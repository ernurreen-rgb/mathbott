"""
Helpers for verifying requests forwarded by the trusted Next.js proxy.
"""
from __future__ import annotations

import hashlib
import hmac
import re
import secrets
import time
from collections import OrderedDict
from threading import Lock
from typing import Optional, Tuple

from fastapi import Request
from settings import get_settings
from utils.request_path import get_scope_path


PROXY_TS_HEADER = "X-Proxy-Request-Ts"
PROXY_NONCE_HEADER = "X-Proxy-Request-Nonce"
PROXY_SIGNATURE_HEADER = "X-Proxy-Request-Signature"
PROXY_SIGNATURE_V2_HEADER = "X-Proxy-Request-Signature-V2"
PROXY_EMAIL_HEADER = "X-Proxy-User-Email"
PROXY_BODY_SHA256_HEADER = "X-Proxy-Body-Sha256"
PROXY_CONTENT_TYPE_HEADER = "X-Proxy-Content-Type"
PROXY_CLIENT_KEY_HEADER = "X-Proxy-Client-Key"
PROXY_CLIENT_KEY_SIGNATURE_HEADER = "X-Proxy-Client-Key-Signature"
PROXY_SIGNATURE_TTL_SECONDS = 60
PRESENCE_WEBSOCKET_TOKEN_TTL_SECONDS = 120
_WS_MAX_FUTURE_SKEW_SECONDS = 5
_PROXY_MUTATING_REPLAY_CACHE_MAX_SIZE = 50000
_PROXY_READ_REPLAY_CACHE_MAX_SIZE = 10000
_WS_TICKET_REPLAY_CACHE_MAX_SIZE = 50000
_proxy_mutating_replay_cache: "OrderedDict[str, int]" = OrderedDict()
_proxy_read_replay_cache: "OrderedDict[str, int]" = OrderedDict()
_proxy_replay_lock = Lock()
_ws_ticket_replay_cache: "OrderedDict[str, int]" = OrderedDict()
_ws_ticket_replay_lock = Lock()
_HEX64_RE = re.compile(r"^[0-9a-f]{64}$")
_WS_JTI_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")


def _get_proxy_secret() -> str:
    settings = get_settings()
    if settings.internal_proxy_shared_secret:
        return settings.internal_proxy_shared_secret
    if not settings.is_production:
        return "dev-internal-proxy-secret-change-me"
    return ""


def build_canonical_proxy_payload(
    *,
    method: str,
    path: str,
    raw_query: str,
    user_email: str,
    timestamp: str,
    nonce: Optional[str] = None,
    body_sha256: Optional[str] = None,
    content_type: Optional[str] = None,
) -> bytes:
    parts = [
        str(method or "").upper(),
        str(path or ""),
        str(raw_query or ""),
        str(user_email or ""),
        str(timestamp or ""),
    ]
    if nonce is not None:
        parts.append(str(nonce or ""))
    if body_sha256 is not None:
        parts.append(str(body_sha256 or ""))
        parts.append(str(content_type or ""))
    return "\n".join(parts).encode("utf-8")


def build_canonical_presence_ws_payload(
    *,
    user_email: str,
    timestamp: str,
    jti: Optional[str] = None,
) -> bytes:
    parts = [
        "WS",
        "/ws/presence",
        str(user_email or "").strip().lower(),
        str(timestamp or ""),
    ]
    if jti is not None:
        parts.append(str(jti or ""))
    return "\n".join(parts).encode("utf-8")


def _build_canonical_from_request(
    request: Request,
    user_email: str,
    timestamp: str,
    nonce: Optional[str],
    body_sha256: Optional[str],
    content_type: Optional[str],
) -> bytes:
    raw_query = (request.scope.get("query_string") or b"").decode("latin-1")
    return build_canonical_proxy_payload(
        method=request.method,
        path=get_scope_path(request),
        raw_query=raw_query,
        user_email=user_email,
        timestamp=timestamp,
        nonce=nonce,
        body_sha256=body_sha256,
        content_type=content_type,
    )


def _is_mutating_method(method: str) -> bool:
    return str(method or "").upper() in {"POST", "PUT", "PATCH", "DELETE"}


def get_proxy_email(request: Request) -> Optional[str]:
    raw = request.headers.get(PROXY_EMAIL_HEADER)
    if raw is None:
        return None
    value = str(raw).strip().lower()
    return value or None


def has_proxy_signature_headers(request: Request) -> bool:
    return bool(
        request.headers.get(PROXY_TS_HEADER)
        and (
            request.headers.get(PROXY_SIGNATURE_HEADER)
            or request.headers.get(PROXY_SIGNATURE_V2_HEADER)
        )
    )


