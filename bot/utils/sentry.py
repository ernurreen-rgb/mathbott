"""
Sentry initialization helpers for backend.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional

from fastapi import HTTPException

logger = logging.getLogger(__name__)
_SENTRY_INIT_RESULT: Optional[bool] = None


def _remove_sensitive_headers(headers: Any) -> Any:
    if isinstance(headers, dict):
        cleaned: Dict[str, Any] = {}
        for key, value in headers.items():
            key_l = str(key).lower()
            if key_l in {"authorization", "cookie", "set-cookie"}:
                cleaned[key] = "[REDACTED]"
            else:
                cleaned[key] = value
        return cleaned
    return headers


def _before_send(event: Dict[str, Any], hint: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    # Ignore expected 4xx HTTP exceptions.
    exc_info = hint.get("exc_info")
    if exc_info and len(exc_info) >= 2:
        exc = exc_info[1]
        if isinstance(exc, HTTPException) and 400 <= int(exc.status_code) < 500:
            return None

    request_data = event.get("request")
    if isinstance(request_data, dict):
        request_data["headers"] = _remove_sensitive_headers(request_data.get("headers"))
        if "cookies" in request_data:
            request_data["cookies"] = "[REDACTED]"
        if "data" in request_data:
            request_data["data"] = "[REDACTED]"

    user_data = event.get("user")
    if isinstance(user_data, dict):
        for field in ("email", "ip_address", "username"):
            if field in user_data:
                user_data[field] = "[REDACTED]"

    return event


def init_sentry(environment: str, release: str) -> bool:
    global _SENTRY_INIT_RESULT

    if _SENTRY_INIT_RESULT is not None:
        return _SENTRY_INIT_RESULT

    dsn = (os.getenv("SENTRY_DSN") or "").strip()
    if not dsn:
        _SENTRY_INIT_RESULT = False
        return _SENTRY_INIT_RESULT

    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
    except Exception:
        logger.warning("Sentry DSN is set but sentry-sdk is not installed")
        _SENTRY_INIT_RESULT = False
        return _SENTRY_INIT_RESULT

    traces_sample_rate_raw = os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.1")
    try:
        traces_sample_rate = float(traces_sample_rate_raw)
    except Exception:
        traces_sample_rate = 0.1

    sentry_sdk.init(
        dsn=dsn,
        environment=(os.getenv("SENTRY_ENVIRONMENT") or environment or "production"),
        release=(os.getenv("SENTRY_RELEASE") or release or "mathbot-backend@unknown"),
        integrations=[FastApiIntegration()],
        traces_sample_rate=max(0.0, min(1.0, traces_sample_rate)),
        before_send=_before_send,
        send_default_pii=False,
    )
    logger.info("Sentry backend initialized")
    _SENTRY_INIT_RESULT = True
    return _SENTRY_INIT_RESULT
