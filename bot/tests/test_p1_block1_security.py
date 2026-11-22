"""Regression tests for Block 1 (P1 Security, RBAC, and Rate Limiting: H-01..H-07).

Runs purely in-memory without requiring a PostgreSQL database:
    cd bot && ./venv/Scripts/python.exe -m pytest tests/test_p1_block1_security.py -v
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import os
import secrets
import time
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.testclient import TestClient
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.requests import Request as StarletteRequest
from starlette.websockets import WebSocketDisconnect

from app import get_rate_limit_key
from middleware.trusted_proxy_identity import TrustedProxyIdentityMiddleware
from repositories.quiz_sessions import QuizSessionsMixin
from routes.admin.bank import register_bank_routes
from routes.admin.content_tasks import register_task_content_routes
from routes.admin.trial_tests import register_trial_tests_routes
from routes.quiz_game import setup_quiz_game_routes
from routes.quizzes import setup_quizzes_routes
from routes.reports import setup_reports_routes
from routes.trial_tests import setup_trial_tests_routes
from utils import internal_proxy_auth as proxy_auth
from utils.internal_proxy_auth import (
    PROXY_BODY_SHA256_HEADER,
    PROXY_CLIENT_KEY_HEADER,
    PROXY_CLIENT_KEY_SIGNATURE_HEADER,
    PROXY_CONTENT_TYPE_HEADER,
    PROXY_EMAIL_HEADER,
    PROXY_NONCE_HEADER,
    PROXY_SIGNATURE_V2_HEADER,
    PROXY_TS_HEADER,
    build_canonical_proxy_payload,
    build_presence_ws_token,
    verify_presence_ws_token,
    verify_proxy_signature,
)
from utils.quiz import QuizError
from utils.quiz_ws_auth import issue_quiz_ws_ticket, verify_quiz_ws_ticket


def _sign_v2_headers(
    *,
    secret: str,
    method: str,
    path: str,
    raw_query: str = "",
    user_email: str = "",
    body: bytes = b"",
    content_type: str = "",
    timestamp: int | None = None,
    nonce: str | None = None,
    client_network: str | None = None,
) -> dict[str, str]:
    ts = str(int(timestamp if timestamp is not None else time.time()))
    nonce_val = nonce or f"nonce-{secrets.token_hex(12)}"
    is_mutating = method.upper() in {"POST", "PUT", "PATCH", "DELETE"}
    body_sha256 = hashlib.sha256(body).hexdigest() if is_mutating else None
    signed_ct = content_type.strip().lower() if body_sha256 is not None else None
    payload = build_canonical_proxy_payload(
        method=method,
        path=path,
        raw_query=raw_query,
        user_email=user_email,
        timestamp=ts,
        nonce=nonce_val,
        body_sha256=body_sha256,
        content_type=signed_ct,
    )
    sig_v2 = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    headers = {
        PROXY_TS_HEADER: ts,
        PROXY_NONCE_HEADER: nonce_val,
        PROXY_SIGNATURE_V2_HEADER: sig_v2,
    }
    if user_email:
        headers[PROXY_EMAIL_HEADER] = user_email
    if body_sha256 is not None:
        headers[PROXY_BODY_SHA256_HEADER] = body_sha256
        headers[PROXY_CONTENT_TYPE_HEADER] = signed_ct or ""
    if client_network is not None:
        client_key = hmac.new(
            secret.encode("utf-8"),
            f"PROXY-CLIENT-NETWORK\n{client_network}".encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        client_sig = hmac.new(
            secret.encode("utf-8"),
            "\n".join(["PROXY-CLIENT-KEY", ts, nonce_val, sig_v2, client_key]).encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        headers[PROXY_CLIENT_KEY_HEADER] = client_key
        headers[PROXY_CLIENT_KEY_SIGNATURE_HEADER] = client_sig
    return headers


def _make_starlette_request(
    method: str,
    path: str,
    headers: dict[str, str],
    query_string: bytes = b"",
    client_ip: str = "10.0.0.1",
) -> StarletteRequest:
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
        "client": (client_ip, 54321),
        "server": ("testserver", 80),
    }
    return StarletteRequest(scope)


def _build_multipart(boundary: str, parts: list[tuple[str, bytes, str | None]]) -> bytes:
    chunks: list[bytes] = []
    b = boundary.encode("ascii")
    for name, value, filename in parts:
        disp = f'form-data; name="{name}"'
        if filename is not None:
            disp += f'; filename="{filename}"'
        chunks.append(b"--" + b + b"\r\n")
        chunks.append(f"Content-Disposition: {disp}\r\n".encode("utf-8"))
        if filename is not None:
            chunks.append(b"Content-Type: application/octet-stream\r\n")
        chunks.append(b"\r\n")
        chunks.append(value)
        chunks.append(b"\r\n")
    chunks.append(b"--" + b + b"--\r\n")
    return b"".join(chunks)


class H01MultipartIdentityMiddlewareTests(unittest.TestCase):
    def setUp(self):
        self.secret = "m" * 48
        self.app = FastAPI()
        self.app.add_middleware(TrustedProxyIdentityMiddleware)

        @self.app.post("/api/upload-echo")
        async def _upload_echo(
            email: str = Form(""),
            image: UploadFile | None = File(None),
        ):
            raw = await image.read() if image else b""
            return {"email": email, "image_len": len(raw), "image_prefix": raw[:4].hex()}

    def test_multipart_email_mismatch_and_duplicate_fields_rejected_with_403(self):
        boundary = "----QazMathTestBoundary123"
        ct = f"multipart/form-data; boundary={boundary}"
        png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"

        mismatch_body = _build_multipart(
            boundary,
            [
                ("email", b"victim@example.com", None),
                ("image", png_bytes, "pic.png"),
            ],
        )
        duplicate_body = _build_multipart(
            boundary,
            [
                ("email", b"alice@example.com", None),
                ("email", b"victim@example.com", None),
                ("image", png_bytes, "pic.png"),
            ],
        )
        matching_body = _build_multipart(
            boundary,
            [
                ("email", b"alice@example.com", None),
                ("image", png_bytes, "pic.png"),
            ],
        )

        with patch.dict(
            os.environ,
            {"ENVIRONMENT": "production", "INTERNAL_PROXY_SHARED_SECRET": self.secret},
            clear=False,
        ):
            client = TestClient(self.app)

            # 1) Mismatched email inside multipart/form-data -> 403
            headers = _sign_v2_headers(
                secret=self.secret,
                method="POST",
                path="/api/upload-echo",
                user_email="alice@example.com",
                body=mismatch_body,
                content_type=ct,
            )
            headers["Content-Type"] = ct
            resp = client.post("/api/upload-echo", content=mismatch_body, headers=headers)
            self.assertEqual(resp.status_code, 403)

            # 2) Duplicate email fields with one spoofed -> 403
            dup_headers = _sign_v2_headers(
                secret=self.secret,
                method="POST",
                path="/api/upload-echo",
                user_email="alice@example.com",
                body=duplicate_body,
                content_type=ct,
            )
            dup_headers["Content-Type"] = ct
            dup_resp = client.post("/api/upload-echo", content=duplicate_body, headers=dup_headers)
            self.assertEqual(dup_resp.status_code, 403)

            # 3) Matching email + binary PNG passes and replays intact body to route
            ok_headers = _sign_v2_headers(
                secret=self.secret,
                method="POST",
                path="/api/upload-echo",
                user_email="alice@example.com",
                body=matching_body,
                content_type=ct,
            )
            ok_headers["Content-Type"] = ct
            ok_resp = client.post("/api/upload-echo", content=matching_body, headers=ok_headers)
            self.assertEqual(ok_resp.status_code, 200, ok_resp.text)
            self.assertEqual(ok_resp.json()["email"], "alice@example.com")
            self.assertEqual(ok_resp.json()["image_len"], len(png_bytes))
            self.assertEqual(ok_resp.json()["image_prefix"], "89504e47")

            # 4) Unsigned multipart with email in production -> 401
            unsigned_resp = client.post(
                "/api/upload-echo",
                content=matching_body,
                headers={"Content-Type": ct},
            )
            self.assertEqual(unsigned_resp.status_code, 401)

    def test_malformed_or_truncated_multipart_fails_closed_with_400(self):
        boundary = "----BrokenBoundary"
        ct = f"multipart/form-data; boundary={boundary}"
        truncated = b"--" + boundary.encode() + b'\r\nContent-Disposition: form-data; name="email"\r\n\r\na@b.com'
        garbage = b"definitely not multipart"

        with patch.dict(
            os.environ,
            {"ENVIRONMENT": "production", "INTERNAL_PROXY_SHARED_SECRET": self.secret},
            clear=False,
        ):
            client = TestClient(self.app)
            for bad_ct, bad_body in [
                (ct, truncated),
                (ct, garbage),
                ("multipart/form-data", b"some-body"),
            ]:
                headers = _sign_v2_headers(
                    secret=self.secret,
                    method="POST",
                    path="/api/upload-echo",
                    user_email="alice@example.com",
                    body=bad_body,
                    content_type=bad_ct,
                )
                headers["Content-Type"] = bad_ct
                resp = client.post("/api/upload-echo", content=bad_body, headers=headers)
                self.assertEqual(resp.status_code, 400, f"Expected 400 for ct={bad_ct!r} body={bad_body!r}")


class H02QuizRbacPrivilegeEscalationTests(unittest.TestCase):
    def _build_users(self):
        return {
            "author@example.com": {"id": 1, "email": "author@example.com", "is_admin": 0, "admin_role": None},
            "reviewer@example.com": {"id": 2, "email": "reviewer@example.com", "is_admin": 1, "admin_role": "reviewer"},
            "legacy@example.com": {"id": 3, "email": "legacy@example.com", "is_admin": 1, "admin_role": None},
            "editor@example.com": {"id": 4, "email": "editor@example.com", "is_admin": 1, "admin_role": "content_editor"},
            "super@example.com": {"id": 5, "email": "super@example.com", "is_admin": 1, "admin_role": "super_admin"},
        }

    def test_reviewer_and_null_role_admin_cannot_manage_other_users_quizzes_or_live_sessions(self):
        users_by_email = self._build_users()
        users_by_id = {u["id"]: u for u in users_by_email.values()}

        fake_db = MagicMock()
        fake_db.users.get_user_by_email = AsyncMock(side_effect=lambda e: users_by_email.get(e))
        fake_db.users.get_user_by_id = AsyncMock(side_effect=lambda uid: users_by_id.get(uid))

        quiz_row = {"id": 10, "title": "Teacher Quiz", "created_by": 1, "is_public": 1}
        question_row = {"id": 99, "quiz_id": 10, "question_type": "input", "options": []}
        session_row = {"id": 77, "quiz_id": 10, "host_id": 1, "status": "lobby", "pin_code": "123456"}

        fake_db.quizzes.get_quiz_by_id = AsyncMock(return_value=quiz_row)
        fake_db.quizzes.get_quiz_owners = AsyncMock(return_value={10: 1})
        fake_db.quizzes.set_catalog_fields = AsyncMock(return_value=1)
        fake_db.quizzes.update_quiz = AsyncMock(return_value=quiz_row)
        fake_db.quizzes.delete_quiz = AsyncMock(return_value=None)
        fake_db.quizzes.add_question = AsyncMock(return_value=question_row)
        fake_db.quizzes.get_question_by_id = AsyncMock(return_value=question_row)
        fake_db.quizzes.update_question = AsyncMock(return_value=question_row)
        fake_db.quizzes.delete_question = AsyncMock(return_value=None)
        fake_db.quizzes.get_quiz_sessions = AsyncMock(return_value=[])

        fake_db.quizzes.get_session_by_id = AsyncMock(return_value=session_row)
        fake_db.quizzes.update_session_status = AsyncMock(return_value={**session_row, "status": "in_progress"})
        fake_db.quizzes.get_session_stats = AsyncMock(return_value={"session_id": 77})
        fake_db.quizzes.get_session_questions = AsyncMock(return_value=[question_row])
        fake_db.quizzes.authenticate_participant = AsyncMock(side_effect=QuizError("unauthorized", "Invalid token"))

        app = FastAPI()
        app.state.db = fake_db
        limiter = Limiter(key_func=get_remote_address)
        app.state.limiter = limiter
        app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
        setup_quizzes_routes(app, fake_db, limiter)
        setup_quiz_game_routes(app, fake_db, limiter)

        with patch.dict(os.environ, {"ENVIRONMENT": "development"}, clear=False):
            client = TestClient(app)

            for denied_email, uid in [("reviewer@example.com", 2), ("legacy@example.com", 3)]:
                params = {"email": denied_email}
                self.assertEqual(client.put("/api/quizzes/10", params=params, json={"title": "Hacked"}).status_code, 403)
                self.assertEqual(client.delete("/api/quizzes/10", params=params).status_code, 403)
                self.assertEqual(
                    client.post("/api/quizzes/bulk-catalog", params=params, json={"quiz_ids": [10], "topic": "X"}).status_code,
                    403,
                )
                self.assertEqual(
                    client.post(
                        "/api/quizzes/10/questions",
                        params=params,
                        json={"question_text": "Q?", "question_type": "input", "correct_answer": "1"},
                    ).status_code,
                    403,
                )
                self.assertEqual(
                    client.put("/api/quizzes/10/questions/99", params=params, json={"correct_answer": "2"}).status_code,
                    403,
                )
                self.assertEqual(client.delete("/api/quizzes/10/questions/99", params=params).status_code, 403)

                # Sessions listing must be scoped to reviewer's own host_id (not host_id=None)
                fake_db.quizzes.get_quiz_sessions.reset_mock()
                self.assertEqual(client.get("/api/quizzes/10/sessions", params=params).status_code, 200)
                fake_db.quizzes.get_quiz_sessions.assert_awaited_once_with(10, host_id=uid)

                # Live quiz game host controls must return 403 for reviewer / null-role admin
                self.assertEqual(client.post("/api/quiz-sessions/77/start", params=params).status_code, 403)
                self.assertEqual(client.post("/api/quiz-sessions/77/finish", params=params).status_code, 403)
                self.assertEqual(
                    client.get("/api/quiz-sessions/77/questions", params={**params, "is_host": "true"}).status_code,
                    403,
                )

                # Even with a host WS ticket for reviewer's actor_id, /ws/quiz/{id} must close with 1008
                ticket = issue_quiz_ws_ticket(77, "host", uid)
                with self.assertRaises(WebSocketDisconnect) as ws_ctx:
                    with client.websocket_connect(f"/ws/quiz/77?token={ticket}"):
                        pass
                self.assertEqual(ws_ctx.exception.code, 1008)

            # content_editor and super_admin ARE allowed to manage quizzes & live sessions
            for allowed_email in ("editor@example.com", "super@example.com"):
                params = {"email": allowed_email}
                self.assertEqual(client.put("/api/quizzes/10", params=params, json={"title": "Edited"}).status_code, 200)
                self.assertEqual(client.post("/api/quiz-sessions/77/start", params=params).status_code, 200)
                fake_db.quizzes.get_quiz_sessions.reset_mock()
                self.assertEqual(client.get("/api/quizzes/10/sessions", params=params).status_code, 200)
                fake_db.quizzes.get_quiz_sessions.assert_awaited_once_with(10, host_id=None)

    def test_create_session_blocks_reviewer_from_hosting_private_quiz(self):
        class FakeRepo(QuizSessionsMixin):
            def _write_transaction(self):
                class _Ctx:
                    async def __aenter__(self_inner):
                        return object()

                    async def __aexit__(self_inner, exc_type, exc, tb):
                        return False

                return _Ctx()

        repo = FakeRepo()
        private_quiz = {"id": 5, "created_by": 1, "is_public": 0}
        reviewer_host = {"id": 2, "is_admin": 1, "admin_role": "reviewer"}

        with patch.object(QuizSessionsMixin, "_row", new=AsyncMock(side_effect=[private_quiz, reviewer_host])):
            with self.assertRaises(QuizError) as ctx:
                asyncio.run(repo.create_session(quiz_id=5, host_id=2))
        self.assertEqual(ctx.exception.kind, "forbidden")


class H03BankExportAndQualityRbacTests(unittest.TestCase):
    def test_export_and_quality_routes_require_content_manage_not_review_manage(self):
        users = {
            "reviewer@example.com": {"id": 2, "email": "reviewer@example.com", "is_admin": 1, "admin_role": "reviewer"},
            "editor@example.com": {"id": 4, "email": "editor@example.com", "is_admin": 1, "admin_role": "content_editor"},
            "super@example.com": {"id": 5, "email": "super@example.com", "is_admin": 1, "admin_role": "super_admin"},
        }
        fake_db = MagicMock()
        fake_db.users.is_admin = AsyncMock(side_effect=lambda email: email in users)
        fake_db.users.get_user_by_email = AsyncMock(side_effect=lambda email: users.get(email))
        fake_db.bank_tasks.export_tasks = AsyncMock(return_value=[])
        fake_db.bank_tasks.get_quality_summary = AsyncMock(return_value={"active_total": 1, "dead_total": 0, "no_topics_total": 0})
        fake_db.bank_tasks.list_quality_dead_tasks = AsyncMock(return_value={"items": [], "total": 0})
        fake_db.bank_tasks.list_quality_no_topics_tasks = AsyncMock(return_value={"items": [], "total": 0})
        fake_db.bank_tasks.list_quality_duplicate_clusters = AsyncMock(return_value={"items": [], "total_clusters": 0})

        app = FastAPI()
        app.state.db = fake_db
        limiter = Limiter(key_func=get_remote_address)
        register_bank_routes(app, fake_db, limiter)

        endpoints = [
            "/api/admin/bank/tasks/export",
            "/api/admin/bank/quality/summary",
            "/api/admin/bank/quality/dead",
            "/api/admin/bank/quality/no-topics",
            "/api/admin/bank/quality/duplicates",
        ]

        with patch.dict(os.environ, {"ENVIRONMENT": "development"}, clear=False):
            client = TestClient(app)
            for path in endpoints:
                self.assertEqual(client.get(path, params={"email": "reviewer@example.com"}).status_code, 403, path)
                self.assertEqual(client.get(path, params={"email": "editor@example.com"}).status_code, 200, path)
                self.assertEqual(client.get(path, params={"email": "super@example.com"}).status_code, 200, path)


class H04AdminTaskOwnershipAndBypassTests(unittest.TestCase):
    def test_super_admin_and_null_created_by_allowed_while_query_email_bypass_is_blocked(self):
        users = {
            "owner@example.com": {"id": 10, "email": "owner@example.com", "is_admin": 1, "admin_role": "content_editor"},
            "other@example.com": {"id": 11, "email": "other@example.com", "is_admin": 1, "admin_role": "content_editor"},
            "reviewer@example.com": {"id": 12, "email": "reviewer@example.com", "is_admin": 1, "admin_role": "reviewer"},
            "super@example.com": {"id": 1, "email": "super@example.com", "is_admin": 1, "admin_role": "super_admin"},
        }
        cms_tasks = {
            100: {"id": 100, "created_by": 10, "bank_task_id": 500, "question_type": "input", "answer": "4", "deleted_at": None},
            101: {"id": 101, "created_by": None, "bank_task_id": 501, "question_type": "input", "answer": "5", "deleted_at": None},
            102: {"id": 102, "created_by": 10, "bank_task_id": 502, "question_type": "input", "answer": "6", "deleted_at": "2026-01-01"},
            103: {"id": 103, "created_by": None, "bank_task_id": 503, "question_type": "input", "answer": "7", "deleted_at": "2026-01-01"},
        }
        trial_tasks = {
            200: {"id": 200, "trial_test_id": 5, "created_by": 10, "bank_task_id": 600},
            201: {"id": 201, "trial_test_id": 5, "created_by": None, "bank_task_id": 601},
        }

        fake_db = MagicMock()
        fake_db.users.is_admin = AsyncMock(side_effect=lambda email: email in users)
        fake_db.users.get_user_by_email = AsyncMock(side_effect=lambda email: users.get(email))
        fake_db.tasks.get_task_by_id = AsyncMock(side_effect=lambda tid: cms_tasks.get(tid))
        fake_db.tasks.update_task = AsyncMock(return_value=None)
        fake_db.tasks.soft_delete_task = AsyncMock(return_value=None)
        fake_db.tasks.restore_task = AsyncMock(return_value=None)
        fake_db.bank_tasks.get_task_by_id = AsyncMock(return_value={"id": 600})
        fake_db.bank_tasks.update_task = AsyncMock(return_value={})
        fake_db.trial_tests.get_trial_test_task = AsyncMock(side_effect=lambda tid: trial_tasks.get(tid))
        fake_db.trial_tests.update_trial_test_task = AsyncMock(return_value=None)

        app = FastAPI()
        app.state.db = fake_db
        limiter = Limiter(key_func=get_remote_address)
        register_task_content_routes(app, fake_db, limiter)
        register_trial_tests_routes(app, fake_db, limiter)

        with patch.dict(os.environ, {"ENVIRONMENT": "development"}, clear=False):
            client = TestClient(app)

            # super_admin can edit, delete, and restore tasks owned by another admin
            self.assertEqual(
                client.put("/api/admin/tasks/100", data={"email": "super@example.com", "text": "Edited", "answer": "4"}).status_code,
                200,
            )
            self.assertEqual(client.delete("/api/admin/tasks/100", params={"email": "super@example.com"}).status_code, 200)
            self.assertEqual(client.post("/api/admin/tasks/102/restore", params={"email": "super@example.com"}).status_code, 200)

            # Tasks with created_by=NULL are editable/deletable/restorable by content_editor too
            self.assertEqual(
                client.put("/api/admin/tasks/101", data={"email": "other@example.com", "text": "Fixed", "answer": "5"}).status_code,
                200,
            )
            self.assertEqual(client.delete("/api/admin/tasks/101", params={"email": "other@example.com"}).status_code, 200)
            self.assertEqual(client.post("/api/admin/tasks/103/restore", params={"email": "other@example.com"}).status_code, 200)

            # Another content_editor cannot edit/delete/restore owner's task — including via query string ?email= bypass
            self.assertEqual(
                client.put("/api/admin/tasks/100", data={"email": "other@example.com", "text": "Nope", "answer": "4"}).status_code,
                403,
            )
            self.assertEqual(
                client.put(
                    "/api/admin/tasks/100",
                    params={"email": "other@example.com"},
                    data={"text": "Bypass attempt", "answer": "4"},
                ).status_code,
                403,
            )
            self.assertEqual(
                client.put(
                    "/api/admin/tasks/100",
                    params={"email": "reviewer@example.com"},
                    data={"text": "Reviewer bypass", "answer": "4"},
                ).status_code,
                403,
            )
            self.assertEqual(client.delete("/api/admin/tasks/100", params={"email": "other@example.com"}).status_code, 403)
            self.assertEqual(client.post("/api/admin/tasks/102/restore", params={"email": "other@example.com"}).status_code, 403)

            # Trial test task: super_admin allowed on other admin's task; content_editor allowed on NULL, denied on other's
            self.assertEqual(
                client.put(
                    "/api/admin/trial-tests/5/tasks/200",
                    data={"email": "super@example.com", "text": "T", "answer": "4", "question_type": "input"},
                ).status_code,
                200,
            )
            self.assertEqual(
                client.put(
                    "/api/admin/trial-tests/5/tasks/201",
                    data={"email": "other@example.com", "text": "T", "answer": "4", "question_type": "input"},
                ).status_code,
                200,
            )
            self.assertEqual(
                client.put(
                    "/api/admin/trial-tests/5/tasks/200",
                    data={"email": "other@example.com", "text": "T", "answer": "4", "question_type": "input"},
                ).status_code,
                403,
            )


class H05GuestRateLimitKeyTests(unittest.TestCase):
    def test_guest_proxy_requests_use_signed_client_key_instead_of_shared_proxy_ip(self):
        secret = "r" * 48
        with patch.dict(
            os.environ,
            {"ENVIRONMENT": "production", "INTERNAL_PROXY_SHARED_SECRET": secret},
            clear=False,
        ):
            h1 = _sign_v2_headers(
                secret=secret,
                method="GET",
                path="/api/quiz-sessions/pin/123456",
                user_email="",
                client_network="v4:203.0.113.10",
            )
            h2 = _sign_v2_headers(
                secret=secret,
                method="GET",
                path="/api/quiz-sessions/pin/123456",
                user_email="",
                client_network="v4:198.51.100.20",
            )
            req1 = _make_starlette_request("GET", "/api/quiz-sessions/pin/123456", h1, client_ip="10.0.0.99")
            req2 = _make_starlette_request("GET", "/api/quiz-sessions/pin/123456", h2, client_ip="10.0.0.99")

            key1 = get_rate_limit_key(req1)
            key2 = get_rate_limit_key(req2)
            self.assertTrue(key1.startswith("proxy-client:"))
            self.assertTrue(key2.startswith("proxy-client:"))
            self.assertNotEqual(key1, key2)
            self.assertNotEqual(key1, "10.0.0.99")

            # Tampered client key must NOT be trusted -> falls back to remote IP
            h_bad_client = _sign_v2_headers(
                secret=secret,
                method="GET",
                path="/api/quiz-sessions/pin/123456",
                user_email="",
                client_network="v4:203.0.113.10",
            )
            h_bad_client[PROXY_CLIENT_KEY_HEADER] = "a" * 64
            bad_req = _make_starlette_request("GET", "/api/quiz-sessions/pin/123456", h_bad_client, client_ip="10.0.0.99")
            self.assertEqual(get_rate_limit_key(bad_req), "10.0.0.99")

            # Direct unsigned request with forged header falls back to remote IP
            direct_req = _make_starlette_request(
                "GET",
                "/api/quiz-sessions/pin/123456",
                {PROXY_CLIENT_KEY_HEADER: "b" * 64, PROXY_CLIENT_KEY_SIGNATURE_HEADER: "c" * 64},
                client_ip="10.0.0.77",
            )
            self.assertEqual(get_rate_limit_key(direct_req), "10.0.0.77")

            # Authenticated user still uses user:<email>
            h_auth = _sign_v2_headers(
                secret=secret,
                method="GET",
                path="/api/quizzes",
                user_email="student@example.com",
                client_network="v4:203.0.113.10",
            )
            auth_req = _make_starlette_request("GET", "/api/quizzes", h_auth, client_ip="10.0.0.99")
            self.assertEqual(get_rate_limit_key(auth_req), "user:student@example.com")


class H06WsTicketReplayAndCacheSeparationTests(unittest.TestCase):
    def test_quiz_ws_ticket_is_single_use_and_requires_jti(self):
        secret = "w" * 48
        with patch.dict(
            os.environ,
            {"ENVIRONMENT": "production", "INTERNAL_PROXY_SHARED_SECRET": secret},
            clear=False,
        ):
            ticket = issue_quiz_ws_ticket(42, "player", 7, "credhash")
            first = verify_quiz_ws_ticket(42, ticket)
            self.assertIsNotNone(first)
            self.assertIn("jti", first)
            # Second use must be rejected!
            self.assertIsNone(verify_quiz_ws_ticket(42, ticket))

            # Ticket forged without jti (even with valid HMAC) must be rejected
            legacy_payload = base64.urlsafe_b64encode(
                json.dumps(
                    {
                        "scope": "quiz-ws",
                        "session_id": 42,
                        "role": "player",
                        "actor_id": 7,
                        "credential": "credhash",
                        "expires": int(time.time()) + 60,
                    },
                    separators=(",", ":"),
                ).encode()
            ).decode().rstrip("=")
            legacy_sig = hmac.new(secret.encode(), legacy_payload.encode(), hashlib.sha256).hexdigest()
            self.assertIsNone(verify_quiz_ws_ticket(42, f"{legacy_payload}.{legacy_sig}"))

    def test_presence_ws_token_is_single_use_rejects_legacy_and_large_future_skew(self):
        secret = "p" * 48
        with patch.dict(
            os.environ,
            {"ENVIRONMENT": "production", "INTERNAL_PROXY_SHARED_SECRET": secret},
            clear=False,
        ):
            token = build_presence_ws_token(user_email="student@example.com")
            self.assertEqual(len(token.split(".")), 3)
            ok1, err1 = verify_presence_ws_token(user_email="student@example.com", token=token)
            self.assertTrue(ok1)
            self.assertIsNone(err1)

            ok2, err2 = verify_presence_ws_token(user_email="student@example.com", token=token)
            self.assertFalse(ok2)
            self.assertEqual(err2, "replayed_token")

            # Future skew > 5s rejected (no 240s window)
            future_token = build_presence_ws_token(
                user_email="student@example.com",
                timestamp=int(time.time()) + 60,
            )
            ok_fut, err_fut = verify_presence_ws_token(user_email="student@example.com", token=future_token)
            self.assertFalse(ok_fut)
            self.assertEqual(err_fut, "timestamp_out_of_range")

            # Legacy 2-part token without jti rejected
            ts = str(int(time.time()))
            legacy_payload = f"WS\n/ws/presence\nstudent@example.com\n{ts}".encode("utf-8")
            legacy_sig = hmac.new(secret.encode("utf-8"), legacy_payload, hashlib.sha256).hexdigest()
            ok_leg, err_leg = verify_presence_ws_token(
                user_email="student@example.com",
                token=f"{ts}.{legacy_sig}",
            )
            self.assertFalse(ok_leg)
            self.assertEqual(err_leg, "invalid_token")

    def test_get_flood_cannot_evict_mutating_post_nonces(self):
        secret = "c" * 48
        with patch.dict(
            os.environ,
            {"ENVIRONMENT": "production", "INTERNAL_PROXY_SHARED_SECRET": secret},
            clear=False,
        ), patch.object(proxy_auth, "_PROXY_READ_REPLAY_CACHE_MAX_SIZE", 5):
            post_body = b'{"x":1}'
            post_headers = _sign_v2_headers(
                secret=secret,
                method="POST",
                path="/api/reports",
                user_email="student@example.com",
                body=post_body,
                content_type="application/json",
            )
            post_headers["Content-Type"] = "application/json"
            post_req = _make_starlette_request("POST", "/api/reports", post_headers)
            post_req.state._trusted_proxy_body_sha256 = hashlib.sha256(post_body).hexdigest()

            ok, _, err = verify_proxy_signature(post_req)
            self.assertTrue(ok, err)

            # Flood more GET requests than _PROXY_READ_REPLAY_CACHE_MAX_SIZE (5)
            for i in range(15):
                get_headers = _sign_v2_headers(
                    secret=secret,
                    method="GET",
                    path="/api/modules",
                    user_email="student@example.com",
                    nonce=f"get-flood-{time.time_ns()}-{i}",
                )
                get_req = _make_starlette_request("GET", "/api/modules", get_headers)
                g_ok, _, g_err = verify_proxy_signature(get_req)
                self.assertTrue(g_ok, g_err)

            # Replaying the POST must STILL be rejected!
            post_replay = _make_starlette_request("POST", "/api/reports", post_headers)
            post_replay.state._trusted_proxy_body_sha256 = hashlib.sha256(post_body).hexdigest()
            replay_ok, _, replay_err = verify_proxy_signature(post_replay)
            self.assertFalse(replay_ok)
            self.assertEqual(replay_err, "replayed_signature")


class H07MutatingRoutesRateLimitTests(unittest.TestCase):
    def test_all_mutating_routes_in_target_modules_have_limiter_decorators_and_enforce_429(self):
        fake_db = MagicMock()
        fake_db.users.get_user_by_email = AsyncMock(
            return_value={"id": 1, "email": "student@example.com", "is_admin": 0, "admin_role": None}
        )
        fake_db.tasks.get_task_by_id = AsyncMock(return_value=None)

        app = FastAPI()
        app.state.db = fake_db
        limiter = Limiter(key_func=get_remote_address)
        app.state.limiter = limiter
        app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

        setup_trial_tests_routes(app, fake_db, limiter)
        setup_quizzes_routes(app, fake_db, limiter)
        setup_quiz_game_routes(app, fake_db, limiter)
        setup_reports_routes(app, fake_db, limiter)

        # Verify every POST/PUT/PATCH/DELETE route across all 4 modules is registered in limiter._route_limits
        limited_keys = set(limiter._route_limits.keys())
        missing: list[str] = []
        mutating_count = 0
        for route in app.routes:
            methods = getattr(route, "methods", None) or set()
            if not (methods & {"POST", "PUT", "PATCH", "DELETE"}):
                continue
            mutating_count += 1
            endpoint = getattr(route, "endpoint", None)
            endpoint_key = f"{endpoint.__module__}.{endpoint.__name__}"
            if endpoint_key not in limited_keys:
                missing.append(f"{sorted(methods)} {route.path} ({endpoint_key})")

        self.assertGreaterEqual(mutating_count, 20)
        self.assertEqual(missing, [], f"Mutating routes missing @limiter.limit: {missing}")

        # Verify actual 429 enforcement on POST /api/reports (limit = 15/minute)
        with patch.dict(os.environ, {"ENVIRONMENT": "development"}, clear=False):
            client = TestClient(app)
            statuses = [
                client.post(
                    "/api/reports",
                    params={"email": "student@example.com"},
                    json={"task_id": 999, "message": "Broken task"},
                ).status_code
                for _ in range(16)
            ]
            self.assertEqual(statuses[:15], [404] * 15)
            self.assertEqual(statuses[15], 429)


if __name__ == "__main__":
    unittest.main()
