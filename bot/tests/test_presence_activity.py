"""Only a heartbeat from an open page counts as a student's activity.

Every page of the site sends its path with the heartbeat. A tab still running the site from before
page tracking (2026-11-18) sends none, and pinged from the background for days: a student who
opened nothing looked active every day in the admin statistics.

Run from bot/: python -m pytest tests/test_presence_activity.py
Needs TEST_DATABASE_URL (see tests/postgres_test_db.py).
"""
import httpx
from fastapi import FastAPI
from slowapi import Limiter
from slowapi.util import get_remote_address

from postgres_test_db import PostgresTestCase
from routes.presence import setup_presence_routes

STUDENT = "presence-student@example.com"
LONG_AGO = "2026-11-10 16:28:36"


class PresenceActivityTests(PostgresTestCase):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        self.student = await self.db.users.create_user_by_email(STUDENT)
        async with self.seed() as c:
            await c.execute("UPDATE users SET last_active = ?, last_seen_path = NULL WHERE id = ?",
                            (LONG_AGO, self.student["id"]))

    async def _activity(self):
        async with self.connect() as c:
            async with c.execute("SELECT last_active, last_seen_path FROM users WHERE id = ?",
                                 (self.student["id"],)) as cursor:
                last_active, last_seen_path = await cursor.fetchone()
            async with c.execute("SELECT path FROM user_page_visits WHERE user_id = ? ORDER BY id",
                                 (self.student["id"],)) as cursor:
                visits = [row[0] for row in await cursor.fetchall()]
        return last_active, last_seen_path, visits

    async def test_a_heartbeat_from_a_page_is_activity(self):
        online = await self.db.users.heartbeat_presence(self.student["id"], path="/lessons/3")
        last_active, last_seen_path, visits = await self._activity()
        self.assertGreater(last_active, LONG_AGO)
        self.assertEqual((last_seen_path, visits), ("/lessons/3", ["/lessons/3"]))
        self.assertIn(self.student["id"], [user["id"] for user in online])

    async def test_a_heartbeat_without_a_page_changes_nothing(self):
        for path in (None, "", "   ", "/api/presence/heartbeat", "https://evil.example/x", "//evil", "/жол"):
            online = await self.db.users.heartbeat_presence(self.student["id"], path=path)
            self.assertNotIn(self.student["id"], [user["id"] for user in online], path)
        await self.db.users.record_presence_activity(self.student["id"], path=None)
        self.assertEqual(await self._activity(), (LONG_AGO, None, []))

    async def test_the_route_still_answers_an_old_tab(self):
        app = FastAPI()
        app.state.db = self.db
        limiter = Limiter(key_func=get_remote_address)
        app.state.limiter = limiter
        setup_presence_routes(app, self.db, limiter)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://presence.test") as client:
            old_tab = await client.post("/api/presence/heartbeat", params={"email": STUDENT})
            self.assertEqual(old_tab.status_code, 200, old_tab.text)
            self.assertEqual(await self._activity(), (LONG_AGO, None, []))
            page = await client.post("/api/presence/heartbeat", params={"email": STUDENT, "path": "/modules"})
        self.assertEqual(page.status_code, 200)
        self.assertEqual((await self._activity())[1:], ("/modules", ["/modules"]))
