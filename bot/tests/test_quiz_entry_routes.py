"""Quiz entry limits apply across routes/workers while classroom NAT and resume work."""
import asyncio
import hashlib
import hmac
import json
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from httpx2 import ASGITransport, AsyncClient

import repositories.quiz_entry_limits as limits
import storage
from repositories.quiz_repository import QuizRepository
from services.maintenance import run_maintenance_cycle
from tests.route_helpers import _proxy_headers
from utils.quiz_entry_auth import quiz_entry_network_key

SECRET = "quiz-entry-routes-test-shared-secret"
CLIENT_A = "a" * 64
CLIENT_B = "b" * 64
NOW = 1200


@pytest.fixture(autouse=True)
def production(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("INTERNAL_PROXY_SHARED_SECRET", SECRET)
    monkeypatch.setattr(limits, "_entry_timestamp", lambda now: NOW)


@pytest.fixture
async def game(test_db, test_user):
    quiz = await test_db.quizzes.create_quiz("Entry quiz", test_user["id"])
    await test_db.quizzes.add_question(quiz["id"], "2+2", correct_answer="4")
    return await test_db.quizzes.create_session(quiz["id"], test_user["id"], {"max_participants": 999999})


def headers(method, path, payload=None, key=CLIENT_A, email=""):
    body = json.dumps(payload) if payload is not None else ""
    content_type = "application/json" if payload is not None else ""
    result = _proxy_headers(method, path, "", email, SECRET, nonce=uuid4().hex, body=body, content_type=content_type)
    if content_type:
        result["Content-Type"] = content_type
    if key is not None:
        result["x-quiz-entry-client-key"] = key
        claim = "\n".join(["QUIZ-ENTRY-CLIENT", result["X-Proxy-Request-Ts"], result["X-Proxy-Request-Nonce"],
                           result["X-Proxy-Request-Signature-V2"], key])
        result["x-quiz-entry-client-signature"] = hmac.new(SECRET.encode(), claim.encode(), hashlib.sha256).hexdigest()
    return result


def lookup(client, pin, key=CLIENT_A):
    path = f"/api/quiz-sessions/pin/{pin}"
    return client.get(path, headers=headers("GET", path, key=key))


def join(client, game, nickname, key=CLIENT_A, email="", participant_token=None):
    path = "/api/quiz-sessions/join"
    payload = {"pin_code": game["pin_code"], "nickname": nickname}
    if participant_token:
        payload["participant_token"] = participant_token
    return client.post(path, content=json.dumps(payload), headers=headers("POST", path, payload, key, email))


async def bucket(repo, key=CLIENT_A):
    async with repo._connection() as connection:
        connection.row_factory = storage.Row
        async with connection.execute("SELECT * FROM quiz_entry_limits WHERE client_key = ?", (key,)) as cursor:
            row = await cursor.fetchone()
    return dict(row) if row else None


@pytest.mark.asyncio
async def test_anonymous_proxy_entry_and_guest_capabilities_remain_available(client, test_db, game):
    assert lookup(client, game["pin_code"]).status_code == 200
    response = join(client, game, "Guest")
    assert response.status_code == 200
    data = response.json()
    saved = await test_db.quizzes.get_participant(game["id"], data["participant"]["id"])
    assert saved["user_id"] is None
    assert "token_hash" not in response.text
    progress = client.get(f"/api/quiz-sessions/{game['id']}/progress", headers={
        "X-Quiz-Participant-Token": data["participant_token"],
    })
    assert progress.status_code == 200


@pytest.mark.asyncio
async def test_missing_pin_guesses_are_counted_across_lookup_and_join_and_survive_restart(client, test_db, monkeypatch):
    monkeypatch.setenv("QUIZ_ENTRY_DISTINCT_PINS_PER_MINUTE", "2")
    assert lookup(client, "111111").status_code == 404
    assert join(client, {"pin_code": "222222"}, "Guest").status_code == 404
    response = lookup(client, "333333")
    assert response.status_code == 429
    assert response.headers["Retry-After"] == "60"
    assert "no-store" in response.headers["Cache-Control"]
    restarted = QuizRepository(test_db.db_path)
    assert await restarted.consume_entry_request(CLIENT_A, "444444") == 60
    assert json.loads((await bucket(restarted))["pin_codes"]) == ["111111", "222222"]
    assert lookup(client, "111111").status_code == 404
    assert lookup(client, "333333", CLIENT_B).status_code == 404


@pytest.mark.asyncio
async def test_repeated_known_pin_has_a_total_request_ceiling_shared_with_join(client, test_db, game, monkeypatch):
    monkeypatch.setenv("QUIZ_ENTRY_REQUESTS_PER_MINUTE", "3")
    assert [lookup(client, game["pin_code"]).status_code for _ in range(3)] == [200] * 3
    assert lookup(client, game["pin_code"]).status_code == 429
    response = join(client, game, "Blocked")
    assert response.status_code == 429
    assert response.headers["Retry-After"] == "60"
    assert await test_db.quizzes.list_participants(game["id"]) == []


@pytest.mark.asyncio
async def test_new_participant_quota_does_not_charge_valid_resume(client, test_db, game, monkeypatch):
    monkeypatch.setenv("QUIZ_ENTRY_NEW_PARTICIPANTS_PER_MINUTE", "2")
    first = join(client, game, "Guest 1")
    assert first.status_code == 200
    assert join(client, game, "Guest 2").status_code == 200
    assert join(client, game, "Guest 3").status_code == 429
    resumed = join(client, game, "Guest 1", participant_token=first.json()["participant_token"])
    assert resumed.status_code == 200
    assert resumed.json()["participant"]["id"] == first.json()["participant"]["id"]
    assert (await bucket(test_db.quizzes))["new_participants"] == 2
    assert join(client, game, "Guest 3", CLIENT_B).status_code == 200


@pytest.mark.asyncio
async def test_simultaneous_joins_cannot_overfill_server_room_cap(client, test_db, game, monkeypatch):
    monkeypatch.setenv("QUIZ_MAX_PARTICIPANTS", "2")
    path = "/api/quiz-sessions/join"
    async with AsyncClient(transport=ASGITransport(app=client.app), base_url="http://testserver") as http:
        requests = []
        for index in range(4):
            payload = {"pin_code": game["pin_code"], "nickname": f"Guest {index}"}
            requests.append(http.post(path, content=json.dumps(payload), headers=headers("POST", path, payload, f"{index:064x}")))
        responses = await asyncio.gather(*requests)
    assert sorted(response.status_code for response in responses) == [200, 200, 409, 409]
    assert len(await test_db.quizzes.list_participants(game["id"])) == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("account", [False, True])
async def test_full_room_allows_owned_token_or_account_recovery_but_not_nickname_only(client, test_db, test_user, game, monkeypatch, account):
    monkeypatch.setenv("QUIZ_MAX_PARTICIPANTS", "1")
    monkeypatch.setenv("QUIZ_ENTRY_NEW_PARTICIPANTS_PER_MINUTE", "1")
    email = test_user["email"] if account else ""
    first = join(client, game, "Owned", email=email)
    assert first.status_code == 200
    assert join(client, game, "New").status_code == 409
    assert join(client, game, "Owned").status_code == 409
    resumed = join(client, game, "Owned", email=email, participant_token=None if account else first.json()["participant_token"])
    assert resumed.status_code == 200
    assert resumed.json()["participant"]["id"] == first.json()["participant"]["id"]
    assert len(await test_db.quizzes.list_participants(game["id"])) == 1
    assert (await bucket(test_db.quizzes))["new_participants"] == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("method", ["GET", "POST"])
async def test_unsigned_production_clients_cannot_bypass_proxy_network_limits(client, game, method):
    if method == "GET":
        response = client.get(f"/api/quiz-sessions/pin/{game['pin_code']}", headers={"X-Forwarded-For": "192.0.2.1"})
    else:
        response = client.post("/api/quiz-sessions/join", json={"pin_code": game["pin_code"], "nickname": "Guest"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_forged_network_claim_is_rejected_before_charging_quota(client, test_db, game):
    path = f"/api/quiz-sessions/pin/{game['pin_code']}"
    forged = headers("GET", path)
    forged["x-quiz-entry-client-key"] = CLIENT_B
    assert client.get(path, headers=forged).status_code == 401
    assert await bucket(test_db.quizzes, CLIENT_A) is None
    assert await bucket(test_db.quizzes, CLIENT_B) is None


@pytest.mark.asyncio
async def test_legacy_proxy_and_unconfigured_new_proxy_share_one_bounded_bucket(client, game, monkeypatch):
    monkeypatch.setenv("QUIZ_ENTRY_REQUESTS_PER_MINUTE", "2")
    assert lookup(client, game["pin_code"], None).status_code == 200
    assert lookup(client, game["pin_code"], None).status_code == 200
    assert lookup(client, game["pin_code"], quiz_entry_network_key("shared-proxy")).status_code == 429
    assert lookup(client, game["pin_code"], None).status_code == 429


@pytest.mark.asyncio
async def test_two_hundred_students_behind_one_network_can_lookup_and_join(client, test_db, game):
    for index in range(200):
        assert lookup(client, game["pin_code"]).status_code == 200
        response = join(client, game, f"Student {index}")
        assert response.status_code == 200, response.text
    assert len(await test_db.quizzes.list_participants(game["id"])) == 200
    row = await bucket(test_db.quizzes)
    assert row["request_count"] == 400
    assert row["new_participants"] == 200
    assert json.loads(row["pin_codes"]) == [game["pin_code"]]


@pytest.mark.asyncio
async def test_maintenance_cleans_expired_quota_buckets(test_db, monkeypatch):
    await test_db.quizzes.consume_entry_request(CLIENT_A, "123456")
    monkeypatch.setattr(limits, "_entry_timestamp", lambda now: NOW + 3601)
    monitor = AsyncMock()
    monitor.run_cleanup.return_value = {}
    result = await run_maintenance_cycle(test_db, monitor)
    assert result["quiz_entry_limits_deleted"] == 1
    assert await bucket(test_db.quizzes) is None
