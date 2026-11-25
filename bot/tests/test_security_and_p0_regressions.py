"""Regression tests for Sprint 1 P0/P1 security, math-engine, and data-integrity fixes.

Runs purely in-memory without requiring a PostgreSQL database:
    cd bot && python -m pytest tests/test_security_and_p0_regressions.py -v
"""
from __future__ import annotations

import asyncio
from datetime import timedelta
import hashlib
import hmac
import json
import os
import time
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import Response
from fastapi.testclient import TestClient
from starlette.requests import Request

from app import create_app
from config import validate_configuration
from dependencies import require_admin, require_admin_review_manage
from middleware.cache_headers_middleware import CacheHeadersMiddleware
from middleware.request_context_middleware import _sanitize_request_id
from middleware.trusted_proxy_identity import _private_email_from_path
from repositories.bank.quality import _find_similar_pairs
from repositories.base import BaseRepository
from repositories.statistics_repository import parse_visit_route
from repositories.user_repository import normalize_visit_path
from routes.admin import setup_admin_routes
from routes.admin.auth import _legacy_admin_bootstrap_enabled
from routes.admin.import_payload import _normalize_import_bank_task
from routes.admin.import_tokens import (
    _consume_import_preview_token_jti,
    _get_import_preview_token_secret,
    _issue_import_preview_token,
    _verify_import_preview_token,
)
from routes.admin.reports import _mask_email, _update_task_from_report_common
from routes.admin.roles import _legacy_role_bootstrap_enabled
from routes.export import _safe_csv_value, _safe_export_filename_stem
from routes.quiz_game import QuizConnectionManager
from routes.reports import _strip_report_answers
from services.ai_twins import AiTwinError, _parse_json_object, _validate_provider_base_url
from services.streak_reminders import is_allowed_push_endpoint
from settings import DEFAULT_ADMIN_SECRET, get_settings
from utils.cache import SimpleCache
from utils.connection_pool import ConnectionPool
from utils.internal_proxy_auth import (
    PROXY_EMAIL_HEADER,
    PROXY_NONCE_HEADER,
    PROXY_SIGNATURE_HEADER,
    PROXY_SIGNATURE_V2_HEADER,
    PROXY_TS_HEADER,
    build_canonical_proxy_payload,
    verify_proxy_signature,
)
from utils.learning_progress import calculate_next_streak
from utils.sentry import _before_send
from utils.timezone import today_almaty
from utils.validation import grade_task_answer, is_task_answer_correct


