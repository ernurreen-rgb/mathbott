"""
Database maintenance utilities
"""
import aiosqlite
import logging
from typing import Optional
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class DatabaseMaintenance:
    """Database maintenance operations"""
    
    def __init__(self, db_path: str, timeout: int = 300):
        """
        Initialize database maintenance
        
        Args:
            db_path: Path to database file
            timeout: Operation timeout in seconds
        """
        self.db_path = db_path
        self.timeout = timeout
        self.last_analyze: Optional[datetime] = None
        self.last_vacuum: Optional[datetime] = None
    
    async def analyze(self) -> bool:
        """
        Run ANALYZE to update query planner statistics
        
        Returns:
            bool: True if successful
        """
        try:
            async with aiosqlite.connect(self.db_path, timeout=self.timeout) as db:
                await db.execute("ANALYZE")
                await db.commit()
            self.last_analyze = datetime.utcnow()
            logger.info("Database ANALYZE completed")
            return True
        except Exception as e:
            logger.error(f"Error running ANALYZE: {e}", exc_info=True)
            return False
    
    async def vacuum(self) -> bool:
        """
        Run VACUUM to optimize database
        
        Returns:
            bool: True if successful
        
        Note:
            VACUUM can take a long time and locks the database
        """
        try:
            async with aiosqlite.connect(self.db_path, timeout=self.timeout * 10) as db:
                await db.execute("VACUUM")
                await db.commit()
            self.last_vacuum = datetime.utcnow()
            logger.info("Database VACUUM completed")
            return True
        except Exception as e:
            logger.error(f"Error running VACUUM: {e}", exc_info=True)
            return False
    
    async def optimize(self) -> bool:
        """
        Run optimization (ANALYZE + optional VACUUM)
        
        Returns:
            bool: True if successful
        """
        analyze_success = await self.analyze()
        
        # Only run VACUUM if it hasn't been run recently (e.g., last 7 days)
        should_vacuum = (
            self.last_vacuum is None or
            (datetime.utcnow() - self.last_vacuum) > timedelta(days=7)
        )
        
        if should_vacuum:
            vacuum_success = await self.vacuum()
            return analyze_success and vacuum_success
        
        return analyze_success
    
    def get_stats(self) -> dict:
        """Get maintenance statistics"""
        return {
            "last_analyze": self.last_analyze.isoformat() if self.last_analyze else None,
            "last_vacuum": self.last_vacuum.isoformat() if self.last_vacuum else None,
            "db_path": self.db_path
        }
