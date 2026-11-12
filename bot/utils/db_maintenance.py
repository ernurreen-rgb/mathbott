"""
Database maintenance utilities

PostgreSQL (Neon) runs autovacuum itself; the app only refreshes planner statistics.
"""
import storage as db_driver
import logging
from typing import Optional
from datetime import datetime

logger = logging.getLogger(__name__)


class DatabaseMaintenance:
    """Database maintenance operations"""

    def __init__(self, database_url: str, timeout: int = 300):
        """
        Initialize database maintenance

        Args:
            database_url: PostgreSQL connection URL
            timeout: Connect timeout in seconds
        """
        self.database_url = database_url
        self.timeout = timeout
        self.last_analyze: Optional[datetime] = None

    async def analyze(self) -> bool:
        """
        Run ANALYZE to update query planner statistics

        Returns:
            bool: True if successful
        """
        try:
            async with db_driver.connect(self.database_url, timeout=self.timeout) as db:
                await db.execute("ANALYZE")
                await db.commit()
            self.last_analyze = datetime.utcnow()
            logger.info("Database ANALYZE completed")
            return True
        except Exception as e:
            logger.error(f"Error running ANALYZE: {e}", exc_info=True)
            return False

    def get_stats(self) -> dict:
        """Get maintenance statistics"""
        return {"last_analyze": self.last_analyze.isoformat() if self.last_analyze else None}
