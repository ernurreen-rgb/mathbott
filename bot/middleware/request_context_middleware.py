"""
Middleware to set request_id context and emit request lifecycle logs.
"""
from __future__ import annotations

import logging
import re
import time
from uuid import uuid4

from fastapi import HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware

from middleware.error_handler import http_exception_handler
from utils.request_context import (
    reset_current_request,
    reset_request_id,
    set_current_request,
    set_request_id,
)

logger = logging.getLogger(__name__)
_SAFE_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
# The first request this process serves waited for it to start (a cold start on Vercel).
_served_a_request = False


def _server_timing(duration_ms: float) -> str:
    """The API's part of a request for the Server-Timing header: the site's proxy adds its own,
    and students' devices report all of it (routes/client_timings.py)."""
    global _served_a_request
    timing = f"app;dur={duration_ms}"
    if not _served_a_request:
        _served_a_request = True
        timing += ", api-cold"
    return timing


def _sanitize_request_id(raw_value: str | None) -> str:
    candidate = (raw_value or "").strip()
    if candidate and _SAFE_REQUEST_ID_RE.fullmatch(candidate):
        return candidate
    return str(uuid4())


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = _sanitize_request_id(request.headers.get("X-Request-ID"))
        request.state.request_id = request_id
        try:
            import sentry_sdk

            sentry_sdk.set_tag("request_id", request_id)
        except Exception:
            pass

        request_token = set_current_request(request)
        token = set_request_id(request_id)
        start = time.perf_counter()
        logger.info(
            "request_start",
            extra={
                "extra_fields": {
                    "event": "request_start",
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                }
            },
        )

        try:
            response = await call_next(request)
        except HTTPException as exc:
            response = await http_exception_handler(request, exc)
        except Exception:
            duration_ms = round((time.perf_counter() - start) * 1000.0, 2)
            logger.exception(
                "request_error",
                extra={
                    "extra_fields": {
                        "event": "request_error",
                        "request_id": request_id,
                        "method": request.method,
                        "path": request.url.path,
                        "duration_ms": duration_ms,
                    }
                },
            )
            raise
        finally:
            reset_request_id(token)
            reset_current_request(request_token)

        response.headers["X-Request-ID"] = request_id
        duration_ms = round((time.perf_counter() - start) * 1000.0, 2)
        existing_timing = response.headers.get("Server-Timing")
        timing = _server_timing(duration_ms)
        response.headers["Server-Timing"] = f"{existing_timing}, {timing}" if existing_timing else timing
        logger.info(
            "request_end",
            extra={
                "extra_fields": {
                    "event": "request_end",
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "status_code": response.status_code,
                    "duration_ms": duration_ms,
                }
            },
        )
        return response
