"""GET /api/admin/check answers from the one user row it loads.

Every page's menu asks it, so it must stay one read of the users table; admin routes, which run on
every admin request, likewise read the row once for both "is this an admin" and "which role".

Run from bot/: python -m pytest tests/test_admin_check.py
Needs TEST_DATABASE_URL (see tests/postgres_test_db.py).
"""
from unittest.mock import patch

import httpx
from fastapi import FastAPI, HTTPException
from slowapi import Limiter
from slowapi.util import get_remote_address

import storage
from dependencies import require_admin
from postgres_test_db import PostgresTestCase
from routes.admin.auth import register_auth_routes

SUPER = "check-super@example.com"
REVIEWER = "check-reviewer@example.com"
STUDENT = "check-student@example.com"
BROKEN = "check-broken@example.com"


class AdminCheckTests(PostgresTestCase):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        for email in (SUPER, REVIEWER, STUDENT, BROKEN):
            await self.db.users.create_user_by_email(email)
        await self.db.users.set_admin_with_role(email=SUPER, is_admin=True, role="super_admin")
        await self.db.users.set_admin_with_role(email=REVIEWER, is_admin=True, role="reviewer")
        # An admin flag left without a valid role must not count as an admin.
        async with self.seed() as c:
            await c.execute("UPDATE users SET is_admin = 1, admin_role = 'owner' WHERE LOWER(email) = ?", (BROKEN,))

    def _client(self):
        app = FastAPI()
        app.state.db = self.db
        limiter = Limiter(key_func=get_remote_address)
        app.state.limiter = limiter
        register_auth_routes(app, self.db, limiter)
        return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://admin-check.test")

    def _counting(self, calls):
        original = storage.PostgresConnection.execute

        def counting(connection, sql, parameters=()):
            calls.append(sql)
            return original(connection, sql, parameters)

        return patch.object(storage.PostgresConnection, "execute", counting)

    async def test_each_account_gets_its_role_and_permissions(self):
        async with self._client() as client:
            answers = {
                email: (await client.get("/api/admin/check", params={"email": email})).json()
                for email in (SUPER, REVIEWER, STUDENT, BROKEN)
            }
        self.assertEqual(
            {email: (a["is_admin"], a["role"], a["is_super_admin"], a["permissions"]) for email, a in answers.items()},
            {
                SUPER: (True, "super_admin", True, ["content_manage", "review_manage", "super_critical"]),
                REVIEWER: (True, "reviewer", False, ["review_manage"]),
                STUDENT: (False, None, False, []),
                BROKEN: (False, None, False, []),
            },
        )
        self.assertEqual(answers[STUDENT]["user"]["email"], STUDENT)

    async def test_the_check_reads_the_users_table_once(self):
        for email in (STUDENT, SUPER):
            calls = []
            async with self._client() as client:
                with self._counting(calls):
                    response = await client.get("/api/admin/check", params={"email": email})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(len(calls), 1, (email, calls))

    async def test_an_unknown_account_is_not_found(self):
        async with self._client() as client:
            response = await client.get("/api/admin/check", params={"email": "nobody@example.com"})
        self.assertEqual(response.status_code, 404)

    async def test_admin_routes_read_the_user_once_and_still_refuse_others(self):
        calls = []
        with self._counting(calls):
            admin = await require_admin(email=SUPER, db=self.db)
        self.assertEqual((admin["admin_role"], admin["is_super_admin"]), ("super_admin", True))
        self.assertEqual(len(calls), 1, calls)

        for email in (STUDENT, BROKEN, "nobody@example.com", REVIEWER):
            with self.assertRaises(HTTPException) as refused:
                await require_admin(email=email, db=self.db)
            self.assertEqual(refused.exception.status_code, 403, email)
