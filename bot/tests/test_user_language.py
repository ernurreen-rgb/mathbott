"""The student's interface language is saved in the profile and comes back with the user data.

Run from bot/: python -m pytest tests/test_user_language.py

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
from routes.users import setup_users_routes
from utils.cache import cache
from utils.internal_proxy_auth import build_canonical_proxy_payload

SECRET = "user-language-test-proxy-secret-0123456789"
STUDENT = "language-student@example.com"


def _signed(method: str, path: str, email: str, body: bytes = b"", content_type: str = "application/json") -> dict:
    """Headers the Next.js proxy adds for a signed-in user, in the form production requires for writes."""
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


class UserLanguageTests(PostgresTestCase):
    environment = {"INTERNAL_PROXY_SHARED_SECRET": SECRET, "CSRF_ENABLED": "false"}

    async def asyncSetUp(self):
        await super().asyncSetUp()
        cache.clear()
        await self.db.users.create_user_by_email(STUDENT)

    def _client(self):
        app = create_app()
        app.state.db = self.db
        setup_users_routes(app, self.db, app.state.limiter)
        return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://language.test")

    async def _post_language(self, client, language: str):
        path = "/api/user/web/language"
        body = json.dumps({"email": STUDENT, "language": language}).encode()
        return await client.post(path, content=body, headers=_signed("POST", path, STUDENT, body))

    async def test_a_new_student_has_no_language_yet(self):
        user = await self.db.users.get_user_by_email(STUDENT)
        self.assertIsNone(user["language"])

    async def test_the_chosen_language_is_saved_and_returned(self):
        async with self._client() as client:
            # Read once first, so a stale cached copy would show if saving forgot to clear it.
            await client.get(f"/api/user/web/{STUDENT}?fields=language")
            response = await self._post_language(client, "ru")
            self.assertEqual(response.status_code, 200, response.text)
            data = (await client.get(f"/api/user/web/{STUDENT}?fields=language")).json()
        self.assertEqual(data["language"], "ru")
        self.assertEqual((await self.db.users.get_user_by_email(STUDENT))["language"], "ru")

    async def test_only_kazakh_and_russian_are_accepted(self):
        async with self._client() as client:
            response = await self._post_language(client, "en")
        self.assertEqual(response.status_code, 422, response.text)
        self.assertIsNone((await self.db.users.get_user_by_email(STUDENT))["language"])

    async def test_the_database_rejects_other_values(self):
        with self.assertRaises(Exception):
            async with self.seed() as connection:
                await connection.execute("UPDATE users SET language = 'en' WHERE email = ?", (STUDENT,))
