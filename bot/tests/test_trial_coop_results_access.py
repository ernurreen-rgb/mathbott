"""A cooperative participant must finish before opening detailed answer-key reviews."""
import json
from urllib.parse import urlencode

import pytest

from tests.route_helpers import _proxy_headers


SECRET = "coop-results-regression-shared-secret"


@pytest.fixture(autouse=True)
def production_identity(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("INTERNAL_PROXY_SHARED_SECRET", SECRET)


@pytest.fixture
async def game(test_db, test_user):
    peer = await test_db.users.create_user_by_email("coop-review-peer@example.com")
    trial = await test_db.trial_tests.create_trial_test("Co-op review", created_by=test_user["id"])
    tasks = [
        await test_db.trial_tests.create_trial_test_task(trial["id"], "2 + 2", "4", sort_order=1),
        await test_db.trial_tests.create_trial_test_task(trial["id"], "3 + 3", "6", sort_order=2),
    ]
    session = await test_db.trial_test_coop.create_session(trial["id"], test_user["id"])
    for user, color in ((test_user, "red"), (peer, "blue")):
        await test_db.trial_test_coop.add_participant(session["id"], user["id"], color)
    return {"owner": test_user, "peer": peer, "trial": trial, "tasks": tasks, "session": session}


def request_as(client, method, path, user, payload=None, query_email=None, secret=SECRET):
    query = urlencode({"email": query_email or user["email"]}) if method == "GET" else ""
    body = json.dumps(payload) if payload is not None else ""
    content_type = "application/json" if payload is not None else ""
    headers = _proxy_headers(method, path, query, user["email"], secret, body=body, content_type=content_type)
    if content_type:
        headers["Content-Type"] = content_type
    return client.request(method, path + ("?" + query if query else ""), content=body, headers=headers)


def results_path(game):
    return f"/api/trial-tests/coop/session/{game['session']['id']}/results"


def finish(client, game, user, answers=None):
    response = request_as(client, "POST", f"/api/trial-tests/{game['trial']['id']}/coop/finish", user, {
        "email": user["email"], "session_id": game["session"]["id"], "answers": answers or {},
    })
    assert response.status_code == 200, response.text
    return response


def assert_no_answer_key(response):
    assert "correct_answer" not in response.text
    assert "answers" not in response.json()
    assert "items" not in response.json()


@pytest.mark.asyncio
@pytest.mark.parametrize("requester", ["owner", "peer"])
async def test_unfinished_member_cannot_read_finished_peers_answer_key(client, test_db, game, requester):
    user = game[requester]
    other = game["peer" if requester == "owner" else "owner"]
    assert finish(client, game, other).json()["score"] == 0
    participant = await test_db.trial_test_coop.get_participant(game["session"]["id"], user["id"])
    assert participant["is_finished"] == 0

    response = request_as(client, "GET", results_path(game), user)
    assert response.status_code == 409
    assert_no_answer_key(response)
    # The live workspace remains available, with peer input but no grading key.
    workspace = request_as(client, "GET", results_path(game).removesuffix("/results"), user)
    assert workspace.status_code == 200
    assert "correct_answer" not in workspace.text

    finish(client, game, user)
    response = request_as(client, "GET", results_path(game), user)
    assert response.status_code == 200
    assert response.json()["status"] == "completed"
    assert len(response.json()["items"]) == 2


@pytest.mark.asyncio
async def test_unfinished_member_is_blocked_even_before_any_results_exist(client, game):
    response = request_as(client, "GET", results_path(game), game["owner"])
    assert response.status_code == 409
    assert_no_answer_key(response)


@pytest.mark.asyncio
@pytest.mark.parametrize("requester", ["owner", "peer"])
async def test_finished_member_can_review_while_peer_is_active_but_cannot_regrade(client, test_db, game, requester):
    user = game[requester]
    assert finish(client, game, user).json()["session_status"] == "active"
    response = request_as(client, "GET", results_path(game), user)
    assert response.status_code == 200
    assert "no-store" in response.headers["Cache-Control"]
    data = response.json()
    assert data["status"] == "active"
    assert len(data["items"]) == 1
    item = data["items"][0]
    assert item["user_id"] == user["id"]
    assert item["color"] == ("red" if requester == "owner" else "blue")
    for task, answer in zip(game["tasks"], ("4", "6")):
        review = item["answers"][str(task["id"])]
        assert review["correct_answer"] == answer
        assert review["task"]["text"] == task["text"]
        assert review["answer"] == ""
        assert review["correct"] is False

    # Reading the key does not let a finished participant rewrite their score.
    answers = {str(task["id"]): answer for task, answer in zip(game["tasks"], ("4", "6"))}
    assert finish(client, game, user, answers).json()["score"] == 0
    save = request_as(client, "PUT", results_path(game).removesuffix("/results") + "/answers", user, {
        "email": user["email"], "answers": answers,
    })
    assert save.status_code == 409
    assert request_as(client, "GET", results_path(game), user).json() == data
    saved = await test_db.trial_tests.get_user_trial_test_results(user["id"], game["trial"]["id"])
    assert len(saved) == 1 and saved[0]["score"] == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("admin", [False, True])
async def test_completed_session_still_requires_membership(client, test_db, game, admin):
    finish(client, game, game["owner"])
    finish(client, game, game["peer"])
    for user in (game["owner"], game["peer"]):
        response = request_as(client, "GET", results_path(game), user)
        assert response.status_code == 200
        assert response.json()["status"] == "completed"
        assert {item["user_id"] for item in response.json()["items"]} == {game["owner"]["id"], game["peer"]["id"]}
    outsider = await test_db.users.create_user_by_email("coop-review-outsider@example.com")
    if admin:
        await test_db.users.set_admin(email=outsider["email"], is_admin=True)
    response = request_as(client, "GET", results_path(game), outsider)
    assert response.status_code == 403
    assert_no_answer_key(response)


@pytest.mark.asyncio
async def test_finished_peers_email_cannot_replace_requesters_signed_identity(client, game):
    finish(client, game, game["peer"])
    response = request_as(client, "GET", results_path(game), game["owner"], query_email=game["peer"]["email"])
    assert response.status_code == 403
    assert_no_answer_key(response)


@pytest.mark.asyncio
@pytest.mark.parametrize("signed", [False, True])
async def test_answer_key_requires_valid_production_identity(client, game, signed):
    finish(client, game, game["owner"])
    if signed:
        response = request_as(client, "GET", results_path(game), game["owner"], secret="wrong-secret")
    else:
        response = client.get(results_path(game), params={"email": game["owner"]["email"]})
    assert response.status_code == 401
    assert_no_answer_key(response)


@pytest.mark.asyncio
async def test_missing_session_retains_not_found_response(client, game):
    path = f"/api/trial-tests/coop/session/{game['session']['id'] + 1000}/results"
    response = request_as(client, "GET", path, game["owner"])
    assert response.status_code == 404
    assert_no_answer_key(response)


@pytest.mark.asyncio
async def test_completed_session_flag_alone_does_not_unlock_unfinished_member(client, test_db, game):
    finish(client, game, game["peer"])
    await test_db.trial_test_coop.update_session_status(game["session"]["id"], "completed")
    response = request_as(client, "GET", results_path(game), game["owner"])
    assert response.status_code == 409
    assert_no_answer_key(response)
