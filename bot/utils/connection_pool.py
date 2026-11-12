"""
Connection pool for PostgreSQL connections
"""
import storage as db_driver
import asyncio
import logging

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

        self._pool: asyncio.Queue[db_driver.Connection] = asyncio.Queue(maxsize=max_size)
        self._created = 0
        self._lock = asyncio.Lock()
        self._closed = False

    async def _create_connection(self) -> db_driver.Connection:
        """Create a new database connection"""
        conn = await db_driver.connect(self.database_url, timeout=self.timeout)
        self._created += 1
        logger.debug(f"Created new connection (total: {self._created})")
        return conn

    async def acquire(self) -> db_driver.Connection:
        """
        Acquire a connection from the pool
        
        Returns:
            db_driver.Connection: Database connection
        """
        if self._closed:
            raise RuntimeError("Connection pool is closed")

        try:
            conn = self._pool.get_nowait()
        except asyncio.QueueEmpty:
            conn = None
        if conn is not None:
            if self._closed:
                await conn.close()
                raise RuntimeError("Connection pool is closed")
            return conn
        
        async with self._lock:
            # Create new connection if under max_size
            if self._closed:
                raise RuntimeError("Connection pool is closed")
            if self._created < self.max_size:
                return await self._create_connection()

        try:
            conn = await asyncio.wait_for(self._pool.get(), timeout=self.timeout)
        except asyncio.TimeoutError as exc:
            raise TimeoutError("Timed out waiting for a database connection") from exc
        if self._closed:
            await conn.close()
            raise RuntimeError("Connection pool is closed")
        return conn
    
    async def release(self, conn: db_driver.Connection) -> None:
        """
        Release a connection back to the pool
        
        Args:
            conn: Connection to release
        """
        if self._closed:
            await conn.close()
            return

        # Roll back any transaction left open by a handler that errored before
        # commit, so the connection is not reused with uncommitted state.
        try:
            await conn.rollback()
        except Exception:
            try:
                await conn.close()
            finally:
                self._created = max(0, self._created - 1)
            return

        try:
            self._pool.put_nowait(conn)
        except asyncio.QueueFull:
            try:
                await conn.close()
            finally:
                self._created = max(0, self._created - 1)
    
    async def initialize(self) -> None:
        """Initialize pool with minimum connections"""
        async with self._lock:
            while self._pool.qsize() < self.min_size and self._created < self.max_size:
                conn = await self._create_connection()
                self._pool.put_nowait(conn)
        logger.info(f"Connection pool initialized with {self._pool.qsize()} connections")
    
    async def close(self) -> None:
        """Close all connections in the pool"""
        async with self._lock:
            self._closed = True
            while True:
                try:
                    conn = self._pool.get_nowait()
                except asyncio.QueueEmpty:
                    break
                try:
                    await conn.close()
                except Exception:
                    pass
            self._created = 0
        logger.info("Connection pool closed")

    def get_stats(self) -> dict:
        """Get pool statistics"""
        return {
            "pool_size": self._pool.qsize(),
            "created": self._created,
            "max_size": self.max_size,
            "min_size": self.min_size,
            "closed": self._closed
        }
