"""import tokens helpers extracted without changing calculation rules."""
import json
import base64
import hashlib
import hmac
import secrets
import time
from collections import OrderedDict
from threading import Lock
from typing import List, Any, Dict, Tuple
from fastapi import HTTPException
from config import KNOWN_PLACEHOLDER_SECRETS
from settings import DEFAULT_ADMIN_SECRET, get_settings
from .content_validation import BANK_IMPORT_PREVIEW_TOKEN_TTL_SECONDS, BANK_IMPORT_PREVIEW_TOKEN_VERSION

_CONSUMED_JTI_MAX_SIZE = 4096
_consumed_import_jtis: "OrderedDict[str, int]" = OrderedDict()
_consumed_import_jtis_lock = Lock()
_DEV_FALLBACK_IMPORT_SECRET = "dev-only-import-preview-token-secret-not-for-production"


def _canonical_json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _normalize_email_for_token(email: str) -> str:
    return (email or "").strip().lower()


def _hash_import_payload(normalized_tasks: List[Dict[str, Any]]) -> str:
    canonical = _canonical_json_dumps(normalized_tasks)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _base64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _base64url_decode(value: str) -> bytes:
    padding = "=" * ((4 - len(value) % 4) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}")


def _is_weak_secret(secret: str) -> bool:
    return not secret or secret == DEFAULT_ADMIN_SECRET or secret in KNOWN_PLACEHOLDER_SECRETS


def _get_import_preview_token_secret() -> str:
    settings = get_settings()
    explicit = (settings.import_preview_token_secret or "").strip()
    if explicit:
        if settings.is_production and (_is_weak_secret(explicit) or len(explicit) < 32):
            raise HTTPException(
                status_code=500,
                detail={
                    "code": "IMPORT_PREVIEW_SECRET_MISSING",
                    "message": "Import preview token secret is misconfigured.",
                },
            )
        return explicit

    admin_secret = (settings.admin_secret or "").strip()
    if admin_secret and not _is_weak_secret(admin_secret):
        return admin_secret

    proxy_secret = (settings.internal_proxy_shared_secret or "").strip()
    if proxy_secret and not _is_weak_secret(proxy_secret):
        return hmac.new(
            proxy_secret.encode("utf-8"),
            b"qazmath:import-preview-token:v1",
            hashlib.sha256,
        ).hexdigest()

    if not settings.is_production:
        return _DEV_FALLBACK_IMPORT_SECRET

    raise HTTPException(
        status_code=500,
        detail={
            "code": "IMPORT_PREVIEW_SECRET_MISSING",
            "message": "Import preview token secret is not configured.",
        },
    )


def _issue_import_preview_token(email_norm: str, payload_hash: str) -> Tuple[str, int]:
    now_ts = int(time.time())
    exp_ts = now_ts + BANK_IMPORT_PREVIEW_TOKEN_TTL_SECONDS
    payload = {
        "v": BANK_IMPORT_PREVIEW_TOKEN_VERSION,
        "jti": secrets.token_urlsafe(16),
        "email_norm": email_norm,
        "payload_hash": payload_hash,
        "iat": now_ts,
        "exp": exp_ts,
    }
    payload_raw = _canonical_json_dumps(payload).encode("utf-8")
    payload_b64 = _base64url_encode(payload_raw)
    secret = _get_import_preview_token_secret().encode("utf-8")
    signature = hmac.new(secret, payload_b64.encode("utf-8"), hashlib.sha256).digest()
    token = f"{payload_b64}.{_base64url_encode(signature)}"
    return token, exp_ts


def _consume_import_preview_token_jti(jti: Any, exp_ts: int) -> None:
    if not isinstance(jti, str) or not jti.strip():
        raise _import_http_error("IMPORT_PREVIEW_TOKEN_INVALID", "preview_token is invalid")
    now_ts = int(time.time())
    with _consumed_import_jtis_lock:
        expired_keys = [k for k, v in _consumed_import_jtis.items() if v < now_ts]
        for key in expired_keys:
            _consumed_import_jtis.pop(key, None)
        if jti in _consumed_import_jtis:
            raise _import_http_error(
                "IMPORT_PREVIEW_TOKEN_REPLAYED",
                "preview_token has already been used. Run dry-run again.",
            )
        _consumed_import_jtis[jti] = exp_ts
        while len(_consumed_import_jtis) > _CONSUMED_JTI_MAX_SIZE:
            _consumed_import_jtis.popitem(last=False)


def _import_http_error(code: str, message: str, status_code: int = 400) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message})


def _verify_import_preview_token(token: Any, expected_email_norm: str) -> Dict[str, Any]:
    if not isinstance(token, str) or not token.strip():
        raise _import_http_error("IMPORT_PREVIEW_TOKEN_REQUIRED", "preview_token is required for confirm mode")

    raw = token.strip()
    parts = raw.split(".")
    if len(parts) != 2 or not parts[0] or not parts[1]:
        raise _import_http_error("IMPORT_PREVIEW_TOKEN_INVALID", "preview_token is invalid")
    payload_b64, signature_b64 = parts

    try:
        payload_raw = _base64url_decode(payload_b64)
        signature_raw = _base64url_decode(signature_b64)
    except Exception:
        raise _import_http_error("IMPORT_PREVIEW_TOKEN_INVALID", "preview_token is invalid")

    secret = _get_import_preview_token_secret().encode("utf-8")
    expected_signature = hmac.new(secret, payload_b64.encode("utf-8"), hashlib.sha256).digest()
    if not hmac.compare_digest(signature_raw, expected_signature):
        raise _import_http_error("IMPORT_PREVIEW_TOKEN_INVALID", "preview_token is invalid")

    try:
        payload = json.loads(payload_raw.decode("utf-8"))
    except Exception:
        raise _import_http_error("IMPORT_PREVIEW_TOKEN_INVALID", "preview_token is invalid")

    if not isinstance(payload, dict):
        raise _import_http_error("IMPORT_PREVIEW_TOKEN_INVALID", "preview_token is invalid")

    token_version = payload.get("v")
    jti = payload.get("jti")
    email_norm = payload.get("email_norm")
    payload_hash = payload.get("payload_hash")
    exp_ts = payload.get("exp")
    iat_ts = payload.get("iat")

    if token_version != BANK_IMPORT_PREVIEW_TOKEN_VERSION:
        raise _import_http_error("IMPORT_PREVIEW_TOKEN_INVALID", "preview_token is invalid")
    if not isinstance(jti, str) or not jti.strip():
        raise _import_http_error("IMPORT_PREVIEW_TOKEN_INVALID", "preview_token is invalid")
    if not isinstance(email_norm, str) or not email_norm:
        raise _import_http_error("IMPORT_PREVIEW_TOKEN_INVALID", "preview_token is invalid")
    if not isinstance(payload_hash, str) or not payload_hash:
        raise _import_http_error("IMPORT_PREVIEW_TOKEN_INVALID", "preview_token is invalid")
    if not isinstance(exp_ts, int) or not isinstance(iat_ts, int):
        raise _import_http_error("IMPORT_PREVIEW_TOKEN_INVALID", "preview_token is invalid")
    if email_norm != expected_email_norm:
        raise _import_http_error("IMPORT_PREVIEW_TOKEN_INVALID", "preview_token does not match current user")

    now_ts = int(time.time())
    if exp_ts < now_ts:
        raise _import_http_error("IMPORT_PREVIEW_TOKEN_EXPIRED", "preview_token expired. Run dry-run again.")

    return payload
