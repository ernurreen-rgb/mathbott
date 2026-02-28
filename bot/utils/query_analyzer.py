"""
Query analyzer for performance monitoring
"""
import logging
import time
from typing import Optional, Dict, Any
from datetime import datetime

logger = logging.getLogger(__name__)

# Global slow query threshold (100ms)
SLOW_QUERY_THRESHOLD = 0.1  # seconds


class QueryAnalyzer:
    """Analyzer for database query performance"""
    
    def __init__(self, slow_query_threshold: float = SLOW_QUERY_THRESHOLD):
        """
        Initialize query analyzer
        
        Args:
            slow_query_threshold: Threshold in seconds for logging slow queries
        """
        self.slow_query_threshold = slow_query_threshold
        self.slow_queries: list = []
        self.max_slow_queries = 100  # Keep last 100 slow queries
    
    async def analyze_query(
        self,
        query: str,
        params: Optional[tuple] = None,
        duration: Optional[float] = None,
        conn=None
    ) -> Dict[str, Any]:
        """
        Analyze a query for performance issues
        
        Args:
            query: SQL query string
            params: Query parameters
            duration: Query execution duration (if already measured)
            conn: Database connection (optional, for EXPLAIN QUERY PLAN)
        
        Returns:
            Dict with analysis results
        """
        if duration is None:
            return {"analyzed": False, "reason": "Duration not provided"}
        
        result = {
            "query": query[:200],  # Truncate for logging
            "params": str(params)[:100] if params else None,
            "duration": duration,
            "is_slow": duration > self.slow_query_threshold,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        # Log slow queries
        if result["is_slow"]:
            logger.warning(
                f"Slow query detected ({duration:.3f}s): {query[:200]}"
            )
            self._record_slow_query(result)
        
        # Get EXPLAIN QUERY PLAN if connection provided
        if conn and result["is_slow"]:
            try:
                explain_query = f"EXPLAIN QUERY PLAN {query}"
                async with conn.execute(explain_query, params or ()) as cursor:
                    explain_rows = await cursor.fetchall()
                    result["explain_plan"] = [dict(row) for row in explain_rows]
            except Exception as e:
                logger.debug(f"Could not get EXPLAIN QUERY PLAN: {e}")
        
        return result
    
    def _record_slow_query(self, query_info: Dict[str, Any]) -> None:
        """Record slow query for analysis"""
        self.slow_queries.append(query_info)
        if len(self.slow_queries) > self.max_slow_queries:
            self.slow_queries.pop(0)
    
    def get_slow_queries(self, limit: int = 10) -> list:
        """Get recent slow queries"""
        return self.slow_queries[-limit:]
    
    def get_stats(self) -> Dict[str, Any]:
        """Get analyzer statistics"""
        if not self.slow_queries:
            return {
                "total_slow_queries": 0,
                "avg_duration": 0,
                "max_duration": 0
            }
        
        durations = [q["duration"] for q in self.slow_queries]
        return {
            "total_slow_queries": len(self.slow_queries),
            "avg_duration": sum(durations) / len(durations),
            "max_duration": max(durations),
            "min_duration": min(durations)
        }


# Global query analyzer instance
query_analyzer = QueryAnalyzer()
