"""Frequent small writes do not queue behind the application write lock.

Every student sends a presence heartbeat every 25 seconds, and the reminder offer records an event
on every summary. Neither reads anything to authorize its write, so neither may wait while an
answer check holds the write lock (the process lock, and the PostgreSQL advisory lock it takes).

Run from bot/: python -m pytest tests/test_write_lock_free.py
Needs TEST_DATABASE_URL (see tests/postgres_test_db.py).
"""
import asyncio

import psycopg

import storage
from postgres_test_db import PostgresTestCase
from repositories.base import _get_process_write_lock

STUDENT = "lock-free@example.com"


class WriteLockFreeTests(PostgresTestCase):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        await self.db.users.create_user_by_email(STUDENT)
        self.student = await self.db.users.get_user_by_email(STUDENT)

    async def test_heartbeats_go_through_while_an_answer_holds_the_process_write_lock(self):
        async with _get_process_write_lock():
            users = await asyncio.wait_for(self.db.users.heartbeat_presence(self.student["id"], path="/modules"), 5)
        self.assertIn(self.student["id"], [user["id"] for user in users])

    async def test_reminder_events_go_through_while_another_process_holds_the_advisory_lock(self):
        # Another instance in the middle of a write transaction.
        with psycopg.connect(self.database_url, autocommit=True) as other:
            other.execute("SELECT pg_advisory_lock(%s)", (storage.WRITE_LOCK_ID,))
            try:
                recorded = await asyncio.wait_for(
                    self.db.push.record_prompt_event(self.student["id"], "off", "seen"), 5
                )
            finally:
                other.execute("SELECT pg_advisory_unlock(%s)", (storage.WRITE_LOCK_ID,))
        self.assertTrue(recorded)

    async def test_other_writes_still_wait_for_the_write_lock(self):
        # The lock itself stays for every write that goes through _write_transaction.
        async with _get_process_write_lock():
            waiting = asyncio.ensure_future(self.db.push.cleanup_old_prompt_events(90))
            await asyncio.sleep(0.3)
            self.assertFalse(waiting.done())
        await asyncio.wait_for(waiting, 5)
