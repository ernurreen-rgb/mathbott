"""Regression tests for P1 Block 4 (H-28, H-29, H-31, H-37): Batching, async S3/FS deletion,
WS presence telemetry, and postgres_backup.py unit tests.

Run from bot/: python -m pytest tests/test_p1_block4_perf_and_admin.py
"""
import asyncio
import hashlib
import json
import os
import tempfile
import unittest
from contextlib import asynccontextmanager
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
from fastapi import FastAPI
from slowapi import Limiter
from slowapi.util import get_remote_address

from repositories.bank_task_repository import BankTaskVersionConflictError, BankTwinError
from repositories.progress_repository import ProgressRepository
from routes.admin.bank import register_bank_routes
from routes.admin.bank_twins import register_bank_twin_routes
from routes.modules import setup_modules_routes
from routes.presence import setup_presence_routes
from scripts import postgres_backup
from utils.cache import cache
from utils.file_storage import delete_image_file_async
from utils.internal_proxy_auth import build_presence_ws_token


class _FakeCursor:
    def __init__(self, rows=None):
        self._rows = list(rows or [])

    def __await__(self):
        async def _self():
            return self
        return _self().__await__()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def fetchone(self):
        return self._rows[0] if self._rows else None

    async def fetchall(self):
        return list(self._rows)


class H28ModulesMapBatchingTests(unittest.TestCase):
    def test_h28_modules_map_uses_batched_sections_and_progress_without_n_plus_1(self):
        cache.clear()
        fake_db = MagicMock()
        fake_db.users.get_user_by_email = AsyncMock(return_value={"id": 5, "email": "student@example.com"})
        fake_db.curriculum.get_all_modules = AsyncMock(return_value=[
            {"id": 1, "name": "M1", "description": "", "icon": "", "sort_order": 0},
            {"id": 2, "name": "M2", "description": "", "icon": "", "sort_order": 1},
        ])
        fake_db.curriculum.get_all_sections = AsyncMock(return_value=[
            {"id": 10, "module_id": 1, "name": "S1", "sort_order": 0},
            {"id": 20, "module_id": 2, "name": "S2", "sort_order": 0},
        ])
        fake_db.curriculum.get_sections_by_module = AsyncMock(side_effect=AssertionError("N+1 get_sections_by_module called"))
        fake_db.calculate_module_completion = AsyncMock(side_effect=AssertionError("N+1 calculate_module_completion called"))
        fake_db.progress.calculate_section_completion = AsyncMock(side_effect=AssertionError("N+1 calculate_section_completion called"))
        fake_db.progress.calculate_modules_map_progress = AsyncMock(return_value=(
            {1: {"completed": True, "total_sections": 1, "completed_sections": 1, "total_lessons": 1, "completed_lessons": 1, "progress": 1.0},
             2: {"completed": False, "total_sections": 1, "completed_sections": 0, "total_lessons": 1, "completed_lessons": 0, "progress": 0.0}},
            {10: {"completed": True, "total": 1, "completed_count": 1, "progress": 1.0, "total_lessons": 1, "completed_lessons": 1},
             20: {"completed": False, "total": 1, "completed_count": 0, "progress": 0.0, "total_lessons": 1, "completed_lessons": 0}},
        ))

        app = FastAPI()
        app.state.db = fake_db
        limiter = Limiter(key_func=get_remote_address)
        app.state.limiter = limiter
        setup_modules_routes(app, fake_db, limiter)

        async def _run():
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://mod.test") as client:
                resp = await client.get("/api/modules/map", params={"email": "student@example.com"})
                self.assertEqual(resp.status_code, 200)
                body = resp.json()
                self.assertEqual(len(body), 2)
                self.assertTrue(body[0]["progress"]["completed"])
                self.assertFalse(body[1]["progress"]["completed"])

        with patch.dict(os.environ, {"ENVIRONMENT": "development"}, clear=False):
            asyncio.run(_run())
        fake_db.curriculum.get_all_sections.assert_awaited_once()
        fake_db.progress.calculate_modules_map_progress.assert_awaited_once()
        cache.clear()

    def test_h28_calculate_modules_map_progress_handles_lessons_and_legacy_sections(self):
        executed = []

        class FakeConn:
            def execute(self, sql, params=()):
                s = " ".join(sql.split())
                executed.append(s)
                if "FROM sections s" in s:
                    # Section 10: 1 lesson (101) with 1 non-empty mini (all done) + 1 empty mini.
                    # Section 20: legacy section with no lessons.
                    return _FakeCursor([
                        (10, 101, 1001, 2, 2),
                        (10, 101, 1002, 0, 0),
                        (20, None, None, 0, 0),
                    ])
                if "FROM tasks t" in s:
                    return _FakeCursor([(20, 4, 2)])
                return _FakeCursor([])

        class DummyProgressRepo(ProgressRepository):
            def __init__(self):
                pass

            @asynccontextmanager
            async def _connection(self):
                yield FakeConn()

        mod_map, sec_map = asyncio.run(
            DummyProgressRepo().calculate_modules_map_progress(
                user_id=7,
                sections_by_module={1: [{"id": 10}], 2: [{"id": 20}]},
            )
        )
        self.assertEqual(len(executed), 2)
        self.assertTrue(mod_map[1]["completed"])
        self.assertTrue(sec_map[10]["completed"])
        self.assertEqual(sec_map[20]["completed_count"], 2)
        self.assertEqual(sec_map[20]["total"], 4)


