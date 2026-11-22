"""Rate-limit keys for the app-wide limiter and for per-route limits."""
from __future__ import annotations

import hashlib
import logging

from slowapi.util import get_remote_address
from starlette.requests import Request

from utils.internal_proxy_auth import (
    get_verified_proxy_client_key,
    has_proxy_signature_headers,
    verify_proxy_signature,
)

logger = logging.getLogger(__name__)

QUIZ_PARTICIPANT_TOKEN_HEADER = "X-Quiz-Participant-Token"
# Per-network ceiling on quiz gameplay endpoints. A whole classroom shares one network
# (school NAT, or the proxy itself when no trusted client IP header is configured), so it
# must fit many players; per-player budgets come from quiz_participant_rate_limit_key.
QUIZ_GAMEPLAY_NETWORK_LIMIT = "3000/minute"


def get_rate_limit_key(request: Request) -> str:
    """Rate limit signed proxy requests per user or signed client network, fallback to client IP."""
    if has_proxy_signature_headers(request):
        try:
            is_valid_proxy, proxy_email, _ = verify_proxy_signature(request)
            if is_valid_proxy:
                if proxy_email:
                    return f"user:{proxy_email}"
                client_key = get_verified_proxy_client_key(request)
                if client_key:
                    return f"proxy-client:{client_key}"
        except Exception:
            logger.debug("Failed to resolve proxy rate-limit key", exc_info=True)
    return get_remote_address(request)


def quiz_participant_rate_limit_key(request: Request) -> str:
    """One budget per quiz participant token, so players behind one network do not share it.

    Requests without a participant token (hosts, signed-in users) use the normal key. A forged
    token only gets its own budget; the network ceiling still bounds what one network sends.
    """
    participant_token = (request.headers.get(QUIZ_PARTICIPANT_TOKEN_HEADER) or "").strip()
    if participant_token:
        digest = hashlib.sha256(participant_token.encode("utf-8")).hexdigest()[:32]
        return f"quiz-participant:{digest}"
    return get_rate_limit_key(request)
