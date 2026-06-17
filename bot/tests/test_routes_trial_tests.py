"""Route tests: trial tests."""
import pytest
from routes.presence import PresenceConnectionManager
from utils.internal_proxy_auth import verify_presence_ws_token, verify_ws_token
from tests.route_helpers import _FakePresenceWebSocket


@pytest.mark.asyncio
async def test_trial_test_submit_awards_points_by_difficulty_and_no_repeat(client, test_db, test_user):
    trial_test = await test_db.trial_tests.create_trial_test("Points Trial", sort_order=0, created_by=test_user["id"])

    bank_task_a = await test_db.bank_tasks.create_task(
        text="Task A",
        answer="A",
        question_type="input",
        difficulty="A",
        created_by=test_user["id"],
    )
    bank_task_b = await test_db.bank_tasks.create_task(
        text="Task B",
        answer="B",
        question_type="input",
        difficulty="B",
        created_by=test_user["id"],
    )
    bank_task_c = await test_db.bank_tasks.create_task(
        text="Task C",
        answer="C",
        question_type="input",
        difficulty="C",
        created_by=test_user["id"],
    )

    task_a = await test_db.trial_tests.create_trial_test_task(
        trial_test_id=trial_test["id"],
        text="Task A",
        answer="A",
        created_by=test_user["id"],
        sort_order=0,
        bank_task_id=bank_task_a["id"],
    )
    task_b = await test_db.trial_tests.create_trial_test_task(
        trial_test_id=trial_test["id"],
        text="Task B",
        answer="B",
        created_by=test_user["id"],
        sort_order=1,
        bank_task_id=bank_task_b["id"],
    )
    task_c = await test_db.trial_tests.create_trial_test_task(
        trial_test_id=trial_test["id"],
        text="Task C",
        answer="C",
        created_by=test_user["id"],
        sort_order=2,
        bank_task_id=bank_task_c["id"],
    )

    payload = {
        "email": test_user["email"],
        "answers": {
            str(task_a["id"]): "A",
            str(task_b["id"]): "B",
            str(task_c["id"]): "C",
        },
    }
    first = client.post(f"/api/trial-tests/{trial_test['id']}/submit", json=payload)
    assert first.status_code == 200
    first_json = first.json()
    assert first_json["score"] == 3
    assert first_json["total"] == 3
    assert first_json["percentage"] == 100.0

    user_after_first = await test_db.users.get_user_by_email(test_user["email"])
    assert user_after_first["total_points"] == 45
    assert user_after_first["week_points"] == 45
    assert user_after_first["total_solved"] == 3
    assert user_after_first["week_solved"] == 3

    second = client.post(f"/api/trial-tests/{trial_test['id']}/submit", json=payload)
    assert second.status_code == 200
    second_json = second.json()
    assert second_json["score"] == 3
    assert second_json["total"] == 3
    assert second_json["percentage"] == 100.0

    user_after_second = await test_db.users.get_user_by_email(test_user["email"])
    assert user_after_second["total_points"] == 45
    assert user_after_second["week_points"] == 45
    assert user_after_second["total_solved"] == 3
    assert user_after_second["week_solved"] == 3


@pytest.mark.asyncio
async def test_trial_test_submit_does_not_double_award_bank_task_solved_in_module(client, test_db, test_user):
    module = await test_db.curriculum.create_module("Shared Module", sort_order=1)
    section = await test_db.curriculum.create_section(module["id"], "Shared Section", sort_order=1)
    trial_test = await test_db.trial_tests.create_trial_test("Shared Trial", sort_order=0, created_by=test_user["id"])

    shared_bank_task = await test_db.bank_tasks.create_task(
        text="Shared task",
        answer="42",
        question_type="input",
        difficulty="A",
        created_by=test_user["id"],
    )
    module_task = await test_db.create_task_in_section(
        section["id"],
        "Shared task",
        "42",
        test_user["id"],
        bank_task_id=shared_bank_task["id"],
    )
    trial_task = await test_db.trial_tests.create_trial_test_task(
        trial_test_id=trial_test["id"],
        text="Shared task",
        answer="42",
        created_by=test_user["id"],
        sort_order=0,
        bank_task_id=shared_bank_task["id"],
    )

    module_response = client.post(
        "/api/task/check",
        json={"task_id": module_task["id"], "answer": "42", "email": test_user["email"]},
    )
    assert module_response.status_code == 200

    user_after_module = await test_db.users.get_user_by_email(test_user["email"])
    assert user_after_module["total_points"] == 10
    assert user_after_module["total_solved"] == 1

    trial_response = client.post(
        f"/api/trial-tests/{trial_test['id']}/submit",
        json={"email": test_user["email"], "answers": {str(trial_task["id"]): "42"}},
    )
    assert trial_response.status_code == 200
    assert trial_response.json()["score"] == 1

    user_after_trial = await test_db.users.get_user_by_email(test_user["email"])
    assert user_after_trial["total_points"] == 10
    assert user_after_trial["total_solved"] == 1


