"""
Middleware for adding HTTP cache headers to responses
"""
import hashlib
import logging
from datetime import datetime, timezone
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from utils.request_path import get_scope_path

logger = logging.getLogger(__name__)

_NO_STORE_PREFIXES = (
    "/api/quizzes",
    "/api/quiz-sessions",
    "/api/health",
    "/api/admin",
    "/api/maintenance",
    "/api/push",
    "/api/export",
    "/api/presence",
    "/api/reports",
    "/api/trial-test-reports",
    "/api/trial-tests",
    "/api/mini-lessons",
    "/api/user/web",
)


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

        path = get_scope_path(request)

        if self._has_user_identity(request) or path.startswith(_NO_STORE_PREFIXES):
            self._set_no_store_headers(response)
            return response

        # Preserve explicit Cache-Control headers set by route handlers (e.g., immutable images)
        if "cache-control" in response.headers:
            return response

        # Determine cache strategy based on endpoint
        if path.startswith("/api/modules") or path.startswith("/api/tasks"):
            # Public content: longer cache
            response.headers["Cache-Control"] = f"public, max-age={self.default_max_age}"
            # Add Last-Modified header
            response.headers["Last-Modified"] = datetime.now(timezone.utc).strftime(
                "%a, %d %b %Y %H:%M:%S GMT"
            )
        else:
            # Fail safe: do not publicly cache unknown or newly added endpoints
            self._set_no_store_headers(response)

        return response

    def _has_user_identity(self, request: Request) -> bool:
        """Return true when a GET response can contain authenticated user data."""
        if request.query_params.get("email"):
            return True
        return bool(request.headers.get("X-Proxy-User-Email"))

    def _set_no_store_headers(self, response) -> None:
        response.headers["Cache-Control"] = "private, no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"

    def _generate_etag(self, response) -> str:
        """Generate ETag from response content"""
        try:
            if hasattr(response, "body"):
                body = response.body
            else:
                return None

            if not body:
                return None

            etag = hashlib.md5(body).hexdigest()
            return f'"{etag}"'
        except Exception:
            return None
