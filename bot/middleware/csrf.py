"""
CSRF protection middleware
"""
import os
from fastapi import Request, HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware
import logging

from utils.internal_proxy_auth import has_proxy_signature_headers, verify_proxy_signature
from utils.request_path import get_scope_path

logger = logging.getLogger(__name__)


class CSRFMiddleware(BaseHTTPMiddleware):
    """CSRF protection middleware for POST/PUT/DELETE requests"""
    
    def __init__(self, app, exempt_paths: list[str] | None = None):
        super().__init__(app)
        self.exempt_paths = exempt_paths or []
        # Allow health check and docs
        self.exempt_paths.extend(["/api/health", "/docs", "/redoc", "/openapi.json"])
    
    async def dispatch(self, request: Request, call_next):
        # Skip CSRF check for GET, HEAD, OPTIONS
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return await call_next(request)

        path = get_scope_path(request)
        
        # Skip CSRF check for exempt paths
        if any(path.startswith(exempt_path) for exempt_path in self.exempt_paths):
            return await call_next(request)
        
        # Skip CSRF check in development if disabled
        if os.getenv("ENVIRONMENT", "development").lower() == "development":
            csrf_enabled = os.getenv("CSRF_ENABLED", "false").lower() == "true"
            if not csrf_enabled:
                return await call_next(request)
        
        # In production, writes must come through the trusted Next.js proxy.
        if has_proxy_signature_headers(request):
            is_valid_proxy, _, _ = verify_proxy_signature(request)
            if is_valid_proxy:
                return await call_next(request)

        logger.warning("Rejected unsigned write request for %s %s", request.method, path)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Trusted proxy signature required for write requests",
        )

