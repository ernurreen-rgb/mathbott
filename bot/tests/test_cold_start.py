"""An API cold start: the database connection made while the code imports, and the phases reported.

On Vercel a cold start cost students 3-5 s (client_request_timings, 22-25 Nov 2026): about a second
of imports and about a second for the first connection. storage.start_prewarm() overlaps the two,
and the first response says where the rest went (utils/boot_timing.py).

Run from bot/: python -m pytest tests/test_cold_start.py
Needs TEST_DATABASE_URL (see tests/postgres_test_db.py).
"""
import sys
import time
import unittest
from unittest.mock import patch

import httpx
from fastapi import FastAPI

import storage
from middleware.request_context_middleware import RequestContextMiddleware
from postgres_test_db import PostgresTestCase
from utils import boot_timing


class _ConnectTimings:
    """Collect storage.connect_timings the way the middleware does for a request."""

    def __enter__(self):
        self.timings = []
        self._token = storage.connect_timings.set(self.timings)
        return self.timings

    def __exit__(self, *_):
        storage.connect_timings.reset(self._token)


class PrewarmTests(PostgresTestCase):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        storage.reset_prewarm_for_tests()
        storage.clear_id_tables_cache()
        self.addCleanup(storage.reset_prewarm_for_tests)
        self.addCleanup(storage.clear_id_tables_cache)

    async def _open_and_close(self):
        connection = await storage.connect(self.database_url)
        async with connection.execute("SELECT 1") as cursor:
            self.assertEqual((await cursor.fetchone())[0], 1)
        await connection.close()

    async def test_the_first_connection_takes_the_one_made_in_the_background(self):
        self.assertTrue(storage.start_prewarm(self.database_url))
        self.assertFalse(storage.start_prewarm(self.database_url), "once per process")
        with _ConnectTimings() as timings:
            await self._open_and_close()
            await self._open_and_close()
        self.assertEqual([prewarmed for _, prewarmed in timings], [True, False])
        # The id-tables query ran in the background too, so no connection needs it any more.
        self.assertIn("users", storage._ID_TABLES_CACHE[self.database_url])

    async def test_a_failed_or_stale_prewarm_falls_back_to_a_normal_connection(self):
        real_connect = storage._connect_sync
        with patch.object(storage, "_connect_sync", side_effect=[OSError("network down"), real_connect(self.database_url, 30)]):
            storage.start_prewarm(self.database_url)
            with _ConnectTimings() as timings:
                await self._open_and_close()
        self.assertEqual([prewarmed for _, prewarmed in timings], [False])

        storage.reset_prewarm_for_tests()
        storage.start_prewarm(self.database_url)
        storage._prewarm["done"].wait(30)
        # Opened long before the first request: too old to trust.
        storage._prewarm["ready_at"] = time.monotonic() - storage.PREWARM_MAX_AGE_SECONDS - 1
        with _ConnectTimings() as timings:
            await self._open_and_close()
        self.assertEqual([prewarmed for _, prewarmed in timings], [False])

    async def test_another_database_is_not_given_the_prewarmed_connection(self):
        storage.start_prewarm(self.database_url + "&application_name=other" if "?" in self.database_url
                              else self.database_url + "?application_name=other")
        with _ConnectTimings() as timings:
            await self._open_and_close()
        self.assertEqual([prewarmed for _, prewarmed in timings], [False])

    async def test_a_bad_url_starts_nothing(self):
        self.assertFalse(storage.start_prewarm(""))
        self.assertFalse(storage.start_prewarm("sqlite:///x.db"))


class ServerTimingTests(PostgresTestCase):
    def _app(self, db=None):
        app = FastAPI()
        app.add_middleware(RequestContextMiddleware)

        @app.get("/api/ping")
        async def ping():
            return {"ok": True}

        @app.get("/api/db")
        async def uses_the_database():
            connection = await storage.connect(self.database_url)
            await connection.close()
            return {"ok": True}

        return app

    async def test_the_first_response_has_the_cold_start_phases_and_later_ones_do_not(self):
        boot_timing.reset_for_tests()
        self.addCleanup(boot_timing.reset_for_tests)
        boot_timing.mark("imported")
        boot_timing.mark("startup")
        boot_timing.mark("ready")
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=self._app()), base_url="http://t.test") as client:
            first = (await client.get("/api/ping")).headers["server-timing"]
            second = (await client.get("/api/ping")).headers["server-timing"]
        self.assertRegex(first, r"^app;dur=[\d.]+, api-cold(, api-process;dur=[\d.]+)?, api-import;dur=[\d.]+, "
                                r"api-startup;dur=[\d.]+, api-wait;dur=[\d.]+$")
        self.assertRegex(second, r"^app;dur=[\d.]+$")

    async def test_a_request_that_opened_a_connection_says_how_long_it_took(self):
        boot_timing.reset_for_tests()
        boot_timing.cold_start_metrics(0.0)  # This process is warm.
        self.addCleanup(boot_timing.reset_for_tests)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=self._app()), base_url="http://t.test") as client:
            timing = (await client.get("/api/db")).headers["server-timing"]
        self.assertRegex(timing, r"^app;dur=[\d.]+, db-connect;dur=[\d.]+$")


class SentryTagTests(unittest.TestCase):
    def test_requests_do_not_load_sentry_when_it_is_not_set_up(self):
        app = FastAPI()
        app.add_middleware(RequestContextMiddleware)

        @app.get("/api/ping")
        async def ping():
            return {"ok": True}

        import asyncio

        async def call():
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t.test") as client:
                return await client.get("/api/ping")

        with patch.dict(sys.modules):
            sys.modules.pop("sentry_sdk", None)
            response = asyncio.run(call())
            self.assertNotIn("sentry_sdk", sys.modules)
        self.assertEqual(response.status_code, 200)
