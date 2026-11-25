"""Async PostgreSQL boundary (Neon in production, any PostgreSQL 17 locally).

Repositories write PostgreSQL SQL with `?` placeholders and use a small cursor
API (execute/fetchone/fetchall, rowcount, lastrowid). `postgres_sql()` turns the
placeholders into psycopg parameters. psycopg runs in worker threads, which also
works with Windows' default event loop.
"""
from __future__ import annotations

import asyncio
import hashlib
import re
import threading
import time
from collections.abc import Sequence
from contextvars import ContextVar
from decimal import Decimal
from functools import lru_cache
from threading import Lock
from typing import Dict, FrozenSet, List, Optional, Tuple

WRITE_LOCK_ID = 724831921
_RESERVED_LOCK_IDS = {WRITE_LOCK_ID, 724831922}
POSTGRES_URL_PREFIXES = ("postgres://", "postgresql://")

_ID_TABLES_CACHE: Dict[str, FrozenSet[str]] = {}
_ID_TABLES_LOCK = Lock()
_ID_TABLES_SQL = (
    "SELECT table_name FROM information_schema.columns "
    "WHERE table_schema = current_schema() AND column_name = 'id'"
)

# Connections opened while a request runs, as (seconds, came from the prewarm), for its
# Server-Timing header (middleware/request_context_middleware.py). None outside a request.
connect_timings: ContextVar[Optional[List[Tuple[float, bool]]]] = ContextVar("db_connect_timings", default=None)


def advisory_lock_id_for_key(lock_key: Optional[str]) -> int:
    """Map an optional logical lock key to a PostgreSQL 64-bit advisory lock ID."""
    if not lock_key:
        return WRITE_LOCK_ID
    digest = hashlib.blake2b(f"qazmath-lock:{lock_key}".encode("utf-8"), digest_size=8).digest()
    lock_id = int.from_bytes(digest, "big") & 0x7FFFFFFFFFFFFFFF
    if lock_id in _RESERVED_LOCK_IDS or lock_id == 0:
        lock_id ^= 0x1000000000000001
    return lock_id


def clear_id_tables_cache(target: Optional[str] = None) -> None:
    """Clear cached table-id metadata (called after migrations or in tests)."""
    with _ID_TABLES_LOCK:
        if target is None:
            _ID_TABLES_CACHE.clear()
        else:
            _ID_TABLES_CACHE.pop(target, None)


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


def _connect_sync(target: str, timeout: float):
    import psycopg
    # Default to autocommit=True so read-only SELECTs never open idle transactions
    # or incur a network ROLLBACK when released back to the connection pool.
    return psycopg.connect(
        target, connect_timeout=int(timeout), prepare_threshold=None,
        options=postgres_options(target), autocommit=True,
    )


def _fetch_id_tables_sync(conn) -> FrozenSet[str]:
    with conn.cursor() as cursor:
        cursor.execute(_ID_TABLES_SQL)
        return frozenset(row[0] for row in cursor.fetchall())


# --- Connecting before the first request ------------------------------------------------------
# On a cold start the first request waited about a second for its connection: TLS, Neon waking
# its compute, and the id-tables query above. start_prewarm() does all of it in a thread while
# the API is still importing its code (about a second too), and the first connection the API
# opens takes the result instead of starting over.
PREWARM_MAX_AGE_SECONDS = 60.0
_prewarm: Optional[dict] = None
_prewarm_lock = Lock()


def start_prewarm(target: str, *, timeout: float = 30) -> bool:
    """Open one connection in the background; once per process. False when nothing was started."""
    global _prewarm
    try:
        url = require_postgres_url(target)
    except ValueError:
        return False
    with _prewarm_lock:
        if _prewarm is not None:
            return False
        state = {"target": url, "done": threading.Event(), "conn": None, "ready_at": None, "taken": False}
        _prewarm = state

    def run() -> None:
        conn = None
        try:
            conn = _connect_sync(url, timeout)
            tables = _fetch_id_tables_sync(conn)
            with _ID_TABLES_LOCK:
                _ID_TABLES_CACHE.setdefault(url, tables)
            state["conn"], state["ready_at"] = conn, time.monotonic()
        except Exception:
            # The first request connects as it always did.
            if conn is not None:
                try:
                    conn.close()
                except Exception:
                    pass
        finally:
            state["done"].set()

    threading.Thread(target=run, name="db-prewarm", daemon=True).start()
    return True