class H29AsyncImageDeletionTests(unittest.TestCase):
    def test_h29_delete_image_file_async_uses_to_thread(self):
        calls = []

        async def _fake_to_thread(fn, *args, **kwargs):
            calls.append((fn.__name__, args))
            return None

        with patch("utils.file_storage.asyncio.to_thread", side_effect=_fake_to_thread):
            asyncio.run(delete_image_file_async("abc123.png"))
        self.assertEqual(calls, [("delete_image_file", ("abc123.png",))])

    def test_h29_bank_and_twin_routes_await_async_delete_on_error(self):
        fake_db = MagicMock()
        admin = {"id": 1, "email": "admin@example.com", "is_admin": 1, "admin_role": "super_admin"}
        fake_db.users.get_user_by_email = AsyncMock(return_value=admin)
        fake_db.users.is_admin = AsyncMock(return_value=True)
        fake_db.bank_tasks.get_task_by_id = AsyncMock(return_value={
            "id": 10, "text": "2+2", "answer": "4", "question_type": "input", "answer_mode": "written",
            "difficulty": "A", "topics": [], "current_version": 2, "image_filename": None,
        })
        fake_db.bank_tasks.find_similar_tasks = AsyncMock(return_value=[])
        fake_db.bank_tasks.update_task = AsyncMock(side_effect=BankTaskVersionConflictError(current_version=3))
        fake_db.bank_tasks.create_twin = AsyncMock(side_effect=BankTwinError("not_found", "missing"))

        app = FastAPI()
        app.state.db = fake_db
        limiter = Limiter(key_func=get_remote_address)
        app.state.limiter = limiter
        register_bank_routes(app, fake_db, limiter)
        register_bank_twin_routes(app, fake_db, limiter)

        async_delete_bank = AsyncMock()
        async_delete_twins = AsyncMock()

        async def _run():
            png_bytes = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
            with patch("routes.admin.bank.save_image_upload", AsyncMock(return_value="uploaded1.png")), \
                 patch("routes.admin.bank.delete_image_file_async", async_delete_bank), \
                 patch("routes.admin.bank_twins.save_image_upload", AsyncMock(return_value="uploaded2.png")), \
                 patch("routes.admin.bank_twins.delete_image_file_async", async_delete_twins):
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://bank.test") as client:
                    resp1 = await client.put(
                        "/api/admin/bank/tasks/10",
                        data={"email": "admin@example.com", "text": "3+3", "answer": "6", "question_type": "input", "expected_current_version": "2"},
                        files={"image": ("a.png", png_bytes, "image/png")},
                    )
                    self.assertEqual(resp1.status_code, 409)

                    resp2 = await client.post(
                        "/api/admin/bank/tasks/10/twins",
                        data={"email": "admin@example.com", "text": "3+3", "answer": "6", "question_type": "input"},
                        files={"image": ("b.png", png_bytes, "image/png")},
                    )
                    self.assertEqual(resp2.status_code, 404)

        with patch.dict(os.environ, {"ENVIRONMENT": "development"}, clear=False):
            asyncio.run(_run())
        async_delete_bank.assert_awaited_once_with("uploaded1.png")
        async_delete_twins.assert_awaited_once_with("uploaded2.png")


