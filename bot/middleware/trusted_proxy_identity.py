"""
Production guard for user identity forwarded by the trusted Next.js proxy.
"""
from __future__ import annotations

import json
import hashlib
import logging
import re
from collections import deque
from typing import Iterable, Optional
from urllib.parse import parse_qs, unquote

from starlette.datastructures import Headers, QueryParams
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

try:
    from python_multipart.multipart import MultipartParser, parse_options_header
except ModuleNotFoundError:  # pragma: no cover
    from multipart.multipart import MultipartParser, parse_options_header

from settings import get_settings
from utils.internal_proxy_auth import (
    PROXY_BODY_SHA256_HEADER,
    has_proxy_signature_headers,
    precheck_proxy_signature,
    verify_proxy_signature,
)

logger = logging.getLogger(__name__)

MAX_IDENTITY_BODY_BYTES = 1024 * 1024
MAX_SIGNED_BODY_BYTES = 10 * 1024 * 1024
_MAX_MULTIPART_EMAIL_BYTES = 4096
_MAX_MULTIPART_HEADER_BYTES = 16384
_MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
_PUBLIC_TRIAL_TEST_CATALOG_RE = re.compile(r"^/api/trial-tests(?:/(?:folders|categories|\d+))?/?$")


class _IdentityParseError(ValueError):
    """Raised when request query/body cannot be parsed safely for identity inspection."""


def _get_environment() -> str:
    return get_settings().environment


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


def _private_email_from_path(path: str, method: str = "GET") -> Optional[str]:
    parts = [unquote(part) for part in path.split("/") if part]
    if (
        len(parts) >= 4
        and parts[0] == "api"
        and parts[1] == "user"
        and parts[2] == "web"
    ):
        segment = _normalize_email(parts[3])
        if segment in {"nickname", "language"} and str(method or "").upper() != "GET":
            return None
        if _is_email_path_segment(segment) or str(method or "").upper() == "GET":
            return segment
    if (
        len(parts) >= 4
        and parts[0] == "api"
        and parts[1] == "export"
        and parts[2] == "user"
    ):
        return _normalize_email(parts[3])
    return None


def _is_public_trial_test_catalog_path(path: str, method: str) -> bool:
    return str(method or "GET").upper() == "GET" and bool(_PUBLIC_TRIAL_TEST_CATALOG_RE.fullmatch(path))


def _is_sensitive_identity_path(path: str, method: str = "GET") -> bool:
    if _is_public_trial_test_catalog_path(path, method):
        return False
    sensitive_prefixes = (
        "/api/admin/",
        "/api/export/admin/",
        "/api/export/user/",
        "/api/mini-lessons",
        "/api/presence",
        "/api/reports",
        "/api/task/check",
        "/api/trial-test-reports",
        "/api/trial-tests",
        "/api/user/web",
    )
    if any(path.startswith(prefix) for prefix in sensitive_prefixes):
        return True
    return path.startswith("/api/tasks/") and path.endswith("/questions/check")


def _extract_query_emails(scope: Scope) -> list[str]:
    raw_bytes = scope.get("query_string") or b""
    if not raw_bytes:
        return []
    try:
        # Match Starlette/FastAPI QueryParams decoding (latin-1) so raw non-UTF-8
        # bytes in query_string can never silently disable email extraction.
        raw_query = raw_bytes.decode("latin-1")
        values = parse_qs(raw_query, keep_blank_values=True)
        starlette_emails = QueryParams(raw_bytes).getlist("email")
    except Exception as exc:
        raise _IdentityParseError("Malformed query string.") from exc
    combined = [*values.get("email", []), *starlette_emails]
    # Validate every value: FastAPI uses the last repeated query parameter.
    return [_normalize_email(value) or "" for value in combined]


def _is_json_content_type(media_type: str) -> bool:
    # Match FastAPI's JSON media types, including headerless legacy requests.
    return (
        not media_type
        or media_type == "application/json"
        or (media_type.startswith("application/") and media_type.endswith("+json"))
    )


def _is_explicit_json_content_type(media_type: str) -> bool:
    return media_type == "application/json" or (
        media_type.startswith("application/") and media_type.endswith("+json")
    )


