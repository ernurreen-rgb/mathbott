"""Request timings from students' devices: POST /api/client-timings (Server-Timing: test_cold_start.py).

Run from bot/: python -m pytest tests/test_client_timings.py
Needs TEST_DATABASE_URL (see tests/postgres_test_db.py).
"""
import httpx
from fastapi import FastAPI
from slowapi import Limiter
from slowapi.util import get_remote_address

from postgres_test_db import PostgresTestCase
from routes.client_timings import setup_client_timings_routes

STUDENT = "timing-student@example.com"


def _report(**overrides):
    report = {
        "kind": "slow", "method": "GET", "path": "lessons/:id", "page": "/lessons/:id", "status": 200,
        "duration_ms": 3400, "ttfb_ms": 3300, "proxy_ms": 64, "api_ms": 58, "app_ms": 31, "was_hidden": False,
        "effective_type": "3g", "started_at": "2026-11-20T06:48:30.000Z",
        "details": {"total_ms": 3420, "dns_ms": 0, "connect_ms": 0, "reused_connection": True, "protocol": "h2",
                    "rtt_ms": 450, "downlink_mbps": 0.7, "online": True, "proxy_cold": True,
                    "user_agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)"},
    }
    report.update(overrides)
    return report


class ClientTimingTests(PostgresTestCase):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        self.student = await self.db.users.create_user_by_email(STUDENT)

    def _client(self):
        app = FastAPI()
        app.state.db = self.db
        limiter = Limiter(key_func=get_remote_address)
        app.state.limiter = limiter
        setup_client_timings_routes(app, self.db, limiter)
        return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://timings.test")

    async def _rows(self):
        async with self.connect() as c:
            async with c.execute(
                "SELECT user_id, tab_id, kind, path, page, status, error, duration_ms, ttfb_ms, proxy_ms, api_ms, "
                "app_ms, was_hidden, effective_type, started_at, details->>'rtt_ms', details->>'proxy_cold', "
                "details->>'user_agent' FROM client_request_timings ORDER BY id"
            ) as cursor:
                return [tuple(row) for row in await cursor.fetchall()]

    async def test_a_signed_in_students_batch_is_stored_with_their_account(self):
        async with self._client() as client:
            response = await client.post("/api/client-timings", params={"email": STUDENT}, json={
                "tab_id": "tab-1",
                "reports": [_report(), _report(kind="failed", status=None, error="network", duration_ms=12, ttfb_ms=None,
                                               proxy_ms=None, api_ms=None, app_ms=None, details={})],
            })
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), {"recorded": 2})
        self.assertEqual(await self._rows(), [
            (self.student["id"], "tab-1", "slow", "lessons/:id", "/lessons/:id", 200, None, 3400, 3300, 64, 58, 31,
             0, "3g", "2026-11-20T06:48:30.000Z", "450", "true",
             "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)"),
            (self.student["id"], "tab-1", "failed", "lessons/:id", "/lessons/:id", None, "network", 12, None, None,
             None, None, 0, "3g", "2026-11-20T06:48:30.000Z", None, None, None),
        ])

    async def test_a_guest_may_report_without_an_account(self):
        async with self._client() as client:
            response = await client.post("/api/client-timings", json={"tab_id": "guest-tab", "reports": [_report()]})
        self.assertEqual(response.json(), {"recorded": 1})
        self.assertIsNone((await self._rows())[0][0])

    async def test_oversized_or_malformed_batches_are_refused(self):
        bad_batches = [
            {"tab_id": "tab-1", "reports": [_report()] * 21},
            {"tab_id": "tab-1", "reports": []},
            {"tab_id": "tab 1;drop", "reports": [_report()]},
            {"tab_id": "tab-1", "reports": [_report(kind="debug")]},
            {"tab_id": "tab-1", "reports": [_report(error="timeout")]},
            {"tab_id": "tab-1", "reports": [_report(duration_ms=-1)]},
            {"tab_id": "tab-1", "reports": [_report(path="x" * 161)]},
            {"tab_id": "tab-1", "reports": [_report(method="get")]},
            {"tab_id": "tab-1", "reports": [_report(details={"user_agent": "x" * 301})]},
        ]
        async with self._client() as client:
            for batch in bad_batches:
                response = await client.post("/api/client-timings", json=batch)
                self.assertEqual(response.status_code, 422, batch["reports"][:1])
        self.assertEqual(await self._rows(), [])

    async def test_fields_the_api_does_not_know_are_not_stored(self):
        async with self._client() as client:
            await client.post("/api/client-timings", json={
                "tab_id": "tab-1", "reports": [_report(details={"rtt_ms": 100, "email": "someone@example.com"})],
            })
        async with self.connect() as c:
            async with c.execute("SELECT details::text FROM client_request_timings") as cursor:
                (details,) = await cursor.fetchone()
        self.assertNotIn("someone@example.com", details)

    async def test_old_timings_are_cleaned_up(self):
        async with self._client() as client:
            await client.post("/api/client-timings", json={"tab_id": "tab-1", "reports": [_report(), _report()]})
        async with self.seed() as c:
            await c.execute("UPDATE client_request_timings SET received_at = '2026-01-01 00:00:00' WHERE id = 1")
        self.assertEqual(await self.db.client_timings.cleanup_old(30), 1)
        self.assertEqual(len(await self._rows()), 1)

    async def test_the_api_runs_before_the_migration_is_applied(self):
        async with self.seed() as c:
            await c.execute("DROP TABLE client_request_timings")
        async with self._client() as client:
            response = await client.post("/api/client-timings", json={"tab_id": "tab-1", "reports": [_report()]})
        self.assertEqual(response.json(), {"recorded": 0})
        self.assertEqual(await self.db.client_timings.cleanup_old(30), 0)

