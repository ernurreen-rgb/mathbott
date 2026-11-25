"""
Middleware to set request_id context and emit request lifecycle logs.
"""
from __future__ import annotations

import logging
import re
import sys
import time
from uuid import uuid4

from fastapi import HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware

import storage
from middleware.error_handler import http_exception_handler
from utils import boot_timing
from utils.request_context import (
    reset_current_request,
    reset_request_id,
    set_current_request,
    set_request_id,
)

logger = logging.getLogger(__name__)
_SAFE_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


def _server_timing(duration_ms: float, request_started: float, connects) -> str:
    """The API's part of a request for the Server-Timing header: the site's proxy adds its own,
    and students' devices report all of it (routes/client_timings.py).

    "app" is this request's handling. The first request of a process also gets the cold start's
    phases (utils/boot_timing.py), and a request that opened database connections gets the time
    it spent on them ("db-connect", plus "db-prewarm" when the first came from storage.start_prewarm).
    """
    parts = [f"app;dur={duration_ms}"]
    cold = boot_timing.cold_start_metrics(request_started)
    if cold:
        parts.append(cold)
    if connects:
        parts.append(f"db-connect;dur={sum(seconds for seconds, _ in connects) * 1000:.1f}")
        if any(prewarmed for _, prewarmed in connects):
            parts.append("db-prewarm")
    return ", ".join(parts)


def _sanitize_request_id(raw_value: str | None) -> str:
    candidate = (raw_value or "").strip()
    if candidate and _SAFE_REQUEST_ID_RE.fullmatch(candidate):
        return candidate
    return str(uuid4())


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = _sanitize_request_id(request.headers.get("X-Request-ID"))
        request.state.request_id = request_id
        # Only when Sentry is set up (utils/sentry.py imported it): importing it here would add
        # about 0.1 s to every cold start.
        sentry_sdk = sys.modules.get("sentry_sdk")
        if sentry_sdk is not None:
            try:
                sentry_sdk.set_tag("request_id", request_id)
            except Exception:
                pass

        request_token = set_current_request(request)
        token = set_request_id(request_id)
        start = time.perf_counter()
        connects: list = []
        connects_token = storage.connect_timings.set(connects)
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
            storage.connect_timings.reset(connects_token)
            reset_request_id(token)
            reset_current_request(request_token)

        response.headers["X-Request-ID"] = request_id
        duration_ms = round((time.perf_counter() - start) * 1000.0, 2)
        existing_timing = response.headers.get("Server-Timing")
        timing = _server_timing(duration_ms, start, connects)
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
