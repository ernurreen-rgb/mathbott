"""
Connection pool for PostgreSQL connections
"""
import asyncio
import logging
import time
from collections import deque

import storage as db_driver

logger = logging.getLogger(__name__)


class ConnectionPool:
    """Small pool of open PostgreSQL connections"""

    def __init__(
        self,
        database_url: str,
        min_size: int = 0,
        max_size: int = 2,
        timeout: int = 30,
    ):
        """
        Initialize connection pool

        Args:
            database_url: PostgreSQL connection URL
            min_size: Minimum number of connections to maintain
            max_size: Maximum number of connections in pool
            timeout: Connect timeout and wait for a free connection, in seconds
        """
        self.database_url = database_url
        self.min_size = min_size
        self.max_size = max_size
        self.timeout = timeout

        self._idle: deque[db_driver.Connection] = deque()
        self._created = 0
        self._cond = asyncio.Condition()
        self._closed = False

    @staticmethod
    def _is_alive(conn: db_driver.Connection) -> bool:
        return not bool(getattr(conn, "closed", False))

    @staticmethod
    def _reset_connection_state(conn: db_driver.Connection) -> None:
        conn.row_factory = None
        if hasattr(conn, "_lastrowid"):
            conn._lastrowid = None

    async def _close_quietly(self, conn: db_driver.Connection) -> None:
        try:
            await conn.close()
        except Exception:
            pass

    async def acquire(self) -> db_driver.Connection:
        """Acquire a live connection from the pool."""
        deadline = time.monotonic() + self.timeout

        while True:
            need_create = False
            async with self._cond:
                while True:
                    if self._closed:
                        raise RuntimeError("Connection pool is closed")

                    while self._idle:
                        conn = self._idle.popleft()
                        if self._is_alive(conn):
                            self._reset_connection_state(conn)
                            return conn
                        # Discard broken idle connection and free its slot.
                        self._created = max(0, self._created - 1)
                        await self._close_quietly(conn)

                    if self._created < self.max_size:
                        # Reserve the slot before opening outside the lock.
                        self._created += 1
                        need_create = True
                        break

                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        raise TimeoutError("Timed out waiting for a database connection")
                    try:
                        await asyncio.wait_for(self._cond.wait(), timeout=remaining)
                    except asyncio.TimeoutError as exc:
                        raise TimeoutError("Timed out waiting for a database connection") from exc

            if need_create:
                try:
                    conn = await db_driver.connect(self.database_url, timeout=self.timeout)
                except Exception:
                    async with self._cond:
                        self._created = max(0, self._created - 1)
                        self._cond.notify()
                    raise

                if self._closed:
                    await self._close_quietly(conn)
                    async with self._cond:
                        self._created = max(0, self._created - 1)
                        self._cond.notify_all()
                    raise RuntimeError("Connection pool is closed")

                logger.debug("Created new connection (total: %s)", self._created)
                self._reset_connection_state(conn)
                return conn

    async def release(self, conn: db_driver.Connection) -> None:
        """Release a connection back to the pool, waking any waiting acquirer."""
        if self._closed:
            await self._close_quietly(conn)
            async with self._cond:
                self._created = max(0, self._created - 1)
                self._cond.notify_all()
            return

        # Roll back any transaction left open by a handler that errored before
        # commit, so the connection is not reused with uncommitted state.
        healthy = self._is_alive(conn)
        if healthy:
            try:
                await conn.rollback()
                self._reset_connection_state(conn)
            except Exception:
                healthy = False

        if not healthy:
            await self._close_quietly(conn)
            async with self._cond:
                self._created = max(0, self._created - 1)
                # Immediately wake a waiter so it can open a fresh connection
                # instead of waiting until timeout.
                self._cond.notify()
            return

        async with self._cond:
            if self._closed or len(self._idle) >= self.max_size:
                self._created = max(0, self._created - 1)
                self._cond.notify_all()
                should_close = True
            else:
                self._idle.append(conn)
                self._cond.notify()
                should_close = False

        if should_close:
            await self._close_quietly(conn)

    async def initialize(self) -> None:
        """Initialize pool with minimum connections"""
        to_create = 0
        async with self._cond:
            if self._closed:
                return
            target = min(self.min_size, self.max_size)
            while self._created < target:
                self._created += 1
                to_create += 1

        for _ in range(to_create):
            try:
                conn = await db_driver.connect(self.database_url, timeout=self.timeout)
            except Exception:
                async with self._cond:
                    self._created = max(0, self._created - 1)
                    self._cond.notify_all()
                raise
            async with self._cond:
                if self._closed:
                    self._created = max(0, self._created - 1)
                    await self._close_quietly(conn)
                else:
                    self._reset_connection_state(conn)
                    self._idle.append(conn)
                    self._cond.notify()

        logger.info("Connection pool initialized with %s connections", len(self._idle))

    async def close(self) -> None:
        """Close all connections in the pool"""
        async with self._cond:
            self._closed = True
            idle = list(self._idle)
            self._idle.clear()
            self._created = 0
            self._cond.notify_all()

        for conn in idle:
            await self._close_quietly(conn)
        logger.info("Connection pool closed")

    def get_stats(self) -> dict:
        """Get pool statistics"""
        return {
            "pool_size": len(self._idle),
            "created": self._created,
            "max_size": self.max_size,
            "min_size": self.min_size,
            "closed": self._closed,
        }