@pytest.mark.asyncio
async def test_trial_test_submit_still_returns_200_when_achievement_check_fails(
    client,
    test_db,
    test_user,
    monkeypatch,
):
    trial_test = await test_db.trial_tests.create_trial_test("Achievement Failure Trial", sort_order=0, created_by=test_user["id"])
    trial_task = await test_db.trial_tests.create_trial_test_task(
        trial_test_id=trial_test["id"],
        text="Task",
        answer="42",
        created_by=test_user["id"],
        sort_order=0,
    )

    async def broken_check_and_unlock_achievements(user_id: int):
        raise RuntimeError("achievement side effect failed")

    monkeypatch.setattr(test_db, "check_and_unlock_achievements", broken_check_and_unlock_achievements)

    response = client.post(
        f"/api/trial-tests/{trial_test['id']}/submit",
        json={"email": test_user["email"], "answers": {str(trial_task["id"]): "42"}},
    )

    assert response.status_code == 200
    assert response.json()["score"] == 1

    user_after_submit = await test_db.users.get_user_by_email(test_user["email"])
    assert user_after_submit["total_points"] == 15
    assert user_after_submit["total_solved"] == 1


@pytest.mark.asyncio
async def test_coop_finish_awards_points_once(client, test_db, test_user):
    trial_test = await test_db.trial_tests.create_trial_test("Coop Points Trial", sort_order=0, created_by=test_user["id"])
    bank_task = await test_db.bank_tasks.create_task(
        text="Coop task",
        answer="yes",
        question_type="input",
        difficulty="C",
        created_by=test_user["id"],
    )
    trial_task = await test_db.trial_tests.create_trial_test_task(
        trial_test_id=trial_test["id"],
        text="Coop task",
        answer="yes",
        created_by=test_user["id"],
        sort_order=0,
        bank_task_id=bank_task["id"],
    )

    session = await test_db.trial_test_coop.create_session(trial_test["id"], test_user["id"])
    await test_db.trial_test_coop.add_participant(session["id"], test_user["id"], "red")

    response = client.post(
        f"/api/trial-tests/{trial_test['id']}/coop/finish",
        json={
            "email": test_user["email"],
            "session_id": session["id"],
            "answers": {str(trial_task["id"]): "yes"},
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["score"] == 1
    assert payload["total"] == 1
    assert payload["percentage"] == 100.0

    user_after_first = await test_db.users.get_user_by_email(test_user["email"])
    assert user_after_first["total_points"] == 20
    assert user_after_first["week_points"] == 20
    assert user_after_first["total_solved"] == 1
    assert user_after_first["week_solved"] == 1

    repeat = client.post(
        f"/api/trial-tests/{trial_test['id']}/coop/finish",
        json={
            "email": test_user["email"],
            "session_id": session["id"],
            "answers": {str(trial_task["id"]): "yes"},
        },
    )
    assert repeat.status_code == 200

    user_after_repeat = await test_db.users.get_user_by_email(test_user["email"])
    assert user_after_repeat["total_points"] == 20
    assert user_after_repeat["week_points"] == 20
    assert user_after_repeat["total_solved"] == 1
    assert user_after_repeat["week_solved"] == 1


@pytest.mark.asyncio
async def test_coop_ws_token_requires_participant(client, test_db, test_user):
    trial_test = await test_db.trial_tests.create_trial_test("Coop WS Token Trial", sort_order=0, created_by=test_user["id"])
    session = await test_db.trial_test_coop.create_session(trial_test["id"], test_user["id"])
    await test_db.trial_test_coop.add_participant(session["id"], test_user["id"], "red")

    response = client.get(
        f"/api/trial-tests/coop/session/{session['id']}/ws-token",
        params={"email": test_user["email"]},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["expires_in"] == 120
    assert verify_ws_token(
        session_id=session["id"],
        user_email=test_user["email"],
        token=payload["token"],
    ) == (True, None)

    outsider = await test_db.users.create_user_by_email("coop-token-outsider@example.com")
    outsider_response = client.get(
        f"/api/trial-tests/coop/session/{session['id']}/ws-token",
        params={"email": outsider["email"]},
    )
    assert outsider_response.status_code == 403


@pytest.mark.asyncio
async def test_presence_ws_token_requires_existing_user(client, test_user):
    response = client.get(
        "/api/presence/ws-token",
        params={"email": test_user["email"]},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["expires_in"] == 120
    assert verify_presence_ws_token(
        user_email=test_user["email"],
        token=payload["token"],
    ) == (True, None)

    missing_response = client.get(
        "/api/presence/ws-token",
        params={"email": "missing-presence@example.com"},
    )
    assert missing_response.status_code == 404


@pytest.mark.asyncio
async def test_presence_ws_sends_snapshot_and_pong(client, test_user):
    token_response = client.get(
        "/api/presence/ws-token",
        params={"email": test_user["email"]},
    )
    token = token_response.json()["token"]

    with client.websocket_connect(
        f"/ws/presence?email={test_user['email']}&token={token}"
    ) as websocket:
        snapshot = websocket.receive_json()
        assert snapshot["type"] == "presence_snapshot"
        assert snapshot["users"] == [
            {
                "id": test_user["id"],
                "nickname": test_user.get("nickname"),
            }
        ]

        websocket.send_json({"type": "ping"})
        assert websocket.receive_json() == {"type": "pong"}


@pytest.mark.asyncio
async def test_presence_broadcast_reports_stale_last_connection_offline():
    manager = PresenceConnectionManager()
    stale_ws = _FakePresenceWebSocket(fail_send=True)
    peer_ws = _FakePresenceWebSocket()

    await manager.connect({"id": 1, "nickname": "Stale"}, stale_ws)
    await manager.connect({"id": 2, "nickname": "Peer"}, peer_ws)

    await manager.broadcast(
        {
            "type": "presence_update",
            "status": "online",
            "user": {"id": 3, "nickname": "Other"},
        }
    )

    assert 1 not in manager.active_connections
    assert any(
        message.get("type") == "presence_update"
        and message.get("status") == "offline"
        and message.get("user", {}).get("id") == 1
        for message in peer_ws.messages
    )