class RbacAndSecurityRegressionTests(unittest.TestCase):
    def test_c01_openapi_exposes_no_capability_query_param_on_admin_routes(self):
        with patch.dict(os.environ, {"ENVIRONMENT": "development", "DATABASE_URL": "postgresql://u:p@localhost/db"}):
            app = create_app()
            setup_admin_routes(app, app.state.db, app.state.limiter)
            schema = app.openapi()

        leaked = []
        for path, methods in schema.get("paths", {}).items():
            for method, operation in methods.items():
                if not isinstance(operation, dict):
                    continue
                for param in operation.get("parameters", []):
                    if param.get("name") == "capability":
                        leaked.append(f"{method.upper()} {path}")
        self.assertEqual(leaked, [], f"capability query param leaked on: {leaked}")

    def test_c02_student_report_answers_are_stripped(self):
        sanitized = _strip_report_answers(
            [
                {
                    "id": 1,
                    "task_id": 10,
                    "task_text": "2+2=?",
                    "task_answer": "4",
                    "answer": "4",
                    "accepted_answers": ["four"],
                    "status": "pending",
                }
            ]
        )
        self.assertEqual(len(sanitized), 1)
        self.assertNotIn("task_answer", sanitized[0])
        self.assertNotIn("answer", sanitized[0])
        self.assertNotIn("accepted_answers", sanitized[0])
        self.assertEqual(sanitized[0]["task_text"], "2+2=?")

    def test_c03_import_token_rejects_default_secret_in_prod_and_prevents_replay(self):
        with patch.dict(
            os.environ,
            {
                "ENVIRONMENT": "staging",
                "ADMIN_SECRET": DEFAULT_ADMIN_SECRET,
                "IMPORT_PREVIEW_TOKEN_SECRET": "",
                "INTERNAL_PROXY_SHARED_SECRET": "",
            },
            clear=False,
        ):
            with self.assertRaises(HTTPException) as ctx:
                _get_import_preview_token_secret()
            self.assertEqual(ctx.exception.status_code, 500)

        with patch.dict(
            os.environ,
            {
                "ENVIRONMENT": "production",
                "ADMIN_SECRET": DEFAULT_ADMIN_SECRET,
                "IMPORT_PREVIEW_TOKEN_SECRET": "",
                "INTERNAL_PROXY_SHARED_SECRET": "a" * 40,
            },
            clear=False,
        ):
            secret = _get_import_preview_token_secret()
            self.assertNotEqual(secret, DEFAULT_ADMIN_SECRET)
            self.assertNotEqual(secret, "a" * 40)

            token, _ = _issue_import_preview_token("admin@example.com", "hash123")
            payload = _verify_import_preview_token(token, "admin@example.com")
            self.assertEqual(payload["payload_hash"], "hash123")
            _consume_import_preview_token_jti(payload["jti"], int(payload["exp"]))
            with self.assertRaises(HTTPException) as replay_ctx:
                _consume_import_preview_token_jti(payload["jti"], int(payload["exp"]))
            self.assertEqual(replay_ctx.exception.status_code, 400)
            self.assertEqual(replay_ctx.exception.detail["code"], "IMPORT_PREVIEW_TOKEN_REPLAYED")

    def test_h16_import_rejects_unsafe_solution_filename(self):
        for bad in ("../../etc/passwd", "https://evil.example/x.svg", "javascript:alert(1)"):
            with self.assertRaises(Exception):
                _normalize_import_bank_task(
                    {
                        "text": "2+2",
                        "answer": "4",
                        "question_type": "input",
                        "solution_filename": bad,
                    }
                )

    def test_c04_environment_fail_closed_and_legacy_bootstrap_opt_in(self):
        for prod_like in ("production", "prod", "staging", "preview", "typo-env"):
            with patch.dict(os.environ, {"ENVIRONMENT": prod_like}, clear=False):
                self.assertTrue(get_settings().is_production, f"{prod_like} must be treated as production")
                self.assertFalse(_legacy_admin_bootstrap_enabled())
                self.assertFalse(_legacy_role_bootstrap_enabled())

        for dev_like in ("development", "dev", "test", "local"):
            with patch.dict(
                os.environ,
                {"ENVIRONMENT": dev_like, "ALLOW_LEGACY_ADMIN_BOOTSTRAP": "false"},
                clear=False,
            ):
                self.assertFalse(get_settings().is_production)
                self.assertFalse(_legacy_admin_bootstrap_enabled())
                self.assertFalse(_legacy_role_bootstrap_enabled())

        with patch.dict(
            os.environ,
            {
                "ENVIRONMENT": "staging",
                "DATABASE_URL": "postgresql://u:p@localhost/db",
                "INTERNAL_PROXY_SHARED_SECRET": "x" * 40,
                "ALLOWED_ORIGINS": "*",
            },
            clear=False,
        ):
            with self.assertRaises(ValueError):
                validate_configuration()

    def test_h01_h02_csrf_returns_403_not_500_with_cors_headers_and_allows_patch(self):
        with patch.dict(
            os.environ,
            {
                "ENVIRONMENT": "development",
                "CSRF_ENABLED": "true",
                "ALLOWED_ORIGINS": "https://app.qazmath.test",
                "DATABASE_URL": "postgresql://u:p@localhost/db",
            },
            clear=False,
        ):
            app = create_app()

            @app.patch("/api/test-patch")
            async def _test_patch():
                return {"ok": True}

            client = TestClient(app, raise_server_exceptions=False)
            resp = client.post(
                "/api/test-patch",
                headers={"Origin": "https://app.qazmath.test"},
            )
            self.assertEqual(resp.status_code, 403)
            self.assertEqual(resp.headers.get("access-control-allow-origin"), "https://app.qazmath.test")

            preflight = client.options(
                "/api/test-patch",
                headers={
                    "Origin": "https://app.qazmath.test",
                    "Access-Control-Request-Method": "PATCH",
                },
            )
            self.assertEqual(preflight.status_code, 200)
            self.assertIn("PATCH", preflight.headers.get("access-control-allow-methods", ""))

    def test_h05_null_admin_role_fails_closed(self):
        fake_db = MagicMock()
        fake_db.users.is_admin = AsyncMock(return_value=True)
        fake_db.users.get_user_by_email = AsyncMock(
            return_value={"id": 7, "email": "legacy@example.com", "is_admin": 1, "admin_role": None}
        )
        with patch.dict(os.environ, {"ENVIRONMENT": "development"}, clear=False):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(require_admin(email="legacy@example.com", db=fake_db))
            self.assertEqual(ctx.exception.status_code, 403)

            with self.assertRaises(HTTPException) as ctx2:
                asyncio.run(require_admin_review_manage(email="legacy@example.com", db=fake_db))
            self.assertEqual(ctx2.exception.status_code, 403)