def _get_cached_proxy_signature_result(
    request: Request,
    *,
    timestamp: str,
    nonce: Optional[str],
    signature: str,
) -> Optional[Tuple[bool, Optional[str], Optional[str]]]:
    cached = getattr(request.state, "_trusted_proxy_signature_result", None)
    if not isinstance(cached, dict):
        return None
    if (
        cached.get("timestamp") == timestamp
        and cached.get("nonce") == nonce
        and cached.get("signature") == signature
    ):
        return cached.get("result")
    return None


def _cache_proxy_signature_result(
    request: Request,
    *,
    timestamp: str,
    nonce: Optional[str],
    signature: str,
    result: Tuple[bool, Optional[str], Optional[str]],
) -> None:
    request.state._trusted_proxy_signature_result = {
        "timestamp": timestamp,
        "nonce": nonce,
        "signature": signature,
        "result": result,
    }


def _prune_ordered_expiring_cache(cache: "OrderedDict[str, int]", cutoff: int, max_size: int) -> None:
    while cache:
        _, oldest_ts = next(iter(cache.items()))
        if oldest_ts < cutoff:
            cache.popitem(last=False)
        else:
            break
    if len(cache) >= max_size:
        expired_keys = [key for key, seen_ts in cache.items() if seen_ts < cutoff]
        for key in expired_keys:
            cache.pop(key, None)


def _remember_proxy_signature_once(
    cache_key: str,
    timestamp_int: int,
    now: int,
    *,
    is_mutating: bool = True,
) -> bool:
    min_timestamp = now - PROXY_SIGNATURE_TTL_SECONDS
    cache = _proxy_mutating_replay_cache if is_mutating else _proxy_read_replay_cache
    max_size = _PROXY_MUTATING_REPLAY_CACHE_MAX_SIZE if is_mutating else _PROXY_READ_REPLAY_CACHE_MAX_SIZE
    with _proxy_replay_lock:
        _prune_ordered_expiring_cache(cache, min_timestamp, max_size)

        if cache_key in cache:
            return False

        cache[cache_key] = timestamp_int
        while len(cache) > max_size:
            cache.popitem(last=False)
        return True


def consume_ws_ticket_jti(
    scope: str,
    jti: str,
    expires_at: int,
    *,
    now: Optional[int] = None,
) -> bool:
    """Record a one-time WebSocket ticket JTI; returns False if already used."""
    current_now = int(now if now is not None else time.time())
    cache_key = f"{scope}:{jti}"
    with _ws_ticket_replay_lock:
        _prune_ordered_expiring_cache(_ws_ticket_replay_cache, current_now, _WS_TICKET_REPLAY_CACHE_MAX_SIZE)
        if cache_key in _ws_ticket_replay_cache:
            return False
        _ws_ticket_replay_cache[cache_key] = int(expires_at)
        while len(_ws_ticket_replay_cache) > _WS_TICKET_REPLAY_CACHE_MAX_SIZE:
            _ws_ticket_replay_cache.popitem(last=False)
        return True


def get_verified_proxy_client_key(request: Request) -> Optional[str]:
    """Verify and return a proxy-signed pseudonymous client network key for rate limiting."""
    secret = _get_proxy_secret()
    if not secret:
        return None
    timestamp = (request.headers.get(PROXY_TS_HEADER) or "").strip()
    nonce = (request.headers.get(PROXY_NONCE_HEADER) or "").strip()
    request_signature = (request.headers.get(PROXY_SIGNATURE_V2_HEADER) or "").strip()
    if not timestamp or not nonce or not request_signature:
        return None

    for key_header, sig_header, domain in (
        (PROXY_CLIENT_KEY_HEADER, PROXY_CLIENT_KEY_SIGNATURE_HEADER, "PROXY-CLIENT-KEY"),
        ("X-Quiz-Entry-Client-Key", "X-Quiz-Entry-Client-Signature", "QUIZ-ENTRY-CLIENT"),
    ):
        client_key = (request.headers.get(key_header) or "").strip().lower()
        client_sig = (request.headers.get(sig_header) or "").strip().lower()
        if not client_key or not client_sig:
            continue
        if not _HEX64_RE.fullmatch(client_key) or not _HEX64_RE.fullmatch(client_sig):
            continue
        payload = "\n".join([domain, timestamp, nonce, request_signature, client_key]).encode("utf-8")
        expected = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
        if hmac.compare_digest(client_sig, expected):
            return client_key
    return None


