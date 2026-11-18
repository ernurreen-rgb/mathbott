"""A signed-in student gets an account on the first API request, not only on the profile page.

Run from bot/: python -m pytest tests/test_signed_in_user.py

Needs TEST_DATABASE_URL (see tests/postgres_test_db.py).
"""
import hashlib
import hmac
import json
import time
from uuid import uuid4

import httpx

from app import create_app
from postgres_test_db import PostgresTestCase
from routes.tasks import setup_tasks_routes
from utils.internal_proxy_auth import build_canonical_proxy_payload

SECRET = "signed-in-user-test-proxy-secret-0123456789"
NEW_STUDENT = "fresh-student@example.com"


def _signed(method: str, path: str, email: str, secret: str = SECRET) -> dict:
    """Headers the Next.js proxy adds for a signed-in user (the legacy form, accepted outside production)."""
    timestamp = str(int(time.time()))
    payload = build_canonical_proxy_payload(method=method, path=path, raw_query="", user_email=email, timestamp=timestamp)
    return {
        "X-Proxy-Request-Ts": timestamp,
        "X-Proxy-Request-Signature": hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest(),
        "X-Proxy-User-Email": email,
    }


def _signed_v2(method: str, path: str, email: str, body: bytes, content_type: str = "application/json") -> dict:
    """The form production requires for writes: nonce plus a hash of the exact body, as the proxy sends it."""
    timestamp = str(int(time.time()))
    nonce = uuid4().hex
    body_sha256 = hashlib.sha256(body).hexdigest()
    payload = build_canonical_proxy_payload(
        method=method, path=path, raw_query="", user_email=email, timestamp=timestamp,
        nonce=nonce, body_sha256=body_sha256, content_type=content_type,
    )
    return {
        "X-Proxy-Request-Ts": timestamp,
        "X-Proxy-Request-Nonce": nonce,
        "X-Proxy-Request-Signature-V2": hmac.new(SECRET.encode(), payload, hashlib.sha256).hexdigest(),
        "X-Proxy-User-Email": email,
        "X-Proxy-Body-Sha256": body_sha256,
        "X-Proxy-Content-Type": content_type,
        "Content-Type": content_type,
    }


class SignedInUserTests(PostgresTestCase):
    environment = {"INTERNAL_PROXY_SHARED_SECRET": SECRET, "CSRF_ENABLED": "false"}

    async def asyncSetUp(self):
        await super().asyncSetUp()
        async with self.seed() as connection:
            await connection.execute("INSERT INTO modules (id, name) VALUES (1, 'Арифметика')")
            await connection.execute("INSERT INTO sections (id, module_id, name, sort_order) VALUES (1, 1, 'Қосу', 0)")
            await connection.execute(
                "INSERT INTO lessons (id, section_id, title, lesson_number, sort_order) VALUES (1, 1, 'Сабақ 1', 1, 0)"
            )
            await connection.execute("INSERT INTO mini_lessons (id, lesson_id, mini_index) VALUES (1, 1, 1)")
        bank = await self.db.bank_tasks.create_task(text="15 + 8", answer="23", question_type="input", difficulty="A")
        async with self.seed() as connection:
            await connection.execute(
                "INSERT INTO tasks (id, mini_lesson_id, bank_task_id, sort_order) VALUES (101, 1, ?, 0)", (bank["id"],)
            )

    def _client(self):
        # The real middleware stack, so the order of the identity check and the account step is tested too.
        app = create_app()
        app.state.db = self.db
        setup_tasks_routes(app, self.db, app.state.limiter)
        return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://signed-in.test")

    async def _accounts(self, email: str) -> int:
        async with self.connect() as connection:
            async with connection.execute("SELECT COUNT(*) FROM users WHERE email = ?", (email,)) as cursor:
                return (await cursor.fetchone())[0]

    async def test_a_new_student_can_answer_before_opening_the_profile(self):
        body = {"task_id": 101, "answer": "23", "email": NEW_STUDENT}
        async with self._client() as client:
            first = await client.post("/api/task/check", json=body, headers=_signed("POST", "/api/task/check", NEW_STUDENT))
            self.assertEqual(first.status_code, 200, first.text)
            self.assertTrue(first.json()["correct"])
            again = await client.post("/api/task/check", json=body, headers=_signed("POST", "/api/task/check", NEW_STUDENT))
            self.assertEqual(again.status_code, 200, again.text)
        self.assertEqual(await self._accounts(NEW_STUDENT), 1)

    async def test_an_existing_account_is_left_as_it_is(self):
        await self.db.users.create_user_by_email(NEW_STUDENT)
        async with self.seed() as connection:
            await connection.execute("UPDATE users SET nickname = 'Ерке' WHERE email = ?", (NEW_STUDENT,))
        body = {"task_id": 101, "answer": "23", "email": NEW_STUDENT}
        async with self._client() as client:
            response = await client.post("/api/task/check", json=body, headers=_signed("POST", "/api/task/check", NEW_STUDENT))
        self.assertEqual(response.status_code, 200, response.text)
        user = await self.db.users.get_user_by_email(NEW_STUDENT)
        self.assertEqual(user["nickname"], "Ерке")
        self.assertEqual(await self._accounts(NEW_STUDENT), 1)

    async def test_only_a_verified_identity_creates_an_account(self):
        body = {"task_id": 101, "answer": "23", "email": NEW_STUDENT}
        async with self._client() as client:
            # No signature: the email is only a claim, so nothing is created and the route reports it.
            unsigned = await client.post("/api/task/check", json=body)
            self.assertEqual(unsigned.status_code, 404, unsigned.text)
            forged = await client.post(
                "/api/task/check", json=body, headers=_signed("POST", "/api/task/check", NEW_STUDENT, secret="wrong-secret")
            )
            self.assertEqual(forged.status_code, 401, forged.text)
        self.assertEqual(await self._accounts(NEW_STUDENT), 0)


class SignedInUserInProductionTests(SignedInUserTests):
    """The same first answer under the production identity checks: v2 signatures and body hashes."""

    environment = {
        "INTERNAL_PROXY_SHARED_SECRET": SECRET,
        "ENVIRONMENT": "production",
        "ALLOWED_ORIGINS": "https://qazmath.vercel.app",
    }

    async def test_a_new_student_can_answer_before_opening_the_profile(self):
        body = json.dumps({"task_id": 101, "answer": "23", "email": NEW_STUDENT}).encode()
        async with self._client() as client:
            response = await client.post(
                "/api/task/check", content=body, headers=_signed_v2("POST", "/api/task/check", NEW_STUDENT, body),
            )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()["correct"])
        self.assertEqual(await self._accounts(NEW_STUDENT), 1)

    async def test_an_existing_account_is_left_as_it_is(self):
        self.skipTest("covered outside production; the production case is about the request checks")

    async def test_only_a_verified_identity_creates_an_account(self):
        body = json.dumps({"task_id": 101, "answer": "23", "email": NEW_STUDENT}).encode()
        async with self._client() as client:
            unsigned = await client.post("/api/task/check", content=body, headers={"Content-Type": "application/json"})
        self.assertEqual(unsigned.status_code, 401, unsigned.text)
        self.assertEqual(await self._accounts(NEW_STUDENT), 0)
