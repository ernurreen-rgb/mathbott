"""Short-lived, one-time, session-scoped tickets for authenticated Quiz sockets."""
import base64
import hashlib
import hmac
import json
import re
import secrets
import time
from utils.internal_proxy_auth import _get_proxy_secret, consume_ws_ticket_jti

QUIZ_WS_TTL = 120
_QUIZ_WS_JTI_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")


def issue_quiz_ws_ticket(session_id: int, role: str, actor_id: int, credential: str = "") -> str:
    secret = _get_proxy_secret()
    if not secret:
        raise ValueError("WebSocket signing is not configured")
    payload = base64.urlsafe_b64encode(json.dumps({
        'scope': 'quiz-ws', 'session_id': session_id, 'role': role, 'actor_id': actor_id,
        'credential': credential, 'jti': secrets.token_urlsafe(16),
        'expires': int(time.time()) + QUIZ_WS_TTL,
    }, separators=(',', ':')).encode()).decode().rstrip('=')
    signature = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f'{payload}.{signature}'


def verify_quiz_ws_ticket(session_id: int, token: str, *, consume: bool = True):
    if not token or len(token) > 1024:
        return None
    try:
        payload, signature = token.split('.')
        secret = _get_proxy_secret()
        expected = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
        if not secret or not hmac.compare_digest(signature, expected):
            return None
        claims = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
        now = int(time.time())
        jti = claims.get('jti')
        if (claims.get('scope') != 'quiz-ws' or claims.get('session_id') != session_id
                or claims.get('role') not in ('host', 'player')
                or not isinstance(claims.get('actor_id'), int)
                or not isinstance(jti, str) or not _QUIZ_WS_JTI_RE.fullmatch(jti)
                or not now <= claims.get('expires', 0) <= now + QUIZ_WS_TTL + 5):
            return None
        if consume and not consume_ws_ticket_jti("quiz-ws", jti, int(claims['expires']), now=now):
            return None
        return claims
    except (ValueError, TypeError, KeyError):
        return None
