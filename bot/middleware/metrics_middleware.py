"""
Middleware for collecting request metrics
"""
import time
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from utils.metrics import metrics
import logging

logger = logging.getLogger(__name__)


class MetricsMiddleware(BaseHTTPMiddleware):
    """Middleware to collect request metrics"""
    
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        response = None
        
        # Get endpoint path
        endpoint = f"{request.method} {request.url.path}"
        
        # Process request
        try:
            response = await call_next(request)
            status_code = response.status_code
        except Exception as e:
            status_code = 500
            logger.error(f"Request failed: {endpoint}", exc_info=True)
            raise
        finally:
            # Calculate duration
            duration_ms = (time.time() - start_time) * 1000.0
            
            # Record metrics
            metrics.record_request(endpoint, duration_ms, status_code)
            
            # Add response time header
            if response is not None and hasattr(response, 'headers'):
                response.headers["X-Response-Time"] = f"{duration_ms:.2f}ms"
        
        return response

