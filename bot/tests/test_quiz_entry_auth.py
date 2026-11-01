"""Network claims are proxy-owned and cryptographically bound to each request."""
import hashlib
import hmac
from uuid import uuid4

import pytest
from fastapi import HTTPException, Request

from tests.route_helpers import _proxy_headers
from utils.quiz_entry_auth import quiz_entry_client_key, quiz_entry_network_key

SECRET = "quiz-entry-auth-test-secret"
CLIENT = "a" * 64


@pytest.fixture(autouse=True)
def production(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("INTERNAL_PROXY_SHARED_SECRET", SECRET)


def signed_entry_headers(path, client_key=CLIENT):
    headers = _proxy_headers("GET", path, "", "", SECRET, nonce=uuid4().hex)
    headers["x-quiz-entry-client-key"] = client_key
    payload = "\n".join(["QUIZ-ENTRY-CLIENT", headers["X-Proxy-Request-Ts"], headers["X-Proxy-Request-Nonce"],
                         headers["X-Proxy-Request-Signature-V2"], client_key])
    headers["x-quiz-entry-client-signature"] = hmac.new(SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return headers


def request(path, headers):
    return Request({"type": "http", "method": "GET", "path": path, "query_string": b"",
                    "headers": [(key.lower().encode(), value.encode()) for key, value in headers.items()],
                    "client": ("192.0.2.1", 1234), "scheme": "http", "server": ("testserver", 80)})


def test_valid_bound_claim_is_used():
    path = "/api/quiz-sessions/pin/123456"
    assert quiz_entry_client_key(request(path, signed_entry_headers(path))) == CLIENT


@pytest.mark.parametrize("header", ["x-quiz-entry-client-key", "x-quiz-entry-client-signature"])
@pytest.mark.parametrize("value", ["b" * 64, ""])
def test_tampered_or_missing_claim_parts_are_rejected(header, value):
    path = "/api/quiz-sessions/pin/123456"
    headers = signed_entry_headers(path)
    headers[header] = value
    with pytest.raises(HTTPException) as error:
        quiz_entry_client_key(request(path, headers))
    assert error.value.status_code == 401


def test_claim_from_a_different_request_cannot_be_reused():
    path = "/api/quiz-sessions/pin/123456"
    first = signed_entry_headers(path)
    second = signed_entry_headers(path)
    second["x-quiz-entry-client-signature"] = first["x-quiz-entry-client-signature"]
    with pytest.raises(HTTPException) as error:
        quiz_entry_client_key(request(path, second))
    assert error.value.status_code == 401


def test_old_signed_proxy_uses_the_same_bounded_shared_fallback():
    path = "/api/quiz-sessions/pin/123456"
    headers = _proxy_headers("GET", path, "", "", SECRET, nonce=uuid4().hex)
    assert quiz_entry_client_key(request(path, headers)) == hmac.new(
        SECRET.encode(), b"QUIZ-ENTRY-NETWORK\nshared-proxy", hashlib.sha256,
    ).hexdigest()


def test_unsigned_production_entry_is_rejected():
    with pytest.raises(HTTPException) as error:
        quiz_entry_client_key(request("/api/quiz-sessions/pin/123456", {"x-forwarded-for": "203.0.113.1"}))
    assert error.value.status_code == 401


def test_direct_development_does_not_trust_identity_or_forwarded_headers(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "development")
    path = "/api/quiz-sessions/pin/123456"
    headers = {"x-forwarded-for": "203.0.113.1", "x-quiz-entry-client-key": "b" * 64}
    assert quiz_entry_client_key(request(path, headers)) == quiz_entry_network_key("direct:192.0.2.1")
