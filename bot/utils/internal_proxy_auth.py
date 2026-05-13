"""
Helpers for verifying requests forwarded by the trusted Next.js proxy.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import time
from typing import Optional, Tuple

from fastapi import Request


PROXY_TS_HEADER = "X-Proxy-Request-Ts"
PROXY_SIGNATURE_HEADER = "X-Proxy-Request-Signature"
PROXY_EMAIL_HEADER = "X-Proxy-User-Email"
PROXY_SIGNATURE_TTL_SECONDS = 60
WEBSOCKET_TOKEN_TTL_SECONDS = 120


def _get_proxy_secret() -> str:
    value = os.getenv("INTERNAL_PROXY_SHARED_SECRET", "")
    if isinstance(value, str) and value.strip():
        return value.strip()
    environment = os.getenv("ENVIRONMENT", "development").strip().lower() or "development"
    if environment != "production":
        return "dev-internal-proxy-secret-change-me"
    return ""


def build_canonical_proxy_payload(
    *,
    method: str,
    path: str,
    raw_query: str,
    user_email: str,
    timestamp: str,
) -> bytes:
    return "\n".join(
        [
            str(method or "").upper(),
            str(path or ""),
            str(raw_query or ""),
            str(user_email or ""),
            str(timestamp or ""),
        ]
    ).encode("utf-8")


def build_canonical_ws_payload(
    *,
    session_id: int,
    user_email: str,
    timestamp: str,
) -> bytes:
    return "\n".join(
        [
            "WS",
            f"/ws/trial-tests/coop/{int(session_id)}",
            str(user_email or "").strip().lower(),
            str(timestamp or ""),
        ]
    ).encode("utf-8")


def _build_canonical_from_request(request: Request, user_email: str, timestamp: str) -> bytes:
    raw_query = ""
    try:
        raw_query = (request.scope.get("query_string") or b"").decode("utf-8")
    except Exception:
        raw_query = request.url.query or ""
    return build_canonical_proxy_payload(
        method=request.method,
        path=request.url.path,
        raw_query=raw_query,
        user_email=user_email,
        timestamp=timestamp,
    )


def get_proxy_email(request: Request) -> Optional[str]:
    raw = request.headers.get(PROXY_EMAIL_HEADER)
    if raw is None:
        return None
    value = str(raw).strip().lower()
    return value or None


def has_proxy_signature_headers(request: Request) -> bool:
    return bool(request.headers.get(PROXY_TS_HEADER) and request.headers.get(PROXY_SIGNATURE_HEADER))


def verify_proxy_signature(request: Request) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Returns: (is_valid, user_email, error_code)
    """
    timestamp = (request.headers.get(PROXY_TS_HEADER) or "").strip()
    signature = (request.headers.get(PROXY_SIGNATURE_HEADER) or "").strip()
    if not timestamp or not signature:
        return False, None, "missing_headers"

    secret = _get_proxy_secret()
    if not secret:
        return False, None, "secret_missing"

    try:
        timestamp_int = int(timestamp)
    except Exception:
        return False, None, "invalid_timestamp"

    now = int(time.time())
    if abs(now - timestamp_int) > PROXY_SIGNATURE_TTL_SECONDS:
        return False, None, "timestamp_out_of_range"

    user_email = get_proxy_email(request) or ""
    payload = _build_canonical_from_request(request, user_email, timestamp)
    expected_signature = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected_signature):
        return False, None, "invalid_signature"

    normalized_email = user_email or None
    return True, normalized_email, None


def build_ws_token(*, session_id: int, user_email: str, timestamp: Optional[int] = None) -> str:
    secret = _get_proxy_secret()
    if not secret:
        raise ValueError("proxy_secret_missing")

    timestamp_value = str(int(timestamp if timestamp is not None else time.time()))
    payload = build_canonical_ws_payload(
        session_id=session_id,
        user_email=user_email,
        timestamp=timestamp_value,
    )
    signature = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    return f"{timestamp_value}.{signature}"


def verify_ws_token(*, session_id: int, user_email: str, token: str) -> Tuple[bool, Optional[str]]:
    if not token or "." not in token:
        return False, "missing_token"

    timestamp, signature = token.split(".", 1)
    if not timestamp or not signature:
        return False, "invalid_token"

    secret = _get_proxy_secret()
    if not secret:
        return False, "secret_missing"

    try:
        timestamp_int = int(timestamp)
    except Exception:
        return False, "invalid_timestamp"

    now = int(time.time())
    if abs(now - timestamp_int) > WEBSOCKET_TOKEN_TTL_SECONDS:
        return False, "timestamp_out_of_range"

    payload = build_canonical_ws_payload(
        session_id=session_id,
        user_email=user_email,
        timestamp=timestamp,
    )
    expected_signature = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected_signature):
        return False, "invalid_signature"

    return True, None
