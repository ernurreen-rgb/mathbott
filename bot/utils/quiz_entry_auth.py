"""Verify a proxy-bound pseudonymous network key for quiz entry budgets."""
import hashlib
import hmac
import re

from fastapi import HTTPException, Request

from settings import get_settings
from utils.internal_proxy_auth import (
    PROXY_NONCE_HEADER, PROXY_SIGNATURE_V2_HEADER, PROXY_TS_HEADER,
    _get_proxy_secret, has_proxy_signature_headers, verify_proxy_signature,
)

QUIZ_ENTRY_KEY_HEADER = "x-quiz-entry-client-key"
QUIZ_ENTRY_SIGNATURE_HEADER = "x-quiz-entry-client-signature"
_HEX_DIGEST = re.compile(r"^[0-9a-f]{64}$")


def quiz_entry_network_key(network: str) -> str:
    return hmac.new(_get_proxy_secret().encode(), f"QUIZ-ENTRY-NETWORK\n{network}".encode(), hashlib.sha256).hexdigest()


def quiz_entry_client_key(request: Request) -> str:
    if not has_proxy_signature_headers(request):
        if get_settings().is_production:
            raise HTTPException(401, "Trusted proxy authentication required for quiz entry.")
        # Never trust client address headers on a direct development request.
        return quiz_entry_network_key(f"direct:{request.client.host if request.client else 'unknown'}")

    valid, _, _ = verify_proxy_signature(request)
    nonce = request.headers.get(PROXY_NONCE_HEADER, "")
    request_signature = request.headers.get(PROXY_SIGNATURE_V2_HEADER, "")
    if not valid or not nonce or not request_signature:
        raise HTTPException(401, "Valid proxy V2 authentication required for quiz entry.")
    key = request.headers.get(QUIZ_ENTRY_KEY_HEADER, "")
    signature = request.headers.get(QUIZ_ENTRY_SIGNATURE_HEADER, "")
    if not key and not signature:
        # Older web deployments share the SAME bounded fallback as a new
        # deployment without configured ingress identity. Never disable limits.
        return quiz_entry_network_key("shared-proxy")
    if not _HEX_DIGEST.fullmatch(key) or not _HEX_DIGEST.fullmatch(signature):
        raise HTTPException(401, "Invalid quiz entry client identity.")
    payload = "\n".join([
        "QUIZ-ENTRY-CLIENT", request.headers.get(PROXY_TS_HEADER, ""), nonce, request_signature, key,
    ])
    expected = hmac.new(_get_proxy_secret().encode(), payload.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(401, "Invalid quiz entry client identity.")
    return key
