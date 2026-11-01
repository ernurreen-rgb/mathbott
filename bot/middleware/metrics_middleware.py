"""
Middleware for collecting request metrics
"""
import time
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from utils.metrics import metrics
import logging

logger = logging.getLogger(__name__)
_HTTP_METHODS = frozenset({"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "TRACE", "CONNECT"})


class MetricsMiddleware(BaseHTTPMiddleware):
    """Middleware to collect request metrics"""

    @staticmethod
    def _endpoint_label(request: Request) -> str:
        route = request.scope.get("route")
        path = getattr(route, "path_format", None) or getattr(route, "path", None)
        if not isinstance(path, str) or not path.startswith("/"):
            path = "<unmatched>"
        method = request.method if request.method in _HTTP_METHODS else "OTHER"
        return f"{method} {path}"
    
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        response = None
        status_code = None
        
        # Process request
        try:
            response = await call_next(request)
            status_code = response.status_code
        except Exception:
            status_code = 500
            logger.error(f"Request failed: {self._endpoint_label(request)}", exc_info=True)
            raise
        finally:
            # Calculate duration
            duration_ms = (time.time() - start_time) * 1000.0
            
            # Record metrics
            # Routing has now populated the scope, even for validation/handler
            # errors. Never fall back to raw paths, IDs, emails or Host values.
            if status_code is not None:
                metrics.record_request(self._endpoint_label(request), duration_ms, status_code)
            
            # Add response time header
            if response is not None and hasattr(response, 'headers'):
                response.headers["X-Response-Time"] = f"{duration_ms:.2f}ms"
        
        return response

