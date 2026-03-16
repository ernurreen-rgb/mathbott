"""
Base repository with common database connection methods
"""
import asyncio
import aiosqlite
import logging
import sqlite3
from typing import Optional, Dict
from functools import lru_cache
from contextlib import asynccontextmanager
from weakref import WeakKeyDictionary

logger = logging.getLogger(__name__)
_process_write_locks: "WeakKeyDictionary[asyncio.AbstractEventLoop, asyncio.Lock]" = WeakKeyDictionary()


def _get_process_write_lock() -> asyncio.Lock:
    """Share one write lock per event loop to avoid in-process SQLite write contention."""
    loop = asyncio.get_running_loop()
    lock = _process_write_locks.get(loop)
    if lock is None:
        lock = asyncio.Lock()
        _process_write_locks[loop] = lock
    return lock


class BaseRepository:
    """Base repository with common database operations"""
    
    def __init__(self, db_path: str = "mathbot.db", connection_pool=None):
        self.db_path = db_path
        self.sqlite_timeout_seconds = 30
        self.sqlite_busy_timeout_ms = 8000
        self.connection_pool = connection_pool  # Optional connection pool
        # Prepared statements cache (simple dict-based cache)
        self._statement_cache: Dict[str, str] = {}

    async def _configure_connection(self, db: aiosqlite.Connection) -> None:
        """Configure database connection settings"""
        await db.execute("PRAGMA foreign_keys = ON")
        try:
            await db.execute("PRAGMA journal_mode = WAL")
            await db.execute("PRAGMA synchronous = NORMAL")
        except Exception:
            # Some environments may not allow changing journal mode; ignore.
            pass
        try:
            await db.execute(f"PRAGMA busy_timeout = {int(self.sqlite_busy_timeout_ms)}")
        except Exception:
            pass
    
    async def _get_connection(self):
        """
        Get a database connection, using pool if available
        
        Returns:
            aiosqlite.Connection: Database connection
        """
        if self.connection_pool:
            return await self.connection_pool.acquire()
        else:
            # Fallback to creating new connection
            conn = await aiosqlite.connect(self.db_path, timeout=self.sqlite_timeout_seconds)
            await self._configure_connection(conn)
            return conn
    
    async def _release_connection(self, conn: aiosqlite.Connection) -> None:
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
        Always ensures connection is configured and released.
        """
        conn = await self._get_connection()
        try:
            await self._configure_connection(conn)
            yield conn
        finally:
            await self._release_connection(conn)
    
    async def batch_insert(
        self,
        table: str,
        columns: list,
        values: list,
        conn: Optional[aiosqlite.Connection] = None
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
        
        use_external_conn = conn is not None
        if not use_external_conn:
            conn = await self._get_connection()
        
        try:
            placeholders = ','.join(['?' for _ in columns])
            columns_str = ','.join(columns)
            query = f"INSERT INTO {table} ({columns_str}) VALUES ({placeholders})"
            
            await conn.executemany(query, values)
            await conn.commit()
        finally:
            if not use_external_conn:
                await self._release_connection(conn)
    
    async def batch_update(
        self,
        table: str,
        updates: list,
        where_column: str,
        conn: Optional[aiosqlite.Connection] = None
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
                    {1: {"total_points": 100, "total_solved": 10}},
                    {2: {"total_points": 200, "total_solved": 20}}
                ],
                "id"
            )
        """
        if not updates:
            return
        
        use_external_conn = conn is not None
        if not use_external_conn:
            conn = await self._get_connection()
        
        try:
            for update_dict in updates:
                for where_value, set_values in update_dict.items():
                    if not set_values:
                        continue
                    # Use cached statement pattern
                    columns_key = ','.join(sorted(set_values.keys()))
                    cache_key = f"UPDATE:{table}:{columns_key}:{where_column}"
                    
                    if cache_key not in self._statement_cache:
                        set_clause = ','.join([f"{col} = ?" for col in set_values.keys()])
                        query = f"UPDATE {table} SET {set_clause} WHERE {where_column} = ?"
                        self._statement_cache[cache_key] = query
                    else:
                        query = self._statement_cache[cache_key]
                    
                    params = list(set_values.values()) + [where_value]
                    await conn.execute(query, params)
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
            str: Query string (for SQLite, statements are just strings)
        """
        cache_key = f"{query_pattern}:{hash(args)}"
        if cache_key not in self._statement_cache:
            self._statement_cache[cache_key] = query_pattern
        return self._statement_cache[cache_key]
    
    def clear_statement_cache(self) -> None:
        """Clear prepared statements cache"""
        self._statement_cache.clear()

    async def _run_with_lock_retry(self, operation, *, attempts: int = 5, base_delay: float = 0.15):
        """Retry SQLite write operations when the database is temporarily locked."""
        write_lock = _get_process_write_lock()
        for attempt in range(1, attempts + 1):
            try:
                async with write_lock:
                    return await operation()
            except sqlite3.OperationalError as e:
                if "database is locked" not in str(e).lower() or attempt == attempts:
                    raise
                await asyncio.sleep(base_delay * attempt)


