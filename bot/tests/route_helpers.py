"""Shared helpers for the split route test modules."""
import hashlib
import hmac
import json
import time


def _extract_http_detail(payload):
    if isinstance(payload, dict):
        if "detail" in payload:
            return payload.get("detail")
        error = payload.get("error")
        if isinstance(error, dict):
            return error.get("detail")
    return None


def _proxy_headers(
    method: str,
    path: str,
    raw_query: str,
    email: str,
    secret: str,
    nonce: str | None = None,
    body: bytes | str | None = None,
    content_type: str = "",
):
    timestamp = str(int(time.time()))
    nonce = nonce or f"test-{time.time_ns()}"
    body_bytes = body.encode("utf-8") if isinstance(body, str) else (body or b"")
    body_sha256 = hashlib.sha256(body_bytes).hexdigest()
    signed_content_type = content_type.strip().lower()
    legacy_payload = "\n".join([method.upper(), path, raw_query, email, timestamp]).encode("utf-8")
    payload_v2_parts = [method.upper(), path, raw_query, email, timestamp, nonce]
    if method.upper() in {"POST", "PUT", "PATCH", "DELETE"}:
        payload_v2_parts.extend([body_sha256, signed_content_type])
    payload_v2 = "\n".join(payload_v2_parts).encode("utf-8")
    legacy_signature = hmac.new(secret.encode("utf-8"), legacy_payload, hashlib.sha256).hexdigest()
    signature_v2 = hmac.new(secret.encode("utf-8"), payload_v2, hashlib.sha256).hexdigest()
    headers = {
        "X-Proxy-Request-Ts": timestamp,
        "X-Proxy-Request-Nonce": nonce,
        "X-Proxy-User-Email": email,
        "X-Proxy-Request-Signature": legacy_signature,
        "X-Proxy-Request-Signature-V2": signature_v2,
    }
    if method.upper() in {"POST", "PUT", "PATCH", "DELETE"}:
        headers["X-Proxy-Body-Sha256"] = body_sha256
        headers["X-Proxy-Content-Type"] = signed_content_type
    return headers


def _legacy_proxy_headers(method: str, path: str, raw_query: str, email: str, secret: str):
    timestamp = str(int(time.time()))
    payload = "\n".join([method.upper(), path, raw_query, email, timestamp]).encode("utf-8")
    signature = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    return {
        "X-Proxy-Request-Ts": timestamp,
        "X-Proxy-User-Email": email,
        "X-Proxy-Request-Signature": signature,
    }


class _FakePresenceWebSocket:
    def __init__(self, *, fail_send: bool = False):
        self.fail_send = fail_send
        self.messages: list[dict] = []

    async def accept(self):
        return None

    async def send_text(self, data: str):
        if self.fail_send:
            raise RuntimeError("stale websocket")
        self.messages.append(json.loads(data))
