"""Short-lived, session-scoped tickets for authenticated Quiz sockets."""
import base64
import hashlib
import hmac
import json
import time
from utils.internal_proxy_auth import _get_proxy_secret

QUIZ_WS_TTL = 120


def issue_quiz_ws_ticket(session_id: int, role: str, actor_id: int, credential: str = "") -> str:
    secret = _get_proxy_secret()
    if not secret:
        raise ValueError("WebSocket signing is not configured")
    payload = base64.urlsafe_b64encode(json.dumps({
        'scope': 'quiz-ws', 'session_id': session_id, 'role': role, 'actor_id': actor_id,
        'credential': credential, 'expires': int(time.time()) + QUIZ_WS_TTL,
    }, separators=(',', ':')).encode()).decode().rstrip('=')
    signature = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f'{payload}.{signature}'


def verify_quiz_ws_ticket(session_id: int, token: str):
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
        if (claims.get('scope') != 'quiz-ws' or claims.get('session_id') != session_id
                or claims.get('role') not in ('host', 'player')
                or not isinstance(claims.get('actor_id'), int)
                or not now <= claims.get('expires', 0) <= now + QUIZ_WS_TTL + 5):
            return None
        return claims
    except (ValueError, TypeError, KeyError):
        return None
