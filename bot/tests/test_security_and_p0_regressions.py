"""Regression tests for Sprint 1 P0/P1 security, math-engine, and data-integrity fixes.

Runs purely in-memory without requiring a PostgreSQL database:
    cd bot && python -m pytest tests/test_security_and_p0_regressions.py -v
"""
from __future__ import annotations

import asyncio
import json
import os
import time
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import create_app
from config import validate_configuration
from dependencies import require_admin, require_admin_review_manage
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
from routes.admin.roles import _legacy_role_bootstrap_enabled
from routes.reports import _strip_report_answers
from settings import DEFAULT_ADMIN_SECRET, get_settings
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


if __name__ == "__main__":
    unittest.main()
