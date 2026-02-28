"""
CSRF protection middleware
"""
import os
import secrets
from typing import Optional
from fastapi import Request, HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware
import logging

from utils.internal_proxy_auth import has_proxy_signature_headers, verify_proxy_signature

logger = logging.getLogger(__name__)

# CSRF token storage (in production, use Redis or similar)
csrf_tokens: dict[str, str] = {}


def generate_csrf_token() -> str:
    """Generate a new CSRF token"""
    return secrets.token_urlsafe(32)


def get_csrf_token_from_request(request: Request) -> Optional[str]:
    """Extract CSRF token from request"""
    # Try header first
    token = request.headers.get("X-CSRF-Token")
    if token:
        return token
    
    # Try form data
    if hasattr(request, "_form") and request._form:
        return request._form.get("csrf_token")
    
    return None


class CSRFMiddleware(BaseHTTPMiddleware):
    """CSRF protection middleware for POST/PUT/DELETE requests"""
    
    def __init__(self, app, exempt_paths: Optional[list[str]] = None):
        super().__init__(app)
        self.exempt_paths = exempt_paths or []
        # Allow health check and docs
        self.exempt_paths.extend(["/api/health", "/docs", "/redoc", "/openapi.json"])
    
    async def dispatch(self, request: Request, call_next):
        # Skip CSRF check for GET, HEAD, OPTIONS
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return await call_next(request)
        
        # Skip CSRF check for exempt paths
        if any(request.url.path.startswith(path) for path in self.exempt_paths):
            return await call_next(request)
        
        # Skip CSRF check in development if disabled
        if os.getenv("ENVIRONMENT", "development").lower() == "development":
            csrf_enabled = os.getenv("CSRF_ENABLED", "false").lower() == "true"
            if not csrf_enabled:
                return await call_next(request)
        
        # For POST/PUT/DELETE, require CSRF token
        if has_proxy_signature_headers(request):
            is_valid_proxy, _, _ = verify_proxy_signature(request)
            if is_valid_proxy:
                return await call_next(request)

        token = get_csrf_token_from_request(request)
        
        if not token:
            logger.warning(f"CSRF token missing for {request.method} {request.url.path}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="CSRF token missing"
            )
        
        # In a real implementation, validate token against session
        # For now, we'll use a simple token validation
        # In production, store tokens in session/Redis
        
        return await call_next(request)


def get_csrf_token(request: Request) -> str:
    """Get or generate CSRF token for request"""
    # In production, get from session
    # For now, generate a new one each time
    return generate_csrf_token()

