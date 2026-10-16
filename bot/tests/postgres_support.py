"""Opt-in real PostgreSQL fixtures; each test owns an isolated schema.

Set MATHBOT_TEST_DATABASE_URL to a disposable PostgreSQL database. Never use
the production Neon URL: this fixture creates/drops its own test schemas.
"""
import asyncio
import os
from urllib.parse import parse_qsl, quote, urlencode, urlsplit, urlunsplit
from uuid import uuid4

import pytest

from database import Database


@pytest.fixture
def postgres_test_db():
    import psycopg
    from psycopg import sql

    url = os.environ["MATHBOT_TEST_DATABASE_URL"]
    schema = "mathbot_test_" + uuid4().hex
    with psycopg.connect(url, autocommit=True) as connection:
        connection.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query))
    query["options"] = query.get("options", "") + f" -c search_path={schema},public"
    target = urlunsplit(parts._replace(query=urlencode(query, quote_via=quote)))
    db = Database(target, use_pool=False)
    try:
        asyncio.run(db.init())
        yield db
    finally:
        with psycopg.connect(url, autocommit=True) as connection:
            connection.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))