def verify_proxy_signature(request: Request) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Returns: (is_valid, user_email, error_code)
    """
    timestamp = (request.headers.get(PROXY_TS_HEADER) or "").strip()
    nonce_header = (request.headers.get(PROXY_NONCE_HEADER) or "").strip()
    nonce = nonce_header or None
    legacy_signature = (request.headers.get(PROXY_SIGNATURE_HEADER) or "").strip()
    signature_v2 = (request.headers.get(PROXY_SIGNATURE_V2_HEADER) or "").strip()
    body_sha256_header = (request.headers.get(PROXY_BODY_SHA256_HEADER) or "").strip().lower()
    signed_content_type = (request.headers.get(PROXY_CONTENT_TYPE_HEADER) or "").strip().lower()
    if bool(nonce) != bool(signature_v2):
        return False, None, "incomplete_v2_headers"
    signature = signature_v2 if nonce and signature_v2 else legacy_signature
    payload_nonce = nonce if nonce and signature_v2 else None
    payload_body_sha256 = body_sha256_header if payload_nonce and body_sha256_header else None
    payload_content_type = signed_content_type if payload_body_sha256 is not None else None
    if not timestamp or not signature:
        return False, None, "missing_headers"

    cached_result = _get_cached_proxy_signature_result(
        request,
        timestamp=timestamp,
        nonce=payload_nonce,
        signature=signature,
    )
    if cached_result is not None:
        return cached_result

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

    settings = get_settings()
    if settings.is_production:
        if not payload_nonce or not signature_v2:
            return False, None, "v2_signature_required"
        if _is_mutating_method(request.method) and not payload_body_sha256:
            return False, None, "body_hash_required"

    actual_body_sha256 = getattr(request.state, "_trusted_proxy_body_sha256", None)
    if settings.is_production and _is_mutating_method(request.method) and actual_body_sha256 is None:
        return False, None, "body_hash_unverified"
    if payload_body_sha256 is not None and actual_body_sha256 is not None:
        if not hmac.compare_digest(payload_body_sha256, str(actual_body_sha256).lower()):
            return False, None, "invalid_body_hash"

    actual_content_type = (request.headers.get("content-type") or "").strip().lower()
    if payload_content_type is not None and not hmac.compare_digest(payload_content_type, actual_content_type):
        return False, None, "invalid_content_type"

    user_email = get_proxy_email(request) or ""
    payload = _build_canonical_from_request(
        request,
        user_email,
        timestamp,
        payload_nonce,
        payload_body_sha256,
        payload_content_type,
    )
    expected_signature = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected_signature):
        return False, None, "invalid_signature"

    if payload_nonce is not None:
        cache_key = f"{timestamp}.{payload_nonce}.{signature}"
        if not _remember_proxy_signature_once(
            cache_key,
            timestamp_int,
            now,
            is_mutating=_is_mutating_method(request.method),
        ):
            return False, None, "replayed_signature"

    normalized_email = user_email or None
    result = (True, normalized_email, None)
    _cache_proxy_signature_result(
        request,
        timestamp=timestamp,
        nonce=payload_nonce,
        signature=signature,
        result=result,
    )
    return result


def build_presence_ws_token(
    *,
    user_email: str,
    timestamp: Optional[int] = None,
    jti: Optional[str] = None,
) -> str:
    secret = _get_proxy_secret()
    if not secret:
        raise ValueError("proxy_secret_missing")

    timestamp_value = str(int(timestamp if timestamp is not None else time.time()))
    jti_value = str(jti or secrets.token_urlsafe(16))
    payload = build_canonical_presence_ws_payload(
        user_email=user_email,
        timestamp=timestamp_value,
        jti=jti_value,
    )
    signature = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    return f"{timestamp_value}.{jti_value}.{signature}"


def verify_presence_ws_token(
    *,
    user_email: str,
    token: str,
    consume: bool = True,
) -> Tuple[bool, Optional[str]]:
    if not token or "." not in token:
        return False, "missing_token"

    parts = token.split(".")
    if len(parts) != 3:
        return False, "invalid_token"
    timestamp, jti, signature = parts
    if not timestamp or not jti or not signature or not _WS_JTI_RE.fullmatch(jti):
        return False, "invalid_token"

    secret = _get_proxy_secret()
    if not secret:
        return False, "secret_missing"

    try:
        timestamp_int = int(timestamp)
    except Exception:
        return False, "invalid_timestamp"

    now = int(time.time())
    if timestamp_int > now + _WS_MAX_FUTURE_SKEW_SECONDS or (now - timestamp_int) > PRESENCE_WEBSOCKET_TOKEN_TTL_SECONDS:
        return False, "timestamp_out_of_range"

    payload = build_canonical_presence_ws_payload(
        user_email=user_email,
        timestamp=timestamp,
        jti=jti,
    )
    expected_signature = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected_signature):
        return False, "invalid_signature"

    if consume:
        expires_at = timestamp_int + PRESENCE_WEBSOCKET_TOKEN_TTL_SECONDS + _WS_MAX_FUTURE_SKEW_SECONDS
        if not consume_ws_ticket_jti("presence-ws", jti, expires_at, now=now):
            return False, "replayed_token"

    return True, None
