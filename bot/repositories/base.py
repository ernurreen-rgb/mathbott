"""
Base repository with common database connection methods
"""
import asyncio
import re
import storage as db_driver
import logging
from typing import Optional, Dict
from contextlib import asynccontextmanager
from weakref import WeakKeyDictionary

logger = logging.getLogger(__name__)
_SQL_IDENTIFIER_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_process_write_locks: "WeakKeyDictionary[asyncio.AbstractEventLoop, asyncio.Lock]" = WeakKeyDictionary()


def _validate_sql_identifier(name: str, kind: str = "identifier") -> str:
    if not isinstance(name, str) or not _SQL_IDENTIFIER_RE.fullmatch(name):
        raise ValueError(f"Invalid SQL {kind}: {name!r}")
    return name


def _get_process_write_lock() -> asyncio.Lock:
    """Share one write lock per event loop so waiting writers do not hold pooled connections."""
    loop = asyncio.get_running_loop()
    lock = _process_write_locks.get(loop)
    if lock is None:
        lock = asyncio.Lock()
        _process_write_locks[loop] = lock
    return lock


class BaseRepository:
    """Base repository with common database operations"""

    def __init__(self, database_url: str, connection_pool=None):
        self.database_url = database_url
        self.connect_timeout_seconds = 30
        self.connection_pool = connection_pool  # Optional connection pool
        # Prepared statements cache (simple dict-based cache)
        self._statement_cache: Dict[str, str] = {}

    async def _get_connection(self):
        """
        Get a database connection, using pool if available
        
        Returns:
            db_driver.Connection: Database connection
        """
        if self.connection_pool:
            return await self.connection_pool.acquire()
        else:
            # Fallback to creating new connection
            return await db_driver.connect(self.database_url, timeout=self.connect_timeout_seconds)
    
    async def _release_connection(self, conn: db_driver.Connection) -> None:
        """
        Release a database connection back to pool or close it
        
        Args:
            conn: Connection to release
        """
        if self.connection_pool:
            await self.connection_pool.release(conn)
        else:
            await conn.close()

    @asynccontextmanager
    async def _connection(self):
        """
        Async context manager to acquire and release a connection.
        Always ensures connection is released.
        """
        conn = await self._get_connection()
        try:
            yield conn
        finally:
            await self._release_connection(conn)

    @asynccontextmanager
    async def _write_transaction(self):
        """Reserve the writer before reading state used to authorize a change."""
        # Acquire the lock before a connection so waiting writers cannot exhaust
        # the pool. The advisory lock also serializes writers in other processes.
        async with _get_process_write_lock():
            async with self._connection() as conn:
                await conn.begin_write()
                try:
                    yield conn
                    await conn.commit()
                except BaseException:
                    await conn.rollback()
                    raise
    
    async def batch_insert(
        self,
        table: str,
        columns: list,
        values: list,
        conn: Optional[db_driver.Connection] = None
    ) -> None:
        """
        Batch insert multiple rows into a table
        
        Args:
            table: Table name
            columns: List of column names
            values: List of tuples, each tuple contains values for one row
            conn: Optional connection to use (if None, creates new connection)
        
        Example:
            await repo.batch_insert(
                "tasks",
                ["text", "answer", "created_by"],
                [("Task 1", "Answer 1", 1), ("Task 2", "Answer 2", 1)]
            )
        """
        if not values:
            return
        safe_table = _validate_sql_identifier(table, "table")
        safe_columns = [_validate_sql_identifier(col, "column") for col in columns]
        if not safe_columns:
            raise ValueError("columns must not be empty")

        use_external_conn = conn is not None
        if not use_external_conn:
            conn = await self._get_connection()

        try:
            placeholders = ",".join(["?" for _ in safe_columns])
            columns_str = ",".join(safe_columns)
            query = f"INSERT INTO {safe_table} ({columns_str}) VALUES ({placeholders})"

            await conn.executemany(query, values)
            if not use_external_conn:
                await conn.commit()
        finally:
            if not use_external_conn:
                await self._release_connection(conn)

    async def batch_update(
        self,
        table: str,
        updates: list,
        where_column: str,
        conn: Optional[db_driver.Connection] = None
    ) -> None:
        """
        Batch update multiple rows in a table
        
        Args:
            table: Table name
            updates: List of dicts, each dict contains {where_value: {column: value, ...}}
            where_column: Column name to use in WHERE clause
            conn: Optional connection to use (if None, creates new connection)
        
        Example:
            await repo.batch_update(
                "users",
                [
                    {1: {"total_solved": 10}},
                    {2: {"total_solved": 20}}
                ],
                "id"
            )
        """
        if not updates:
            return
        safe_table = _validate_sql_identifier(table, "table")
        safe_where = _validate_sql_identifier(where_column, "column")

        use_external_conn = conn is not None
        if not use_external_conn:
            conn = await self._get_connection()

        try:
            for update_dict in updates:
                for where_value, set_values in update_dict.items():
                    if not set_values:
                        continue
                    sorted_cols = tuple(
                        _validate_sql_identifier(col, "column")
                        for col in sorted(set_values.keys())
                    )
                    columns_key = ",".join(sorted_cols)
                    cache_key = f"UPDATE:{safe_table}:{columns_key}:{safe_where}"

                    if cache_key not in self._statement_cache:
                        set_clause = ",".join([f"{col} = ?" for col in sorted_cols])
                        query = f"UPDATE {safe_table} SET {set_clause} WHERE {safe_where} = ?"
                        self._statement_cache[cache_key] = query
                    else:
                        query = self._statement_cache[cache_key]

                    params = [set_values[col] for col in sorted_cols] + [where_value]
                    await conn.execute(query, params)
            if not use_external_conn:
                await conn.commit()
        finally:
            if not use_external_conn:
                await self._release_connection(conn)
    
    def _get_cached_statement(self, query_pattern: str, *args) -> str:
        """
        Get or create cached prepared statement
        
        Args:
            query_pattern: Query pattern with placeholders
            *args: Arguments to create cache key
        
        Returns:
            str: Query string
        """
        cache_key = f"{query_pattern}:{hash(args)}"
        if cache_key not in self._statement_cache:
            self._statement_cache[cache_key] = query_pattern
        return self._statement_cache[cache_key]
    
    def _escape_like_value(self, value: str) -> str:
        """Escape user-controlled wildcards for LIKE queries."""
        return str(value or "").replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")

    def _contains_like_pattern(self, value: str) -> str:
        """Build an escaped contains-pattern for LIKE ... ESCAPE '\\'."""
        return f"%{self._escape_like_value(value)}%"

    async def _run_with_write_lock(self, operation):
        """Run a write operation while holding this process's write lock."""
        async with _get_process_write_lock():
            return await operation()

    async def _has_page_visit_tracking(self, conn: db_driver.Connection) -> bool:
        """True once migration 0013_user_page_visits has been applied; safe before rollout."""
        if getattr(self, "_page_visit_tracking_ready", False):
            return True
        async with conn.execute(
            """SELECT (
                   to_regclass(current_schema() || '.user_page_visits') IS NOT NULL
                   AND EXISTS (
                       SELECT 1 FROM information_schema.columns
                       WHERE table_schema = current_schema()
                         AND table_name = 'users'
                         AND column_name = 'last_seen_path'
                   )
               )::int"""
        ) as cursor:
            row = await cursor.fetchone()
        ready = bool(row and row[0])
        if ready:
            self._page_visit_tracking_ready = True
        return ready
