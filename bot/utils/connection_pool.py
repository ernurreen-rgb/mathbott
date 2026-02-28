"""
Connection pool for SQLite database connections
"""
import aiosqlite
import asyncio
import logging
from typing import Optional
from collections import deque

logger = logging.getLogger(__name__)


class ConnectionPool:
    """Connection pool for aiosqlite connections"""
    
    def __init__(
        self,
        db_path: str,
        min_size: int = 2,
        max_size: int = 10,
        timeout: int = 30,
        busy_timeout_ms: int = 8000
    ):
        """
        Initialize connection pool
        
        Args:
            db_path: Path to SQLite database file
            min_size: Minimum number of connections to maintain
            max_size: Maximum number of connections in pool
            timeout: Connection timeout in seconds
            busy_timeout_ms: SQLite busy timeout in milliseconds
        """
        self.db_path = db_path
        self.min_size = min_size
        self.max_size = max_size
        self.timeout = timeout
        self.busy_timeout_ms = busy_timeout_ms
        
        self._pool: deque = deque()
        self._created = 0
        self._lock = asyncio.Lock()
        self._closed = False
    
    async def _create_connection(self) -> aiosqlite.Connection:
        """Create a new database connection"""
        conn = await aiosqlite.connect(self.db_path, timeout=self.timeout)
        await self._configure_connection(conn)
        self._created += 1
        logger.debug(f"Created new connection (total: {self._created})")
        return conn
    
    async def _configure_connection(self, conn: aiosqlite.Connection) -> None:
        """Configure connection settings"""
        await conn.execute("PRAGMA foreign_keys = ON")
        try:
            await conn.execute("PRAGMA journal_mode = WAL")
            await conn.execute("PRAGMA synchronous = NORMAL")
        except Exception:
            pass
        try:
            await conn.execute(f"PRAGMA busy_timeout = {int(self.busy_timeout_ms)}")
        except Exception:
            pass
    
    async def acquire(self) -> aiosqlite.Connection:
        """
        Acquire a connection from the pool
        
        Returns:
            aiosqlite.Connection: Database connection
        """
        if self._closed:
            raise RuntimeError("Connection pool is closed")
        
        async with self._lock:
            # Try to get connection from pool
            if self._pool:
                conn = self._pool.popleft()
                # Check if connection is still valid
                try:
                    await conn.execute("SELECT 1")
                    return conn
                except Exception:
                    # Connection is invalid, create new one
                    logger.warning("Invalid connection in pool, creating new one")
                    self._created -= 1
            
            # Create new connection if under max_size
            if self._created < self.max_size:
                return await self._create_connection()
            
            # Wait for connection to become available
            # In practice, this should rarely happen with proper sizing
        
        # If we can't get a connection immediately, wait a bit and retry
        await asyncio.sleep(0.01)
        return await self.acquire()
    
    async def release(self, conn: aiosqlite.Connection) -> None:
        """
        Release a connection back to the pool
        
        Args:
            conn: Connection to release
        """
        if self._closed:
            await conn.close()
            return
        
        async with self._lock:
            # Check if connection is still valid
            try:
                await conn.execute("SELECT 1")
                if len(self._pool) < self.max_size:
                    self._pool.append(conn)
                else:
                    await conn.close()
                    self._created -= 1
            except Exception:
                # Connection is invalid, close it
                try:
                    await conn.close()
                except Exception:
                    pass
                self._created -= 1
    
    async def initialize(self) -> None:
        """Initialize pool with minimum connections"""
        async with self._lock:
            while len(self._pool) < self.min_size and self._created < self.max_size:
                conn = await self._create_connection()
                self._pool.append(conn)
        logger.info(f"Connection pool initialized with {len(self._pool)} connections")
    
    async def close(self) -> None:
        """Close all connections in the pool"""
        async with self._lock:
            self._closed = True
            while self._pool:
                conn = self._pool.popleft()
                try:
                    await conn.close()
                except Exception:
                    pass
            self._created = 0
        logger.info("Connection pool closed")
    
    async def __aenter__(self):
        """Async context manager entry"""
        return await self.acquire()
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        # Note: This won't work as expected since we need the connection
        # This is just for interface compatibility
        pass
    
    def get_stats(self) -> dict:
        """Get pool statistics"""
        return {
            "pool_size": len(self._pool),
            "created": self._created,
            "max_size": self.max_size,
            "min_size": self.min_size,
            "closed": self._closed
        }
