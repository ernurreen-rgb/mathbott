"""
Middleware for cleaning up database connections after request
"""
import logging
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)


class ConnectionCleanupMiddleware(BaseHTTPMiddleware):
    """Middleware to release database connections after request"""
    
    async def dispatch(self, request: Request, call_next):
        """Process request and cleanup connections"""
        try:
            response = await call_next(request)
            return response
        finally:
            # Release any connections stored in request state
            if hasattr(request.state, 'db_connections'):
                from database import Database
                db: Database = request.app.state.db
                
                if db.connection_pool:
                    for conn in request.state.db_connections:
                        try:
                            await db.connection_pool.release(conn)
                        except Exception as e:
                            logger.error(f"Error releasing connection: {e}", exc_info=True)
                else:
                    # Close connections if no pool
                    for conn in request.state.db_connections:
                        try:
                            await conn.close()
                        except Exception as e:
                            logger.error(f"Error closing connection: {e}", exc_info=True)
                
                request.state.db_connections.clear()
