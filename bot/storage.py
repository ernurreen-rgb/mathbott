"""Async PostgreSQL boundary (Neon in production, any PostgreSQL 17 locally).

Repositories write PostgreSQL SQL with `?` placeholders and use a small cursor
API (execute/fetchone/fetchall, rowcount, lastrowid). `postgres_sql()` turns the
placeholders into psycopg parameters. psycopg runs in worker threads, which also
works with Windows' default event loop.
"""
from __future__ import annotations

import asyncio
import re
from collections.abc import Sequence
from decimal import Decimal
from functools import lru_cache

WRITE_LOCK_ID = 724831921
POSTGRES_URL_PREFIXES = ("postgres://", "postgresql://")


class DatabaseError(Exception):
    """Base class for database errors raised by this module."""


class OperationalError(DatabaseError):
    """A statement failed for a reason other than a constraint violation."""


class IntegrityError(DatabaseError):
    """A statement violated a unique, foreign key, check or not-null constraint."""


def is_postgres(target: str) -> bool:
    return str(target or "").strip().startswith(POSTGRES_URL_PREFIXES)


def require_postgres_url(target: str) -> str:
    """Return the URL, or fail with a message that says how to configure the database."""
    url = str(target or "").strip()
    if not url:
        raise ValueError("DATABASE_URL is not set. QazMath needs PostgreSQL: set DATABASE_URL to a "
                         "postgresql:// URL (see docs/development/setup.md).")
    if not is_postgres(url):
        raise ValueError("DATABASE_URL must be a PostgreSQL connection URL starting with postgresql://; "
                         "SQLite files are no longer supported.")
    return url


def postgres_options(target: str) -> str:
    from psycopg.conninfo import conninfo_to_dict
    return (conninfo_to_dict(target).get("options", "") + " -c timezone=UTC").strip()


def _sql_tokens(sql: str):
    """Separate quoted strings/identifiers/comments from executable SQL."""
    return re.split(r"('(?:''|[^'])*'|\"(?:\"\"|[^\"])*\"|--[^\n]*(?:\n|$)|/\*[\s\S]*?\*/)", sql)


@lru_cache(maxsize=2048)
def postgres_sql(sql: str) -> str:
    """Turn `?` placeholders into psycopg `%s` parameters.

    Values always remain driver parameters. Literal question marks, percent
    signs, comments and SQL strings must never become parameter placeholders.
    """
    sql = sql.strip().rstrip(";")
    parts = _sql_tokens(sql)
    for i in range(0, len(parts), 2):
        parts[i] = parts[i].replace("?", "\x00PARAM\x00")
    sql = "".join(parts)
    # psycopg also parses percent signs inside SQL literals when parameters exist.
    if "\x00PARAM\x00" in sql:
        sql = sql.replace("%", "%%").replace("\x00PARAM\x00", "%s")
    return sql


def _value(value):
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    return value


class Record(Sequence):
    """A result row with both named and positional access."""
    def __init__(self, names, values):
        self._names = names
        self._values = tuple(_value(value) for value in values)

    def keys(self):
        return self._names

    def __getitem__(self, key):
        return self._values[self._names.index(key) if isinstance(key, str) else key]

    def __len__(self):
        return len(self._values)


# Assign to `connection.row_factory` to get Record rows instead of plain tuples.
Row = Record


class PostgresCursor:
    def __init__(self, rows=(), names=(), *, named=False, rowcount=-1, lastrowid=None):
        self._rows = [Record(names, row) if named else tuple(_value(v) for v in row) for row in rows]
        self._position = 0
        self.rowcount = rowcount
        self.lastrowid = lastrowid

    async def fetchone(self):
        if self._position >= len(self._rows):
            return None
        row = self._rows[self._position]
        self._position += 1
        return row

    async def fetchall(self):
        rows = self._rows[self._position:]
        self._position = len(self._rows)
        return rows

    async def close(self):
        self._rows = []

    def __aiter__(self):
        return self

    async def __anext__(self):
        row = await self.fetchone()
        if row is None:
            raise StopAsyncIteration
        return row


class _Query:
    def __init__(self, operation):
        self._operation = operation
        self._cursor = None

    def __await__(self):
        return self._operation.__await__()

    async def __aenter__(self):
        self._cursor = await self._operation
        return self._cursor

    async def __aexit__(self, *_):
        await self._cursor.close()