def _extract_multipart_emails(content_type: str, body: bytes) -> list[str]:
    if not body:
        return []
    try:
        _, params = parse_options_header((content_type or "").encode("latin-1"))
    except Exception as exc:
        raise _IdentityParseError("Malformed multipart request body.") from exc

    boundary = params.get(b"boundary")
    if not boundary:
        raise _IdentityParseError("Malformed multipart request body.")

    emails: list[str] = []
    saw_end = False
    header_field = bytearray()
    header_value = bytearray()
    disposition: Optional[bytes] = None
    part_charset = "utf-8"
    is_email_field = False
    is_file_field = False
    email_buf = bytearray()

    def on_part_begin() -> None:
        nonlocal disposition, part_charset, is_email_field, is_file_field
        header_field.clear()
        header_value.clear()
        disposition = None
        part_charset = "utf-8"
        is_email_field = False
        is_file_field = False
        email_buf.clear()

    def on_header_field(data: bytes, start: int, end: int) -> None:
        if len(header_field) + (end - start) > _MAX_MULTIPART_HEADER_BYTES:
            raise _IdentityParseError("Malformed multipart request body.")
        header_field.extend(data[start:end])

    def on_header_value(data: bytes, start: int, end: int) -> None:
        if len(header_value) + (end - start) > _MAX_MULTIPART_HEADER_BYTES:
            raise _IdentityParseError("Malformed multipart request body.")
        header_value.extend(data[start:end])

    def on_header_end() -> None:
        nonlocal disposition, part_charset
        name_lower = bytes(header_field).strip().lower()
        val_bytes = bytes(header_value)
        header_field.clear()
        header_value.clear()
        if name_lower == b"content-disposition":
            disposition = val_bytes
        elif name_lower == b"content-type":
            _, ct_params = parse_options_header(val_bytes)
            raw_cs = ct_params.get(b"charset")
            if raw_cs:
                part_charset = raw_cs.decode("latin-1").strip() or "utf-8"

    def on_headers_finished() -> None:
        nonlocal is_email_field, is_file_field
        if disposition is None:
            return
        _, disp_params = parse_options_header(disposition)
        raw_name = disp_params.get(b"name")
        if raw_name is None:
            return
        try:
            field_name = raw_name.decode("utf-8")
        except UnicodeDecodeError:
            field_name = raw_name.decode("latin-1")
        if field_name == "email":
            is_email_field = True
            is_file_field = b"filename" in disp_params

    def on_part_data(data: bytes, start: int, end: int) -> None:
        if is_email_field and not is_file_field:
            if len(email_buf) + (end - start) > _MAX_MULTIPART_EMAIL_BYTES:
                raise _IdentityParseError("Malformed multipart email field.")
            email_buf.extend(data[start:end])

    def on_part_end() -> None:
        if is_email_field:
            if is_file_field:
                emails.append("")
                return
            try:
                decoded = bytes(email_buf).decode(part_charset)
            except Exception:
                try:
                    decoded = bytes(email_buf).decode("latin-1")
                except Exception as exc:
                    raise _IdentityParseError("Malformed multipart email field.") from exc
            emails.append(_normalize_email(decoded) or "")

    def on_end() -> None:
        nonlocal saw_end
        saw_end = True

    callbacks = {
        "on_part_begin": on_part_begin,
        "on_header_field": on_header_field,
        "on_header_value": on_header_value,
        "on_header_end": on_header_end,
        "on_headers_finished": on_headers_finished,
        "on_part_data": on_part_data,
        "on_part_end": on_part_end,
        "on_end": on_end,
    }
    try:
        parser = MultipartParser(boundary, callbacks)
        parser.write(body)
        parser.finalize()
    except _IdentityParseError:
        raise
    except Exception as exc:
        raise _IdentityParseError("Malformed multipart request body.") from exc

    if not saw_end:
        raise _IdentityParseError("Malformed multipart request body.")
    return emails


