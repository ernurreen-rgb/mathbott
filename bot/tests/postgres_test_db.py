"""Disposable PostgreSQL databases for the backend tests.

The backend runs on PostgreSQL only, so the database tests need a server you can throw away:
set TEST_DATABASE_URL to any database on it, for example
postgresql://postgres:postgres@127.0.0.1:5432/postgres. Each test database is created there
under a random name and dropped afterwards. Without the variable the database tests are
skipped, except in CI, where a missing server is an error.
"""
import asyncio
import os
import unittest
from contextlib import asynccontextmanager
from unittest.mock import patch
from urllib.parse import urlsplit, urlunsplit
from uuid import uuid4

import storage
from database import Database

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "").strip()
if not TEST_DATABASE_URL and os.environ.get("CI"):
    raise RuntimeError("TEST_DATABASE_URL must point at a disposable PostgreSQL server in CI")

requires_postgres = unittest.skipUnless(
    TEST_DATABASE_URL, "TEST_DATABASE_URL is not set; database tests need a disposable PostgreSQL server")


def _database_name(url: str) -> str:
    return urlsplit(url).path.lstrip("/")


def create_database(prefix: str = "qazmath_test") -> str:
    """Create an empty database on the test server and return its URL."""
    import psycopg

    name = f"{prefix}_{uuid4().hex[:12]}"
    with psycopg.connect(TEST_DATABASE_URL, autocommit=True) as server:
        server.execute(f'CREATE DATABASE "{name}"')
    return urlunsplit(urlsplit(TEST_DATABASE_URL)._replace(path=f"/{name}"))


def drop_database(url: str) -> None:
    import psycopg

    with psycopg.connect(TEST_DATABASE_URL, autocommit=True) as server:
        server.execute(f'DROP DATABASE IF EXISTS "{_database_name(url)}" WITH (FORCE)')


def sync_id_sequences(url: str) -> None:
    """Move every id sequence past the largest id, so rows seeded with explicit ids cannot collide."""
    import psycopg
    from psycopg import sql

    with psycopg.connect(url, autocommit=True) as connection:
        tables = [row[0] for row in connection.execute(
            "SELECT table_name FROM information_schema.columns "
            "WHERE table_schema = current_schema() AND column_name = 'id' AND is_identity = 'YES'")]
        for table in tables:
            connection.execute(sql.SQL(
                "SELECT setval(pg_get_serial_sequence({name}, 'id'), COALESCE((SELECT MAX(id) FROM {table}), 0) + 1, false)"
            ).format(name=sql.Literal(table), table=sql.Identifier(table)))


@requires_postgres
class PostgresTestCase(unittest.IsolatedAsyncioTestCase):
    """Runs every test against its own freshly migrated database, available as self.db."""

    database_prefix = "qazmath_test"
    environment: dict = {}

    async def asyncSetUp(self):
        self.database_url = await asyncio.to_thread(create_database, self.database_prefix)
        self.addCleanup(drop_database, self.database_url)
        environment = patch.dict(os.environ, {
            "ENVIRONMENT": "development", "DATABASE_URL": self.database_url, "DATABASE_MIGRATION_URL": "",
            "SENTRY_DSN": "", **self.environment,
        })
        environment.start()
        self.addCleanup(environment.stop)
        # The pool matches production and saves a new connection per repository call.
        self.db = Database(self.database_url)
        await self.db.init()
        self.addAsyncCleanup(self.db.connection_pool.close)

    def connect(self) -> storage.PostgresConnection:
        """A plain connection to this test's database."""
        return storage.connect(self.database_url)

    @asynccontextmanager
    async def seed(self):
        """A connection for fixture rows: commits on exit and moves id sequences past explicit ids."""
        async with self.connect() as connection:
            yield connection
            await connection.commit()
        await asyncio.to_thread(sync_id_sequences, self.database_url)