class MathEngineP0RegressionTests(unittest.TestCase):
    def test_c05_nested_polynomial_power_dos_is_rejected_quickly(self):
        started = time.perf_counter()
        result = is_task_answer_correct(
            {"question_type": "input", "answer": "x+1"},
            "((((x^20)^20)^20)+1)/(x+1)",
        )
        elapsed = time.perf_counter() - started
        self.assertFalse(result)
        self.assertLess(elapsed, 0.25)

    def test_c06_coordinates_sets_and_root_lists_do_not_collapse_to_decimals(self):
        self.assertFalse(is_task_answer_correct({"question_type": "input", "answer": "(1, 2)"}, "1.2"))
        self.assertFalse(is_task_answer_correct({"question_type": "input", "answer": "{1, 2}"}, "6/5"))
        self.assertFalse(is_task_answer_correct({"question_type": "input", "answer": "1, 2"}, "1.2"))
        self.assertTrue(is_task_answer_correct({"question_type": "input", "answer": "(1, 2)"}, "(1,2)"))
        self.assertTrue(is_task_answer_correct({"question_type": "input", "answer": "{1, 2}"}, "{1,2}"))
        self.assertTrue(is_task_answer_correct({"question_type": "input", "answer": "5"}, "5,0"))

    def test_c07_trailing_percent_cannot_bypass_math_final_form(self):
        self.assertFalse(is_task_answer_correct({"question_type": "input", "answer": "110"}, "(88+22)*100%"))
        self.assertFalse(is_task_answer_correct({"question_type": "input", "answer": "110"}, r"(88+22)\cdot 100\%"))
        self.assertTrue(is_task_answer_correct({"question_type": "input", "answer": r"25\%"}, "0,25"))
        self.assertTrue(is_task_answer_correct({"question_type": "input", "answer": "0,25"}, "25%"))

    def test_c08_euler_constant_not_scientific_notation_and_no_500_crash(self):
        self.assertFalse(is_task_answer_correct({"question_type": "input", "answer": "2000"}, "2e + 3"))
        self.assertTrue(is_task_answer_correct({"question_type": "input", "answer": "2e + 3"}, "3 + 2e"))
        # Must return False cleanly instead of raising unhandled ValueError
        self.assertFalse(is_task_answer_correct({"question_type": "input", "answer": "x = 1"}, "x/1e700 = 1e700"))

    def test_c09_strict_written_vs_choices_mcq_and_select_grading(self):
        written_mcq = {
            "question_type": "mcq",
            "answer_mode": "written",
            "answer": "B",
            "options": json.dumps([
                {"label": "A", "text": "10"},
                {"label": "B", "text": "42"},
                {"label": "C", "text": "99"},
                {"label": "D", "text": "0"},
            ]),
        }
        self.assertFalse(is_task_answer_correct(written_mcq, "B"))
        self.assertTrue(is_task_answer_correct(written_mcq, "42"))

        choices_mcq_with_letter_text = {
            "question_type": "mcq",
            "answer_mode": "choices",
            "answer": "B",
            "options": json.dumps([
                {"label": "A", "text": "5"},
                {"label": "B", "text": "A"},
                {"label": "C", "text": "7"},
                {"label": "D", "text": "8"},
            ]),
        }
        self.assertFalse(is_task_answer_correct(choices_mcq_with_letter_text, "A"))
        self.assertTrue(is_task_answer_correct(choices_mcq_with_letter_text, "B"))

        written_mcq6 = {
            "question_type": "mcq6",
            "answer_mode": "written",
            "answer": '["A", "C"]',
            "options": json.dumps([
                {"label": "A", "text": "1"},
                {"label": "B", "text": "2"},
                {"label": "C", "text": "3"},
                {"label": "D", "text": "4"},
                {"label": "E", "text": "5"},
                {"label": "F", "text": "6"},
            ]),
        }
        self.assertEqual(grade_task_answer(written_mcq6, ["A", "C"]), (0, 2))
        self.assertEqual(grade_task_answer(written_mcq6, ["1", "3"]), (2, 2))

        written_select = {
            "question_type": "select",
            "answer_mode": "written",
            "answer": '["C", "A"]',
            "options": json.dumps([
                {"label": "A", "text": "10"},
                {"label": "B", "text": "20"},
                {"label": "C", "text": "30"},
                {"label": "D", "text": "40"},
            ]),
        }
        self.assertEqual(grade_task_answer(written_select, ["C", "A"]), (0, 2))
        self.assertEqual(grade_task_answer(written_select, ["30", "10"]), (2, 2))

    def test_h18_h19_math_false_negatives_and_written_interval_slots(self):
        # x \in (0; 1) vs (0; 1)
        self.assertTrue(is_task_answer_correct({"question_type": "input", "answer": r"(0; 1)"}, r"x \in (0; 1)"))
        self.assertTrue(is_task_answer_correct({"question_type": "input", "answer": r"x \in (0; 1)"}, r"(0; 1)"))
        self.assertFalse(is_task_answer_correct({"question_type": "input", "answer": r"(0; 2)"}, r"x \in (0; 1+1)"))

        # \frac{2x}{3} vs \frac{2}{3}x and \frac{2\pi}{3} vs \frac{2}{3}\pi (while rejecting unreduced \frac{4x}{6})
        self.assertTrue(is_task_answer_correct({"question_type": "input", "answer": r"\frac{2}{3}x"}, r"\frac{2x}{3}"))
        self.assertTrue(is_task_answer_correct({"question_type": "input", "answer": r"\frac{2x}{3}"}, r"\frac{2}{3}x"))
        self.assertTrue(is_task_answer_correct({"question_type": "input", "answer": r"\frac{2}{3}\pi"}, r"\frac{2\pi}{3}"))
        self.assertFalse(is_task_answer_correct({"question_type": "input", "answer": r"\frac{2}{3}x"}, r"\frac{4x}{6}"))

        # 2\pi r vs 2r\pi and \pi r^2 vs r^2\pi
        self.assertTrue(is_task_answer_correct({"question_type": "input", "answer": r"2\pi r"}, r"2r\pi"))
        self.assertTrue(is_task_answer_correct({"question_type": "input", "answer": r"\pi r^2"}, r"r^2\pi"))

        # xy vs yx and x \cdot y (without corrupting sin(x) into s*i*n*x)
        self.assertTrue(is_task_answer_correct({"question_type": "input", "answer": "xy"}, "yx"))
        self.assertTrue(is_task_answer_correct({"question_type": "input", "answer": "xy"}, r"x\cdot y"))
        self.assertFalse(is_task_answer_correct({"question_type": "input", "answer": "sin(x)"}, "nis(x)"))

        # H-19: closed interval [1, 2] on 1-slot written MCQ and zero slot [0, 5]
        written_interval_mcq = {
            "question_type": "mcq",
            "answer_mode": "written",
            "answer": "A",
            "options": json.dumps([
                {"label": "A", "text": "[1, 2]"},
                {"label": "B", "text": "(1, 2)"},
                {"label": "C", "text": "[0, 1]"},
                {"label": "D", "text": "[2, 3]"},
            ]),
        }
        self.assertTrue(is_task_answer_correct(written_interval_mcq, "[1, 2]"))
        written_zero_mcq = {
            "question_type": "mcq6",
            "answer_mode": "written",
            "answer": '["A", "B"]',
            "options": json.dumps([
                {"label": "A", "text": "0"},
                {"label": "B", "text": "5"},
                {"label": "C", "text": "1"},
                {"label": "D", "text": "2"},
                {"label": "E", "text": "3"},
                {"label": "F", "text": "4"},
            ]),
        }
        self.assertTrue(is_task_answer_correct(written_zero_mcq, [0, 5]))


