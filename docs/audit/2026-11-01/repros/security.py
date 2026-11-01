#!/usr/bin/env python3
"""Reproduce two audit findings using only an isolated temporary SQLite database.

Usage: python mathbot-audit-security-repros.py E:\\CursorMathbot\\bot
Requires the backend dependencies to be installed. No application lifespan,
.env loading, network server, object storage or external services are used.
Assertions describe the vulnerable behavior at the audited revision: after a
fix, a failing assertion is expected and should be reviewed as a regression check.
"""
from __future__ import annotations

import argparse
import asyncio
from collections import Counter
import hashlib
import hmac
import json
import logging
import os
from pathlib import Path
import sys
import tempfile
import time
from urllib.parse import urlencode
from uuid import uuid4


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("backend_dir", type=Path)
    parser.add_argument("--requests", type=int, default=120,
                        help="Number of guest lookup/join requests (default: 120)")
    args = parser.parse_args()
    backend = args.backend_dir.resolve(strict=True)
    if not (backend / "database.py").is_file():
        parser.error("backend_dir must contain the project's database.py")
    if args.requests < 61:
        parser.error("--requests must be at least 61")

    sys.path.insert(0, str(backend))
    # Settings read only process environment. Do not load the checkout's .env.
    secret = "isolated-audit-secret-" + uuid4().hex
    os.environ.update({
        "ENVIRONMENT": "production",
        "INTERNAL_PROXY_SHARED_SECRET": secret,
        "CSRF_ENABLED": "true",
        "SENTRY_DSN": "",
        "DATABASE_URL": "",
        "DATABASE_MIGRATION_URL": "",
        "IMAGE_STORAGE_BACKEND": "local",
        "BACKGROUND_TASKS_ENABLED": "false",
        "ALERTS_ENABLED": "false",
        "ALERT_TELEGRAM_ENABLED": "false",
        "EMAIL_NOTIFICATIONS_ENABLED": "false",
        "PUSH_NOTIFICATIONS_ENABLED": "false",
    })
    logging.disable(logging.CRITICAL)

    from fastapi import FastAPI, HTTPException
    from fastapi.testclient import TestClient
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.errors import RateLimitExceeded
    from slowapi.util import get_remote_address
    from database import Database
    from middleware.csrf import CSRFMiddleware
    from middleware.error_handler import http_exception_handler
    from middleware.request_context_middleware import RequestContextMiddleware
    from middleware.trusted_proxy_identity import TrustedProxyIdentityMiddleware
    from routes.admin.bank import register_bank_routes
    from routes.quiz_game import setup_quiz_game_routes
    from routes.trial_tests import setup_trial_tests_routes

    def signed_headers(method: str, path: str, body: str = "", *,
                       content_type: str = "", email: str = "") -> dict[str, str]:
        timestamp, nonce = str(int(time.time())), uuid4().hex
        body_hash = hashlib.sha256(body.encode("utf-8")).hexdigest()
        parts = [method, path, "", email, timestamp, nonce]
        if method in {"POST", "PUT", "PATCH", "DELETE"}:
            parts.extend([body_hash, content_type])
        signature = hmac.new(secret.encode(), "\n".join(parts).encode(),
                             hashlib.sha256).hexdigest()
        headers = {
            "X-Proxy-Request-Ts": timestamp,
            "X-Proxy-Request-Nonce": nonce,
            "X-Proxy-Request-Signature-V2": signature,
        }
        if email:
            headers["X-Proxy-User-Email"] = email
        if method in {"POST", "PUT", "PATCH", "DELETE"}:
            headers["X-Proxy-Body-Sha256"] = body_hash
            headers["X-Proxy-Content-Type"] = content_type
            headers["Content-Type"] = content_type
        return headers

    with tempfile.TemporaryDirectory(prefix="mathbot-security-audit-") as temp_dir:
        db_path = str(Path(temp_dir) / "audit.sqlite3")
        os.environ["DB_PATH"] = db_path

        async def prepare():
            db = Database(db_path=db_path, use_pool=False)
            await db.init()
            owner = await db.users.create_user_by_email("audit-owner@example.com")
            await db.users.set_admin_with_role(email=owner["email"],
                                               is_admin=True, role="super_admin")
            trial = await db.trial_tests.create_trial_test("Audit trial",
                                                           created_by=owner["id"])
            quiz = await db.quizzes.create_quiz("Audit quiz", owner["id"])
            await db.quizzes.add_question(quiz["id"], "1+1", question_type="input",
                                          correct_answer="2")
            session = await db.quizzes.create_session(quiz["id"], owner["id"])
            return db, owner, trial, session

        db, owner, trial, session = asyncio.run(prepare())
        app = FastAPI()  # Deliberately no production lifespan or external tasks.
        app.state.db = db
        app.state.environment = "production"
        limiter = Limiter(key_func=get_remote_address)
        app.state.limiter = limiter
        app.add_exception_handler(HTTPException, http_exception_handler)
        app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
        register_bank_routes(app, db, limiter)
        setup_trial_tests_routes(app, db, limiter)
        setup_quiz_game_routes(app, db, limiter)
        app.add_middleware(CSRFMiddleware)
        app.add_middleware(TrustedProxyIdentityMiddleware)
        app.add_middleware(RequestContextMiddleware)

        with TestClient(app) as client:
            options = [
                {"label": label, "text": label, "correct": label == "A",
                 "answer": "hidden-solution"}
                for label in "ABCD"
            ]
            form = urlencode({
                "email": owner["email"], "text": "Which option is correct?",
                "answer": "A", "question_type": "mcq", "options": json.dumps(options),
            })
            path = "/api/admin/bank/tasks"
            created = client.post(path, content=form, headers=signed_headers(
                "POST", path, form, content_type="application/x-www-form-urlencoded",
                email=owner["email"]))
            assert created.status_code == 200, created.text
            bank = created.json()
            asyncio.run(db.trial_tests.create_trial_test_task(
                trial["id"], "Question", "A", created_by=owner["id"],
                bank_task_id=bank["id"]))
            path = f"/api/trial-tests/{trial['id']}"
            response = client.get(path, headers=signed_headers("GET", path,
                                                               email=owner["email"]))
            assert response.status_code == 200, response.text
            leaked_options = response.json()["tasks"][0]["options"]
            assert leaked_options == options, leaked_options
            print(json.dumps({
                "finding": "student_options_solution_metadata_leak",
                "admin_create_status": created.status_code,
                "student_detail_status": response.status_code,
                "leaked_options": leaked_options,
            }))

            lookup_path = f"/api/quiz-sessions/pin/{session['pin_code']}"
            lookups = [client.get(lookup_path).status_code for _ in range(args.requests)]
            join_path = "/api/quiz-sessions/join"
            joins = []
            for number in range(args.requests):
                body = json.dumps({"pin_code": session["pin_code"],
                                   "nickname": f"Guest{number}"})
                joined = client.post(join_path, content=body, headers=signed_headers(
                    "POST", join_path, body, content_type="application/json"))
                joins.append(joined.status_code)
                assert joined.status_code == 200, joined.text
            assert lookups == [200] * args.requests, Counter(lookups)

            async def participant_count():
                return len(await db.quizzes.list_participants(session["id"]))

            count = asyncio.run(participant_count())
            assert count == args.requests, count
            print(json.dumps({
                "finding": "unrestricted_guest_quiz_lookup_and_join",
                "same_client_pin_lookup_statuses": dict(Counter(lookups)),
                "same_client_anonymous_join_statuses": dict(Counter(joins)),
                "persisted_participants": count,
            }))
    print("Both vulnerable behaviors reproduced; temporary SQLite data removed.")


if __name__ == "__main__":
    main()