class PostgresConnection:
    dialect = "postgresql"

    def __init__(self, target, *, timeout=30, **kwargs):
        self._target = target
        self._timeout = timeout
        self._conn = None
        self._id_tables = set()
        self._lastrowid = None
        self.row_factory = None
        self.total_changes = 0

    async def _open(self):
        if self._conn is None:
            import psycopg
            self._conn = await asyncio.to_thread(
                psycopg.connect, self._target, connect_timeout=int(self._timeout),
                prepare_threshold=None, options=postgres_options(self._target),
            )
            def tables():
                with self._conn.cursor() as cursor:
                    cursor.execute("SELECT table_name FROM information_schema.columns "
                                   "WHERE table_schema = current_schema() AND column_name = 'id'")
                    result = {row[0] for row in cursor.fetchall()}
                self._conn.rollback()
                return result
            self._id_tables = await asyncio.to_thread(tables)
        return self

    def __await__(self):
        return self._open().__await__()

    async def __aenter__(self):
        return await self._open()

    async def __aexit__(self, *_):
        await self.close()

    @property
    def in_transaction(self):
        from psycopg.pq import TransactionStatus
        return self._conn.info.transaction_status != TransactionStatus.IDLE

    def _begin_write_sync(self):
        # psycopg opens the transaction itself on the first statement.
        with self._conn.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_xact_lock(%s)", (WRITE_LOCK_ID,))

    async def begin_write(self):
        """Start a transaction that holds the application-wide write lock until it ends.

        Writers in every process take the same advisory lock, so state read inside the
        transaction cannot change before the transaction commits.
        """
        await asyncio.to_thread(self._begin_write_sync)

    def _execute_sync(self, sql, parameters):
        import psycopg
        query = postgres_sql(sql)
        insert = re.match(r"INSERT\s+INTO\s+(\w+)", query, re.I)
        generated_id = bool(insert and insert[1] in self._id_tables and not re.search(r"\bRETURNING\b", query, re.I))
        if generated_id:
            query += " RETURNING id"
        args = tuple(int(value) if isinstance(value, bool) else value for value in parameters)
        # A failed statement aborts a PostgreSQL transaction. Savepoints keep it usable
        # for the repositories that catch duplicate-key errors and carry on.
        with self._conn.cursor() as cursor:
            if insert:
                cursor.execute("SAVEPOINT mathbot_statement")
            try:
                cursor.execute(query, args if args else None)
                names = tuple(column.name for column in cursor.description) if cursor.description else ()
                rows = cursor.fetchall() if cursor.description else []
                rowcount = cursor.rowcount
                if generated_id and rows:
                    self._lastrowid = rows[-1][0]
                if not re.match(r"\s*(SELECT|WITH)\b", query, re.I) and rowcount > 0:
                    self.total_changes += rowcount
                if insert:
                    cursor.execute("RELEASE SAVEPOINT mathbot_statement")
            except psycopg.Error as exc:
                if insert:
                    cursor.execute("ROLLBACK TO SAVEPOINT mathbot_statement")
                    cursor.execute("RELEASE SAVEPOINT mathbot_statement")
                if isinstance(exc, psycopg.IntegrityError):
                    raise IntegrityError(str(exc)) from exc
                raise OperationalError(str(exc)) from exc
        return PostgresCursor(rows if not generated_id else [], names, named=self.row_factory is not None,
                              rowcount=rowcount, lastrowid=self._lastrowid)

    async def _execute(self, sql, parameters=()):
        return await asyncio.to_thread(self._execute_sync, sql, parameters)

    def execute(self, sql, parameters=()):
        return _Query(self._execute(sql, parameters))

    async def executemany(self, sql, parameters):
        cursor = PostgresCursor()
        for values in parameters:
            cursor = await self._execute(sql, values)
        return cursor

    async def commit(self):
        await asyncio.to_thread(self._conn.commit)

    async def rollback(self):
        await asyncio.to_thread(self._conn.rollback)

    async def close(self):
        if self._conn is not None:
            await asyncio.to_thread(self._conn.close)


Connection = PostgresConnection


def connect(target, **kwargs) -> PostgresConnection:
    return PostgresConnection(require_postgres_url(target), **kwargs)