class RepositorySafetyRegressionTests(unittest.TestCase):
    def test_c11_visit_path_and_route_reject_unicode_digits_overflow_and_nul(self):
        self.assertIsNone(normalize_visit_path("/modules/²"))
        self.assertIsNone(normalize_visit_path("/modules/\x001"))
        self.assertEqual(normalize_visit_path("/modules/42"), "/modules/42")

        label, entity = parse_visit_route("/modules/²")
        self.assertIsNone(entity)
        self.assertEqual(label, "/modules/²")

        label_big, entity_big = parse_visit_route("/modules/99999999999999999999")
        self.assertIsNone(entity_big)
        self.assertEqual(label_big, "/modules/99999999999999999999")

        label_ok, entity_ok = parse_visit_route("/modules/12")
        self.assertEqual(entity_ok, ("module", 12))
        self.assertEqual(label_ok, "Модуль #12")

    def test_c13_batch_update_preserves_column_alignment_and_rejects_sqli_identifiers(self):
        repo = BaseRepository("postgresql://u:p@localhost/db")
        executed: list[tuple[str, list]] = []

        class FakeConn:
            async def execute(self, query, params):
                executed.append((query, list(params)))

            async def executemany(self, query, values):
                executed.append((query, list(values)))

            async def commit(self):
                return None

        conn = FakeConn()
        asyncio.run(
            repo.batch_update(
                "users",
                [
                    {1: {"a": 1, "b": 2}},
                    {2: {"b": 20, "a": 10}},
                ],
                "id",
                conn=conn,
            )
        )
        self.assertEqual(len(executed), 2)
        self.assertEqual(executed[0][0], "UPDATE users SET a = ?,b = ? WHERE id = ?")
        self.assertEqual(executed[0][1], [1, 2, 1])
        self.assertEqual(executed[1][0], "UPDATE users SET a = ?,b = ? WHERE id = ?")
        self.assertEqual(executed[1][1], [10, 20, 2])

        with self.assertRaises(ValueError):
            asyncio.run(repo.batch_insert("users; DROP TABLE users", ["a"], [(1,)], conn=conn))
        with self.assertRaises(ValueError):
            asyncio.run(repo.batch_update("users", [{1: {"a = 1; --": 2}}], "id", conn=conn))


