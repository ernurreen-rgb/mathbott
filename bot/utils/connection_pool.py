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
    """Small pool of open PostgreSQL connections with idle staleness detection."""

    def __init__(
        self,
        database_url: str,
        min_size: int = 0,
        max_size: int = 6,
        timeout: int = 30,
        idle_check_after_seconds: float = 60.0,
        max_idle_seconds: float = 240.0,
    ):
        """
        Initialize connection pool

        Args:
            database_url: PostgreSQL connection URL
            min_size: Minimum number of connections to maintain
            max_size: Maximum number of connections in pool
            timeout: Connect timeout and wait for a free connection, in seconds
            idle_check_after_seconds: Ping pooled connections idle longer than this
            max_idle_seconds: Proactively retire pooled connections idle longer than this
        """
        self.database_url = database_url
        self.min_size = min_size
        self.max_size = max_size
        self.timeout = timeout
        self.idle_check_after_seconds = max(0.0, float(idle_check_after_seconds))
        self.max_idle_seconds = max(0.0, float(max_idle_seconds))

        self._idle: deque[tuple[db_driver.Connection, float]] = deque()
        self._created = 0
        self._cond = asyncio.Condition()
        self._closed = False
        self._bg_tasks: set[asyncio.Task] = set()

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

    async def _open_connection(self) -> db_driver.Connection:
        # storage.connect returns an awaitable connection, not a coroutine, and
        # asyncio.create_task only takes coroutines.
        return await db_driver.connect(self.database_url, timeout=self.timeout)

    def _spawn_bg(self, coro) -> asyncio.Task:
        task = asyncio.create_task(coro)
        self._bg_tasks.add(task)

        def _done(done_task: asyncio.Task) -> None:
            self._bg_tasks.discard(done_task)
            if not done_task.cancelled():
                done_task.exception()

        task.add_done_callback(_done)
        return task

    async def _notify_slot_freed(self, *, notify_all: bool = False) -> None:
        async with self._cond:
            if notify_all:
                self._cond.notify_all()
            else:
                self._cond.notify()

    async def _free_slot_safe(self, count: int = 1, *, notify_all: bool = False) -> None:
        """Decrement _created synchronously and wake waiters even under cancellation."""
        self._created = max(0, self._created - count)
        notify_task = self._spawn_bg(self._notify_slot_freed(notify_all=notify_all))
        try:
            await asyncio.shield(notify_task)
        except BaseException:
            # notify_task keeps running on the event loop so waiters still wake up.
            pass

    async def acquire(self) -> db_driver.Connection:
        """Acquire a live connection from the pool."""
        deadline = time.monotonic() + self.timeout

        while True:
            need_create = False
            candidate: db_driver.Connection | None = None
            candidate_needs_ping = False
            dead_idle: list[db_driver.Connection] = []
            async with self._cond:
                while True:
                    if self._closed:
                        raise RuntimeError("Connection pool is closed")

                    now = time.monotonic()
                    while self._idle:
                        conn, returned_at = self._idle.popleft()
                        idle_for = max(0.0, now - returned_at)
                        stale = self.max_idle_seconds > 0 and idle_for >= self.max_idle_seconds
                        if self._is_alive(conn) and not stale:
                            self._reset_connection_state(conn)
                            candidate = conn
                            candidate_needs_ping = bool(
                                self.idle_check_after_seconds > 0
                                and idle_for >= self.idle_check_after_seconds
                                and hasattr(conn, "ping")
                            )
                            break
                        # Discard broken or over-idle connection and free its slot.
                        self._created = max(0, self._created - 1)
                        dead_idle.append(conn)

                    if candidate is not None:
                        break

                    if self._created < self.max_size:
                        # Reserve the slot before opening outside the lock.
                        self._created += 1
                        need_create = True
                        break

                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        for dead in dead_idle:
                            self._spawn_bg(self._close_quietly(dead))
                        raise TimeoutError("Timed out waiting for a database connection")
                    try:
                        await asyncio.wait_for(self._cond.wait(), timeout=remaining)
                    except asyncio.TimeoutError as exc:
                        for dead in dead_idle:
                            self._spawn_bg(self._close_quietly(dead))
                        raise TimeoutError("Timed out waiting for a database connection") from exc

            for dead in dead_idle:
                self._spawn_bg(self._close_quietly(dead))

            if candidate is not None:
                if not candidate_needs_ping:
                    return candidate
                ping_ok = False
                try:
                    ping_ok = bool(await candidate.ping())
                except asyncio.CancelledError:
                    self._spawn_bg(self._close_quietly(candidate))
                    await self._free_slot_safe()
                    raise
                except Exception:
                    ping_ok = False
                if ping_ok:
                    self._reset_connection_state(candidate)
                    return candidate
                # Server closed idle connection (e.g. Neon idle timeout); drop and acquire fresh.
                self._spawn_bg(self._close_quietly(candidate))
                await self._free_slot_safe()
                continue

            if need_create:
                connect_task = self._spawn_bg(
                    self._open_connection()
                )
                try:
                    conn = await asyncio.shield(connect_task)
                except asyncio.CancelledError:
                    def _cleanup_stray(done_task: asyncio.Task) -> None:
                        if done_task.cancelled():
                            return
                        if done_task.exception() is None:
                            self._spawn_bg(self._close_quietly(done_task.result()))

                    connect_task.add_done_callback(_cleanup_stray)
                    if not connect_task.done():
                        connect_task.cancel()
                    await self._free_slot_safe()
                    raise
                except BaseException:
                    await self._free_slot_safe()
                    raise

                if self._closed:
                    self._spawn_bg(self._close_quietly(conn))
                    await self._free_slot_safe(notify_all=True)
                    raise RuntimeError("Connection pool is closed")

                logger.debug("Created new connection (total: %s)", self._created)
                self._reset_connection_state(conn)
                return conn

    async def release(self, conn: db_driver.Connection) -> None:
        """Release a connection back to the pool, waking any waiting acquirer."""
        if self._closed:
            close_task = self._spawn_bg(self._close_quietly(conn))
            try:
                await asyncio.shield(close_task)
            finally:
                await self._free_slot_safe(notify_all=True)
            return

        # Roll back only when a transaction was actually left open (skips network ROLLBACK
        # on autocommit read connections while preserving cleanup after failed writes).
        healthy = self._is_alive(conn)
        needs_rollback = bool(getattr(conn, "in_transaction", True))
        if healthy and needs_rollback:
            rollback_task = self._spawn_bg(conn.rollback())
            try:
                await asyncio.shield(rollback_task)
                self._reset_connection_state(conn)
            except asyncio.CancelledError:
                async def _close_after_rollback() -> None:
                    try:
                        await rollback_task
                    except BaseException:
                        pass
                    await self._close_quietly(conn)

                self._spawn_bg(_close_after_rollback())
                await self._free_slot_safe()
                raise
            except Exception:
                healthy = False
        elif healthy:
            self._reset_connection_state(conn)

        if not healthy:
            close_task = self._spawn_bg(self._close_quietly(conn))
            try:
                await asyncio.shield(close_task)
            finally:
                await self._free_slot_safe()
            return

        should_close = False
        returned = False
        try:
            async with self._cond:
                if self._closed or len(self._idle) >= self.max_size:
                    self._created = max(0, self._created - 1)
                    self._cond.notify_all()
                    should_close = True
                else:
                    self._idle.append((conn, time.monotonic()))
                    self._cond.notify()
                returned = True
        except BaseException:
            if not returned:
                self._spawn_bg(self._close_quietly(conn))
                await self._free_slot_safe()
            raise

        if should_close:
            await asyncio.shield(self._spawn_bg(self._close_quietly(conn)))

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

        remaining = to_create
        for _ in range(to_create):
            connect_task = self._spawn_bg(
                self._open_connection()
            )
            try:
                conn = await asyncio.shield(connect_task)
            except asyncio.CancelledError:
                def _cleanup_stray(done_task: asyncio.Task) -> None:
                    if done_task.cancelled():
                        return
                    if done_task.exception() is None:
                        self._spawn_bg(self._close_quietly(done_task.result()))

                connect_task.add_done_callback(_cleanup_stray)
                if not connect_task.done():
                    connect_task.cancel()
                await self._free_slot_safe(count=remaining, notify_all=True)
                raise
            except BaseException:
                await self._free_slot_safe(count=remaining, notify_all=True)
                raise
            remaining -= 1
            async with self._cond:
                if self._closed:
                    self._created = max(0, self._created - 1)
                    self._spawn_bg(self._close_quietly(conn))
                else:
                    self._reset_connection_state(conn)
                    self._idle.append((conn, time.monotonic()))
                    self._cond.notify()

        logger.info("Connection pool initialized with %s connections", len(self._idle))

    async def close(self) -> None:
        """Close all connections in the pool"""
        async with self._cond:
            self._closed = True
            idle = [conn for conn, _ in self._idle]
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
