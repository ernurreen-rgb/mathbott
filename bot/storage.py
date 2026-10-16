"""Async database boundary for local SQLite and hosted PostgreSQL/Neon.

Repositories retain their parameterized SQL and cursor API. PostgreSQL runs
through psycopg in worker threads (also works with Windows' default event loop).
SQLite remains available for local development and existing database backups.
"""
from __future__ import annotations

import asyncio
import re
import sqlite3
from collections.abc import Sequence
from decimal import Decimal
from functools import lru_cache

import aiosqlite

Row = sqlite3.Row
IntegrityError = sqlite3.IntegrityError
OperationalError = sqlite3.OperationalError
DatabaseError = sqlite3.DatabaseError
WRITE_LOCK_ID = 724831921


def is_postgres(target: str) -> bool:
    return str(target).startswith(("postgres://", "postgresql://"))


def postgres_options(target: str) -> str:
    from psycopg.conninfo import conninfo_to_dict
    return (conninfo_to_dict(target).get("options", "") + " -c timezone=UTC").strip()


def _sql_tokens(sql: str):
    """Separate quoted strings/identifiers/comments from executable SQL."""
    return re.split(r"('(?:''|[^'])*'|\"(?:\"\"|[^\"])*\"|--[^\n]*(?:\n|$)|/\*[\s\S]*?\*/)", sql)


@lru_cache(maxsize=2048)
def postgres_sql(sql: str) -> str:
    """Translate the small SQLite-specific vocabulary used by repositories.

    Values always remain driver parameters. Literal question marks, percent
    signs, comments and SQL strings must never become parameter placeholders.
    """
    sql = sql.strip().rstrip(";")
    ignore = bool(re.match(r"INSERT\s+OR\s+IGNORE\b", sql, re.I))
    replace = re.match(r"INSERT\s+OR\s+REPLACE\s+INTO\s+(\w+)\s*\(([^)]+)\)", sql, re.I)
    sql = re.sub(r"\bINSERT\s+OR\s+(IGNORE|REPLACE)\b", "INSERT", sql, flags=re.I)
    # These are the only JSON table/extract expressions in the application.
    sql = re.sub(r"JOIN\s+json_each\(r\.answers\)\s+AS\s+answer_entry",
                 "JOIN LATERAL jsonb_each(r.answers::jsonb) AS answer_entry ON TRUE", sql, flags=re.I)
    sql = re.sub(r"json_extract\(answer_entry\.value,\s*'\$\.answer'\)",
                 "(answer_entry.value ->> 'answer')", sql, flags=re.I)
    sql = re.sub(r"json_extract\(answer_entry\.value,\s*'\$\.correct'\)",
                 "(CASE WHEN answer_entry.value ->> 'correct' IN ('true', '1') THEN 1 "
                 "WHEN answer_entry.value ->> 'correct' IN ('false', '0') THEN 0 END)", sql, flags=re.I)
    parts = _sql_tokens(sql)
    for i in range(0, len(parts), 2):
        part = parts[i]
        part = re.sub(r"\b(datetime|strftime|julianday|date)\s*\(",
                      lambda match: "mathbot_" + match[1].lower() + "(", part, flags=re.I)
        part = re.sub(r"\bCURRENT_TIMESTAMP\b", "mathbot_datetime('now')", part, flags=re.I)
        part = re.sub(r"\bAS\s+REAL\b", "AS DOUBLE PRECISION", part, flags=re.I)
        parts[i] = part.replace("?", "\x00PARAM\x00")
    sql = "".join(parts)
    if ignore:
        sql += " ON CONFLICT DO NOTHING"
    if replace:
        conflicts = {
            "user_onboarding": ("user_id",),
            "friend_requests": ("sender_id", "receiver_id"),
            "trial_test_coop_results": ("session_id", "user_id"),
        }
        table = replace[1].lower()
        if table not in conflicts:
            raise ValueError(f"No PostgreSQL conflict target declared for {table}")
        columns = [column.strip() for column in replace[2].split(",")]
        keys = conflicts[table]
        updates = ", ".join(f"{column} = EXCLUDED.{column}" for column in columns if column not in keys)
        sql += f" ON CONFLICT ({', '.join(keys)}) DO UPDATE SET {updates}"
    # psycopg also parses percent signs inside SQL literals when parameters exist.
    if "\x00PARAM\x00" in sql:
        sql = sql.replace("%", "%%").replace("\x00PARAM\x00", "%s")
    return sql


def _value(value):
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    return value


class Record(Sequence):
    """Named and positional access, matching the repository's sqlite Row use."""
    def __init__(self, names, values):
        self._names = names
        self._values = tuple(_value(value) for value in values)

    def keys(self):
        return self._names

    def __getitem__(self, key):
        return self._values[self._names.index(key) if isinstance(key, str) else key]

    def __len__(self):
        return len(self._values)


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

    def _execute_sync(self, sql, parameters):
        import psycopg
        query = sql.strip().rstrip(";")
        if re.match(r"PRAGMA\b", query, re.I):
            # Connection-level SQLite tuning has no PostgreSQL equivalent.
            if re.match(r"PRAGMA\s+(foreign_keys|journal_mode|synchronous|busy_timeout)\s*=", query, re.I):
                return PostgresCursor()
            raise NotImplementedError("SQLite schema introspection is not supported on PostgreSQL")
        if re.fullmatch(r"BEGIN\s+IMMEDIATE", query, re.I):
            with self._conn.cursor() as cursor:
                cursor.execute("BEGIN")
                cursor.execute("SELECT pg_advisory_xact_lock(%s)", (WRITE_LOCK_ID,))
            return PostgresCursor()
        if re.fullmatch(r"DELETE\s+FROM\s+sqlite_sequence\s+WHERE\s+name\s*=\s*'tasks'", query, re.I):
            query = "ALTER TABLE tasks ALTER COLUMN id RESTART WITH 1"
        query = re.sub(r"last_insert_rowid\(\)", str(self._lastrowid or 0), query, flags=re.I)
        if "sqlite_master" in query.lower():
            query = query.replace("sqlite_master", "information_schema.tables")
            query = re.sub(r"\bname\b", "table_name", query)
            query = re.sub(r"\btype\s*=\s*'table'", "table_schema = current_schema()", query)
        query = postgres_sql(query)
        insert = re.match(r"INSERT\s+INTO\s+(\w+)", query, re.I)
        generated_id = bool(insert and insert[1] in self._id_tables and not re.search(r"\bRETURNING\b", query, re.I))
        if generated_id:
            query += " RETURNING id"
        args = tuple(int(value) if isinstance(value, bool) else value for value in parameters)
        # SQLite leaves a transaction usable after a constraint error. Savepoints
        # preserve that contract for the few repositories that catch duplicates.
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


Connection = aiosqlite.Connection | PostgresConnection


def connect(target, **kwargs):
    if is_postgres(target):
        return PostgresConnection(target, **kwargs)
    return aiosqlite.connect(target, **kwargs)