class H31PresenceWebSocketTelemetryTests(unittest.TestCase):
    def test_h31_presence_ws_records_initial_visit_and_route_changes(self):
        recorded = []
        fake_db = MagicMock()
        fake_db.users.get_user_by_email = AsyncMock(return_value={"id": 42, "email": "s@example.com", "nickname": "Stu"})

        async def _record(user_id, path=None):
            recorded.append((user_id, path))

        fake_db.users.record_presence_activity = AsyncMock(side_effect=_record)

        app = FastAPI()
        app.state.db = fake_db
        limiter = Limiter(key_func=get_remote_address)
        app.state.limiter = limiter
        setup_presence_routes(app, fake_db, limiter)

        ws_route = next(r for r in app.routes if getattr(r, "path", None) == "/ws/presence")

        class ScriptedWS:
            def __init__(self, token):
                self.query_params = {"email": "s@example.com", "token": token, "path": "/modules"}
                self._messages = [
                    json.dumps({"type": "visit", "path": "/lessons/12"}),
                    json.dumps({"type": "ping", "path": "/lessons/12"}),
                ]
                self.sent = []
                self.clock = 100.0

            async def accept(self):
                return None

            async def send_text(self, text):
                self.sent.append(json.loads(text))

            async def receive_text(self):
                if not self._messages:
                    from fastapi import WebSocketDisconnect
                    raise WebSocketDisconnect()
                self.clock += 20.0
                return self._messages.pop(0)

            async def close(self, code=1000):
                return None

        async def _run():
            with patch.dict(os.environ, {"INTERNAL_PROXY_SECRET": "presence-h31-secret-123"}, clear=False):
                token = build_presence_ws_token(user_email="s@example.com")
                ws = ScriptedWS(token)
                with patch("routes.presence.time.monotonic", side_effect=lambda: ws.clock):
                    await ws_route.endpoint(ws)
                self.assertEqual(recorded, [
                    (42, "/modules"),
                    (42, "/lessons/12"),
                    (42, "/lessons/12"),
                ])
                self.assertTrue(any(m.get("type") == "pong" for m in ws.sent))

        asyncio.run(_run())


class H37PostgresBackupScriptTests(unittest.TestCase):
    def test_connection_info_validation_and_identity(self):
        info = postgres_backup.connection_info("postgresql://user:secret@db.example.com:5432/mathbot")
        self.assertEqual(info["host"], "db.example.com")
        self.assertEqual(info["dbname"], "mathbot")
        # Identity is host-case-insensitive and independent of credentials.
        self.assertEqual(
            postgres_backup.identity("postgresql://u1:p1@DB.EXAMPLE.COM:5432/mathbot"),
            postgres_backup.identity("postgresql://u2:p2@db.example.com/mathbot"),
        )
        for bad_url in (
            "",
            "mysql://user:pass@host/db",
            "postgresql://user:pass@ep-abc-pooler.us-east-2.aws.neon.tech/neondb",
            "postgresql://user:pass@db.example.com/mathbot?options=-c%20statement_timeout=0",
            "postgresql://user:pass@db.example.com/mathbot?hostaddr=127.0.0.1",
            "postgresql://user:pass@db.example.com/",
        ):
            with self.assertRaises(postgres_backup.BackupError, msg=bad_url):
                postgres_backup.connection_info(bad_url)

    def test_run_client_strips_pg_env_and_hides_credentials_on_failure(self):
        captured_env = {}

        def _fake_run(cmd, *, env, **kwargs):
            captured_env.update(env)
            return MagicMock(returncode=1, stdout="", stderr="password=supersecret failed")

        with patch.dict(os.environ, {"PGPASSWORD": "leaked-env-password"}, clear=False), \
             patch("scripts.postgres_backup.subprocess.run", side_effect=_fake_run):
            with self.assertRaises(postgres_backup.BackupError) as raised:
                postgres_backup.run_client(
                    "pg_dump",
                    ["--version"],
                    url="postgresql://user:supersecret@db.example.com/mathbot",
                    read_only=True,
                )
        self.assertNotIn("supersecret", str(raised.exception))
        self.assertEqual(captured_env.get("PGOPTIONS"), "-c default_transaction_read_only=on")
        self.assertEqual(captured_env.get("PGHOST"), "db.example.com")

    def test_restore_preflight_and_checksum_guards(self):
        source_id = postgres_backup.identity("postgresql://u:p@src.example.com/prod")
        manifest = {"format_version": 1, "source_identity_sha256": source_id, "pg_dump_major": 17}

        # Rejects non-mathbot_restore_* database name
        with self.assertRaises(postgres_backup.BackupError):
            postgres_backup.restore_preflight("postgresql://u:p@dst.example.com/prod", manifest)

        # Rejects restoring onto source identity
        same_manifest = {
            **manifest,
            "source_identity_sha256": postgres_backup.identity("postgresql://u:p@dst.example.com/mathbot_restore_drill"),
        }
        with self.assertRaises(postgres_backup.BackupError):
            postgres_backup.restore_preflight("postgresql://u:p@dst.example.com/mathbot_restore_drill", same_manifest)

        # Rejects tampered dump checksum before touching target DB
        with tempfile.TemporaryDirectory() as tmpdir:
            bundle = Path(tmpdir)
            dump = bundle / "database.dump"
            dump.write_bytes(b"real dump bytes")
            bad_manifest = {**manifest, "dump_sha256": hashlib.sha256(b"other").hexdigest()}
            (bundle / "manifest.json").write_text(json.dumps(bad_manifest), encoding="utf-8")
            with self.assertRaises(postgres_backup.BackupError):
                postgres_backup.restore("postgresql://u:p@dst.example.com/mathbot_restore_drill", bundle)


if __name__ == "__main__":
    unittest.main()
