"""Route tests: proxy."""
import json

import pytest
from tests.route_helpers import _extract_http_detail, _legacy_proxy_headers, _proxy_headers
from middleware.trusted_proxy_identity import MAX_IDENTITY_BODY_BYTES, MAX_SIGNED_BODY_BYTES


@pytest.fixture
def production_proxy(monkeypatch):
    secret = "test-shared-secret"
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("INTERNAL_PROXY_SHARED_SECRET", secret)
    return secret


@pytest.mark.asyncio
@pytest.mark.parametrize("query", [
    "email=&email=victim%40example.com",
    "email=test%40example.com&email=victim%40example.com",
    "email=victim%40example.com&email=test%40example.com",
    "email=test%40example.com&email=",
])
async def test_repeated_query_email_cannot_read_victim_invites(client, test_db, test_user, production_proxy, query):
    victim = await test_db.users.create_user_by_email("victim@example.com")
    await test_db.friends.create_invite(victim["id"], "2099-01-01 00:00:00")
    path = "/api/friends/invites"
    response = client.get(f"{path}?{query}", headers=_proxy_headers(
        "GET", path, query, test_user["email"], production_proxy,
    ))
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_repeated_form_email_cannot_change_victim_onboarding(client, test_db, test_user, production_proxy):
    victim = await test_db.users.create_user_by_email("victim@example.com")
    path = "/api/user/onboarding"
    content_type = "application/x-www-form-urlencoded"
    body = "email=&email=victim%40example.com&nickname=ChangedByOther&math_level=basic&how_did_you_hear=friend"
    response = client.post(path, content=body, headers={"Content-Type": content_type, **_proxy_headers(
        "POST", path, "", test_user["email"], production_proxy, body=body, content_type=content_type,
    )})
    assert response.status_code == 403
    assert not await test_db.onboarding.is_onboarding_completed(victim["id"])


def test_unsigned_repeated_query_requires_authentication(client, production_proxy):
    response = client.get("/api/modules/map?email=&email=victim%40example.com")
    assert response.status_code == 401


def test_repeated_matching_query_email_is_allowed(client, test_user, production_proxy):
    path = "/api/friends/invites"
    query = "email=test%40example.com&email=test%40example.com"
    response = client.get(f"{path}?{query}", headers=_proxy_headers(
        "GET", path, query, test_user["email"], production_proxy,
    ))
    assert response.status_code == 200
    assert response.json() == {"items": []}


@pytest.mark.asyncio
@pytest.mark.parametrize("content_type", [
    "application/json", "application/problem+json", "APPLICATION/VND.MATHBOT+JSON; charset=utf-8", "",
])
@pytest.mark.parametrize("foreign_identity", [True, False])
async def test_json_identity_must_match_signed_user(client, test_db, test_user, production_proxy, content_type, foreign_identity):
    victim = await test_db.users.create_user_by_email("victim@example.com")
    original_nickname = victim["nickname"]
    path = "/api/user/web/nickname"
    email = victim["email"] if foreign_identity else test_user["email"]
    body = json.dumps({"email": email, "nickname": "ProxyNick"})
    headers = _proxy_headers("POST", path, "", test_user["email"], production_proxy,
                             body=body, content_type=content_type)
    if content_type:
        headers["Content-Type"] = content_type
    response = client.post(path, content=body, headers=headers)
    # Headerless JSON may be rejected by FastAPI's strict content-type policy;
    # foreign identity must still be stopped at the authentication boundary.
    expected = 403 if foreign_identity else (200 if content_type else 422)
    assert response.status_code == expected
    assert (await test_db.users.get_user_by_id(victim["id"]))["nickname"] == original_nickname
    if not foreign_identity and content_type:
        assert (await test_db.users.get_user_by_id(test_user["id"]))["nickname"] == "ProxyNick"


@pytest.mark.asyncio
@pytest.mark.parametrize("foreign_identity", [True, False])
async def test_large_signed_json_still_checks_identity(client, test_db, test_user, production_proxy, foreign_identity):
    victim = await test_db.users.create_user_by_email("victim@example.com")
    body = json.dumps({"email": victim["email"] if foreign_identity else test_user["email"],
                       "nickname": "LargeBodyNick", "padding": "x" * MAX_IDENTITY_BODY_BYTES})
    path = "/api/user/web/nickname"
    headers = {"Content-Type": "application/json", **_proxy_headers(
        "POST", path, "", test_user["email"], production_proxy, body=body, content_type="application/json",
    )}
    response = client.post(path, content=body, headers=headers)
    assert response.status_code == (403 if foreign_identity else 200)
    assert (await test_db.users.get_user_by_id(victim["id"]))["nickname"] == victim["nickname"]


def test_signed_body_size_limit_still_applies(client, test_user, production_proxy):
    body = "x" * (MAX_SIGNED_BODY_BYTES + 1)
    path = "/api/user/web/nickname"
    response = client.post(path, content=body, headers={"Content-Type": "application/json", **_proxy_headers(
        "POST", path, "", test_user["email"], production_proxy, body=body, content_type="application/json",
    )})
    assert response.status_code == 413


@pytest.mark.asyncio
@pytest.mark.parametrize("encoding", ["utf-8-sig", "utf-16-le", "utf-32-le"])
async def test_encoded_json_cannot_hide_foreign_identity(client, test_db, test_user, production_proxy, encoding):
    victim = await test_db.users.create_user_by_email("victim@example.com")
    body = json.dumps({"email": victim["email"], "nickname": "ChangedByOther"}).encode(encoding)
    path = "/api/user/web/nickname"
    response = client.post(path, content=body, headers={"Content-Type": "application/json", **_proxy_headers(
        "POST", path, "", test_user["email"], production_proxy, body=body, content_type="application/json",
    )})
    assert response.status_code == 403
    assert (await test_db.users.get_user_by_id(victim["id"]))["nickname"] == victim["nickname"]


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
