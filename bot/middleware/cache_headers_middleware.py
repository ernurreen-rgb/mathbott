"""
Middleware for adding HTTP cache headers to responses
"""
import hashlib
import logging
from datetime import datetime, timedelta
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)


class CacheHeadersMiddleware(BaseHTTPMiddleware):
    """Middleware to add cache headers to responses"""
    
    def __init__(self, app, default_max_age: int = 300):
        """
        Initialize cache headers middleware
        
        Args:
            app: FastAPI application
            default_max_age: Default cache max age in seconds (default: 5 minutes)
        """
        super().__init__(app)
        self.default_max_age = default_max_age
    
    async def dispatch(self, request: Request, call_next):
        """Add cache headers to response"""
        response = await call_next(request)
        
        # Only add cache headers for successful GET requests
        if request.method != "GET" or response.status_code != 200:
            return response
        
        path = request.url.path
        
        # Determine cache strategy based on endpoint
        if path.startswith("/api/health"):
            # Health check should not be cached
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        elif path.startswith("/api/rating") or path.startswith("/api/user/web/"):
            # User-specific data: short cache with revalidation
            response.headers["Cache-Control"] = f"private, max-age=30, must-revalidate"
            # Add ETag for conditional requests
            etag = self._generate_etag(response)
            if etag:
                response.headers["ETag"] = etag
                # Check if client sent If-None-Match
                if_none_match = request.headers.get("if-none-match")
                if if_none_match == etag:
                    from starlette.responses import Response
                    return Response(status_code=304)
        elif path.startswith("/api/modules") or path.startswith("/api/tasks"):
            # Public content: longer cache
            response.headers["Cache-Control"] = f"public, max-age={self.default_max_age}"
            # Add Last-Modified header
            response.headers["Last-Modified"] = datetime.utcnow().strftime("%a, %d %b %Y %H:%M:%S GMT")
        elif path.startswith("/api/admin"):
            # Admin endpoints: no cache
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        else:
            # Default: short cache
            response.headers["Cache-Control"] = f"public, max-age=60"
        
        return response
    
    def _generate_etag(self, response) -> str:
        """Generate ETag from response content"""
        try:
            if hasattr(response, 'body'):
                body = response.body
            else:
                return None
            
            if not body:
                return None
            
            # Generate ETag from body hash
            etag = hashlib.md5(body).hexdigest()
            return f'"{etag}"'
        except Exception:
            return None