class Sprint2RegressionTests(unittest.TestCase):
    @staticmethod
    def _make_request(
        method: str,
        path: str,
        headers: dict[str, str],
        query_string: bytes = b"",
    ) -> Request:
        scope = {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": method.upper(),
            "scheme": "http",
            "path": path,
            "raw_path": path.encode("utf-8"),
            "query_string": query_string,
            "headers": [(k.lower().encode("latin-1"), v.encode("latin-1")) for k, v in headers.items()],
            "client": ("127.0.0.1", 12345),
            "server": ("testserver", 80),
        }
        return Request(scope)

    def test_h03_proxy_v2_downgrade_blocked_and_required_for_get_in_prod(self):
        secret = "s" * 48
        ts = str(int(time.time()))
        email = "user@example.com"
        payload_v1 = build_canonical_proxy_payload(
            method="GET",
            path="/api/user/web/user@example.com",
            raw_query="",
            user_email=email,
            timestamp=ts,
        )
        sig_v1 = hmac.new(secret.encode("utf-8"), payload_v1, hashlib.sha256).hexdigest()

        with patch.dict(
            os.environ,
            {
                "ENVIRONMENT": "production",
                "INTERNAL_PROXY_SHARED_SECRET": secret,
            },
            clear=False,
        ):
            # Nonce present without V2 signature -> must reject as incomplete_v2_headers (no downgrade)
            req_nonce_only = self._make_request(
                "GET",
                "/api/user/web/user@example.com",
                {
                    PROXY_TS_HEADER: ts,
                    PROXY_NONCE_HEADER: "nonce-123",
                    PROXY_SIGNATURE_HEADER: sig_v1,
                    PROXY_EMAIL_HEADER: email,
                },
            )
            ok, _, err = verify_proxy_signature(req_nonce_only)
            self.assertFalse(ok)
            self.assertEqual(err, "incomplete_v2_headers")

            # V2 signature present without nonce -> must reject as incomplete_v2_headers
            req_sig_v2_only = self._make_request(
                "GET",
                "/api/user/web/user@example.com",
                {
                    PROXY_TS_HEADER: ts,
                    PROXY_SIGNATURE_V2_HEADER: sig_v1,
                    PROXY_EMAIL_HEADER: email,
                },
            )
            ok, _, err = verify_proxy_signature(req_sig_v2_only)
            self.assertFalse(ok)
            self.assertEqual(err, "incomplete_v2_headers")

            # Legacy V1 GET in production -> must reject with v2_signature_required
            req_v1_prod = self._make_request(
                "GET",
                "/api/user/web/user@example.com",
                {
                    PROXY_TS_HEADER: ts,
                    PROXY_SIGNATURE_HEADER: sig_v1,
                    PROXY_EMAIL_HEADER: email,
                },
            )
            ok, _, err = verify_proxy_signature(req_v1_prod)
            self.assertFalse(ok)
            self.assertEqual(err, "v2_signature_required")

            # Proper V2 GET in production -> accepted once, replay rejected
            nonce = f"n-{time.time_ns()}"
            payload_v2 = build_canonical_proxy_payload(
                method="GET",
                path="/api/user/web/user@example.com",
                raw_query="",
                user_email=email,
                timestamp=ts,
                nonce=nonce,
            )
            sig_v2 = hmac.new(secret.encode("utf-8"), payload_v2, hashlib.sha256).hexdigest()
            v2_headers = {
                PROXY_TS_HEADER: ts,
                PROXY_NONCE_HEADER: nonce,
                PROXY_SIGNATURE_V2_HEADER: sig_v2,
                PROXY_EMAIL_HEADER: email,
            }
            ok, verified_email, err = verify_proxy_signature(
                self._make_request("GET", "/api/user/web/user@example.com", v2_headers)
            )
            self.assertTrue(ok)
            self.assertEqual(verified_email, email)
            self.assertIsNone(err)

            ok_replay, _, err_replay = verify_proxy_signature(
                self._make_request("GET", "/api/user/web/user@example.com", v2_headers)
            )
            self.assertFalse(ok_replay)
            self.assertEqual(err_replay, "replayed_signature")

    def test_h04_private_email_from_path_handles_non_email_and_nickname(self):
        self.assertEqual(_private_email_from_path("/api/user/web/victim", "GET"), "victim")
        self.assertEqual(_private_email_from_path("/api/user/web/Student@Example.COM", "GET"), "student@example.com")
        self.assertEqual(_private_email_from_path("/api/export/user/victim", "GET"), "victim")
        self.assertIsNone(_private_email_from_path("/api/user/web/nickname", "POST"))
        self.assertEqual(_private_email_from_path("/api/user/web/nickname", "GET"), "nickname")

    def test_h12_report_email_masking_and_unreported_task_edit_denied(self):
        self.assertEqual(_mask_email("student@example.com"), "st***@example.com")
        self.assertEqual(_mask_email("ab@example.com"), "a***@example.com")
        self.assertEqual(_mask_email("plain-no-at"), "plain-no-at")

        fake_db = MagicMock()
        fake_db.users.is_admin = AsyncMock(return_value=True)
        fake_db.users.get_user_by_email = AsyncMock(
            return_value={"id": 11, "email": "reviewer@example.com", "is_admin": 1, "admin_role": "reviewer"}
        )
        fake_db.tasks.get_task_by_id = AsyncMock(return_value={"id": 99, "bank_task_id": 500})
        fake_db.reports.has_report_for_task = AsyncMock(return_value=False)

        with patch.dict(os.environ, {"ENVIRONMENT": "development"}, clear=False):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(
                    _update_task_from_report_common(
                        task_id=99,
                        text="Updated",
                        answer="4",
                        question_type="input",
                        text_scale="md",
                        options=None,
                        subquestions=None,
                        image=None,
                        email="reviewer@example.com",
                        db=fake_db,
                    )
                )
        self.assertEqual(ctx.exception.status_code, 403)
        fake_db.reports.has_report_for_task.assert_awaited_once_with(99)

    def test_h21_connection_pool_wakes_waiter_immediately_on_broken_release(self):
        async def _scenario():
            created: list[object] = []

            class FakeConn:
                def __init__(self, idx: int, fail_rollback: bool = False):
                    self.idx = idx
                    self.fail_rollback = fail_rollback
                    self.closed = False
                    self.row_factory = "dirty"
                    self._lastrowid = 999

                async def rollback(self):
                    if self.fail_rollback:
                        raise RuntimeError("connection dropped")

                async def close(self):
                    self.closed = True

            async def fake_connect(_url: str, timeout: int = 30):
                idx = len(created) + 1
                conn = FakeConn(idx, fail_rollback=(idx == 1))
                created.append(conn)
                return conn

            pool = ConnectionPool("postgresql://u:p@localhost/db", max_size=1, timeout=5)
            with patch("utils.connection_pool.db_driver.connect", side_effect=fake_connect):
                c1 = await pool.acquire()
                self.assertEqual(c1.idx, 1)
                self.assertIsNone(c1.row_factory)
                self.assertIsNone(c1._lastrowid)

                waiter_task = asyncio.create_task(pool.acquire())
                await asyncio.sleep(0.02)
                started = time.perf_counter()
                await pool.release(c1)
                c2 = await asyncio.wait_for(waiter_task, timeout=1.0)
                elapsed = time.perf_counter() - started

                self.assertTrue(c1.closed)
                self.assertEqual(c2.idx, 2)
                self.assertIsNone(c2.row_factory)
                self.assertIsNone(c2._lastrowid)
                self.assertLess(elapsed, 0.5)

                await pool.release(c2)
                await pool.close()

        asyncio.run(_scenario())

    def test_h22_cache_headers_preserve_explicit_and_fail_safe_no_store(self):
        app = FastAPI()
        app.add_middleware(CacheHeadersMiddleware, default_max_age=300)

        @app.get("/api/images/test.png")
        async def _img():
            return Response(
                content=b"png",
                media_type="image/png",
                headers={"Cache-Control": "public, max-age=31536000, immutable"},
            )

        @app.get("/api/modules")
        async def _modules():
            return {"modules": []}

        @app.get("/api/maintenance")
        async def _maint():
            return {"active": False}

        @app.get("/api/push/status")
        async def _push():
            return {"enabled": False}

        @app.get("/api/unknown-private")
        async def _unknown():
            return {"secret": True}

        client = TestClient(app)
        self.assertEqual(
            client.get("/api/images/test.png").headers.get("cache-control"),
            "public, max-age=31536000, immutable",
        )
        self.assertEqual(
            client.get("/api/modules").headers.get("cache-control"),
            "public, max-age=300",
        )
        for no_store_path in ("/api/maintenance", "/api/push/status", "/api/unknown-private"):
            cc = client.get(no_store_path).headers.get("cache-control", "")
            self.assertIn("no-store", cc, f"{no_store_path} must return no-store")

    def test_h23_almaty_streak_preserves_on_negative_days_diff(self):
        today = today_almaty()
        future_date = (today + timedelta(days=1)).isoformat()
        streak, stored_date = calculate_next_streak(5, future_date)
        self.assertEqual(streak, 5)
        self.assertEqual(stored_date, future_date)

        yesterday = (today - timedelta(days=1)).isoformat()
        streak_inc, stored_today = calculate_next_streak(5, yesterday)
        self.assertEqual(streak_inc, 6)
        self.assertEqual(stored_today, today.isoformat())

    def test_h27_h28_export_csv_sanitization_and_push_endpoint_ssrf(self):
        self.assertTrue(_safe_csv_value(" =cmd|' /C calc'!A0").startswith("'"))
        self.assertTrue(_safe_csv_value("\t+1+1").startswith("'"))
        self.assertTrue(_safe_csv_value("\n-2").startswith("'"))
        self.assertEqual(_safe_csv_value("normal text"), "normal text")

        stem = _safe_export_filename_stem('a"b/../c\r\n@d.com')
        self.assertNotIn('"', stem)
        self.assertNotIn("/", stem)
        self.assertNotIn("\r", stem)
        self.assertNotIn("\n", stem)

        self.assertTrue(is_allowed_push_endpoint("https://fcm.googleapis.com/fcm/send/abc"))
        self.assertTrue(is_allowed_push_endpoint("https://fcm.googleapis.com:443/fcm/send/abc"))
        self.assertFalse(is_allowed_push_endpoint("https://evil@fcm.googleapis.com/x"))
        self.assertFalse(is_allowed_push_endpoint("https://fcm.googleapis.com:8443/x"))
        self.assertFalse(is_allowed_push_endpoint("https://fcm.googleapis.com/x\r\n"))
        self.assertFalse(is_allowed_push_endpoint("http://fcm.googleapis.com/x"))
        self.assertFalse(is_allowed_push_endpoint("https://evilfcm.googleapis.com/x"))

    def test_h36_h37_ws_broadcast_timeout_and_bounded_lru_cache(self):
        async def _ws_scenario():
            mgr = QuizConnectionManager()
            mgr.WS_SEND_TIMEOUT_SECONDS = 0.05

            received: list[str] = []

            class FastWS:
                async def accept(self):
                    return None

                async def send_text(self, text: str):
                    received.append(text)

            class HangingWS:
                async def accept(self):
                    return None

                async def send_text(self, _text: str):
                    await asyncio.sleep(5)

            await mgr.connect(1, "fast", FastWS())
            await mgr.connect(1, "hang", HangingWS())

            started = time.perf_counter()
            await mgr.broadcast(1, {"type": "ping"})
            elapsed = time.perf_counter() - started

            self.assertLess(elapsed, 0.5)
            self.assertEqual(len(received), 1)
            self.assertIn("fast", mgr.sessions.get(1, {}))
            self.assertNotIn("hang", mgr.sessions.get(1, {}))

        asyncio.run(_ws_scenario())

        lru = SimpleCache(default_ttl=60, maxsize=3)
        lru.set("a", 1)
        lru.set("b", 2)
        lru.set("c", 3)
        # Touch 'a' so 'b' becomes least-recently used
        self.assertEqual(lru.get("a"), 1)
        lru.set("d", 4)
        self.assertIsNone(lru.get("b"))
        self.assertEqual(lru.get("a"), 1)
        self.assertEqual(lru.get("c"), 3)
        self.assertEqual(lru.get("d"), 4)


