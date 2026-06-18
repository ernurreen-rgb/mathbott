"""Route tests: proxy."""
import json

import pytest
from tests.route_helpers import _extract_http_detail, _legacy_proxy_headers, _proxy_headers


def test_production_private_email_route_requires_trusted_proxy(client, monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")

    response = client.get("/api/user/web/someone@example.com")

    assert response.status_code == 401
    assert _extract_http_detail(response.json()) == "Trusted proxy authentication required."


def test_trusted_proxy_identity_rejects_email_mismatch(client, monkeypatch):
    secret = "test-shared-secret"
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("INTERNAL_PROXY_SHARED_SECRET", secret)
    raw_query = "email=other%40example.com"

    response = client.get(
        f"/api/modules/map?{raw_query}",
        headers=_proxy_headers(
            "GET",
            "/api/modules/map",
            raw_query,
            "owner@example.com",
            secret,
        ),
    )

    assert response.status_code == 403
    assert _extract_http_detail(response.json()) == "Client email does not match authenticated user."


def test_trusted_proxy_identity_allows_matching_private_route(client, monkeypatch):
    secret = "test-shared-secret"
    email = "owner@example.com"
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("INTERNAL_PROXY_SHARED_SECRET", secret)

    response = client.get(
        f"/api/user/web/{email}",
        headers=_proxy_headers("GET", f"/api/user/web/{email}", "", email, secret),
    )

    assert response.status_code == 200
    assert response.json()["email"] == email


def test_trusted_proxy_identity_allows_legacy_signature_without_nonce(client, monkeypatch):
    secret = "test-shared-secret"
    email = "legacy.owner@example.com"
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("INTERNAL_PROXY_SHARED_SECRET", secret)

    response = client.get(
        f"/api/user/web/{email}",
        headers=_legacy_proxy_headers("GET", f"/api/user/web/{email}", "", email, secret),
    )

    assert response.status_code == 200
    assert response.json()["email"] == email


@pytest.mark.asyncio
async def test_trusted_proxy_identity_rejects_replayed_signature(client, test_db, monkeypatch):
    secret = "test-shared-secret"
    email = "replay.admin@example.com"
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("INTERNAL_PROXY_SHARED_SECRET", secret)
    user = await test_db.users.create_user_by_email(email)
    await test_db.users.set_admin_with_role(email=user["email"], is_admin=True, role="super_admin")
    headers = _proxy_headers("GET", "/api/admin/check", "", email, secret, nonce="fixed-replay-nonce")

    first_response = client.get("/api/admin/check", headers=headers)
    replay_response = client.get("/api/admin/check", headers=headers)

    assert first_response.status_code == 200
    assert replay_response.status_code == 401


@pytest.mark.asyncio
async def test_trusted_proxy_identity_allows_nickname_endpoint(client, test_db, test_user, monkeypatch):
    secret = "test-shared-secret"
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("INTERNAL_PROXY_SHARED_SECRET", secret)
    body = json.dumps(
        {
            "email": test_user["email"],
            "nickname": "ProxyNick",
        },
        separators=(",", ":"),
    )

    response = client.post(
        "/api/user/web/nickname",
        headers={
            **_proxy_headers(
                "POST",
                "/api/user/web/nickname",
                "",
                test_user["email"],
                secret,
                body=body,
                content_type="application/json",
            ),
            "Content-Type": "application/json",
        },
        content=body,
    )

    assert response.status_code == 200
    assert response.json()["success"] is True
    user = await test_db.users.get_user_by_email(test_user["email"])
    assert user["nickname"] == "ProxyNick"


@pytest.mark.asyncio
async def test_trusted_proxy_identity_rejects_body_tampering(client, test_db, test_user, monkeypatch):
    secret = "test-shared-secret"
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("INTERNAL_PROXY_SHARED_SECRET", secret)
    signed_body = json.dumps(
        {"email": test_user["email"], "nickname": "SignedNick"},
        separators=(",", ":"),
    )
    tampered_body = json.dumps(
        {"email": test_user["email"], "nickname": "TamperedNick"},
        separators=(",", ":"),
    )

    response = client.post(
        "/api/user/web/nickname",
        headers={
            **_proxy_headers(
                "POST",
                "/api/user/web/nickname",
                "",
                test_user["email"],
                secret,
                body=signed_body,
                content_type="application/json",
            ),
            "Content-Type": "application/json",
        },
        content=tampered_body,
    )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_trusted_proxy_identity_rejects_legacy_mutating_signature(client, test_user, monkeypatch):
    secret = "test-shared-secret"
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("INTERNAL_PROXY_SHARED_SECRET", secret)
    body = json.dumps(
        {"email": test_user["email"], "nickname": "LegacyNick"},
        separators=(",", ":"),
    )

    response = client.post(
        "/api/user/web/nickname",
        headers={
            **_legacy_proxy_headers(
                "POST",
                "/api/user/web/nickname",
                "",
                test_user["email"],
                secret,
            ),
            "Content-Type": "application/json",
        },
        content=body,
    )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_trusted_proxy_identity_rejects_content_type_tampering(client, test_user, monkeypatch):
    secret = "test-shared-secret"
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("INTERNAL_PROXY_SHARED_SECRET", secret)
    body = json.dumps(
        {"email": test_user["email"], "nickname": "ContentTypeNick"},
        separators=(",", ":"),
    )

    response = client.post(
        "/api/user/web/nickname",
        headers={
            **_proxy_headers(
                "POST",
                "/api/user/web/nickname",
                "",
                test_user["email"],
                secret,
                body=body,
                content_type="application/json",
            ),
            "Content-Type": "text/plain",
        },
        content=body,
    )

    assert response.status_code == 401
