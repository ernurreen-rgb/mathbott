"""Regression tests for all 16 P0 vulnerabilities from the QazMath security & code audit.

Runs purely in-memory without requiring a live PostgreSQL server:
    cd bot && python -m pytest tests/test_p0_audit_fixes.py -v
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import os
from pathlib import Path
import time
import unittest
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from slowapi import Limiter
from slowapi.util import get_remote_address

from app import create_app
from middleware.trusted_proxy_identity import (
    TrustedProxyIdentityMiddleware,
    _extract_body_emails,
    _extract_query_emails,
    _is_sensitive_identity_path,
)
from repositories.bank.crud import BankTaskCrudMixin
from repositories.bank.twins import BankTaskTwinsMixin
from repositories.bank.unrecognized_answers import BankTaskUnrecognizedAnswersMixin
from repositories.bank.versions import BankTaskVersionConflictError
from repositories.base import BaseRepository
from repositories.curriculum_repository import CurriculumRepository
from repositories.module_review_repository import _compute_lesson_gate_locks
from repositories.progress_repository import ProgressRepository
from repositories.quiz_repository import QuizRepository
from repositories.trial_test_repository import TrialTestRepository
from routes.admin.bank_twins import register_bank_twin_routes
from routes.admin.content_tasks import register_task_content_routes
from routes.admin.content_validation import _raise_version_conflict_from_exception
from routes.admin.reports import _update_task_from_report_common
from routes.modules import setup_modules_routes
from routes.questions import setup_questions_routes
from routes.quizzes import setup_quizzes_routes
from routes.tasks import setup_tasks_routes
from routes.trial_tests import _has_meaningful_trial_answer, setup_trial_tests_routes
from routes.users import setup_users_routes
from services import ai_twins
from services.ops_monitor import OpsMonitor
from utils.cache import cache
from utils.connection_pool import ConnectionPool
from utils.internal_proxy_auth import (
    PROXY_EMAIL_HEADER,
    PROXY_NONCE_HEADER,
    PROXY_SIGNATURE_V2_HEADER,
    PROXY_TS_HEADER,
    build_canonical_proxy_payload,
)
from utils.math_algebra import canonicalize_algebraic_expression
from utils.math_statements import canonicalize_math_statement
from utils.quiz import QuizError
from utils.validation import is_task_answer_correct


REPO_ROOT = Path(__file__).resolve().parents[2]


def _make_v2_get_headers(secret: str, path: str, raw_query: str, email: str) -> dict[str, str]:
    ts = str(int(time.time()))
    nonce = f"p0-{time.time_ns()}"
    payload = build_canonical_proxy_payload(
        method="GET",
        path=path,
        raw_query=raw_query,
        user_email=email,
        timestamp=ts,
        nonce=nonce,
    )
    sig = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    return {
        PROXY_TS_HEADER: ts,
        PROXY_NONCE_HEADER: nonce,
        PROXY_SIGNATURE_V2_HEADER: sig,
        PROXY_EMAIL_HEADER: email,
    }


class C01IgnoreAndSecretCleanupTests(unittest.TestCase):
    def test_gitignore_and_vercelignore_cover_star_env_and_db_dumps(self):
        root_gitignore = (REPO_ROOT / ".gitignore").read_text(encoding="utf-8")
        bot_vercelignore = (REPO_ROOT / "bot" / ".vercelignore").read_text(encoding="utf-8")
        web_vercelignore = (REPO_ROOT / "web" / ".vercelignore").read_text(encoding="utf-8")

        for content in (root_gitignore, bot_vercelignore, web_vercelignore):
            self.assertIn("*.env", content)
            self.assertIn("!*.env.example", content)
            self.assertIn("*.db*", content)

        leaked_files = [
            REPO_ROOT / "bot" / ".env.prod.test",
            REPO_ROOT / "web" / ".env.prod.web",
            REPO_ROOT / "bot" / ".vercel" / "hosted-backend.env",
            REPO_ROOT / "bot" / ".vercel" / "neon-storage.env",
            REPO_ROOT / "bot" / ".vercel" / "neon.env",
            REPO_ROOT / "bot" / ".vercel" / "runtime-check.env",
            REPO_ROOT / "bot" / ".vercel" / "pre-neon-migration.db",
            REPO_ROOT / "web" / ".vercel" / "hosted-frontend.env",
            REPO_ROOT / "web" / ".vercel" / "prior-production.env",
        ]
        for path in leaked_files:
            self.assertFalse(path.exists(), f"Leaked secret/dump file must be removed: {path}")


class C02TrustedProxyMiddlewareEncodingTests(unittest.TestCase):
    def test_non_utf8_query_string_still_extracts_email_and_blocks_bypass(self):
        scope = {"type": "http", "query_string": b"x=\xff&email=admin@example.com"}
        self.assertIn("admin@example.com", _extract_query_emails(scope))

        # Same for urlencoded body containing raw non-UTF-8 bytes.
        body_emails = _extract_body_emails(
            "application/x-www-form-urlencoded",
            b"x=\xff&email=victim@example.com",
        )
        self.assertEqual(body_emails, ["victim@example.com"])

    def test_middleware_rejects_raw_non_utf8_email_spoofing_in_production(self):
        secret = "p" * 48

        async def _inner(scope, receive, send):
            await send({
                "type": "http.response.start",
                "status": 200,
                "headers": [(b"content-type", b"application/json")],
            })
            await send({"type": "http.response.body", "body": b'{"ok":true}'})

        mw = TrustedProxyIdentityMiddleware(_inner)

        async def _run_scope(scope: dict) -> int:
            status_holder = []

            async def _receive():
                return {"type": "http.request", "body": b"", "more_body": False}

            async def _send(message):
                if message["type"] == "http.response.start":
                    status_holder.append(message["status"])

            await mw(scope, _receive, _send)
            return status_holder[0]

        with patch.dict(
            os.environ,
            {"ENVIRONMENT": "production", "INTERNAL_PROXY_SHARED_SECRET": secret},
            clear=False,
        ):
            # 1) Unsigned request with non-UTF-8 byte + email to /api/lessons/2 -> 401
            unsigned_scope = {
                "type": "http",
                "method": "GET",
                "path": "/api/lessons/2",
                "query_string": b"x=\xff&email=admin@example.com",
                "headers": [],
            }
            self.assertEqual(asyncio.run(_run_scope(unsigned_scope)), 401)

            # 2) Signed request as attacker@example.com with spoofed admin email after 0xff -> 403
            raw_query = b"x=\xff&email=admin@example.com"
            headers = _make_v2_get_headers(
                secret,
                "/api/lessons/2",
                raw_query.decode("latin-1"),
                "attacker@example.com",
            )
            signed_scope = {
                "type": "http",
                "method": "GET",
                "path": "/api/lessons/2",
                "query_string": raw_query,
                "headers": [(k.lower().encode("latin-1"), v.encode("latin-1")) for k, v in headers.items()],
            }
            self.assertEqual(asyncio.run(_run_scope(signed_scope)), 403)


class C03ConnectionPoolCancellationTests(unittest.TestCase):
    def test_cancelled_acquire_never_leaks_slots_or_deadlocks_pool(self):
        async def _scenario():
            started_connects = 0
            closed_conns: list[int] = []

            class FakeConn:
                def __init__(self, idx: int):
                    self.idx = idx
                    self.closed = False
                    self.row_factory = None
                    self._lastrowid = None

                async def rollback(self):
                    return None

                async def close(self):
                    self.closed = True
                    closed_conns.append(self.idx)

            connect_gate = asyncio.Event()

            async def slow_connect(_url: str, timeout: int = 30):
                nonlocal started_connects
                started_connects += 1
                idx = started_connects
                if idx <= 2:
                    await connect_gate.wait()
                return FakeConn(idx)

            pool = ConnectionPool("postgresql://u:p@localhost/db", max_size=2, timeout=2)
            with patch("utils.connection_pool.db_driver.connect", side_effect=slow_connect):
                t1 = asyncio.create_task(pool.acquire())
                t2 = asyncio.create_task(pool.acquire())
                await asyncio.sleep(0.02)
                self.assertEqual(pool.get_stats()["created"], 2)

                # Cancel BOTH in-flight connects (previously caused permanent deadlock at max_size=2).
                t1.cancel()
                t2.cancel()
                for t in (t1, t2):
                    with self.assertRaises(asyncio.CancelledError):
                        await t

                self.assertEqual(pool.get_stats()["created"], 0)

                # Pool must immediately hand out a fresh connection without timing out.
                conn = await asyncio.wait_for(pool.acquire(), timeout=0.5)
                self.assertEqual(conn.idx, 3)
                await pool.release(conn)
                await pool.close()

        asyncio.run(_scenario())

    def test_cancelled_release_during_rollback_frees_slot_and_wakes_waiter(self):
        async def _scenario():
            rollback_gate = asyncio.Event()
            closed: list[int] = []

            class FakeConn:
                def __init__(self, idx: int, slow_rollback: bool = False):
                    self.idx = idx
                    self.slow_rollback = slow_rollback
                    self.closed = False
                    self.row_factory = None
                    self._lastrowid = None

                async def rollback(self):
                    if self.slow_rollback:
                        await rollback_gate.wait()

                async def close(self):
                    self.closed = True
                    closed.append(self.idx)

            counter = 0

            async def fake_connect(_url: str, timeout: int = 30):
                nonlocal counter
                counter += 1
                return FakeConn(counter, slow_rollback=(counter == 1))

            pool = ConnectionPool("postgresql://u:p@localhost/db", max_size=1, timeout=2)
            with patch("utils.connection_pool.db_driver.connect", side_effect=fake_connect):
                c1 = await pool.acquire()
                waiter = asyncio.create_task(pool.acquire())
                await asyncio.sleep(0.02)

                rel_task = asyncio.create_task(pool.release(c1))
                await asyncio.sleep(0.02)
                rel_task.cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await rel_task

                # Waiter must acquire a fresh connection immediately instead of hanging forever.
                c2 = await asyncio.wait_for(waiter, timeout=0.5)
                self.assertEqual(c2.idx, 2)

                # Once rollback finishes, the discarded connection must be closed too.
                rollback_gate.set()
                await asyncio.sleep(0.05)
                self.assertIn(1, closed)

                await pool.release(c2)
                await pool.close()

        asyncio.run(_scenario())


class C04BankHardDeleteIntegrityTests(unittest.TestCase):
    def test_migration_0017_sets_bank_task_fks_to_on_delete_set_null(self):
        sql = (REPO_ROOT / "bot" / "migrations" / "postgres" / "0017_bank_task_fk_set_null.sql").read_text(encoding="utf-8")
        self.assertIn("fk_tasks_bank_task_id", sql)
        self.assertIn("fk_trial_test_tasks_bank_task_id", sql)
        self.assertEqual(sql.upper().count("ON DELETE SET NULL"), 2)
        self.assertNotIn("ON DELETE CASCADE", sql.upper())

    def test_hard_delete_and_cleanup_detach_placements_before_delete_and_version_twins(self):
        executed_sql: list[str] = []
        recorded_versions: list[tuple[int, str]] = []

        class FakeCursor:
            def __init__(self, rows=None, rowcount=1):
                self._rows = rows or []
                self.rowcount = rowcount

            def __await__(self):
                async def _self():
                    return self
                return _self().__await__()

            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                return False

            async def fetchall(self):
                return self._rows

            async def fetchone(self):
                return self._rows[0] if self._rows else None

        class FakeConn:
            row_factory = None

            def execute(self, sql, params=()):
                executed_sql.append(" ".join(sql.split()))
                if "SELECT bt.id" in sql:
                    return FakeCursor(rows=[(77,)])
                if "SELECT id FROM bank_tasks" in " ".join(sql.split()):
                    return FakeCursor(rows=[{"id": 10}])
                return FakeCursor(rowcount=1)

        class DummyRepo(BankTaskCrudMixin, BankTaskTwinsMixin):
            AUDIT_ACTION_HARD_DELETE = "hard_delete"

            @asynccontextmanager
            async def _write_transaction(self):
                yield FakeConn()

            async def _fetch_task_row(self, db, task_id):
                return {
                    "id": task_id,
                    "text": "2+2",
                    "answer": "4",
                    "question_type": "input",
                    "difficulty": "A",
                    "current_version": 1,
                    "deleted_at": "2026-01-01 00:00:00",
                }

            async def _fetch_topics_for_task(self, db, task_id):
                return []

            def _build_snapshot(self, row, topics):
                return {"id": row["id"]}

            def _build_text_preview(self, text):
                return str(text or "")

            async def _record_version_event(self, db, *, task_id, event_type, **kwargs):
                recorded_versions.append((task_id, event_type))
                return 2

            async def _record_admin_audit_event(self, db, **kwargs):
                return None

        repo = DummyRepo()
        ok = asyncio.run(repo.hard_delete_task(10, actor_user_id=1, actor_email="a@b.c"))
        self.assertTrue(ok)
        self.assertIn((77, "soft_delete"), recorded_versions)

        detach_tasks_idx = next(i for i, q in enumerate(executed_sql) if "UPDATE tasks SET bank_task_id = NULL" in q)
        detach_trial_idx = next(i for i, q in enumerate(executed_sql) if "UPDATE trial_test_tasks SET bank_task_id = NULL" in q)
        delete_bank_idx = next(i for i, q in enumerate(executed_sql) if "DELETE FROM bank_tasks WHERE id = ?" in q)
        self.assertLess(detach_tasks_idx, delete_bank_idx)
        self.assertLess(detach_trial_idx, delete_bank_idx)

        executed_sql.clear()
        deleted = asyncio.run(repo.cleanup_old_deleted_tasks(days=30))
        self.assertEqual(deleted, 1)
        cleanup_detach_tasks = next(i for i, q in enumerate(executed_sql) if "UPDATE tasks SET deleted_at" in q and "bank_task_id = NULL" in q)
        cleanup_detach_trial = next(i for i, q in enumerate(executed_sql) if "UPDATE trial_test_tasks SET deleted_at" in q and "bank_task_id = NULL" in q)
        cleanup_delete = next(i for i, q in enumerate(executed_sql) if "DELETE FROM bank_tasks WHERE id IN" in q)
        self.assertLess(cleanup_detach_tasks, cleanup_delete)
        self.assertLess(cleanup_detach_trial, cleanup_delete)


class C05VersionConflictErrorTests(unittest.TestCase):
    def test_add_accepted_answer_raises_version_conflict_not_type_error(self):
        class DummyUnrecRepo(BankTaskUnrecognizedAnswersMixin):
            @asynccontextmanager
            async def _write_transaction(self):
                yield MagicMock()

            async def _fetch_task_row(self, db, task_id):
                return {
                    "id": task_id,
                    "current_version": 5,
                    "deleted_at": None,
                    "question_type": "input",
                    "answer_mode": "written",
                    "answer": "4",
                }

            async def _fetch_topics_for_task(self, db, task_id):
                return []

            def _serialize_task_row(self, row, topics):
                return dict(row)

        repo = DummyUnrecRepo()
        with self.assertRaises(BankTaskVersionConflictError) as ctx:
            asyncio.run(
                repo.add_accepted_answer(
                    task_id=42,
                    answer="4.0",
                    max_accepted_answers=10,
                    expected_current_version=3,
                )
            )
        self.assertEqual(str(ctx.exception), "VERSION_CONFLICT:5")
        self.assertEqual(ctx.exception.current_version, 5)

        http_exc = _raise_version_conflict_from_exception(ctx.exception)
        self.assertEqual(http_exc.status_code, 409)
        self.assertEqual(http_exc.detail["code"], "VERSION_CONFLICT")
        self.assertEqual(http_exc.detail["current_version"], 5)


class C06C07C08AnswerLeakPreventionTests(unittest.TestCase):
    def test_c06_task_and_question_check_never_leak_correct_answer_on_wrong_attempt(self):
        fake_db = MagicMock()
        fake_db.users.get_user_by_email = AsyncMock(
            return_value={"id": 1, "email": "student@example.com", "is_admin": 0}
        )
        fake_db.tasks.get_task_by_id = AsyncMock(
            return_value={
                "id": 10,
                "text": "2+2",
                "answer": "4",
                "question_type": "input",
                "deleted_at": None,
                "mini_lesson_id": None,
            }
        )
        fake_db.record_solution = AsyncMock(return_value=None)
        fake_db.progress.get_task_questions = AsyncMock(
            return_value=[{"text": "2+2", "answer": "4"}]
        )
        fake_db.progress.check_task_question_answer = AsyncMock(return_value=False)
        fake_db.progress.record_task_question_progress = AsyncMock(return_value=None)
        fake_db.progress.check_if_task_all_questions_completed = AsyncMock(return_value=False)

        app = FastAPI()
        app.state.db = fake_db
        limiter = Limiter(key_func=get_remote_address)
        app.state.limiter = limiter
        setup_tasks_routes(app, fake_db, limiter)
        setup_questions_routes(app, fake_db, limiter)

        with patch.dict(os.environ, {"ENVIRONMENT": "development"}, clear=False):
            client = TestClient(app)
            resp = client.post(
                "/api/task/check",
                json={"task_id": 10, "answer": "0", "email": "student@example.com"},
            )
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(resp.json(), {"correct": False, "correct_answer": None})

            q_resp = client.post(
                "/api/tasks/10/questions/check",
                data={"question_index": "0", "answer": "0", "email": "student@example.com"},
            )
            self.assertEqual(q_resp.status_code, 200)
            self.assertFalse(q_resp.json()["correct"])
            self.assertIsNone(q_resp.json()["correct_answer"])

    def test_c07_quiz_fork_blocked_during_active_session_for_non_author(self):
        fake_db = MagicMock()
        fake_db.users.get_user_by_email = AsyncMock(
            return_value={"id": 99, "email": "student@example.com", "is_admin": 0, "admin_role": None}
        )
        fake_db.quizzes.get_quiz_by_id = AsyncMock(
            return_value={"id": 7, "title": "Live Quiz", "created_by": 1, "is_public": 1}
        )
        fake_db.quizzes.fork_quiz = AsyncMock(
            side_effect=QuizError("conflict", "Белсенді ойын жүріп жатқан кезде бұл квизді көшіруге болмайды.")
        )

        app = FastAPI()
        app.state.db = fake_db
        limiter = Limiter(key_func=get_remote_address)
        setup_quizzes_routes(app, fake_db, limiter)

        with patch.dict(os.environ, {"ENVIRONMENT": "development"}, clear=False):
            client = TestClient(app)
            resp = client.post("/api/quizzes/7/fork", params={"email": "student@example.com"})
            self.assertEqual(resp.status_code, 409)
            fake_db.quizzes.fork_quiz.assert_awaited_once_with(
                quiz_id=7, user_id=99, allow_during_active_session=False
            )

        # Verify repository atomic check raises QuizError("conflict") when active session exists.
        class FakeCursor:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                return False

            async def fetchone(self):
                return (1,)

        class FakeConn:
            def execute(self, sql, params=()):
                return FakeCursor()

        class DummyQuizRepo(QuizRepository):
            def __init__(self):
                pass

            async def get_quiz_by_id(self, quiz_id):
                return {"id": quiz_id, "title": "Live Quiz", "created_by": 1, "is_public": 1}

            async def get_quiz_questions(self, quiz_id):
                return []

            @asynccontextmanager
            async def _write_transaction(self):
                yield FakeConn()

        with self.assertRaises(QuizError) as ctx:
            asyncio.run(DummyQuizRepo().fork_quiz(7, user_id=99, allow_during_active_session=False))
        self.assertEqual(ctx.exception.kind, "conflict")

    def test_c08_trial_test_empty_submit_hides_answers_and_revealed_retake_grants_no_completions(self):
        self.assertFalse(_has_meaningful_trial_answer(""))
        self.assertFalse(_has_meaningful_trial_answer("   "))
        self.assertFalse(_has_meaningful_trial_answer('["", ""]'))
        self.assertFalse(_has_meaningful_trial_answer("[null, null]"))
        self.assertTrue(_has_meaningful_trial_answer("42"))
        self.assertTrue(_has_meaningful_trial_answer('["A", ""]'))

        captured_submit: dict = {}

        async def _fake_submit(**kwargs):
            captured_submit.update(kwargs)
            return {
                "result": {
                    "id": 1,
                    "attempt_id": kwargs.get("attempt_id"),
                    "score": kwargs["score"],
                    "total": kwargs["total"],
                    "percentage": kwargs["percentage"],
                    "answers": json.dumps(kwargs["answers"]),
                },
                "recorded_any": False,
                "streak_updated": False,
            }

        fake_db = MagicMock()
        fake_db.users.get_user_by_email = AsyncMock(
            return_value={"id": 1, "email": "student@example.com", "is_admin": 0}
        )
        fake_db.trial_tests.get_trial_test_by_id = AsyncMock(return_value={"id": 5, "title": "UNT"})
        fake_db.trial_tests.get_trial_test_tasks = AsyncMock(
            return_value=[
                {"id": 101, "text": "Q1", "answer": "42", "question_type": "input", "bank_task_id": 1001},
                {"id": 102, "text": "Q2", "answer": "99", "question_type": "input", "bank_task_id": 1002},
            ]
        )
        fake_db.trial_tests.submit_trial_test_attempt = AsyncMock(side_effect=_fake_submit)
        fake_db.check_and_unlock_achievements = AsyncMock(return_value=None)

        app = FastAPI()
        app.state.db = fake_db
        limiter = Limiter(key_func=get_remote_address)
        setup_trial_tests_routes(app, fake_db, limiter)

        with patch.dict(os.environ, {"ENVIRONMENT": "development"}, clear=False):
            client = TestClient(app)
            resp = client.post(
                "/api/trial-tests/5/submit",
                json={"email": "student@example.com", "answers": {"101": "0"}},
            )
            self.assertEqual(resp.status_code, 200)
            body = resp.json()
            # Answered task 101 shows correct_answer; unanswered task 102 hides it.
            self.assertEqual(body["results"]["101"]["correct_answer"], "42")
            self.assertIsNone(body["results"]["102"]["correct_answer"])

        # Verify repository excludes tasks revealed in a prior attempt from completions & streak.
        prior_answers = json.dumps({"101": {"answer": "0", "correct": False, "correct_answer": "42"}})
        inserted_completions: list[dict] = []

        class FakeCursor:
            def __init__(self, rows=None, lastrowid=2):
                self._rows = rows or []
                self.lastrowid = lastrowid

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
                return self._rows

        class FakeConn:
            row_factory = None

            async def begin_write(self):
                return None

            async def commit(self):
                return None

            async def rollback(self):
                return None

            def execute(self, sql, params=()):
                s = " ".join(sql.split())
                if "AND attempt_id = ?" in s:
                    return FakeCursor(rows=[])
                if "SELECT answers FROM trial_test_results" in s:
                    return FakeCursor(rows=[{"answers": prior_answers}])
                if "SELECT * FROM trial_test_results WHERE id = ?" in s:
                    return FakeCursor(rows=[{"id": 2, "score": 1, "total": 1, "percentage": 100.0, "answers": "{}"}])
                return FakeCursor(rows=[], lastrowid=2)

        class DummyTrialRepo(TrialTestRepository):
            def __init__(self):
                pass

            @asynccontextmanager
            async def _connection(self):
                yield FakeConn()

            async def _run_with_write_lock(self, op):
                return await op()

        async def _fake_insert_completion(db, **kwargs):
            inserted_completions.append(kwargs)
            return True

        with patch("repositories.trial_test_repository.insert_task_completion", side_effect=_fake_insert_completion):
            retake_res = asyncio.run(
                DummyTrialRepo().submit_trial_test_attempt(
                    user_id=1,
                    trial_test_id=5,
                    score=1,
                    total=1,
                    percentage=100.0,
                    answers={101: {"answer": "42", "correct": True, "score": 1, "max_score": 1, "correct_answer": "42"}},
                    completions=[{"completion_key": "bank:1001", "bank_task_id": 1001, "source": "trial_test", "source_ref_id": 101}],
                    should_update_streak=True,
                )
            )
        self.assertEqual(inserted_completions, [])
        self.assertFalse(retake_res["recorded_any"])
        self.assertFalse(retake_res["streak_updated"])


class C09C10LessonGateAndAuthEnforcementTests(unittest.TestCase):
    def test_c09_lesson_gate_locks_all_subsequent_unstarted_lessons_and_blocks_anon_lesson2(self):
        lessons = [
            {"id": 1, "title": "L1", "lesson_number": 1},
            {"id": 2, "title": "L2", "lesson_number": 2},
            {"id": 3, "title": "L3", "lesson_number": 3},
            {"id": 4, "title": "L4", "lesson_number": 4},
        ]
        minis = {10: {"lesson_id": 1, "mini_index": 1}}
        pending = {1: {10: 2}}

        locks = _compute_lesson_gate_locks(lessons, pending, minis, started=set())
        self.assertEqual(list(locks.keys()), [2, 3, 4])
        self.assertEqual(locks[4]["lesson_id"], 1)

        # Already started lesson 2 remains open, while unstarted 3 and 4 remain locked.
        locks_started = _compute_lesson_gate_locks(lessons, pending, minis, started={2})
        self.assertEqual(list(locks_started.keys()), [3, 4])

        # Unauthenticated GET /api/lessons/2 must return empty tasks (no Lesson Gate bypass).
        fake_db = MagicMock()
        fake_db.curriculum.get_lesson_by_id = AsyncMock(return_value={"id": 2, "section_id": 1, "title": "L2", "lesson_number": 2})
        fake_db.curriculum.get_section_by_id = AsyncMock(return_value={"id": 1, "module_id": 1})
        fake_db.curriculum.get_mini_lessons_by_lesson = AsyncMock(return_value=[{"id": 20, "mini_index": 1, "title": "M1"}])
        fake_db.module_review.get_module_lesson_order = AsyncMock(return_value=lessons)
        fake_db.tasks.get_tasks_by_mini_lesson = AsyncMock(return_value=[{"id": 999, "text": "Secret"}])

        app = FastAPI()
        app.state.db = fake_db
        limiter = Limiter(key_func=get_remote_address)
        setup_modules_routes(app, fake_db, limiter)

        with patch.dict(os.environ, {"ENVIRONMENT": "production"}, clear=False):
            client = TestClient(app)
            resp = client.get("/api/lessons/2")
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(resp.json()["mini_lessons"][0]["tasks"], [])
            fake_db.tasks.get_tasks_by_mini_lesson.assert_not_awaited()

    def test_c10_private_routes_require_proxy_auth_in_prod_and_public_trial_catalog_is_open(self):
        self.assertFalse(_is_sensitive_identity_path("/api/trial-tests", "GET"))
        self.assertFalse(_is_sensitive_identity_path("/api/trial-tests/folders", "GET"))
        self.assertFalse(_is_sensitive_identity_path("/api/trial-tests/categories", "GET"))
        self.assertFalse(_is_sensitive_identity_path("/api/trial-tests/12", "GET"))
        self.assertTrue(_is_sensitive_identity_path("/api/trial-tests/drafts", "GET"))
        self.assertTrue(_is_sensitive_identity_path("/api/trial-tests/12/submit", "POST"))
        self.assertTrue(_is_sensitive_identity_path("/api/trial-tests/12/draft", "GET"))
        self.assertTrue(_is_sensitive_identity_path("/api/trial-tests/12/results", "GET"))

        fake_db = MagicMock()
        fake_db.trial_tests.get_trial_tests = AsyncMock(return_value=[{"id": 1, "title": "Public UNT"}])
        fake_db.trial_tests.get_trial_test_folders = AsyncMock(return_value=[])
        fake_db.users.get_user_by_email = AsyncMock(return_value=None)
        fake_db.users.create_user_by_email = AsyncMock()

        with patch.dict(
            os.environ,
            {
                "ENVIRONMENT": "production",
                "DATABASE_URL": "postgresql://u:p@localhost/db",
                "INTERNAL_PROXY_SHARED_SECRET": "x" * 48,
                "ALLOWED_ORIGINS": "https://app.qazmath.test",
            },
            clear=False,
        ):
            cache.clear()
            app = create_app()
            app.state.db = fake_db
            setup_tasks_routes(app, fake_db, app.state.limiter)
            setup_users_routes(app, fake_db, app.state.limiter)
            setup_trial_tests_routes(app, fake_db, app.state.limiter)

            client = TestClient(app, raise_server_exceptions=False)
            # Public catalog works for guests in production!
            self.assertEqual(client.get("/api/trial-tests").status_code, 200)
            self.assertEqual(client.get("/api/trial-tests/folders").status_code, 200)
            # Private endpoints reject unauthenticated callers with 401!
            self.assertEqual(client.get("/api/trial-tests?attempted_only=true").status_code, 401)
            self.assertEqual(client.get("/api/trial-tests/drafts").status_code, 401)
            self.assertEqual(client.get("/api/trial-tests/1/draft").status_code, 401)
            self.assertEqual(client.get("/api/trial-tests/1/results").status_code, 401)
            self.assertEqual(client.get("/api/user/web/student@example.com").status_code, 401)
            self.assertEqual(
                client.post("/api/user/web/language", json={"email": "student@example.com", "language": "ru"}).status_code,
                401,
            )
            self.assertEqual(
                client.post("/api/user/web/nickname", json={"email": "student@example.com", "nickname": "Neo"}).status_code,
                401,
            )
            self.assertEqual(
                client.post("/api/task/check", json={"task_id": 1, "answer": "4", "email": "student@example.com"}).status_code,
                401,
            )

        # Even in dev, GET /api/user/web/{invalid} rejects bad email with 400 and does NOT auto-create.
        with patch.dict(os.environ, {"ENVIRONMENT": "development"}, clear=False):
            app_dev = FastAPI()
            app_dev.state.db = fake_db
            limiter = Limiter(key_func=get_remote_address)
            setup_users_routes(app_dev, fake_db, limiter)
            dev_client = TestClient(app_dev)
            bad = dev_client.get("/api/user/web/not-an-email")
            self.assertEqual(bad.status_code, 400)
            fake_db.users.create_user_by_email.assert_not_awaited()


class C11IrrationalRadicalsTests(unittest.TestCase):
    def test_irrational_radical_equivalence_and_final_form(self):
        cases_true = [
            (r"1 + \sqrt{2}", r"\sqrt{2} + 1"),
            (r"2\sqrt{3}", r"2\cdot\sqrt{3}"),
            (r"2\sqrt{3}", r"\sqrt{3}\cdot 2"),
            (r"\frac{\sqrt{3}}{2}", r"\sqrt{3}/2"),
            (r"\frac{\sqrt{3}}{2}", r"0,5\sqrt{3}"),
            (r"\frac{\sqrt{3}}{2}", r"\frac{1}{2}\sqrt{3}"),
            (r"x = \sqrt{2} - 1", r"x = -1 + \sqrt{2}"),
            (r"x = \sqrt{2} - 1", r"\sqrt{2} - 1 = x"),
            (r"1 - \sqrt{2}", r"-\sqrt{2} + 1"),
            (r"2\sqrt[3]{3}", r"\sqrt[3]{3}\cdot 2"),
        ]
        for key, answer in cases_true:
            self.assertTrue(
                is_task_answer_correct({"question_type": "input", "answer": key}, answer),
                f"{answer!r} must match {key!r}",
            )

        # Algebraic canonicalizer simplifies powers, products, and monomial radical denominators.
        self.assertEqual(
            canonicalize_algebraic_expression(r"\sqrt{12}"),
            canonicalize_algebraic_expression(r"2\sqrt{3}"),
        )
        self.assertEqual(
            canonicalize_algebraic_expression(r"\sqrt{2}\cdot\sqrt{3}"),
            canonicalize_algebraic_expression(r"\sqrt{6}"),
        )
        self.assertEqual(canonicalize_algebraic_expression(r"(\sqrt{2})^2"), "2")
        self.assertEqual(
            canonicalize_algebraic_expression(r"\frac{1}{\sqrt{2}}"),
            canonicalize_algebraic_expression(r"\frac{\sqrt{2}}{2}"),
        )
        self.assertEqual(
            canonicalize_algebraic_expression(r"\sqrt[3]{24}"),
            canonicalize_algebraic_expression(r"2\sqrt[3]{3}"),
        )
        self.assertEqual(
            canonicalize_math_statement(r"x = \sqrt{2} - 1"),
            canonicalize_math_statement(r"x + 1 = \sqrt{2}"),
        )

        # Final form still rejects unsimplified radicals & distinct irrational values.
        self.assertFalse(is_task_answer_correct({"question_type": "input", "answer": r"2\sqrt{3}"}, r"\sqrt{12}"))
        self.assertFalse(is_task_answer_correct({"question_type": "input", "answer": r"\sqrt{2}"}, r"\sqrt{3}"))
        self.assertFalse(is_task_answer_correct({"question_type": "input", "answer": "2"}, r"(\sqrt{2})^2"))


class C12AiTwinWrittenModeCheckTests(unittest.TestCase):
    def test_ai_check_matches_option_labels_even_when_answer_mode_is_written(self):
        for qtype, answer, solved_ok, solved_bad in [
            ("mcq", "B", "B", "A"),
            ("mcq6", '["A", "C"]', '["A", "C"]', '["A", "B"]'),
            ("select", '["C", "A"]', '["C", "A"]', '["A", "C"]'),
        ]:
            fake_db = MagicMock()
            fake_db.users.is_admin = AsyncMock(return_value=True)
            fake_db.users.get_user_by_email = AsyncMock(
                return_value={"id": 1, "email": "admin@example.com", "is_admin": 1, "admin_role": "super_admin"}
            )
            fake_db.bank_tasks.get_twin_link = AsyncMock(return_value={"source_bank_task_id": 1})
            fake_db.bank_tasks.get_task_by_id = AsyncMock(
                return_value={
                    "id": 2,
                    "text": "Compute",
                    "question_type": qtype,
                    "answer_mode": "written",
                    "answer": answer,
                    "current_version": 1,
                    "options": [
                        {"label": "A", "text": "10"},
                        {"label": "B", "text": "20"},
                        {"label": "C", "text": "30"},
                        {"label": "D", "text": "40"},
                        {"label": "E", "text": "50"},
                        {"label": "F", "text": "60"},
                    ][: (6 if qtype == "mcq6" else 4)],
                }
            )
            fake_db.bank_tasks.record_twin_check = AsyncMock(return_value=None)

            app = FastAPI()
            app.state.db = fake_db
            limiter = Limiter(key_func=get_remote_address)
            register_bank_twin_routes(app, fake_db, limiter)

            with patch.dict(os.environ, {"ENVIRONMENT": "development"}, clear=False):
                client = TestClient(app)
                with patch.object(ai_twins, "solve_task", AsyncMock(return_value=solved_ok)):
                    res_ok = client.post("/api/admin/bank/tasks/2/ai-check", data={"email": "admin@example.com"})
                self.assertEqual(res_ok.status_code, 200)
                self.assertEqual(res_ok.json()["status"], "match", f"Expected match for written {qtype}")

                with patch.object(ai_twins, "solve_task", AsyncMock(return_value=solved_bad)):
                    res_bad = client.post("/api/admin/bank/tasks/2/ai-check", data={"email": "admin@example.com"})
                self.assertEqual(res_bad.status_code, 200)
                self.assertEqual(res_bad.json()["status"], "mismatch", f"Expected mismatch for written {qtype}")


class C13OpsMonitorRegressionAndServerlessTests(unittest.TestCase):
    def test_db_down_does_not_raise_attribute_error_when_db_unreachable(self):
        fake_db = MagicMock()
        fake_db.connection_pool = None
        fake_db.ops.probe_database = AsyncMock(return_value=False)
        fake_db.ops.add_health_sample = AsyncMock(side_effect=RuntimeError("connection refused"))

        monitor = OpsMonitor(fake_db)
        with patch("services.ops_monitor.metrics.get_window_stats", return_value={"requests": 10, "errors": 0, "error_rate": 0.0, "p95_ms": 10.0, "avg_ms": 5.0}):
            res1 = asyncio.run(monitor.run_cycle())
            res2 = asyncio.run(monitor.run_cycle())

        self.assertEqual(res1["service_status"], "down")
        self.assertEqual(res2["database_status"], "error")
        self.assertEqual(monitor.rule_state["db_down"]["breach_streak"], 2)

    def test_serverless_fresh_monitor_instances_open_and_resolve_incidents_from_db_samples(self):
        samples: list[dict] = []
        open_incidents: dict[str, dict] = {}
        resolved_fingerprints: list[str] = []

        async def _add_sample(**kwargs):
            samples.insert(0, kwargs)
            return len(samples)

        async def _list_recent(limit=10):
            return samples[:limit]

        async def _get_open(fingerprint):
            return open_incidents.get(fingerprint)

        async def _open_or_update(**kwargs):
            inc = {"id": 1, **kwargs}
            open_incidents[kwargs["fingerprint"]] = inc
            return inc

        async def _resolve(fingerprint, metadata=None):
            inc = open_incidents.pop(fingerprint, None)
            if inc:
                resolved_fingerprints.append(fingerprint)
            return inc

        fake_db = MagicMock()
        fake_db.connection_pool = None
        fake_db.ops.probe_database = AsyncMock(return_value=True)
        fake_db.ops.add_health_sample = AsyncMock(side_effect=_add_sample)
        fake_db.ops.list_recent_health_samples = AsyncMock(side_effect=_list_recent)
        fake_db.ops.get_open_incident_by_fingerprint = AsyncMock(side_effect=_get_open)
        fake_db.ops.open_or_update_incident = AsyncMock(side_effect=_open_or_update)
        fake_db.ops.resolve_incident = AsyncMock(side_effect=_resolve)

        bad_window = {"requests": 100, "errors": 10, "error_rate": 10.0, "p95_ms": 100.0, "avg_ms": 50.0}
        good_window = {"requests": 100, "errors": 0, "error_rate": 0.0, "p95_ms": 100.0, "avg_ms": 50.0}

        # Two separate fresh OpsMonitor instances (serverless cron pattern) open the incident on cycle 2.
        with patch("services.ops_monitor.metrics.get_window_stats", return_value=bad_window):
            asyncio.run(OpsMonitor(fake_db).run_cycle())
            self.assertNotIn("high_5xx_rate", open_incidents)
            asyncio.run(OpsMonitor(fake_db).run_cycle())
            self.assertIn("high_5xx_rate", open_incidents)

        # Three separate fresh OpsMonitor instances resolve the incident on cycle 5.
        with patch("services.ops_monitor.metrics.get_window_stats", return_value=good_window):
            asyncio.run(OpsMonitor(fake_db).run_cycle())
            self.assertIn("high_5xx_rate", open_incidents)
            asyncio.run(OpsMonitor(fake_db).run_cycle())
            self.assertIn("high_5xx_rate", open_incidents)
            asyncio.run(OpsMonitor(fake_db).run_cycle())
            self.assertNotIn("high_5xx_rate", open_incidents)
            self.assertEqual(resolved_fingerprints, ["high_5xx_rate"])


class C14ProgressEmptyMiniLessonsTests(unittest.TestCase):
    def test_lesson_reaches_100_percent_with_empty_mini_lessons_and_no_hidden_writes(self):
        class FakeCursor:
            def __init__(self, rows):
                self._rows = rows

            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                return False

            async def fetchall(self):
                return self._rows

        class FakeConn:
            def __init__(self, rows):
                self._rows = rows

            def execute(self, sql, params=()):
                return FakeCursor(self._rows)

        class DummyProgressRepo(ProgressRepository):
            def __init__(self, rows):
                self._rows = rows

            @asynccontextmanager
            async def _connection(self):
                yield FakeConn(self._rows)

        curriculum_repo = MagicMock()
        curriculum_repo.get_mini_lessons_by_lesson = AsyncMock(
            return_value=[{"id": 1}, {"id": 2}, {"id": 3}, {"id": 4}]
        )
        curriculum_repo.ensure_default_mini_lessons = AsyncMock()

        # Minis 1 and 2 have tasks (all completed); minis 3 and 4 are empty.
        lesson_rows = [(1, 2, 2), (2, 1, 1), (3, 0, 0), (4, 0, 0)]
        progress = asyncio.run(
            DummyProgressRepo(lesson_rows).calculate_lesson_completion(1, 10, curriculum_repo)
        )
        self.assertTrue(progress["completed"])
        self.assertEqual(progress["total_mini_lessons"], 2)
        self.assertEqual(progress["completed_mini_lessons"], 2)
        self.assertEqual(progress["progress"], 1.0)
        curriculum_repo.ensure_default_mini_lessons.assert_not_awaited()

        # Module page progress uses the exact same non-empty mini-lesson rule.
        page_rows = [
            (10, 100, 1, 2, 2),
            (10, 100, 2, 1, 1),
            (10, 100, 3, 0, 0),
            (10, 100, 4, 0, 0),
        ]
        page_progress = asyncio.run(
            DummyProgressRepo(page_rows).calculate_module_page_progress(1, 1)
        )
        self.assertTrue(page_progress["lessons"][100]["completed"])
        self.assertEqual(page_progress["lessons"][100]["total_mini_lessons"], 2)
        self.assertTrue(page_progress["sections"][10]["completed"])


class C15TransactionAndPlacementIntegrityTests(unittest.TestCase):
    def test_batch_insert_and_update_do_not_commit_external_connection(self):
        repo = BaseRepository("postgresql://u:p@localhost/db")
        commits = 0

        class FakeConn:
            async def execute(self, sql, params):
                return None

            async def executemany(self, sql, values):
                return None

            async def commit(self):
                nonlocal commits
                commits += 1

        conn = FakeConn()
        asyncio.run(repo.batch_insert("users", ["a"], [(1,)], conn=conn))
        asyncio.run(repo.batch_update("users", [{1: {"a": 2}}], "id", conn=conn))
        self.assertEqual(commits, 0)

    def test_curriculum_create_task_requires_positive_bank_task_id(self):
        repo = CurriculumRepository("postgresql://u:p@localhost/db")
        for bad_id in (None, 0, -5, True):
            with self.assertRaises(ValueError):
                asyncio.run(repo.create_task_in_mini_lesson(1, "text", "ans", bank_task_id=bad_id))
            with self.assertRaises(ValueError):
                asyncio.run(repo.create_task_in_section(1, "text", "ans", bank_task_id=bad_id))


class C16QuestionTypeTransitionBackendTests(unittest.TestCase):
    def test_cms_and_report_update_clear_subquestions_and_reject_invalid_tf_answer(self):
        fake_db = MagicMock()
        fake_db.users.is_admin = AsyncMock(return_value=True)
        fake_db.users.get_user_by_email = AsyncMock(
            return_value={"id": 1, "email": "admin@example.com", "is_admin": 1, "admin_role": "super_admin"}
        )
        fake_db.tasks.get_task_by_id = AsyncMock(
            return_value={
                "id": 50,
                "created_by": 1,
                "bank_task_id": 500,
                "question_type": "select",
                "answer": '["A", "B"]',
                "options": [{"label": "A", "text": "1"}, {"label": "B", "text": "2"}, {"label": "C", "text": "3"}, {"label": "D", "text": "4"}],
                "subquestions": [{"text": "S1", "correct": "A"}, {"text": "S2", "correct": "B"}],
            }
        )
        fake_db.tasks.update_task = AsyncMock(return_value=None)
        fake_db.bank_tasks.update_task = AsyncMock(return_value={})

        app = FastAPI()
        app.state.db = fake_db
        limiter = Limiter(key_func=get_remote_address)
        register_task_content_routes(app, fake_db, limiter)

        with patch.dict(os.environ, {"ENVIRONMENT": "development"}, clear=False):
            client = TestClient(app)
            # 1) Switching select -> tf with stale answer "A" must be rejected with 400.
            bad_tf = client.put(
                "/api/admin/tasks/50",
                data={
                    "email": "admin@example.com",
                    "text": "Is 2+2=4?",
                    "answer": "A",
                    "question_type": "tf",
                    "options": "",
                    "subquestions": "",
                },
            )
            self.assertEqual(bad_tf.status_code, 400)

            # 2) Switching select -> tf with valid "true" and empty subquestions="" must pass [] (not None) to clear DB!
            ok_tf = client.put(
                "/api/admin/tasks/50",
                data={
                    "email": "admin@example.com",
                    "text": "Is 2+2=4?",
                    "answer": "true",
                    "question_type": "tf",
                    "options": "",
                    "subquestions": "",
                },
            )
            self.assertEqual(ok_tf.status_code, 200, ok_tf.text)
            kwargs = fake_db.bank_tasks.update_task.call_args.kwargs
            self.assertEqual(kwargs["options"], [])
            self.assertEqual(kwargs["subquestions"], [])

            # 3) Report task update also clears options & subquestions when switching to input.
            fake_db.bank_tasks.update_task.reset_mock()
            asyncio.run(
                _update_task_from_report_common(
                    task_id=50,
                    text="2+2=?",
                    answer="4",
                    question_type="input",
                    text_scale="md",
                    options="",
                    subquestions="",
                    image=None,
                    email="admin@example.com",
                    db=fake_db,
                )
            )
            report_kwargs = fake_db.bank_tasks.update_task.call_args.kwargs
            self.assertEqual(report_kwargs["options"], [])
            self.assertEqual(report_kwargs["subquestions"], [])


if __name__ == "__main__":
    unittest.main()
