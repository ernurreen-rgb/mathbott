"""
Error handling middleware for FastAPI.
"""
import logging
from typing import Any, Dict, List, Optional, Union

from fastapi import HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


class APIError(Exception):
    """Custom API error with status code and detail."""

    def __init__(self, status_code: int, detail: str, error_code: str = None):
        self.status_code = status_code
        self.detail = detail
        self.error_code = error_code
        super().__init__(self.detail)


def _environment(request: Request) -> str:
    try:
        return str(getattr(request.app.state, "environment", "development")).lower()
    except Exception:
        return "development"


def _request_id(request: Optional[Request]) -> Optional[str]:
    if not request:
        return None
    return getattr(request.state, "request_id", None)


def create_error_response(
    status_code: int,
    detail: Union[str, Dict[str, Any], List[Any]],
    error_code: str = None,
    request: Request = None,
) -> JSONResponse:
    """Create standardized error response."""
    error_data = {
        "error": {
            "status_code": status_code,
            "detail": detail,
            "error_code": error_code or f"ERR_{status_code}",
            "request_id": _request_id(request),
        }
    }
    return JSONResponse(status_code=status_code, content=error_data)


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """Handle HTTP exceptions with production-safe 500 sanitization."""
    status_code = int(exc.status_code)
    env = _environment(request)
    error_code = f"ERR_{status_code}"
    detail: Any = exc.detail

    if status_code >= 500 and env == "production":
        detail = "An internal server error occurred"
        error_code = "INTERNAL_SERVER_ERROR"
    elif isinstance(detail, dict):
        code = detail.get("code")
        if isinstance(code, str) and code.strip():
            error_code = code.strip()

    logger.warning(
        "http_exception",
        extra={
            "extra_fields": {
                "event": "error",
                "error_type": "http_exception",
                "status_code": status_code,
                "error_code": error_code,
                "detail": str(detail),
                "method": request.method,
                "path": request.url.path,
                "request_id": _request_id(request),
            }
        },
    )

    return create_error_response(
        status_code=status_code,
        detail=detail,
        error_code=error_code,
        request=request,
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Handle validation errors."""
    errors = exc.errors()
    error_messages = []
    for error in errors:
        field = " -> ".join(str(loc) for loc in error.get("loc", []))
        message = error.get("msg", "Validation error")
        error_messages.append(f"{field}: {message}")

    detail = "; ".join(error_messages)
    logger.warning(
        "validation_exception",
        extra={
            "extra_fields": {
                "event": "error",
                "error_type": "validation_exception",
                "status_code": status.HTTP_422_UNPROCESSABLE_ENTITY,
                "error_code": "VALIDATION_ERROR",
                "detail": detail,
                "method": request.method,
                "path": request.url.path,
                "request_id": _request_id(request),
            }
        },
    )

    return create_error_response(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=f"Validation error: {detail}",
        error_code="VALIDATION_ERROR",
        request=request,
    )


async def general_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle unhandled exceptions."""
    env = _environment(request)
    if env == "production":
        detail = "An internal server error occurred"
    else:
        detail = f"Internal server error: {str(exc)}"

    logger.error(
        "unhandled_exception",
        exc_info=True,
        extra={
            "extra_fields": {
                "event": "error",
                "error_type": "unhandled_exception",
                "status_code": status.HTTP_500_INTERNAL_SERVER_ERROR,
                "error_code": "INTERNAL_SERVER_ERROR",
                "exception_class": type(exc).__name__,
                "method": request.method,
                "path": request.url.path,
                "request_id": _request_id(request),
            }
        },
    )

    return create_error_response(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=detail,
        error_code="INTERNAL_SERVER_ERROR",
        request=request,
    )

