"""
Middleware to set request_id context and emit request lifecycle logs.
"""
from __future__ import annotations

import logging
import time
from uuid import uuid4

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

from utils.request_context import (
    reset_current_request,
    reset_request_id,
    set_current_request,
    set_request_id,
)

logger = logging.getLogger(__name__)


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        incoming_request_id = (request.headers.get("X-Request-ID") or "").strip()
        request_id = incoming_request_id or str(uuid4())
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
