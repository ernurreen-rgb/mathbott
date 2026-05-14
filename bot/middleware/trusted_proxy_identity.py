"""
Production guard for user identity forwarded by the trusted Next.js proxy.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Iterable, Optional
from urllib.parse import parse_qs, unquote

from starlette.datastructures import Headers
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from utils.internal_proxy_auth import has_proxy_signature_headers, verify_proxy_signature

logger = logging.getLogger(__name__)

MAX_IDENTITY_BODY_BYTES = 1024 * 1024


def _get_environment() -> str:
    return os.getenv("ENVIRONMENT", "development").strip().lower() or "development"


def _normalize_email(value: object) -> Optional[str]:
    if not isinstance(value, str):
        return None
    normalized = value.strip().lower()
    return normalized or None


def _is_email_path_segment(value: object) -> bool:
    normalized = _normalize_email(value)
    if normalized is None:
        return False
    return "@" in normalized and "." in normalized.rsplit("@", 1)[-1]


def _private_email_from_path(path: str) -> Optional[str]:
    parts = [unquote(part) for part in path.split("/") if part]
    if (
        len(parts) >= 4
        and parts[0] == "api"
        and parts[1] == "user"
        and parts[2] == "web"
        and _is_email_path_segment(parts[3])
    ):
        return _normalize_email(parts[3])
    if (
        len(parts) >= 4
        and parts[0] == "api"
        and parts[1] == "export"
        and parts[2] == "user"
        and _is_email_path_segment(parts[3])
    ):
        return _normalize_email(parts[3])
    return None


def _is_sensitive_identity_path(path: str) -> bool:
    sensitive_prefixes = (
        "/api/admin/",
        "/api/export/admin/",
        "/api/export/user/",
        "/api/friends",
        "/api/reports",
        "/api/task/check",
        "/api/trial-test-reports",
        "/api/trial-tests",
        "/api/user/onboarding",
        "/api/user/web",
    )
    if any(path.startswith(prefix) for prefix in sensitive_prefixes):
        return True
    return path.startswith("/api/tasks/") and path.endswith("/questions/check")


def _extract_query_email(scope: Scope) -> Optional[str]:
    try:
        raw_query = (scope.get("query_string") or b"").decode("utf-8")
    except Exception:
        return None
    values = parse_qs(raw_query, keep_blank_values=True)
    email_values = values.get("email") or []
    return _normalize_email(email_values[0] if email_values else None)


def _extract_body_email(content_type: str, body: bytes) -> Optional[str]:
    if not body or len(body) > MAX_IDENTITY_BODY_BYTES:
        return None

    if "application/json" in content_type:
        try:
            payload = json.loads(body.decode("utf-8"))
        except Exception:
            return None
        if isinstance(payload, dict):
            return _normalize_email(payload.get("email"))
        return None

    if "application/x-www-form-urlencoded" in content_type:
        try:
            values = parse_qs(body.decode("utf-8"), keep_blank_values=True)
        except Exception:
            return None
        email_values = values.get("email") or []
        return _normalize_email(email_values[0] if email_values else None)

    return None


def _explicit_emails_match(proxy_email: str, explicit_emails: Iterable[Optional[str]]) -> bool:
    normalized_proxy_email = _normalize_email(proxy_email)
    if not normalized_proxy_email:
        return False
    return all(email is None or email == normalized_proxy_email for email in explicit_emails)


class TrustedProxyIdentityMiddleware:
    """Ensure signed proxy identity is not bypassed by client-supplied email fields."""

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = str(scope.get("path") or "")
        headers = Headers(scope=scope)
        content_type = headers.get("content-type", "")
        request = Request(scope, receive)
        has_signature = has_proxy_signature_headers(request)
        is_valid_proxy = False
        proxy_email: Optional[str] = None

        if has_signature:
            is_valid_proxy, proxy_email, error_code = verify_proxy_signature(request)
            if not is_valid_proxy:
                logger.warning("Invalid trusted proxy signature: %s %s %s", path, error_code, proxy_email)
                response = JSONResponse(
                    {"detail": "Invalid trusted proxy signature."},
                    status_code=401,
                )
                await response(scope, receive, send)
                return

        environment = _get_environment()
        explicit_query_email = _extract_query_email(scope)
        explicit_path_email = _private_email_from_path(path)

        if environment == "production" and (
            _is_sensitive_identity_path(path)
            or explicit_query_email is not None
            or explicit_path_email is not None
        ):
            if not is_valid_proxy or not proxy_email:
                response = JSONResponse(
                    {"detail": "Trusted proxy authentication required."},
                    status_code=401,
                )
                await response(scope, receive, send)
                return

        should_inspect_body = (
            "application/json" in content_type
            or "application/x-www-form-urlencoded" in content_type
        )
        # In production, signed proxy requests already passed the trusted identity boundary.
        # Avoid buffering large bodies on hot paths such as admin imports.
        should_inspect_body = should_inspect_body and not (environment == "production" and is_valid_proxy)

        body = b""
        replay_receive = receive
        if should_inspect_body:
            body_messages: list[Message] = []
            more_body = True
            while more_body:
                message = await receive()
                body_messages.append(message)
                if message["type"] != "http.request":
                    break
                body += message.get("body", b"")
                if len(body) > MAX_IDENTITY_BODY_BYTES:
                    response = JSONResponse(
                        {"detail": "Request body is too large for identity validation."},
                        status_code=413,
                    )
                    await response(scope, receive, send)
                    return
                more_body = bool(message.get("more_body", False))

            async def _replay_receive() -> Message:
                if body_messages:
                    return body_messages.pop(0)
                return {"type": "http.disconnect"}

            replay_receive = _replay_receive

        explicit_emails = [
            explicit_query_email,
            explicit_path_email,
            _extract_body_email(content_type, body),
        ]
        has_explicit_email = any(email is not None for email in explicit_emails)

        if environment == "production" and (_is_sensitive_identity_path(path) or has_explicit_email):
            if not is_valid_proxy or not proxy_email:
                response = JSONResponse(
                    {"detail": "Trusted proxy authentication required."},
                    status_code=401,
                )
                await response(scope, replay_receive, send)
                return

        if proxy_email and not _explicit_emails_match(proxy_email, explicit_emails):
            response = JSONResponse(
                {"detail": "Client email does not match authenticated user."},
                status_code=403,
            )
            await response(scope, replay_receive, send)
            return

        await self.app(scope, replay_receive, send)