async def _take_prewarmed(target: str):
    """The prewarmed connection for the first connection to `target`, waiting for it if needed."""
    with _prewarm_lock:
        state = _prewarm
        if state is None or state["taken"] or state["target"] != target:
            return None
        state["taken"] = True
    if not state["done"].is_set():
        # It is already on its way: waiting is quicker than starting another one.
        await asyncio.to_thread(state["done"].wait, 35)
    conn, state["conn"] = state["conn"], None
    if conn is None:
        return None
    if time.monotonic() - (state["ready_at"] or 0) > PREWARM_MAX_AGE_SECONDS or conn.closed or conn.broken:
        try:
            await asyncio.to_thread(conn.close)
        except Exception:
            pass
        return None
    return conn


def reset_prewarm_for_tests() -> None:
    global _prewarm
    with _prewarm_lock:
        state, _prewarm = _prewarm, None
    if state is not None:
        state["done"].wait(35)
        conn = state.get("conn")
        if conn is not None:
            conn.close()


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
            started = time.perf_counter()
            conn = await _take_prewarmed(self._target)
            prewarmed = conn is not None
            if conn is None:
                conn = await asyncio.to_thread(_connect_sync, self._target, self._timeout)
            self._conn = conn
            with _ID_TABLES_LOCK:
                cached_tables = _ID_TABLES_CACHE.get(self._target)
            if cached_tables is not None:
                self._id_tables = set(cached_tables)
            else:
                try:
                    fetched = await asyncio.to_thread(_fetch_id_tables_sync, conn)
                    with _ID_TABLES_LOCK:
                        _ID_TABLES_CACHE[self._target] = fetched
                    self._id_tables = set(fetched)
                except BaseException:
                    self._conn = None
                    try:
                        await asyncio.to_thread(conn.close)
                    except Exception:
                        pass
                    raise
            timings = connect_timings.get()
            if timings is not None:
                timings.append((time.perf_counter() - started, prewarmed))
        return self

    def __await__(self):
        return self._open().__await__()

    async def __aenter__(self):
        return await self._open()

    async def __aexit__(self, *_):
        await self.close()

    @property
    def closed(self) -> bool:
        if self._conn is None:
            return True
        return bool(getattr(self._conn, "closed", False)) or bool(getattr(self._conn, "broken", False))

    @property
    def in_transaction(self) -> bool:
        if self.closed:
            return False
        from psycopg.pq import TransactionStatus
        return self._conn.info.transaction_status != TransactionStatus.IDLE

    def _begin_write_sync(self, lock_id: int = WRITE_LOCK_ID):
        # Switch out of autocommit before taking the transaction-scoped advisory lock.
        if getattr(self._conn, "autocommit", False):
            self._conn.autocommit = False
        with self._conn.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_xact_lock(%s)", (int(lock_id),))

    async def begin_write(self, lock_id: int = WRITE_LOCK_ID):
        """Start a transaction holding the given transaction-scoped advisory lock until commit/rollback."""
        await asyncio.to_thread(self._begin_write_sync, int(lock_id))

    def _execute_sync(self, sql, parameters):
        import psycopg
        query = postgres_sql(sql)
        insert = re.match(r"INSERT\s+INTO\s+(\w+)", query, re.I)
        generated_id = bool(insert and insert[1] in self._id_tables and not re.search(r"\bRETURNING\b", query, re.I))
        if generated_id:
            query += " RETURNING id"
        args = tuple(int(value) if isinstance(value, bool) else value for value in parameters)
        # Only use a savepoint inside an explicit transaction block; autocommit statements
        # cannot create savepoints and do not abort enclosing transactions on error.
        use_savepoint = bool(insert and not getattr(self._conn, "autocommit", False))
        with self._conn.cursor() as cursor:
            if use_savepoint:
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
                if use_savepoint:
                    cursor.execute("RELEASE SAVEPOINT mathbot_statement")
            except psycopg.Error as exc:
                if use_savepoint:
                    try:
                        cursor.execute("ROLLBACK TO SAVEPOINT mathbot_statement")
                        cursor.execute("RELEASE SAVEPOINT mathbot_statement")
                    except psycopg.Error:
                        pass
                if isinstance(exc, psycopg.IntegrityError):
                    raise IntegrityError(str(exc)) from exc
                raise OperationalError(str(exc)) from exc
        return PostgresCursor(rows if not generated_id else [], names, named=self.row_factory is not None,
                              rowcount=rowcount, lastrowid=self._lastrowid)

    async def _execute(self, sql, parameters=()):
        return await asyncio.to_thread(self._execute_sync, sql, parameters)

    def execute(self, sql, parameters=()):
        return _Query(self._execute(sql, parameters))

    def _executemany_sync(self, sql, param_rows):
        import psycopg
        if not param_rows:
            return PostgresCursor()
        query = postgres_sql(sql)
        insert = re.match(r"INSERT\s+INTO\s+(\w+)", query, re.I)
        converted_rows = [
            tuple(int(value) if isinstance(value, bool) else value for value in values)
            for values in param_rows
        ]
        use_savepoint = bool(insert and not getattr(self._conn, "autocommit", False))
        with self._conn.cursor() as cursor:
            if use_savepoint:
                cursor.execute("SAVEPOINT mathbot_statement")
            try:
                cursor.executemany(query, converted_rows)
                rowcount = cursor.rowcount
                if not re.match(r"\s*(SELECT|WITH)\b", query, re.I) and rowcount > 0:
                    self.total_changes += rowcount
                if use_savepoint:
                    cursor.execute("RELEASE SAVEPOINT mathbot_statement")
            except psycopg.Error as exc:
                if use_savepoint:
                    try:
                        cursor.execute("ROLLBACK TO SAVEPOINT mathbot_statement")
                        cursor.execute("RELEASE SAVEPOINT mathbot_statement")
                    except psycopg.Error:
                        pass
                if isinstance(exc, psycopg.IntegrityError):
                    raise IntegrityError(str(exc)) from exc
                raise OperationalError(str(exc)) from exc
        return PostgresCursor(rowcount=rowcount, lastrowid=self._lastrowid)

    async def executemany(self, sql, parameters):
        rows = list(parameters)
        if not rows:
            return PostgresCursor()
        return await asyncio.to_thread(self._executemany_sync, sql, rows)

    def _commit_sync(self):
        if self._conn is None or getattr(self._conn, "autocommit", False):
            return
        try:
            self._conn.commit()
        finally:
            if not self.closed:
                self._conn.autocommit = True

    async def commit(self):
        await asyncio.to_thread(self._commit_sync)

    def _rollback_sync(self):
        if self._conn is None:
            return
        if getattr(self._conn, "autocommit", False) and not self.in_transaction:
            return
        try:
            self._conn.rollback()
        finally:
            if not self.closed:
                self._conn.autocommit = True

    async def rollback(self):
        await asyncio.to_thread(self._rollback_sync)

    def _ping_sync(self) -> bool:
        if self.closed:
            return False
        try:
            with self._conn.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
            return True
        except Exception:
            conn = self._conn
            self._conn = None
            try:
                if conn is not None:
                    conn.close()
            except Exception:
                pass
            return False

    async def ping(self) -> bool:
        """Probe connection liveness (detects idle disconnects from Neon/proxies)."""
        return await asyncio.to_thread(self._ping_sync)

    async def close(self):
        if self._conn is not None:
            conn = self._conn
            self._conn = None
            await asyncio.to_thread(conn.close)


Connection = PostgresConnection


def connect(target, **kwargs) -> PostgresConnection:
    return PostgresConnection(require_postgres_url(target), **kwargs)
