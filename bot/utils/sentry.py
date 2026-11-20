"""
Sentry initialization helpers for backend.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from fastapi import HTTPException

from settings import get_settings

logger = logging.getLogger(__name__)
_SENTRY_INIT_RESULT: Optional[bool] = None
_SENSITIVE_HEADERS = {
    "authorization",
    "cookie",
    "set-cookie",
    "x-admin-secret",
    "x-proxy-user-email",
    "x-proxy-request-signature",
    "x-proxy-request-signature-v2",
}
_SENSITIVE_QUERY_KEYS = {"email", "token", "secret", "ticket", "key", "password", "code"}


def _remove_sensitive_headers(headers: Any) -> Any:
    if isinstance(headers, dict):
        cleaned: Dict[str, Any] = {}
        for key, value in headers.items():
            key_l = str(key).lower()
            if key_l in _SENSITIVE_HEADERS:
                cleaned[key] = "[REDACTED]"
            else:
                cleaned[key] = value
        return cleaned
    return headers


def _scrub_query_string(raw_query: Any) -> Any:
    if not isinstance(raw_query, str) or not raw_query:
        return raw_query
    pairs = parse_qsl(raw_query, keep_blank_values=True)
    if not pairs:
        return raw_query
    scrubbed = [
        (k, "[REDACTED]" if k.strip().lower() in _SENSITIVE_QUERY_KEYS else v)
        for k, v in pairs
    ]
    return urlencode(scrubbed)


def _scrub_url(raw_url: Any) -> Any:
    if not isinstance(raw_url, str) or "?" not in raw_url:
        return raw_url
    try:
        parts = urlsplit(raw_url)
        return urlunsplit((parts.scheme, parts.netloc, parts.path, _scrub_query_string(parts.query), ""))
    except Exception:
        return raw_url


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
        if "query_string" in request_data:
            request_data["query_string"] = _scrub_query_string(request_data.get("query_string"))
        if "url" in request_data:
            request_data["url"] = _scrub_url(request_data.get("url"))
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

    settings = get_settings()
    dsn = settings.sentry_dsn
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

    traces_sample_rate = settings.sentry_traces_sample_rate

    sentry_sdk.init(
        dsn=dsn,
        environment=(settings.sentry_environment or environment or "production"),
        release=(settings.sentry_release or release or "mathbot-backend@unknown"),
        integrations=[FastApiIntegration()],
        traces_sample_rate=max(0.0, min(1.0, traces_sample_rate)),
        before_send=_before_send,
        send_default_pii=False,
    )
    logger.info("Sentry backend initialized")
    _SENTRY_INIT_RESULT = True
    return _SENTRY_INIT_RESULT