class Sprint3RegressionTests(unittest.TestCase):
    def test_p2_prod_app_hides_docs_and_preserves_http_exception_headers_and_sanitizes_request_id(self):
        with patch.dict(
            os.environ,
            {
                "ENVIRONMENT": "production",
                "DATABASE_URL": "postgresql://u:p@localhost/db",
                "INTERNAL_PROXY_SHARED_SECRET": "x" * 40,
                "ALLOWED_ORIGINS": "https://app.qazmath.test",
            },
            clear=False,
        ):
            app = create_app()
            self.assertIsNone(app.docs_url)
            self.assertIsNone(app.redoc_url)
            self.assertIsNone(app.openapi_url)

            @app.get("/api/test-rate-header")
            async def _rate_header():
                raise HTTPException(status_code=429, detail="Too many", headers={"Retry-After": "42"})

            client = TestClient(app, raise_server_exceptions=False)
            self.assertEqual(client.get("/docs").status_code, 404)
            self.assertEqual(client.get("/openapi.json").status_code, 404)

            resp = client.get(
                "/api/test-rate-header",
                headers={"X-Request-ID": "bad\r\nid with spaces"},
            )
            self.assertEqual(resp.status_code, 429)
            self.assertEqual(resp.headers.get("retry-after"), "42")
            req_id = resp.headers.get("x-request-id") or ""
            self.assertNotIn("\r", req_id)
            self.assertNotIn(" ", req_id)
            self.assertNotEqual(req_id, "bad\r\nid with spaces")

            ok_id = _sanitize_request_id("req-123_abc.9")
            self.assertEqual(ok_id, "req-123_abc.9")

    def test_p2_sentry_scrubs_proxy_headers_and_sensitive_query_params(self):
        event = {
            "request": {
                "url": "https://api.qazmath.test/api/user?email=victim@example.com&token=abc&page=2",
                "query_string": "email=victim@example.com&secret=s3cr3t&page=2",
                "headers": {
                    "Authorization": "Bearer secret",
                    "X-Proxy-User-Email": "victim@example.com",
                    "X-Proxy-Request-Signature-V2": "deadbeef",
                    "User-Agent": "pytest",
                },
            }
        }
        cleaned = _before_send(event, {})
        self.assertIsNotNone(cleaned)
        assert cleaned is not None
        self.assertEqual(cleaned["request"]["headers"]["Authorization"], "[REDACTED]")
        self.assertEqual(cleaned["request"]["headers"]["X-Proxy-User-Email"], "[REDACTED]")
        self.assertEqual(cleaned["request"]["headers"]["X-Proxy-Request-Signature-V2"], "[REDACTED]")
        self.assertEqual(cleaned["request"]["headers"]["User-Agent"], "pytest")
        self.assertNotIn("victim@example.com", cleaned["request"]["url"])
        self.assertNotIn("s3cr3t", cleaned["request"]["query_string"])
        self.assertIn("page=2", cleaned["request"]["query_string"])

    def test_p2_math_final_form_rejects_unsimplified_double_negatives(self):
        self.assertFalse(is_task_answer_correct({"question_type": "input", "answer": "2x"}, "(-2)(-x)"))
        self.assertFalse(is_task_answer_correct({"question_type": "input", "answer": "x+2"}, "x-(-2)"))
        self.assertFalse(is_task_answer_correct({"question_type": "input", "answer": "1/2"}, "(-1)/(-2)"))
        self.assertFalse(is_task_answer_correct({"question_type": "input", "answer": "2"}, "--2"))
        # Legitimate signed forms remain accepted
        self.assertTrue(is_task_answer_correct({"question_type": "input", "answer": "-5"}, "+(-5)"))
        self.assertTrue(is_task_answer_correct({"question_type": "input", "answer": "-2x"}, "-2x"))
        self.assertTrue(is_task_answer_correct({"question_type": "input", "answer": "-1/2"}, r"\frac{-1}{2}"))

    def test_p2_bank_quality_exact_float_threshold_and_ai_twins_validation(self):
        # 4 of 5 chars match -> exact SequenceMatcher ratio = 2*4/(5+5) = 0.80
        # Test lengths 4 and 6 where ratio = 2*4/(4+6) = 0.80 (max_len = 4 * (1.2/0.8) = 6.0 exact boundary)
        pairs = _find_similar_pairs([[(0, 1, "abcd"), (1, 2, "abcdxy")]], 0.80)
        self.assertEqual(len(pairs), 1)
        self.assertAlmostEqual(pairs[0][2], 0.80, places=6)

        # AI twins case-insensitive markdown fence & HTTPS enforcement in prod
        self.assertEqual(_parse_json_object("```JSON\n{\"answer\": \"5\"}\n```"), {"answer": "5"})
        self.assertEqual(
            _validate_provider_base_url("https://provider.example/v1/", is_production=True),
            "https://provider.example/v1",
        )
        with self.assertRaises(AiTwinError):
            _validate_provider_base_url("http://provider.example/v1", is_production=True)
        with self.assertRaises(AiTwinError):
            _validate_provider_base_url("https://user:pass@provider.example/v1", is_production=True)

    def test_multipart_upload_with_mixed_case_boundary_passes_proxy_v2_and_fastapi(self):
        secret = "s" * 48
        ts = str(int(time.time()))
        nonce = f"mp-{time.time_ns()}"
        email = "teacher@example.com"
        boundary = "----WebKitFormBoundaryAbCdEf123456"
        jpeg_bytes = b"\xff\xd8\xff\xe0" + b"\x00" * 16
        raw_body = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="image"; filename="title.jpg"\r\n'
            f"Content-Type: image/jpeg\r\n\r\n"
        ).encode("utf-8") + jpeg_bytes + f"\r\n--{boundary}--\r\n".encode("utf-8")
        content_type = f"multipart/form-data; boundary={boundary}"
        signed_content_type = content_type.lower()
        body_sha256 = hashlib.sha256(raw_body).hexdigest()
        path = "/api/constructor/collections/1/images/title"
        raw_query = "email=teacher%40example.com"
        payload = build_canonical_proxy_payload(
            method="POST",
            path=path,
            raw_query=raw_query,
            user_email=email,
            timestamp=ts,
            nonce=nonce,
            body_sha256=body_sha256,
            content_type=signed_content_type,
        )
        sig_v2 = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()

        with patch.dict(
            os.environ,
            {
                "ENVIRONMENT": "production",
                "DATABASE_URL": "postgresql://u:p@localhost/db",
                "INTERNAL_PROXY_SHARED_SECRET": secret,
                "ALLOWED_ORIGINS": "https://app.qazmath.test",
            },
            clear=False,
        ):
            app = create_app()
            app.state.db.users.ensure_user_by_email = AsyncMock(return_value={"id": 1, "email": email})

            @app.post(path)
            async def _upload(image: UploadFile = File(...)):
                data = await image.read()
                return {"filename": image.filename, "content_type": image.content_type, "size": len(data)}

            client = TestClient(app, raise_server_exceptions=False)
            resp = client.post(
                f"{path}?{raw_query}",
                content=raw_body,
                headers={
                    "Content-Type": content_type,
                    PROXY_TS_HEADER: ts,
                    PROXY_NONCE_HEADER: nonce,
                    PROXY_SIGNATURE_V2_HEADER: sig_v2,
                    PROXY_EMAIL_HEADER: email,
                    "X-Proxy-Body-Sha256": body_sha256,
                    "X-Proxy-Content-Type": signed_content_type,
                },
            )
            self.assertEqual(resp.status_code, 200, resp.text)
            self.assertEqual(
                resp.json(),
                {"filename": "title.jpg", "content_type": "image/jpeg", "size": len(jpeg_bytes)},
            )

    def test_list_topics_without_limit_omits_sql_limit_clause(self):
        from repositories.bank.crud import BankTaskCrudMixin

        executed = []

        class _FakeCursor:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                return False

            async def fetchall(self):
                return [("Алгебра",), ("ҰБТ есептері",)]

        class _FakeDb:
            def execute(self, sql, params):
                executed.append((sql, list(params)))
                return _FakeCursor()

        class _FakeConnCtx:
            async def __aenter__(self):
                return _FakeDb()

            async def __aexit__(self, *args):
                return False

        class _FakeRepo(BankTaskCrudMixin):
            def _connection(self):
                return _FakeConnCtx()

            def _normalize_topic(self, text: str) -> str:
                return text.strip().lower()

            def _contains_like_pattern(self, value: str) -> str:
                return f"%{value}%"

        repo = _FakeRepo()
        items = asyncio.run(repo.list_topics(query=None, limit=None))
        self.assertEqual(items, ["Алгебра", "ҰБТ есептері"])
        self.assertEqual(len(executed), 1)
        self.assertNotIn("LIMIT", executed[0][0].upper())
        self.assertEqual(executed[0][1], [])

    def test_task_collection_inherits_latest_template_and_preserves_shared_images(self):
        from repositories.task_collection_repository import TaskCollectionRepository

        rows = {
            1: {
                "id": 1,
                "user_id": 7,
                "title": "Бірінші",
                "header_text": "Ернұр ағай",
                "pptx_font": "Calibri",
                "title_image": "title.jpg",
                "background_image": "bg.jpg",
                "task_ids": [],
                "updated_at": "2026-11-25 00:00:00",
            }
        }
        next_id = [2]

        class _FakeCursor:
            def __init__(self, one=None):
                self._one = one

            def __await__(self):
                async def _done():
                    return self
                return _done().__await__()

            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                return False

            async def fetchone(self):
                return self._one

        class _FakeDb:
            row_factory = None

            def execute(self, sql, params=()):
                s = " ".join(sql.split())
                if s.startswith("SELECT COUNT(*) FROM task_collections"):
                    uid = params[0]
                    return _FakeCursor((sum(1 for r in rows.values() if r["user_id"] == uid),))
                if s.startswith("SELECT header_text, pptx_font, title_image, background_image"):
                    uid = params[0]
                    user_rows = [r for r in rows.values() if r["user_id"] == uid]
                    user_rows.sort(key=lambda r: (r["updated_at"], r["id"]), reverse=True)
                    return _FakeCursor(user_rows[0] if user_rows else None)
                if s.startswith("INSERT INTO task_collections (user_id, title, header_text, pptx_font, title_image, background_image)"):
                    cid = next_id[0]
                    next_id[0] += 1
                    row = {
                        "id": cid,
                        "user_id": params[0],
                        "title": params[1],
                        "header_text": params[2],
                        "pptx_font": params[3],
                        "title_image": params[4],
                        "background_image": params[5],
                        "task_ids": [],
                        "updated_at": "2026-11-25 00:01:00",
                    }
                    rows[cid] = row
                    return _FakeCursor(row)
                if s.startswith("SELECT title_image FROM task_collections") or s.startswith("SELECT background_image FROM task_collections"):
                    col = "title_image" if "SELECT title_image" in s else "background_image"
                    r = rows.get(params[0])
                    return _FakeCursor((r[col],) if r and r["user_id"] == params[1] else None)
                if s.startswith("UPDATE task_collections SET title_image = ?"):
                    rows[params[1]]["title_image"] = params[0]
                    return _FakeCursor(None)
                if s.startswith("DELETE FROM task_collections"):
                    r = rows.pop(params[0], None)
                    return _FakeCursor((r["title_image"], r["background_image"]) if r and r["user_id"] == params[1] else None)
                if s.startswith("SELECT 1 FROM task_collections WHERE title_image = ? OR background_image = ?"):
                    fn = params[0]
                    used = any(r["title_image"] == fn or r["background_image"] == fn for r in rows.values())
                    return _FakeCursor((1,) if used else None)
                raise AssertionError(f"Unexpected SQL: {s}")

        class _FakeTx:
            async def __aenter__(self):
                return _FakeDb()

            async def __aexit__(self, *args):
                return False

        class _FakeRepo(TaskCollectionRepository):
            def __init__(self):
                pass

            def _write_transaction(self, lock_key=None):
                return _FakeTx()

        repo = _FakeRepo()
        created = asyncio.run(repo.create(7, "Екінші"))
        self.assertEqual(
            (created["header_text"], created["pptx_font"], created["title_image"], created["background_image"]),
            ("Ернұр ағай", "Calibri", "title.jpg", "bg.jpg"),
        )
        # Replacing title.jpg on collection #2 must NOT delete title.jpg while collection #1 still uses it.
        found, deletable = asyncio.run(repo.set_image(created["id"], 7, "title", "title2.jpg"))
        self.assertTrue(found)
        self.assertIsNone(deletable)
        # Deleting collection #1 deletes title.jpg (now unreferenced) but keeps bg.jpg (still used by #2).
        found, deleted_files = asyncio.run(repo.delete(1, 7))
        self.assertTrue(found)
        self.assertEqual(deleted_files, ["title.jpg"])
        # Deleting collection #2 deletes both remaining images (title2.jpg and bg.jpg).
        found, deleted_files = asyncio.run(repo.delete(created["id"], 7))
        self.assertTrue(found)
        self.assertEqual(set(deleted_files), {"title2.jpg", "bg.jpg"})


if __name__ == "__main__":
    unittest.main()