def _extract_body_emails(media_type: str, body: bytes, content_type: str = "") -> list[str]:
    # The caller already bounds buffered bodies. Do not silently skip identity
    # validation for signed JSON imports larger than MAX_IDENTITY_BODY_BYTES.
    if not body:
        return []

    if _is_json_content_type(media_type):
        try:
            # Use the same bytes parser as Request.json(), including BOMs and
            # UTF-16/32, so identity checks cannot disagree with the endpoint.
            payload = json.loads(body)
        except Exception as exc:
            if _is_explicit_json_content_type(media_type):
                raise _IdentityParseError("Malformed JSON request body.") from exc
            return []
        if isinstance(payload, dict) and "email" in payload:
            return [_normalize_email(payload["email"]) or ""]
        return []

    if media_type == "application/x-www-form-urlencoded":
        try:
            # Match Starlette's form parser (latin-1) and fail closed on parse errors.
            values = parse_qs(body.decode("latin-1"), keep_blank_values=True)
        except Exception as exc:
            raise _IdentityParseError("Malformed form request body.") from exc
        return [_normalize_email(value) or "" for value in values.get("email", [])]

    if media_type == "multipart/form-data":
        return _extract_multipart_emails(content_type, body)

    return []


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
        media_type = content_type.split(";", 1)[0].strip().lower()
        request = Request(scope, receive)
        has_signature = has_proxy_signature_headers(request)
        is_valid_proxy = False
        proxy_email: Optional[str] = None

        try:
            explicit_query_emails = _extract_query_emails(scope)
        except _IdentityParseError as exc:
            response = JSONResponse({"detail": str(exc)}, status_code=400)
            await response(scope, receive, send)
            return
        explicit_path_email = _private_email_from_path(path, request.method)

        should_inspect_body = request.method.upper() in _MUTATING_METHODS and (
            _is_json_content_type(media_type)
            or media_type == "application/x-www-form-urlencoded"
            or media_type == "multipart/form-data"
        )
        should_verify_signed_body = bool(
            has_signature
            and request.method.upper() in _MUTATING_METHODS
            and headers.get(PROXY_BODY_SHA256_HEADER)
        )

        # Verify signature BEFORE buffering body whenever body hash verification is not needed.
        if has_signature and not should_verify_signed_body:
            is_valid_proxy, proxy_email, error_code = verify_proxy_signature(request)
            if not is_valid_proxy:
                logger.warning("Invalid trusted proxy signature: %s %s %s", path, error_code, proxy_email)
                response = JSONResponse(
                    {"detail": "Invalid trusted proxy signature."},
                    status_code=401,
                )
                await response(scope, receive, send)
                return

        # A body-hash signature can only be fully checked after reading the body, but its headers
        # can be checked now. Without this, forged signature headers alone would make the server
        # buffer up to MAX_SIGNED_BODY_BYTES for an unauthenticated client.
        if should_verify_signed_body:
            headers_valid, header_email, error_code = precheck_proxy_signature(request)
            if not headers_valid:
                logger.warning("Invalid trusted proxy signature: %s %s %s", path, error_code, header_email)
                response = JSONResponse(
                    {"detail": "Invalid trusted proxy signature."},
                    status_code=401,
                )
                await response(scope, receive, send)
                return

        body = b""
        replay_receive = receive
        if should_inspect_body or should_verify_signed_body:
            allow_signed_size = should_verify_signed_body or (
                not get_settings().is_production and media_type == "multipart/form-data"
            )
            max_body_bytes = MAX_SIGNED_BODY_BYTES if allow_signed_size else MAX_IDENTITY_BODY_BYTES
            raw_content_length = headers.get("content-length")
            if raw_content_length:
                try:
                    if int(raw_content_length) > max_body_bytes:
                        response = JSONResponse(
                            {"detail": "Request body is too large for identity validation."},
                            status_code=413,
                        )
                        await response(scope, receive, send)
                        return
                except ValueError:
                    pass

            # bytearray + incremental hash keep buffering linear: `bytes +=` copies the whole body
            # on every chunk, which a client sending many small chunks turns into seconds of CPU.
            body_messages: deque[Message] = deque()
            body_buffer = bytearray()
            body_hash = hashlib.sha256()
            more_body = True
            while more_body:
                message = await receive()
                body_messages.append(message)
                if message["type"] != "http.request":
                    break
                chunk = message.get("body", b"")
                if len(body_buffer) + len(chunk) > max_body_bytes:
                    response = JSONResponse(
                        {"detail": "Request body is too large for identity validation."},
                        status_code=413,
                    )
                    await response(scope, receive, send)
                    return
                body_buffer += chunk
                body_hash.update(chunk)
                more_body = bool(message.get("more_body", False))
            body = bytes(body_buffer)

            async def _replay_receive() -> Message:
                if body_messages:
                    return body_messages.popleft()
                return {"type": "http.request", "body": b"", "more_body": False}

            replay_receive = _replay_receive

            request.state._trusted_proxy_body_sha256 = body_hash.hexdigest()

        if has_signature and should_verify_signed_body:
            is_valid_proxy, proxy_email, error_code = verify_proxy_signature(request)
            if not is_valid_proxy:
                logger.warning("Invalid trusted proxy signature: %s %s %s", path, error_code, proxy_email)
                response = JSONResponse(
                    {"detail": "Invalid trusted proxy signature."},
                    status_code=401,
                )
                await response(scope, replay_receive, send)
                return

        try:
            body_emails = _extract_body_emails(media_type, body, content_type=content_type)
        except _IdentityParseError as exc:
            response = JSONResponse({"detail": str(exc)}, status_code=400)
            await response(scope, replay_receive, send)
            return

        explicit_emails = [
            *explicit_query_emails,
            explicit_path_email,
            *body_emails,
        ]
        has_explicit_email = any(email is not None for email in explicit_emails)

        if get_settings().is_production and (_is_sensitive_identity_path(path, request.method) or has_explicit_email):
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

        if is_valid_proxy and proxy_email:
            # For EnsureSignedInUserMiddleware: a signature is only checked once per request.
            request.state.trusted_proxy_email = proxy_email

        await self.app(scope, replay_receive, send)
