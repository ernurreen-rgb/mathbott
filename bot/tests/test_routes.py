"""
Extended tests for API routes
"""
import json

import aiosqlite
import pytest


def _extract_http_detail(payload):
    if isinstance(payload, dict):
        if "detail" in payload:
            return payload.get("detail")
        error = payload.get("error")
        if isinstance(error, dict):
            return error.get("detail")
    return None


@pytest.mark.asyncio
async def test_get_task_by_id(client, test_db, test_user):
    """Test getting task by ID"""
    # Create task
    module = await test_db.create_module("Test Module", sort_order=1)
    section = await test_db.create_section(module["id"], "Test Section", sort_order=1)
    task = await test_db.create_task_in_section(
        section["id"], "What is 2+2?", "4", test_user["id"]
    )
    
    # Get task by ID
    response = client.get(f"/api/tasks/{task['id']}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == task["id"]
    assert data["text"] == "What is 2+2?"
    assert "answer" in data


def test_get_task_by_id_not_found(client):
    """Test getting non-existent task"""
    response = client.get("/api/tasks/99999")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_check_task_answer_correct(client, test_db, test_user):
    """Test checking correct answer"""
    # Create task
    module = await test_db.create_module("Test Module", sort_order=1)
    section = await test_db.create_section(module["id"], "Test Section", sort_order=1)
    task = await test_db.create_task_in_section(
        section["id"], "What is 2+2?", "4", test_user["id"]
    )
    
    # Check correct answer
    response = client.post(
        "/api/task/check",
        json={
            "task_id": task["id"],
            "answer": "4",
            "email": test_user["email"]
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["correct"] is True
    assert data.get("correct_answer") is None


@pytest.mark.asyncio
async def test_check_task_answer_incorrect(client, test_db, test_user):
    """Test checking incorrect answer"""
    # Create task
    module = await test_db.create_module("Test Module", sort_order=1)
    section = await test_db.create_section(module["id"], "Test Section", sort_order=1)
    task = await test_db.create_task_in_section(
        section["id"], "What is 2+2?", "4", test_user["id"]
    )
    
    # Check incorrect answer
    response = client.post(
        "/api/task/check",
        json={
            "task_id": task["id"],
            "answer": "5",
            "email": test_user["email"]
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["correct"] is False
    assert data["correct_answer"] == "4"


@pytest.mark.asyncio
async def test_check_task_answer_factor_grid_accepts_swapped_rows(client, test_db, test_user):
    """Factor-grid answers should accept row swaps but reject in-row swaps."""
    module = await test_db.create_module("Factor Grid Module", sort_order=1)
    section = await test_db.create_section(module["id"], "Factor Grid Section", sort_order=1)
    task = await test_db.create_task_in_section(
        section["id"],
        "2x^2 + 5x - 3 = 0",
        '["\\\\text{2x}","\\\\text{-1}","\\\\text{x}","\\\\text{3}"]',
        test_user["id"],
        question_type="factor_grid",
    )

    swapped_rows = client.post(
        "/api/task/check",
        json={
            "task_id": task["id"],
            "answer": '["x","3","2x","-1"]',
            "email": test_user["email"],
        },
    )
    assert swapped_rows.status_code == 200
    assert swapped_rows.json()["correct"] is True

    swapped_rows_unicode_minus = client.post(
        "/api/task/check",
        json={
            "task_id": task["id"],
            "answer": '["x","3","2x","\\u22121"]',
            "email": test_user["email"],
        },
    )
    assert swapped_rows_unicode_minus.status_code == 200
    assert swapped_rows_unicode_minus.json()["correct"] is True

    swapped_inside_row = client.post(
        "/api/task/check",
        json={
            "task_id": task["id"],
            "answer": '["-1","2x","x","3"]',
            "email": test_user["email"],
        },
    )
    assert swapped_inside_row.status_code == 200
    payload = swapped_inside_row.json()
    assert payload["correct"] is False
    assert payload["correct_answer"] == '["\\\\text{2x}","\\\\text{-1}","\\\\text{x}","\\\\text{3}"]'


@pytest.mark.asyncio
async def test_check_task_answer_awards_points_once_by_difficulty(client, test_db, test_user):
    module = await test_db.create_module("Points Module", sort_order=1)
    section = await test_db.create_section(module["id"], "Points Section", sort_order=1)
    task = await test_db.create_task_in_section(
        section["id"],
        "What is 2+2?",
        "4",
        test_user["id"],
        bank_difficulty="A",
    )

    first = client.post(
        "/api/task/check",
        json={"task_id": task["id"], "answer": "4", "email": test_user["email"]},
    )
    assert first.status_code == 200
    assert first.json()["correct"] is True

    user_after_first = await test_db.get_user_by_email(test_user["email"])
    assert user_after_first["total_points"] == 10
    assert user_after_first["week_points"] == 10
    assert user_after_first["total_solved"] == 1
    assert user_after_first["week_solved"] == 1

    second = client.post(
        "/api/task/check",
        json={"task_id": task["id"], "answer": "4", "email": test_user["email"]},
    )
    assert second.status_code == 200
    assert second.json()["correct"] is True

    user_after_second = await test_db.get_user_by_email(test_user["email"])
    assert user_after_second["total_points"] == 10
    assert user_after_second["week_points"] == 10
    assert user_after_second["total_solved"] == 1
    assert user_after_second["week_solved"] == 1


@pytest.mark.asyncio
async def test_check_task_answer_user_not_found(client, test_db, test_user):
    """Test checking answer with non-existent user"""
    # Create task
    module = await test_db.create_module("Test Module", sort_order=1)
    section = await test_db.create_section(module["id"], "Test Section", sort_order=1)
    task = await test_db.create_task_in_section(
        section["id"], "What is 2+2?", "4", test_user["id"]
    )
    
    # Check answer with non-existent user
    response = client.post(
        "/api/task/check",
        json={
            "task_id": task["id"],
            "answer": "4",
            "email": "nonexistent@example.com"
        }
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_trial_test_submit_awards_points_by_difficulty_and_no_repeat(client, test_db, test_user):
    trial_test = await test_db.create_trial_test("Points Trial", sort_order=0, created_by=test_user["id"])

    bank_task_a = await test_db.create_bank_task(
        text="Task A",
        answer="A",
        question_type="input",
        difficulty="A",
        created_by=test_user["id"],
    )
    bank_task_b = await test_db.create_bank_task(
        text="Task B",
        answer="B",
        question_type="input",
        difficulty="B",
        created_by=test_user["id"],
    )
    bank_task_c = await test_db.create_bank_task(
        text="Task C",
        answer="C",
        question_type="input",
        difficulty="C",
        created_by=test_user["id"],
    )

    task_a = await test_db.create_trial_test_task(
        trial_test_id=trial_test["id"],
        text="Task A",
        answer="A",
        created_by=test_user["id"],
        sort_order=0,
        bank_task_id=bank_task_a["id"],
    )
    task_b = await test_db.create_trial_test_task(
        trial_test_id=trial_test["id"],
        text="Task B",
        answer="B",
        created_by=test_user["id"],
        sort_order=1,
        bank_task_id=bank_task_b["id"],
    )
    task_c = await test_db.create_trial_test_task(
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

    user_after_first = await test_db.get_user_by_email(test_user["email"])
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

    user_after_second = await test_db.get_user_by_email(test_user["email"])
    assert user_after_second["total_points"] == 45
    assert user_after_second["week_points"] == 45
    assert user_after_second["total_solved"] == 3
    assert user_after_second["week_solved"] == 3


@pytest.mark.asyncio
async def test_trial_test_submit_does_not_double_award_bank_task_solved_in_module(client, test_db, test_user):
    module = await test_db.create_module("Shared Module", sort_order=1)
    section = await test_db.create_section(module["id"], "Shared Section", sort_order=1)
    trial_test = await test_db.create_trial_test("Shared Trial", sort_order=0, created_by=test_user["id"])

    shared_bank_task = await test_db.create_bank_task(
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
    trial_task = await test_db.create_trial_test_task(
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

    user_after_module = await test_db.get_user_by_email(test_user["email"])
    assert user_after_module["total_points"] == 10
    assert user_after_module["total_solved"] == 1

    trial_response = client.post(
        f"/api/trial-tests/{trial_test['id']}/submit",
        json={"email": test_user["email"], "answers": {str(trial_task["id"]): "42"}},
    )
    assert trial_response.status_code == 200
    assert trial_response.json()["score"] == 1

    user_after_trial = await test_db.get_user_by_email(test_user["email"])
    assert user_after_trial["total_points"] == 10
    assert user_after_trial["total_solved"] == 1


@pytest.mark.asyncio
async def test_coop_finish_awards_points_once(client, test_db, test_user):
    trial_test = await test_db.create_trial_test("Coop Points Trial", sort_order=0, created_by=test_user["id"])
    bank_task = await test_db.create_bank_task(
        text="Coop task",
        answer="yes",
        question_type="input",
        difficulty="C",
        created_by=test_user["id"],
    )
    trial_task = await test_db.create_trial_test_task(
        trial_test_id=trial_test["id"],
        text="Coop task",
        answer="yes",
        created_by=test_user["id"],
        sort_order=0,
        bank_task_id=bank_task["id"],
    )

    session = await test_db.create_trial_test_coop_session(trial_test["id"], test_user["id"])
    await test_db.add_trial_test_coop_participant(session["id"], test_user["id"], "red")

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

    user_after_first = await test_db.get_user_by_email(test_user["email"])
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

    user_after_repeat = await test_db.get_user_by_email(test_user["email"])
    assert user_after_repeat["total_points"] == 20
    assert user_after_repeat["week_points"] == 20
    assert user_after_repeat["total_solved"] == 1
    assert user_after_repeat["week_solved"] == 1


@pytest.mark.asyncio
async def test_get_user_web(client, test_db):
    """Test getting user web stats"""
    # Create user
    user = await test_db.create_user_by_email("testuser@example.com")
    
    # Get user stats
    response = client.get(f"/api/user/web/{user['email']}")
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == user["email"]
    assert "total_points" in data
    assert "total_solved" in data
    assert "league" in data
    assert "achievements" in data


@pytest.mark.asyncio
async def test_get_user_web_auto_create(client, test_db):
    """Test auto-creating user when getting web stats"""
    # Try to get non-existent user (should auto-create)
    response = client.get("/api/user/web/newuser@example.com")
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "newuser@example.com"
    
    # Verify user was created
    user = await test_db.get_user_by_email("newuser@example.com")
    assert user is not None


@pytest.mark.asyncio
async def test_get_user_web_with_refresh_achievements(client, test_db, test_user):
    """Test getting user web stats with achievement refresh"""
    response = client.get(
        f"/api/user/web/{test_user['email']}",
        params={"refresh_achievements": "true"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "achievements" in data


@pytest.mark.asyncio
async def test_get_public_user_profile(client, test_db, test_user):
    """Test getting public user profile"""
    # Set nickname
    await test_db.update_user_nickname(test_user["email"], "TestUser")
    
    # Get public profile
    response = client.get(f"/api/user/public/{test_user['email']}")
    assert response.status_code == 200
    data = response.json()
    assert data["nickname"] == "TestUser"
    assert "email" not in data  # Should not include email
    assert "is_admin" not in data  # Should not include is_admin


def test_get_public_user_profile_not_found(client):
    """Test getting public profile for non-existent user"""
    response = client.get("/api/user/public/nonexistent@example.com")
    assert response.status_code == 404


def test_friend_invite_flow(client):
    """Test creating and accepting friend invite"""
    inviter_email = "inviter@example.com"
    invitee_email = "invitee@example.com"

    inviter_response = client.get(f"/api/user/web/{inviter_email}")
    assert inviter_response.status_code == 200

    invite_response = client.post(
        "/api/friends/invites",
        json={"email": inviter_email, "expires_in_days": 7}
    )
    assert invite_response.status_code == 200
    invite_data = invite_response.json()
    token = invite_data["token"]

    details_response = client.get(
        f"/api/friends/invites/{token}",
        params={"email": invitee_email}
    )
    assert details_response.status_code == 200
    details = details_response.json()
    assert details["status"] == "active"

    accept_response = client.post(
        f"/api/friends/invites/{token}/accept",
        json={"email": invitee_email}
    )
    assert accept_response.status_code == 200
    accept_data = accept_response.json()
    assert accept_data["success"] is True

    invitee_response = client.get(f"/api/user/web/{invitee_email}")
    assert invitee_response.status_code == 200
    invitee_data = invitee_response.json()

    friends_response = client.get(
        "/api/friends",
        params={"email": inviter_email}
    )
    assert friends_response.status_code == 200
    friends_data = friends_response.json()
    assert any(friend["id"] == invitee_data["id"] for friend in friends_data["items"])


def test_friend_block_flow(client):
    """Test blocking and unblocking a user"""
    blocker_email = "blocker@example.com"
    blocked_email = "blocked@example.com"

    blocker_response = client.get(f"/api/user/web/{blocker_email}")
    assert blocker_response.status_code == 200
    blocked_response = client.get(f"/api/user/web/{blocked_email}")
    assert blocked_response.status_code == 200
    blocked_user = blocked_response.json()

    block_response = client.post(
        "/api/friends/blocks",
        json={"email": blocker_email, "blocked_user_id": blocked_user["id"]}
    )
    assert block_response.status_code == 200

    blocked_list_response = client.get(
        "/api/friends/blocks",
        params={"email": blocker_email}
    )
    assert blocked_list_response.status_code == 200
    blocked_list = blocked_list_response.json()["items"]
    assert any(item["id"] == blocked_user["id"] for item in blocked_list)

    unblock_response = client.delete(
        f"/api/friends/blocks/{blocked_user['id']}",
        params={"email": blocker_email}
    )
    assert unblock_response.status_code == 200

    blocked_list_response = client.get(
        "/api/friends/blocks",
        params={"email": blocker_email}
    )
    assert blocked_list_response.status_code == 200
    blocked_list = blocked_list_response.json()["items"]
    assert all(item["id"] != blocked_user["id"] for item in blocked_list)

@pytest.mark.asyncio
async def test_update_nickname(client, test_db, test_user):
    """Test updating nickname"""
    response = client.post(
        "/api/user/web/nickname",
        json={
            "email": test_user["email"],
            "nickname": "NewNickname"
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    
    # Verify nickname was updated
    user = await test_db.get_user_by_email(test_user["email"])
    assert user["nickname"] == "NewNickname"


def test_update_nickname_invalid_email(client):
    """Test updating nickname with invalid email"""
    response = client.post(
        "/api/user/web/nickname",
        json={
            "email": "invalid-email",
            "nickname": "Test"
        }
    )
    assert response.status_code == 422  # Validation error


@pytest.mark.asyncio
async def test_get_rating(client, test_db):
    """Test getting rating"""
    # Create users with nicknames
    user1 = await test_db.create_user_by_email("user1@example.com")
    user2 = await test_db.create_user_by_email("user2@example.com")
    await test_db.update_user_nickname("user1@example.com", "User1")
    await test_db.update_user_nickname("user2@example.com", "User2")
    
    # Get rating
    response = client.get("/api/rating?limit=10")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert "limit" in data
    assert "offset" in data
    assert len(data["items"]) >= 2


@pytest.mark.asyncio
async def test_get_rating_with_pagination(client, test_db):
    """Test getting rating with pagination"""
    # Create multiple users
    for i in range(5):
        email = f"user{i}@example.com"
        await test_db.create_user_by_email(email)
        await test_db.update_user_nickname(email, f"User{i}")
    
    # Get first page
    response1 = client.get("/api/rating?limit=2&offset=0")
    assert response1.status_code == 200
    data1 = response1.json()
    assert len(data1["items"]) == 2
    
    # Get second page
    response2 = client.get("/api/rating?limit=2&offset=2")
    assert response2.status_code == 200
    data2 = response2.json()
    assert len(data2["items"]) == 2
    assert data1["items"][0]["id"] != data2["items"][0]["id"]


@pytest.mark.asyncio
async def test_get_rating_with_league_filter(client, test_db):
    """Test getting rating filtered by league"""
    # Create users in different leagues
    user1 = await test_db.create_user_by_email("user1@example.com")
    await test_db.update_user_nickname("user1@example.com", "User1")
    
    # Get rating for specific league
    response = client.get("/api/rating?limit=10&league=Қола")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    # All items should be in the specified league
    for item in data["items"]:
        assert item["league"] == "Қола"


@pytest.mark.asyncio
async def test_get_modules_map(client, test_db):
    """Test getting modules map"""
    # Create module
    module = await test_db.create_module("Test Module", sort_order=1)
    section = await test_db.create_section(module["id"], "Test Section", sort_order=1)
    
    # Get modules map
    response = client.get("/api/modules/map")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0
    assert any(m["id"] == module["id"] for m in data)


@pytest.mark.asyncio
async def test_get_modules_map_with_email(client, test_db, test_user):
    """Test getting modules map with user email"""
    # Create module
    module = await test_db.create_module("Test Module", sort_order=1)
    section = await test_db.create_section(module["id"], "Test Section", sort_order=1)
    
    # Get modules map with email
    response = client.get(f"/api/modules/map?email={test_user['email']}")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    # Check that progress is included
    if len(data) > 0:
        assert "progress" in data[0]


@pytest.mark.asyncio
async def test_get_module_details(client, test_db):
    """Test getting module details"""
    # Create module
    module = await test_db.create_module("Test Module", sort_order=1)
    section = await test_db.create_section(module["id"], "Test Section", sort_order=1)
    
    # Get module details
    response = client.get(f"/api/modules/{module['id']}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == module["id"]
    assert data["name"] == "Test Module"
    assert "sections" in data


def test_get_module_details_not_found(client):
    """Test getting non-existent module"""
    response = client.get("/api/modules/99999")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_lesson_details(client, test_db):
    """Test getting lesson details"""
    # Create module, section, lesson
    module = await test_db.create_module("Test Module", sort_order=1)
    section = await test_db.create_section(module["id"], "Test Section", sort_order=1)
    lesson = await test_db.create_lesson(
        section["id"], lesson_number=1, title="Test Lesson", sort_order=1
    )
    
    # Get lesson details
    response = client.get(f"/api/lessons/{lesson['id']}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == lesson["id"]
    assert "mini_lessons" in data


def test_get_lesson_details_not_found(client):
    """Test getting non-existent lesson"""
    response = client.get("/api/lessons/99999")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_admin_trial_task_create_auto_links_bank_task(client, test_db):
    """Creating a trial-test task via admin endpoint should auto-create linked bank task."""
    admin_user = await test_db.create_user_by_email("admin.autobank@example.com")
    await test_db.set_admin(email=admin_user["email"], is_admin=True)
    trial_test = await test_db.create_trial_test("Auto Bank Test", sort_order=0, created_by=admin_user["id"])

    response = client.post(
        f"/api/admin/trial-tests/{trial_test['id']}/tasks/create",
        data={
            "email": admin_user["email"],
            "text": "x^2 + 1 = 0",
            "answer": "i",
            "question_type": "input",
            "sort_order": "0",
            "bank_difficulty": "C",
            "bank_topics": json.dumps(["Algebra", "Complex"]),
        },
    )
    assert response.status_code == 200
    created_task = response.json()
    assert isinstance(created_task.get("bank_task_id"), int)

    bank_task = await test_db.get_bank_task_by_id(created_task["bank_task_id"], include_deleted=True)
    assert bank_task is not None
    assert bank_task["text"] == "x^2 + 1 = 0"
    assert bank_task["answer"] == "i"
    assert bank_task["difficulty"] == "C"
    assert bank_task["topics"] == ["Algebra", "Complex"]

    list_response = client.get(
        f"/api/admin/trial-tests/{trial_test['id']}/tasks",
        params={"email": admin_user["email"]},
    )
    assert list_response.status_code == 200
    tasks_payload = list_response.json()
    assert isinstance(tasks_payload.get("tasks"), list)
    assert len(tasks_payload["tasks"]) == 1
    listed = tasks_payload["tasks"][0]
    assert listed["answer"] == "i"
    assert listed["bank_task_id"] == created_task["bank_task_id"]
    assert listed["bank_difficulty"] == "C"
    assert listed["bank_topics"] == ["Algebra", "Complex"]


@pytest.mark.asyncio
async def test_admin_trial_task_update_syncs_linked_bank_task(client, test_db):
    """Updating linked trial task should sync values to bank task."""
    admin_user = await test_db.create_user_by_email("admin.sync@example.com")
    await test_db.set_admin(email=admin_user["email"], is_admin=True)
    trial_test = await test_db.create_trial_test("Sync Test", sort_order=0, created_by=admin_user["id"])
    bank_task = await test_db.create_bank_task(
        text="Old text",
        answer="A",
        question_type="input",
        difficulty="B",
        topics=["OldTopic"],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    trial_task = await test_db.create_trial_test_task(
        trial_test_id=trial_test["id"],
        text="Old text",
        answer="A",
        question_type="input",
        sort_order=0,
        created_by=admin_user["id"],
        bank_task_id=bank_task["id"],
    )

    response = client.post(
        f"/api/admin/trial-tests/{trial_test['id']}/tasks/{trial_task['id']}/update",
        data={
            "email": admin_user["email"],
            "text": "Updated text",
            "answer": "Updated answer",
            "question_type": "input",
            "bank_difficulty": "A",
            "bank_topics": json.dumps(["NewTopic", "SecondTopic"]),
        },
    )
    assert response.status_code == 200
    assert response.json().get("success") is True

    updated_bank_task = await test_db.get_bank_task_by_id(bank_task["id"], include_deleted=True)
    assert updated_bank_task is not None
    assert updated_bank_task["text"] == "Updated text"
    assert updated_bank_task["answer"] == "Updated answer"
    assert updated_bank_task["difficulty"] == "A"
    assert updated_bank_task["topics"] == ["NewTopic", "SecondTopic"]


@pytest.mark.asyncio
async def test_admin_trial_task_update_does_not_create_bank_for_legacy_unlinked(client, test_db):
    """Legacy unlinked trial task should not create new bank task on update."""
    admin_user = await test_db.create_user_by_email("admin.legacy@example.com")
    await test_db.set_admin(email=admin_user["email"], is_admin=True)
    trial_test = await test_db.create_trial_test("Legacy Test", sort_order=0, created_by=admin_user["id"])

    # Create a true legacy unlinked placement row (bank_task_id=NULL) bypassing modern helper.
    async with aiosqlite.connect(test_db.db_path) as db:
        await db.execute(
            """
            INSERT INTO trial_test_tasks (trial_test_id, bank_task_id, sort_order, created_by)
            VALUES (?, NULL, ?, ?)
            """,
            (trial_test["id"], 0, admin_user["id"]),
        )
        await db.commit()
        async with db.execute("SELECT id FROM trial_test_tasks ORDER BY id DESC LIMIT 1") as cursor:
            row = await cursor.fetchone()
            trial_task_id = int(row[0]) if row else None

    assert trial_task_id is not None

    before = await test_db.get_bank_tasks(limit=50, offset=0)
    before_total = before["total"]

    response = client.post(
        f"/api/admin/trial-tests/{trial_test['id']}/tasks/{trial_task_id}/update",
        data={
            "email": admin_user["email"],
            "text": "Legacy task updated",
            "answer": "84",
            "question_type": "input",
            "bank_difficulty": "C",
            "bank_topics": json.dumps(["ShouldNotPersist"]),
        },
    )
    assert response.status_code == 200
    assert response.json().get("success") is True

    after = await test_db.get_bank_tasks(limit=50, offset=0)
    assert after["total"] == before_total


@pytest.mark.asyncio
async def test_admin_trial_slot_upsert_with_existing_bank_task(client, test_db):
    """Slot upsert with bank_task_id should create/update only one placement in that slot."""
    admin_user = await test_db.create_user_by_email("admin.slot.bank@example.com")
    await test_db.set_admin(email=admin_user["email"], is_admin=True)
    assert await test_db.is_admin(email=admin_user["email"]) is True
    trial_test = await test_db.create_trial_test("Slot Test", sort_order=0, created_by=admin_user["id"])

    bank_task_a = await test_db.create_bank_task(
        text="Bank A",
        answer="A",
        question_type="mcq",
        difficulty="B",
        topics=["TopicA"],
        options=[
            {"label": "A", "text": "1"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "3"},
            {"label": "D", "text": "4"},
        ],
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    bank_task_b = await test_db.create_bank_task(
        text="Bank B",
        answer="B",
        question_type="mcq",
        difficulty="C",
        topics=["TopicB"],
        options=[
            {"label": "A", "text": "10"},
            {"label": "B", "text": "20"},
            {"label": "C", "text": "30"},
            {"label": "D", "text": "40"},
        ],
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )

    create_response = client.put(
        f"/api/admin/trial-tests/{trial_test['id']}/slots/3",
        json={"email": admin_user["email"], "bank_task_id": bank_task_a["id"]},
    )
    assert create_response.status_code == 200
    created = create_response.json()
    assert created["sort_order"] == 2
    assert created["bank_task_id"] == bank_task_a["id"]
    assert created["text"] == "Bank A"

    replace_response = client.put(
        f"/api/admin/trial-tests/{trial_test['id']}/slots/3",
        json={"email": admin_user["email"], "bank_task_id": bank_task_b["id"]},
    )
    assert replace_response.status_code == 200
    replaced = replace_response.json()
    assert replaced["sort_order"] == 2
    assert replaced["bank_task_id"] == bank_task_b["id"]
    assert replaced["text"] == "Bank B"

    list_response = client.get(
        f"/api/admin/trial-tests/{trial_test['id']}/tasks",
        params={"email": admin_user["email"]},
    )
    assert list_response.status_code == 200
    payload = list_response.json()
    assert payload["expected_tasks_count"] == 40
    assert len(payload["tasks"]) == 1
    assert payload["tasks"][0]["sort_order"] == 2
    assert payload["tasks"][0]["bank_task_id"] == bank_task_b["id"]


@pytest.mark.asyncio
async def test_admin_trial_slot_upsert_inline_creates_bank_task(client, test_db):
    """Inline slot upsert should create bank task and link placement to it."""
    admin_user = await test_db.create_user_by_email("admin.slot.inline@example.com")
    await test_db.set_admin(email=admin_user["email"], is_admin=True)
    trial_test = await test_db.create_trial_test("Inline Slot Test", sort_order=0, created_by=admin_user["id"])

    before = await test_db.get_bank_tasks(limit=100, offset=0)

    response = client.put(
        f"/api/admin/trial-tests/{trial_test['id']}/slots/1",
        json={
            "email": admin_user["email"],
            "text": "Inline slot text",
            "answer": "C",
            "question_type": "mcq",
            "options": [
                {"label": "A", "text": "a"},
                {"label": "B", "text": "b"},
                {"label": "C", "text": "c"},
                {"label": "D", "text": "d"},
            ],
            "bank_difficulty": "A",
            "bank_topics": ["InlineTopic", "SecondTopic"],
        },
    )
    assert response.status_code == 200
    created = response.json()
    assert isinstance(created.get("bank_task_id"), int)
    assert created["sort_order"] == 0
    assert created["text"] == "Inline slot text"
    assert created["bank_difficulty"] == "A"
    assert created["bank_topics"] == ["InlineTopic", "SecondTopic"]

    after = await test_db.get_bank_tasks(limit=100, offset=0)
    assert after["total"] == before["total"] + 1
    created_bank = await test_db.get_bank_task_by_id(created["bank_task_id"], include_deleted=True)
    assert created_bank is not None
    assert created_bank["text"] == "Inline slot text"
    assert created_bank["difficulty"] == "A"
    assert created_bank["topics"] == ["InlineTopic", "SecondTopic"]


@pytest.mark.asyncio
async def test_admin_trial_slot_clear_soft_deletes_slot_placement(client, test_db):
    """Clearing slot should remove active placement from slot listing."""
    admin_user = await test_db.create_user_by_email("admin.slot.clear@example.com")
    await test_db.set_admin(email=admin_user["email"], is_admin=True)
    trial_test = await test_db.create_trial_test("Clear Slot Test", sort_order=0, created_by=admin_user["id"])
    bank_task = await test_db.create_bank_task(
        text="Clear me",
        answer="42",
        question_type="input",
        difficulty="B",
        topics=["Cleanup"],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )

    create_response = client.put(
        f"/api/admin/trial-tests/{trial_test['id']}/slots/2",
        json={"email": admin_user["email"], "bank_task_id": bank_task["id"]},
    )
    assert create_response.status_code == 200

    clear_response = client.delete(
        f"/api/admin/trial-tests/{trial_test['id']}/slots/2",
        params={"email": admin_user["email"]},
    )
    assert clear_response.status_code == 200
    assert clear_response.json()["cleared"] == 1

    list_response = client.get(
        f"/api/admin/trial-tests/{trial_test['id']}/tasks",
        params={"email": admin_user["email"]},
    )
    assert list_response.status_code == 200
    assert list_response.json()["tasks"] == []


@pytest.mark.asyncio
async def test_admin_bank_permanent_delete_removes_trial_placements(client, test_db):
    """Permanent bank delete should remove linked trial placements from active content."""
    admin_user = await test_db.create_user_by_email("admin.bank.delete@example.com")
    await test_db.set_admin(email=admin_user["email"], is_admin=True)
    trial_test = await test_db.create_trial_test("Delete Cascade Test", sort_order=0, created_by=admin_user["id"])
    bank_task = await test_db.create_bank_task(
        text="Cascade bank task",
        answer="1",
        question_type="input",
        difficulty="B",
        topics=["Cascade"],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )

    link_response = client.put(
        f"/api/admin/trial-tests/{trial_test['id']}/slots/1",
        json={"email": admin_user["email"], "bank_task_id": bank_task["id"]},
    )
    assert link_response.status_code == 200

    to_trash_response = client.delete(
        f"/api/admin/bank/tasks/{bank_task['id']}",
        params={"email": admin_user["email"]},
    )
    assert to_trash_response.status_code == 200
    assert to_trash_response.json()["success"] is True

    permanent_response = client.delete(
        f"/api/admin/bank/tasks/{bank_task['id']}/permanent",
        params={"email": admin_user["email"]},
    )
    assert permanent_response.status_code == 200
    assert permanent_response.json()["success"] is True

    list_response = client.get(
        f"/api/admin/trial-tests/{trial_test['id']}/tasks",
        params={"email": admin_user["email"]},
    )
    assert list_response.status_code == 200
    assert list_response.json()["tasks"] == []

    deleted_bank = await test_db.get_bank_task_by_id(bank_task["id"], include_deleted=True)
    assert deleted_bank is None


@pytest.mark.asyncio
async def test_admin_bank_versions_update_and_rollback(client, test_db):
    """Bank task should track versions and support rollback."""
    admin_user = await test_db.create_user_by_email("admin.bank.versions@example.com")
    await test_db.set_admin(email=admin_user["email"], is_admin=True)

    create_response = client.post(
        "/api/admin/bank/tasks",
        data={
            "email": admin_user["email"],
            "text": "Version source text",
            "answer": "10",
            "question_type": "input",
            "difficulty": "B",
            "topics": json.dumps(["History"]),
        },
    )
    assert create_response.status_code == 200
    created = create_response.json()
    task_id = int(created["id"])
    assert int(created.get("current_version") or 0) == 1

    versions_after_create = client.get(
        f"/api/admin/bank/tasks/{task_id}/versions",
        params={"email": admin_user["email"]},
    )
    assert versions_after_create.status_code == 200
    payload_create = versions_after_create.json()
    assert payload_create["total"] >= 1
    assert payload_create["items"][0]["event_type"] == "create"
    assert payload_create["items"][0]["version_no"] == 1

    update_response = client.put(
        f"/api/admin/bank/tasks/{task_id}",
        data={
            "email": admin_user["email"],
            "text": "Version updated text",
            "answer": "20",
            "question_type": "input",
            "expected_current_version": "1",
        },
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["text"] == "Version updated text"
    assert int(updated.get("current_version") or 0) == 2

    detail_v1 = client.get(
        f"/api/admin/bank/tasks/{task_id}/versions/1",
        params={"email": admin_user["email"]},
    )
    assert detail_v1.status_code == 200
    v1_payload = detail_v1.json()
    assert v1_payload["snapshot"]["text"] == "Version source text"

    rollback_response = client.post(
        f"/api/admin/bank/tasks/{task_id}/rollback",
        json={
            "email": admin_user["email"],
            "target_version": 1,
            "expected_current_version": 2,
        },
    )
    assert rollback_response.status_code == 200
    rolled = rollback_response.json()
    assert rolled["text"] == "Version source text"
    assert int(rolled.get("current_version") or 0) == 3

    versions_after_rollback = client.get(
        f"/api/admin/bank/tasks/{task_id}/versions",
        params={"email": admin_user["email"]},
    )
    assert versions_after_rollback.status_code == 200
    rollback_items = versions_after_rollback.json()["items"]
    assert rollback_items[0]["event_type"] == "rollback"
    assert rollback_items[0]["rollback_from_version"] == 1


@pytest.mark.asyncio
async def test_admin_bank_delete_non_current_version(client, test_db):
    """Admin can permanently remove a non-current version from history."""
    admin_user = await test_db.create_user_by_email("admin.bank.versions.delete@example.com")
    await test_db.set_admin(email=admin_user["email"], is_admin=True)

    create_response = client.post(
        "/api/admin/bank/tasks",
        data={
            "email": admin_user["email"],
            "text": "Delete history source",
            "answer": "10",
            "question_type": "input",
            "difficulty": "B",
        },
    )
    assert create_response.status_code == 200
    task_id = int(create_response.json()["id"])

    update_response = client.put(
        f"/api/admin/bank/tasks/{task_id}",
        data={
            "email": admin_user["email"],
            "text": "Delete history updated",
            "answer": "20",
            "question_type": "input",
            "expected_current_version": "1",
        },
    )
    assert update_response.status_code == 200

    delete_response = client.delete(
        f"/api/admin/bank/tasks/{task_id}/versions/1",
        params={"email": admin_user["email"]},
    )
    assert delete_response.status_code == 200
    assert delete_response.json()["success"] is True

    version_detail = client.get(
        f"/api/admin/bank/tasks/{task_id}/versions/1",
        params={"email": admin_user["email"]},
    )
    assert version_detail.status_code == 404

    versions_response = client.get(
        f"/api/admin/bank/tasks/{task_id}/versions",
        params={"email": admin_user["email"]},
    )
    assert versions_response.status_code == 200
    version_numbers = [int(item["version_no"]) for item in versions_response.json()["items"]]
    assert 1 not in version_numbers

    task = await test_db.get_bank_task_by_id(task_id, include_deleted=True)
    assert task is not None
    assert int(task.get("current_version") or 0) == 2


@pytest.mark.asyncio
async def test_admin_bank_delete_current_version_repoints_to_latest(client, test_db):
    """Deleting current version should move current_version to latest remaining history item."""
    admin_user = await test_db.create_user_by_email("admin.bank.versions.current@example.com")
    await test_db.set_admin(email=admin_user["email"], is_admin=True)

    create_response = client.post(
        "/api/admin/bank/tasks",
        data={
            "email": admin_user["email"],
            "text": "Current version protect",
            "answer": "10",
            "question_type": "input",
            "difficulty": "B",
        },
    )
    assert create_response.status_code == 200
    task_id = int(create_response.json()["id"])

    update_response = client.put(
        f"/api/admin/bank/tasks/{task_id}",
        data={
            "email": admin_user["email"],
            "text": "Current version protect updated",
            "answer": "20",
            "question_type": "input",
            "expected_current_version": "1",
        },
    )
    assert update_response.status_code == 200

    delete_response = client.delete(
        f"/api/admin/bank/tasks/{task_id}/versions/2",
        params={"email": admin_user["email"]},
    )
    assert delete_response.status_code == 200
    assert delete_response.json()["success"] is True

    task = await test_db.get_bank_task_by_id(task_id, include_deleted=True)
    assert task is not None
    assert int(task.get("current_version") or 0) == 1

    version_detail = client.get(
        f"/api/admin/bank/tasks/{task_id}/versions/2",
        params={"email": admin_user["email"]},
    )
    assert version_detail.status_code == 404

    version_detail_v1 = client.get(
        f"/api/admin/bank/tasks/{task_id}/versions/1",
        params={"email": admin_user["email"]},
    )
    assert version_detail_v1.status_code == 200


@pytest.mark.asyncio
async def test_admin_bank_delete_last_remaining_version_forbidden(client, test_db):
    """Deleting the last remaining version should be rejected."""
    admin_user = await test_db.create_user_by_email("admin.bank.versions.last@example.com")
    await test_db.set_admin(email=admin_user["email"], is_admin=True)

    create_response = client.post(
        "/api/admin/bank/tasks",
        data={
            "email": admin_user["email"],
            "text": "Last version protect",
            "answer": "10",
            "question_type": "input",
            "difficulty": "B",
        },
    )
    assert create_response.status_code == 200
    task_id = int(create_response.json()["id"])

    delete_response = client.delete(
        f"/api/admin/bank/tasks/{task_id}/versions/1",
        params={"email": admin_user["email"]},
    )
    assert delete_response.status_code == 400
    delete_payload = delete_response.json()
    detail = delete_payload.get("detail")
    if detail is None and isinstance(delete_payload.get("error"), dict):
        detail = delete_payload["error"].get("detail")
    if detail is None:
        detail = delete_payload
    assert isinstance(detail, dict)
    assert detail.get("code") == "LAST_VERSION_DELETE_FORBIDDEN"


@pytest.mark.asyncio
async def test_admin_bank_delete_missing_version_returns_404(client, test_db):
    """Deleting unknown version should return not found."""
    admin_user = await test_db.create_user_by_email("admin.bank.versions.missing@example.com")
    await test_db.set_admin(email=admin_user["email"], is_admin=True)

    create_response = client.post(
        "/api/admin/bank/tasks",
        data={
            "email": admin_user["email"],
            "text": "Missing version",
            "answer": "10",
            "question_type": "input",
            "difficulty": "B",
        },
    )
    assert create_response.status_code == 200
    task_id = int(create_response.json()["id"])

    delete_response = client.delete(
        f"/api/admin/bank/tasks/{task_id}/versions/999",
        params={"email": admin_user["email"]},
    )
    assert delete_response.status_code == 404


@pytest.mark.asyncio
async def test_admin_bank_usage_endpoint_returns_module_and_trial_context(client, test_db):
    """Usage endpoint should include active placements from modules and trial tests."""
    admin_user = await test_db.create_user_by_email("admin.bank.usage@example.com")
    await test_db.set_admin(email=admin_user["email"], is_admin=True)

    module = await test_db.create_module("Usage Module", sort_order=1)
    section = await test_db.create_section(module["id"], "Usage Section", sort_order=1)
    trial_test = await test_db.create_trial_test("Usage Trial", sort_order=1, created_by=admin_user["id"])

    bank_task = await test_db.create_bank_task(
        text="Usage linked task",
        answer="A",
        question_type="input",
        difficulty="B",
        topics=["Usage"],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    await test_db.create_task_in_section(
        section_id=section["id"],
        text="Usage linked task",
        answer="A",
        created_by=admin_user["id"],
        bank_task_id=bank_task["id"],
        sort_order=0,
    )
    await test_db.create_trial_test_task(
        trial_test_id=trial_test["id"],
        text="Usage linked task",
        answer="A",
        created_by=admin_user["id"],
        bank_task_id=bank_task["id"],
        sort_order=0,
    )

    response = client.get(
        f"/api/admin/bank/tasks/{bank_task['id']}/usage",
        params={"email": admin_user["email"]},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["task_id"] == bank_task["id"]
    assert payload["active_only"] is True
    assert payload["total"] >= 2
    kinds = {item["kind"] for item in payload["items"]}
    assert "module" in kinds
    assert "trial_test" in kinds


@pytest.mark.asyncio
async def test_admin_bank_dedup_warn_on_save(client, test_db):
    """Create/update should return dedup warning unless explicitly confirmed."""
    admin_user = await test_db.create_user_by_email("admin.bank.dedup@example.com")
    await test_db.set_admin(email=admin_user["email"], is_admin=True)

    first = client.post(
        "/api/admin/bank/tasks",
        data={
            "email": admin_user["email"],
            "text": "Duplicate anchor text",
            "answer": "1",
            "question_type": "input",
            "difficulty": "B",
        },
    )
    assert first.status_code == 200

    duplicate = client.post(
        "/api/admin/bank/tasks",
        data={
            "email": admin_user["email"],
            "text": "Duplicate anchor text",
            "answer": "2",
            "question_type": "input",
            "difficulty": "B",
        },
    )
    assert duplicate.status_code == 409
    duplicate_json = duplicate.json()
    duplicate_detail = duplicate_json.get("detail")
    if duplicate_detail is None and isinstance(duplicate_json.get("error"), dict):
        duplicate_detail = duplicate_json["error"].get("detail")
    if duplicate_detail is None:
        duplicate_detail = duplicate_json
    assert duplicate_detail["code"] == "SIMILAR_TASKS_FOUND"
    assert isinstance(duplicate_detail.get("similar_tasks"), list)
    assert len(duplicate_detail["similar_tasks"]) >= 1

    duplicate_confirmed = client.post(
        "/api/admin/bank/tasks",
        data={
            "email": admin_user["email"],
            "text": "Duplicate anchor text",
            "answer": "2",
            "question_type": "input",
            "difficulty": "B",
            "dedup_confirmed": "true",
        },
    )
    assert duplicate_confirmed.status_code == 200


@pytest.mark.asyncio
async def test_admin_bank_import_mode_required(client, test_db):
    admin_user = await test_db.create_user_by_email("admin.bank.import.mode@example.com")
    await test_db.set_admin(email=admin_user["email"], is_admin=True)

    response = client.post(
        "/api/admin/bank/tasks/import",
        json={
            "email": admin_user["email"],
            "tasks": {"text": "No mode", "answer": "1", "question_type": "input", "difficulty": "B"},
        },
    )
    assert response.status_code == 400
    payload = response.json()
    detail = payload.get("detail")
    if detail is None and isinstance(payload.get("error"), dict):
        detail = payload["error"].get("detail")
    if detail is None:
        detail = payload
    assert isinstance(detail, dict)
    assert detail.get("code") == "IMPORT_MODE_REQUIRED"


@pytest.mark.asyncio
async def test_admin_bank_import_dry_run_single_select_task(client, test_db):
    admin_user = await test_db.create_user_by_email("admin.bank.import.dryrun.single@example.com")
    await test_db.set_admin(email=admin_user["email"], is_admin=True)
    before_total = (await test_db.get_bank_tasks(limit=100, offset=0))["total"]

    task_payload = {
        "text": "Import select question",
        "answer": ["D", "B"],
        "question_type": "select",
        "options": [
            {"label": "A", "text": "14"},
            {"label": "B", "text": "15"},
            {"label": "C", "text": "16"},
            {"label": "D", "text": "17"},
        ],
        "subquestions": [
            {"text": "Degree", "correct": "D"},
            {"text": "Coefficient", "correct": "B"},
        ],
        "difficulty": "B",
        "topics": ["Algebra", "Monomial"],
        "image_filename": None,
        "solution_filename": None,
    }
    response = client.post(
        "/api/admin/bank/tasks/import",
        json={
            "email": admin_user["email"],
            "mode": "dry_run",
            "tasks": task_payload,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["mode"] == "dry_run"
    assert isinstance(payload.get("preview_token"), str)
    assert payload["summary"]["total_tasks"] == 1
    assert payload["summary"]["valid_count"] == 1
    assert payload["summary"]["invalid_count"] == 0
    assert payload["summary"]["duplicate_count"] == 0
    assert payload["summary"]["can_confirm"] is True
    assert payload["summary"]["requires_dedup_confirmation"] is False
    assert payload["validation_errors"] == []
    assert payload["duplicate_conflicts"] == []

    after_total = (await test_db.get_bank_tasks(limit=100, offset=0))["total"]
    assert after_total == before_total


@pytest.mark.asyncio
async def test_admin_bank_import_dry_run_mixed_validation_errors(client, test_db):
    admin_user = await test_db.create_user_by_email("admin.bank.import.dryrun.validation@example.com")
    await test_db.set_admin(email=admin_user["email"], is_admin=True)
    before_total = (await test_db.get_bank_tasks(limit=100, offset=0))["total"]

    response = client.post(
        "/api/admin/bank/tasks/import",
        json={
            "email": admin_user["email"],
            "mode": "dry_run",
            "tasks": [
                {
                    "text": "Atomic valid task",
                    "answer": "10",
                    "question_type": "input",
                    "difficulty": "B",
                },
                {
                    "text": "Atomic invalid task",
                    "answer": "A",
                    "question_type": "mcq",
                    "difficulty": "B",
                },
            ],
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["mode"] == "dry_run"
    assert payload["summary"]["total_tasks"] == 2
    assert payload["summary"]["invalid_count"] >= 1
    assert payload["summary"]["can_confirm"] is False
    assert isinstance(payload["validation_errors"], list)
    assert any(item.get("index") == 1 for item in payload["validation_errors"])

    after_total = (await test_db.get_bank_tasks(limit=100, offset=0))["total"]
    assert after_total == before_total


@pytest.mark.asyncio
async def test_admin_bank_import_dry_run_dedup_all_conflicts(client, test_db):
    admin_user = await test_db.create_user_by_email("admin.bank.import.dryrun.conflicts@example.com")
    await test_db.set_admin(email=admin_user["email"], is_admin=True)

    await test_db.create_bank_task(
        text="Dry-run duplicate one",
        answer="1",
        question_type="input",
        difficulty="B",
        topics=[],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    await test_db.create_bank_task(
        text="Dry-run duplicate two",
        answer="1",
        question_type="input",
        difficulty="B",
        topics=[],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )

    response = client.post(
        "/api/admin/bank/tasks/import",
        json={
            "email": admin_user["email"],
            "mode": "dry_run",
            "tasks": [
                {"text": "Dry-run duplicate one", "answer": "2", "question_type": "input", "difficulty": "B"},
                {"text": "Dry-run duplicate two", "answer": "3", "question_type": "input", "difficulty": "B"},
            ],
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["mode"] == "dry_run"
    assert payload["summary"]["duplicate_count"] == 2
    assert payload["summary"]["requires_dedup_confirmation"] is True
    conflicts = payload.get("duplicate_conflicts") or []
    assert isinstance(conflicts, list)
    assert len(conflicts) == 2
    assert {int(item["index"]) for item in conflicts} == {0, 1}


@pytest.mark.asyncio
async def test_admin_bank_import_confirm_success_after_dry_run(client, test_db):
    admin_user = await test_db.create_user_by_email("admin.bank.import.confirm.success@example.com")
    await test_db.set_admin(email=admin_user["email"], is_admin=True)
    before_total = (await test_db.get_bank_tasks(limit=100, offset=0))["total"]

    tasks_payload = {
        "text": "Confirm select question",
        "answer": ["D", "B"],
        "question_type": "select",
        "options": [
            {"label": "A", "text": "14"},
            {"label": "B", "text": "15"},
            {"label": "C", "text": "16"},
            {"label": "D", "text": "17"},
        ],
        "subquestions": [
            {"text": "Degree", "correct": "D"},
            {"text": "Coefficient", "correct": "B"},
        ],
        "difficulty": "B",
        "topics": ["Algebra"],
    }

    preview_response = client.post(
        "/api/admin/bank/tasks/import",
        json={"email": admin_user["email"], "mode": "dry_run", "tasks": tasks_payload},
    )
    assert preview_response.status_code == 200
    preview_payload = preview_response.json()
    token = preview_payload["preview_token"]
    assert isinstance(token, str) and token

    confirm_response = client.post(
        "/api/admin/bank/tasks/import",
        json={
            "email": admin_user["email"],
            "mode": "confirm",
            "preview_token": token,
            "tasks": tasks_payload,
        },
    )
    assert confirm_response.status_code == 200
    confirm_payload = confirm_response.json()
    assert confirm_payload["mode"] == "confirm"
    assert confirm_payload["created_count"] == 1
    assert len(confirm_payload["created_ids"]) == 1
    task_id = int(confirm_payload["created_ids"][0])
    created = await test_db.get_bank_task_by_id(task_id, include_deleted=True)
    assert created is not None
    assert created["question_type"] == "select"
    assert created["answer"] == json.dumps(["D", "B"], ensure_ascii=False)

    after_total = (await test_db.get_bank_tasks(limit=100, offset=0))["total"]
    assert after_total == before_total + 1


@pytest.mark.asyncio
async def test_admin_bank_create_factor_grid_canonicalizes_answer(client, test_db):
    admin_user = await test_db.create_user_by_email("admin.bank.factor.grid@example.com")
    await test_db.set_admin(email=admin_user["email"], is_admin=True)

    response = client.post(
        "/api/admin/bank/tasks",
        data={
            "text": "2x^2 + 5x - 3 = 0",
            "answer": '["x","3","2x","-1"]',
            "question_type": "factor_grid",
            "difficulty": "B",
            "email": admin_user["email"],
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["question_type"] == "factor_grid"
    assert payload["answer"] == '["2x", "-1", "x", "3"]'


@pytest.mark.asyncio
async def test_admin_bank_import_confirm_dedup_conflict(client, test_db):
    admin_user = await test_db.create_user_by_email("admin.bank.import.confirm.conflict@example.com")
    await test_db.set_admin(email=admin_user["email"], is_admin=True)
    await test_db.create_bank_task(
        text="Confirm duplicate anchor",
        answer="1",
        question_type="input",
        difficulty="B",
        topics=[],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    before_total = (await test_db.get_bank_tasks(limit=100, offset=0))["total"]

    tasks_payload = {
        "text": "Confirm duplicate anchor",
        "answer": "2",
        "question_type": "input",
        "difficulty": "B",
    }
    preview_response = client.post(
        "/api/admin/bank/tasks/import",
        json={"email": admin_user["email"], "mode": "dry_run", "tasks": tasks_payload},
    )
    assert preview_response.status_code == 200
    token = preview_response.json()["preview_token"]

    confirm_response = client.post(
        "/api/admin/bank/tasks/import",
        json={
            "email": admin_user["email"],
            "mode": "confirm",
            "preview_token": token,
            "tasks": tasks_payload,
        },
    )
    assert confirm_response.status_code == 409
    payload = confirm_response.json()
    detail = payload.get("detail")
    if detail is None and isinstance(payload.get("error"), dict):
        detail = payload["error"].get("detail")
    if detail is None:
        detail = payload
    assert detail.get("code") == "SIMILAR_TASKS_FOUND"
    assert isinstance(detail.get("conflicts"), list)
    assert len(detail["conflicts"]) >= 1
    assert detail.get("task_index") == 0
    assert isinstance(detail.get("similar_tasks"), list)
    assert len(detail["similar_tasks"]) >= 1

    after_total = (await test_db.get_bank_tasks(limit=100, offset=0))["total"]
    assert after_total == before_total


@pytest.mark.asyncio
async def test_admin_bank_import_confirm_dedup_force(client, test_db):
    admin_user = await test_db.create_user_by_email("admin.bank.import.confirm.force@example.com")
    await test_db.set_admin(email=admin_user["email"], is_admin=True)
    await test_db.create_bank_task(
        text="Confirm force duplicate",
        answer="1",
        question_type="input",
        difficulty="B",
        topics=[],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    before_total = (await test_db.get_bank_tasks(limit=100, offset=0))["total"]

    tasks_payload = {
        "text": "Confirm force duplicate",
        "answer": "2",
        "question_type": "input",
        "difficulty": "B",
    }
    preview_response = client.post(
        "/api/admin/bank/tasks/import",
        json={"email": admin_user["email"], "mode": "dry_run", "tasks": tasks_payload},
    )
    assert preview_response.status_code == 200
    token = preview_response.json()["preview_token"]

    confirm_response = client.post(
        "/api/admin/bank/tasks/import",
        json={
            "email": admin_user["email"],
            "mode": "confirm",
            "preview_token": token,
            "dedup_confirmed": True,
            "tasks": tasks_payload,
        },
    )
    assert confirm_response.status_code == 200
    payload = confirm_response.json()
    assert payload["mode"] == "confirm"
    assert payload["created_count"] == 1
    assert len(payload["created_ids"]) == 1

    after_total = (await test_db.get_bank_tasks(limit=100, offset=0))["total"]
    assert after_total == before_total + 1


@pytest.mark.asyncio
async def test_admin_bank_import_confirm_payload_mismatch(client, test_db):
    admin_user = await test_db.create_user_by_email("admin.bank.import.confirm.mismatch@example.com")
    await test_db.set_admin(email=admin_user["email"], is_admin=True)

    preview_response = client.post(
        "/api/admin/bank/tasks/import",
        json={
            "email": admin_user["email"],
            "mode": "dry_run",
            "tasks": {"text": "Preview payload", "answer": "1", "question_type": "input", "difficulty": "B"},
        },
    )
    assert preview_response.status_code == 200
    token = preview_response.json()["preview_token"]

    confirm_response = client.post(
        "/api/admin/bank/tasks/import",
        json={
            "email": admin_user["email"],
            "mode": "confirm",
            "preview_token": token,
            "tasks": {"text": "Changed payload", "answer": "1", "question_type": "input", "difficulty": "B"},
        },
    )
    assert confirm_response.status_code == 400
    payload = confirm_response.json()
    detail = payload.get("detail")
    if detail is None and isinstance(payload.get("error"), dict):
        detail = payload["error"].get("detail")
    if detail is None:
        detail = payload
    assert isinstance(detail, dict)
    assert detail.get("code") == "IMPORT_PREVIEW_PAYLOAD_MISMATCH"


@pytest.mark.asyncio
async def test_admin_bank_import_confirm_invalid_token(client, test_db):
    admin_user = await test_db.create_user_by_email("admin.bank.import.confirm.token@example.com")
    await test_db.set_admin(email=admin_user["email"], is_admin=True)

    confirm_response = client.post(
        "/api/admin/bank/tasks/import",
        json={
            "email": admin_user["email"],
            "mode": "confirm",
            "preview_token": "invalid-token",
            "tasks": {"text": "Payload", "answer": "1", "question_type": "input", "difficulty": "B"},
        },
    )
    assert confirm_response.status_code == 400
    payload = confirm_response.json()
    detail = payload.get("detail")
    if detail is None and isinstance(payload.get("error"), dict):
        detail = payload["error"].get("detail")
    if detail is None:
        detail = payload
    assert isinstance(detail, dict)
    assert detail.get("code") == "IMPORT_PREVIEW_TOKEN_INVALID"


@pytest.mark.asyncio
async def test_admin_bank_import_confirm_validation_failure_atomic(client, test_db):
    admin_user = await test_db.create_user_by_email("admin.bank.import.confirm.validation@example.com")
    await test_db.set_admin(email=admin_user["email"], is_admin=True)
    before_total = (await test_db.get_bank_tasks(limit=100, offset=0))["total"]

    tasks_payload = [
        {"text": "Atomic valid", "answer": "10", "question_type": "input", "difficulty": "B"},
        {"text": "Atomic invalid", "answer": "A", "question_type": "mcq", "difficulty": "B"},
    ]
    preview_response = client.post(
        "/api/admin/bank/tasks/import",
        json={"email": admin_user["email"], "mode": "dry_run", "tasks": tasks_payload},
    )
    assert preview_response.status_code == 200
    token = preview_response.json()["preview_token"]

    confirm_response = client.post(
        "/api/admin/bank/tasks/import",
        json={
            "email": admin_user["email"],
            "mode": "confirm",
            "preview_token": token,
            "tasks": tasks_payload,
        },
    )
    assert confirm_response.status_code == 400
    payload = confirm_response.json()
    detail = payload.get("detail")
    if detail is None and isinstance(payload.get("error"), dict):
        detail = payload["error"].get("detail")
    if detail is None:
        detail = payload
    assert detail.get("code") == "IMPORT_VALIDATION_FAILED"
    assert isinstance(detail.get("errors"), list)
    assert any(item.get("index") == 1 for item in detail["errors"])

    after_total = (await test_db.get_bank_tasks(limit=100, offset=0))["total"]
    assert after_total == before_total


@pytest.mark.asyncio
async def test_admin_bank_quality_summary_counts(client, test_db):
    admin_user = await test_db.create_user_by_email("admin.bank.quality.summary@example.com")
    await test_db.set_admin(email=admin_user["email"], is_admin=True)

    module = await test_db.create_module("Quality Module", sort_order=0)
    section = await test_db.create_section(module["id"], "Quality Section", sort_order=0)
    trial_test = await test_db.create_trial_test("Quality Trial", sort_order=0, created_by=admin_user["id"])

    dead_no_topics = await test_db.create_bank_task(
        text="Quality dead no topics",
        answer="1",
        question_type="input",
        difficulty="A",
        topics=[],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    dead_with_topics = await test_db.create_bank_task(
        text="Quality dead with topics",
        answer="2",
        question_type="input",
        difficulty="B",
        topics=["Algebra"],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    used_in_module = await test_db.create_bank_task(
        text="Quality used in module",
        answer="3",
        question_type="input",
        difficulty="B",
        topics=["Geometry"],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    used_in_trial_no_topics = await test_db.create_bank_task(
        text="Quality used in trial no topics",
        answer="4",
        question_type="input",
        difficulty="C",
        topics=[],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    deleted_task = await test_db.create_bank_task(
        text="Quality deleted task",
        answer="5",
        question_type="input",
        difficulty="A",
        topics=[],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    await test_db.soft_delete_bank_task(deleted_task["id"], actor_user_id=admin_user["id"])

    await test_db.create_task_in_section(
        section_id=section["id"],
        text="Placement module",
        answer="3",
        created_by=admin_user["id"],
        bank_task_id=used_in_module["id"],
        sort_order=0,
    )
    await test_db.create_trial_test_task(
        trial_test_id=trial_test["id"],
        text="Placement trial",
        answer="4",
        question_type="input",
        created_by=admin_user["id"],
        bank_task_id=used_in_trial_no_topics["id"],
        sort_order=0,
    )

    response = client.get(
        "/api/admin/bank/quality/summary",
        params={"email": admin_user["email"]},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["active_total"] == 4
    assert payload["dead_total"] == 2
    assert payload["no_topics_total"] == 2
    assert payload["default_similarity_threshold"] == pytest.approx(0.92)
    assert dead_no_topics["id"] > 0
    assert dead_with_topics["id"] > 0


@pytest.mark.asyncio
async def test_admin_bank_quality_dead_list_filters_and_pagination(client, test_db):
    admin_user = await test_db.create_user_by_email("admin.bank.quality.dead@example.com")
    await test_db.set_admin(email=admin_user["email"], is_admin=True)

    module = await test_db.create_module("Quality Dead Module", sort_order=0)
    section = await test_db.create_section(module["id"], "Quality Dead Section", sort_order=0)

    dead_a = await test_db.create_bank_task(
        text="Dead filter item A",
        answer="1",
        question_type="input",
        difficulty="A",
        topics=["TopicA"],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    dead_b = await test_db.create_bank_task(
        text="Dead filter item B",
        answer="2",
        question_type="input",
        difficulty="B",
        topics=["TopicB"],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    used_task = await test_db.create_bank_task(
        text="Dead filter used item",
        answer="3",
        question_type="input",
        difficulty="A",
        topics=["TopicA"],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    await test_db.create_task_in_section(
        section_id=section["id"],
        text="Used placement",
        answer="3",
        created_by=admin_user["id"],
        bank_task_id=used_task["id"],
        sort_order=0,
    )

    filtered_response = client.get(
        "/api/admin/bank/quality/dead",
        params={
            "email": admin_user["email"],
            "search": "Dead filter item",
            "difficulty": "A",
            "limit": 20,
            "offset": 0,
        },
    )
    assert filtered_response.status_code == 200
    filtered_payload = filtered_response.json()
    assert filtered_payload["total"] == 1
    assert len(filtered_payload["items"]) == 1
    assert filtered_payload["items"][0]["id"] == dead_a["id"]
    assert filtered_payload["items"][0]["active_usage_count"] == 0

    page_one_response = client.get(
        "/api/admin/bank/quality/dead",
        params={"email": admin_user["email"], "limit": 1, "offset": 0},
    )
    assert page_one_response.status_code == 200
    page_one_payload = page_one_response.json()
    assert page_one_payload["total"] == 2
    assert len(page_one_payload["items"]) == 1
    assert page_one_payload["has_more"] is True

    page_two_response = client.get(
        "/api/admin/bank/quality/dead",
        params={"email": admin_user["email"], "limit": 1, "offset": 1},
    )
    assert page_two_response.status_code == 200
    page_two_payload = page_two_response.json()
    assert len(page_two_payload["items"]) == 1
    page_ids = {page_one_payload["items"][0]["id"], page_two_payload["items"][0]["id"]}
    assert page_ids == {dead_a["id"], dead_b["id"]}


@pytest.mark.asyncio
async def test_admin_bank_quality_no_topics_only_tasks_without_topics(client, test_db):
    admin_user = await test_db.create_user_by_email("admin.bank.quality.notopics@example.com")
    await test_db.set_admin(email=admin_user["email"], is_admin=True)

    module = await test_db.create_module("Quality NoTopics Module", sort_order=0)
    section = await test_db.create_section(module["id"], "Quality NoTopics Section", sort_order=0)

    no_topics_plain = await test_db.create_bank_task(
        text="NoTopic plain item",
        answer="1",
        question_type="input",
        difficulty="B",
        topics=[],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    no_topics_used = await test_db.create_bank_task(
        text="NoTopic used item",
        answer="2",
        question_type="input",
        difficulty="B",
        topics=[],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    with_topics = await test_db.create_bank_task(
        text="NoTopic should be excluded",
        answer="3",
        question_type="input",
        difficulty="B",
        topics=["Algebra"],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    deleted_no_topics = await test_db.create_bank_task(
        text="NoTopic deleted item",
        answer="4",
        question_type="input",
        difficulty="B",
        topics=[],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    await test_db.soft_delete_bank_task(deleted_no_topics["id"], actor_user_id=admin_user["id"])

    await test_db.create_task_in_section(
        section_id=section["id"],
        text="NoTopic usage placement",
        answer="2",
        created_by=admin_user["id"],
        bank_task_id=no_topics_used["id"],
        sort_order=0,
    )

    response = client.get(
        "/api/admin/bank/quality/no-topics",
        params={
            "email": admin_user["email"],
            "search": "NoTopic",
            "difficulty": "B",
            "limit": 20,
            "offset": 0,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    ids = {item["id"] for item in payload["items"]}
    assert no_topics_plain["id"] in ids
    assert no_topics_used["id"] in ids
    assert with_topics["id"] not in ids
    assert deleted_no_topics["id"] not in ids


@pytest.mark.asyncio
async def test_admin_bank_quality_duplicates_threshold_and_pagination(client, test_db):
    admin_user = await test_db.create_user_by_email("admin.bank.quality.duplicates@example.com")
    await test_db.set_admin(email=admin_user["email"], is_admin=True)

    first_a = await test_db.create_bank_task(
        text="Quality duplicate candidate 12345",
        answer="1",
        question_type="input",
        difficulty="B",
        topics=["TopicD"],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    first_b = await test_db.create_bank_task(
        text="Quality duplicate candidate 12346",
        answer="2",
        question_type="input",
        difficulty="B",
        topics=["TopicD"],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    second_a = await test_db.create_bank_task(
        text="Integral substitution check 2024-A",
        answer="3",
        question_type="input",
        difficulty="A",
        topics=[],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    second_b = await test_db.create_bank_task(
        text="Integral substitution check 2024-B",
        answer="4",
        question_type="input",
        difficulty="A",
        topics=[],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    await test_db.create_bank_task(
        text="Totally unrelated item",
        answer="5",
        question_type="input",
        difficulty="C",
        topics=[],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )

    response = client.get(
        "/api/admin/bank/quality/duplicates",
        params={
            "email": admin_user["email"],
            "threshold": 0.92,
            "limit": 10,
            "offset": 0,
            "question_type": "input",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["threshold"] == pytest.approx(0.92)
    assert payload["total_clusters"] >= 2
    assert payload["total_tasks_in_clusters"] >= 4

    first_pair_cluster_found = False
    for cluster in payload["items"]:
        member_ids = {item["id"] for item in cluster["members"]}
        if {first_a["id"], first_b["id"]}.issubset(member_ids):
            first_pair_cluster_found = True
            break
    assert first_pair_cluster_found is True

    page_one_response = client.get(
        "/api/admin/bank/quality/duplicates",
        params={
            "email": admin_user["email"],
            "threshold": 0.92,
            "limit": 1,
            "offset": 0,
            "question_type": "input",
        },
    )
    assert page_one_response.status_code == 200
    page_one_payload = page_one_response.json()
    assert page_one_payload["total_clusters"] >= 2
    assert len(page_one_payload["items"]) == 1

    page_two_response = client.get(
        "/api/admin/bank/quality/duplicates",
        params={
            "email": admin_user["email"],
            "threshold": 0.92,
            "limit": 1,
            "offset": 1,
            "question_type": "input",
        },
    )
    assert page_two_response.status_code == 200
    page_two_payload = page_two_response.json()
    assert len(page_two_payload["items"]) == 1
    assert page_one_payload["items"][0]["cluster_id"] != page_two_payload["items"][0]["cluster_id"]

    strict_response = client.get(
        "/api/admin/bank/quality/duplicates",
        params={
            "email": admin_user["email"],
            "threshold": 0.99,
            "limit": 10,
            "offset": 0,
            "question_type": "input",
        },
    )
    assert strict_response.status_code == 200
    strict_payload = strict_response.json()
    assert strict_payload["total_clusters"] < payload["total_clusters"]
    assert second_a["id"] > 0
    assert second_b["id"] > 0


@pytest.mark.asyncio
async def test_admin_bank_quality_requires_admin(client, test_db):
    user = await test_db.create_user_by_email("admin.bank.quality.noadmin@example.com")

    response = client.get(
        "/api/admin/bank/quality/summary",
        params={"email": user["email"]},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_admin_bank_audit_import_confirm_logs_once(client, test_db):
    admin_user = await test_db.create_user_by_email("admin.bank.audit.import@example.com")
    await test_db.set_admin(email=admin_user["email"], is_admin=True)

    payload_task = {
        "text": "Audit import task",
        "answer": "11",
        "question_type": "input",
        "difficulty": "B",
    }
    dry_run_response = client.post(
        "/api/admin/bank/tasks/import",
        json={"email": admin_user["email"], "mode": "dry_run", "tasks": payload_task},
    )
    assert dry_run_response.status_code == 200
    preview_token = dry_run_response.json()["preview_token"]

    before_confirm_logs = client.get(
        "/api/admin/bank/audit",
        params={"email": admin_user["email"], "action": "import_confirm"},
    )
    assert before_confirm_logs.status_code == 200
    assert before_confirm_logs.json()["total"] == 0

    confirm_response = client.post(
        "/api/admin/bank/tasks/import",
        json={
            "email": admin_user["email"],
            "mode": "confirm",
            "preview_token": preview_token,
            "tasks": payload_task,
        },
    )
    assert confirm_response.status_code == 200
    confirm_payload = confirm_response.json()
    assert confirm_payload["created_count"] == 1

    after_confirm_logs = client.get(
        "/api/admin/bank/audit",
        params={"email": admin_user["email"], "action": "import_confirm"},
    )
    assert after_confirm_logs.status_code == 200
    logs_payload = after_confirm_logs.json()
    assert logs_payload["total"] == 1
    item = logs_payload["items"][0]
    assert item["action"] == "import_confirm"
    assert item["entity_type"] == "bank_import_batch"
    assert item["entity_id"] is None
    assert item["actor_email"] == admin_user["email"]
    assert item["actor_user_id"] == admin_user["id"]
    assert item["metadata"]["created_count"] == 1


@pytest.mark.asyncio
async def test_admin_bank_audit_version_delete_metadata(client, test_db):
    admin_user = await test_db.create_user_by_email("admin.bank.audit.version.delete@example.com")
    await test_db.set_admin(email=admin_user["email"], is_admin=True)

    create_response = client.post(
        "/api/admin/bank/tasks",
        data={
            "email": admin_user["email"],
            "text": "Audit version delete source",
            "answer": "10",
            "question_type": "input",
            "difficulty": "B",
        },
    )
    assert create_response.status_code == 200
    task_id = int(create_response.json()["id"])

    update_response = client.put(
        f"/api/admin/bank/tasks/{task_id}",
        data={
            "email": admin_user["email"],
            "text": "Audit version delete updated",
            "answer": "20",
            "question_type": "input",
            "expected_current_version": "1",
        },
    )
    assert update_response.status_code == 200

    delete_response = client.delete(
        f"/api/admin/bank/tasks/{task_id}/versions/2",
        params={"email": admin_user["email"]},
    )
    assert delete_response.status_code == 200

    logs_response = client.get(
        "/api/admin/bank/audit",
        params={
            "email": admin_user["email"],
            "action": "version_delete",
            "task_id": task_id,
        },
    )
    assert logs_response.status_code == 200
    payload = logs_response.json()
    assert payload["total"] == 1
    item = payload["items"][0]
    assert item["entity_type"] == "bank_task"
    assert item["entity_id"] == task_id
    assert item["changed_fields"] == ["version_history"]
    assert item["metadata"]["deleted_version_no"] == 2
    assert item["metadata"]["current_version_before"] == 2
    assert item["metadata"]["current_version_after"] == 1
    assert item["metadata"]["was_current_version"] is True


@pytest.mark.asyncio
async def test_admin_bank_audit_rollback_metadata(client, test_db):
    admin_user = await test_db.create_user_by_email("admin.bank.audit.rollback@example.com")
    await test_db.set_admin(email=admin_user["email"], is_admin=True)

    create_response = client.post(
        "/api/admin/bank/tasks",
        data={
            "email": admin_user["email"],
            "text": "Rollback audit v1",
            "answer": "1",
            "question_type": "input",
            "difficulty": "B",
        },
    )
    assert create_response.status_code == 200
    task_id = int(create_response.json()["id"])

    update_response = client.put(
        f"/api/admin/bank/tasks/{task_id}",
        data={
            "email": admin_user["email"],
            "text": "Rollback audit v2",
            "answer": "2",
            "question_type": "input",
            "expected_current_version": "1",
        },
    )
    assert update_response.status_code == 200

    rollback_response = client.post(
        f"/api/admin/bank/tasks/{task_id}/rollback",
        json={
            "email": admin_user["email"],
            "target_version": 1,
            "expected_current_version": 2,
            "reason": "audit-check",
        },
    )
    assert rollback_response.status_code == 200

    logs_response = client.get(
        "/api/admin/bank/audit",
        params={"email": admin_user["email"], "action": "rollback", "task_id": task_id},
    )
    assert logs_response.status_code == 200
    payload = logs_response.json()
    assert payload["total"] == 1
    item = payload["items"][0]
    assert item["metadata"]["target_version"] == 1
    assert item["metadata"]["previous_current_version"] == 2
    assert item["metadata"]["new_current_version"] == 3
    assert item["metadata"]["reason"] == "audit-check"
    assert isinstance(item["changed_fields"], list)
    assert len(item["changed_fields"]) > 0


@pytest.mark.asyncio
async def test_admin_bank_audit_hard_delete_persists_after_task_removal(client, test_db):
    admin_user = await test_db.create_user_by_email("admin.bank.audit.hard.delete@example.com")
    await test_db.set_admin(email=admin_user["email"], is_admin=True)

    create_response = client.post(
        "/api/admin/bank/tasks",
        data={
            "email": admin_user["email"],
            "text": "Hard delete audit task",
            "answer": "A",
            "question_type": "input",
            "difficulty": "B",
        },
    )
    assert create_response.status_code == 200
    task_id = int(create_response.json()["id"])

    to_trash_response = client.delete(
        f"/api/admin/bank/tasks/{task_id}",
        params={"email": admin_user["email"]},
    )
    assert to_trash_response.status_code == 200

    permanent_response = client.delete(
        f"/api/admin/bank/tasks/{task_id}/permanent",
        params={"email": admin_user["email"]},
    )
    assert permanent_response.status_code == 200

    deleted_task = await test_db.get_bank_task_by_id(task_id, include_deleted=True)
    assert deleted_task is None

    logs_response = client.get(
        "/api/admin/bank/audit",
        params={"email": admin_user["email"], "action": "hard_delete", "task_id": task_id},
    )
    assert logs_response.status_code == 200
    payload = logs_response.json()
    assert payload["total"] == 1
    item = payload["items"][0]
    assert item["action"] == "hard_delete"
    assert item["entity_id"] == task_id
    assert item["metadata"]["current_version_before_delete"] >= 1
    assert "text_preview" in item["metadata"]


@pytest.mark.asyncio
async def test_admin_bank_audit_list_filters_and_pagination(client, test_db):
    admin_a = await test_db.create_user_by_email("admin.bank.audit.filter.a@example.com")
    admin_b = await test_db.create_user_by_email("admin.bank.audit.filter.b@example.com")
    await test_db.set_admin(email=admin_a["email"], is_admin=True)
    await test_db.set_admin(email=admin_b["email"], is_admin=True)

    import_task = {"text": "Audit filter import", "answer": "1", "question_type": "input", "difficulty": "B"}
    preview_response = client.post(
        "/api/admin/bank/tasks/import",
        json={"email": admin_a["email"], "mode": "dry_run", "tasks": import_task},
    )
    assert preview_response.status_code == 200
    preview_token = preview_response.json()["preview_token"]
    confirm_response = client.post(
        "/api/admin/bank/tasks/import",
        json={
            "email": admin_a["email"],
            "mode": "confirm",
            "preview_token": preview_token,
            "tasks": import_task,
        },
    )
    assert confirm_response.status_code == 200

    create_a = client.post(
        "/api/admin/bank/tasks",
        data={
            "email": admin_a["email"],
            "text": "Audit filter rollback v1",
            "answer": "1",
            "question_type": "input",
            "difficulty": "B",
        },
    )
    assert create_a.status_code == 200
    task_a_id = int(create_a.json()["id"])
    update_a = client.put(
        f"/api/admin/bank/tasks/{task_a_id}",
        data={
            "email": admin_a["email"],
            "text": "Audit filter rollback v2",
            "answer": "2",
            "question_type": "input",
            "expected_current_version": "1",
        },
    )
    assert update_a.status_code == 200
    rollback_a = client.post(
        f"/api/admin/bank/tasks/{task_a_id}/rollback",
        json={"email": admin_a["email"], "target_version": 1, "expected_current_version": 2},
    )
    assert rollback_a.status_code == 200

    create_b = client.post(
        "/api/admin/bank/tasks",
        data={
            "email": admin_b["email"],
            "text": "Audit filter delete v1",
            "answer": "1",
            "question_type": "input",
            "difficulty": "B",
        },
    )
    assert create_b.status_code == 200
    task_b_id = int(create_b.json()["id"])
    update_b = client.put(
        f"/api/admin/bank/tasks/{task_b_id}",
        data={
            "email": admin_b["email"],
            "text": "Audit filter delete v2",
            "answer": "2",
            "question_type": "input",
            "expected_current_version": "1",
        },
    )
    assert update_b.status_code == 200
    delete_b = client.delete(
        f"/api/admin/bank/tasks/{task_b_id}/versions/2",
        params={"email": admin_b["email"]},
    )
    assert delete_b.status_code == 200

    all_logs = client.get("/api/admin/bank/audit", params={"email": admin_a["email"]})
    assert all_logs.status_code == 200
    all_payload = all_logs.json()
    assert all_payload["total"] >= 3

    rollback_filter = client.get(
        "/api/admin/bank/audit",
        params={"email": admin_a["email"], "action": "rollback"},
    )
    assert rollback_filter.status_code == 200
    rollback_items = rollback_filter.json()["items"]
    assert len(rollback_items) >= 1
    assert all(item["action"] == "rollback" for item in rollback_items)

    task_filter = client.get(
        "/api/admin/bank/audit",
        params={"email": admin_a["email"], "task_id": task_a_id},
    )
    assert task_filter.status_code == 200
    task_items = task_filter.json()["items"]
    assert len(task_items) >= 1
    assert all(item["entity_type"] == "bank_task" and item["entity_id"] == task_a_id for item in task_items)

    actor_filter = client.get(
        "/api/admin/bank/audit",
        params={"email": admin_a["email"], "actor_email": "filter.b@"},
    )
    assert actor_filter.status_code == 200
    actor_items = actor_filter.json()["items"]
    assert len(actor_items) >= 1
    assert all("filter.b@" in item["actor_email"] for item in actor_items)

    page_one = client.get(
        "/api/admin/bank/audit",
        params={"email": admin_a["email"], "limit": 1, "offset": 0},
    )
    page_two = client.get(
        "/api/admin/bank/audit",
        params={"email": admin_a["email"], "limit": 1, "offset": 1},
    )
    assert page_one.status_code == 200
    assert page_two.status_code == 200
    assert len(page_one.json()["items"]) == 1
    assert len(page_two.json()["items"]) == 1
    assert page_one.json()["items"][0]["id"] != page_two.json()["items"][0]["id"]


@pytest.mark.asyncio
async def test_admin_bank_audit_requires_admin(client, test_db):
    user = await test_db.create_user_by_email("admin.bank.audit.nonadmin@example.com")

    response = client.get(
        "/api/admin/bank/audit",
        params={"email": user["email"]},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_admin_bank_export_json_returns_import_compatible_active_tasks(client, test_db):
    admin_user = await test_db.create_user_by_email("admin.bank.export@example.com")
    await test_db.set_admin(email=admin_user["email"], is_admin=True)

    select_answer = '["A","C"]'
    factor_answer = '["2x","-1","x","3"]'

    await test_db.create_bank_task(
        text="Select export task",
        answer=select_answer,
        question_type="select",
        difficulty="A",
        text_scale="lg",
        topics=["Algebra", "Export"],
        options=[
            {"label": "A", "text": "1"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "3"},
            {"label": "D", "text": "4"},
        ],
        subquestions=[
            {"text": "First", "correct": "A"},
            {"text": "Second", "correct": "C"},
        ],
        image_filename="task.png",
        solution_filename="solution.png",
        created_by=admin_user["id"],
    )
    await test_db.create_bank_task(
        text="Factor export task",
        answer=factor_answer,
        question_type="factor_grid",
        difficulty="C",
        topics=["Factor"],
        options=None,
        subquestions=None,
        created_by=admin_user["id"],
    )
    deleted_task = await test_db.create_bank_task(
        text="Deleted export task",
        answer="42",
        question_type="input",
        difficulty="B",
        topics=["Hidden"],
        created_by=admin_user["id"],
    )
    await test_db.soft_delete_bank_task(deleted_task["id"], actor_user_id=admin_user["id"])

    response = client.get(
        "/api/admin/bank/tasks/export",
        params={"email": admin_user["email"]},
    )

    assert response.status_code == 200
    assert "application/json" in response.headers["content-type"]
    assert "attachment;" in response.headers["content-disposition"]
    assert "bank_tasks_export_" in response.headers["content-disposition"]

    payload = response.json()
    assert isinstance(payload, list)
    assert len(payload) == 2
    assert [item["text"] for item in payload] == ["Select export task", "Factor export task"]

    expected_keys = {
        "text",
        "answer",
        "question_type",
        "text_scale",
        "difficulty",
        "topics",
        "options",
        "subquestions",
        "image_filename",
        "solution_filename",
    }

    select_item = payload[0]
    assert set(select_item.keys()) == expected_keys
    assert select_item["answer"] == select_answer
    assert select_item["question_type"] == "select"
    assert select_item["text_scale"] == "lg"
    assert select_item["difficulty"] == "A"
    assert select_item["topics"] == ["Algebra", "Export"]
    assert select_item["options"][0]["label"] == "A"
    assert select_item["subquestions"][0]["correct"] == "A"
    assert select_item["image_filename"] == "task.png"
    assert select_item["solution_filename"] == "solution.png"
    assert "id" not in select_item
    assert "created_at" not in select_item
    assert "updated_at" not in select_item
    assert "deleted_at" not in select_item
    assert "current_version" not in select_item
    assert "active_usage_count" not in select_item
    assert "created_by" not in select_item

    factor_item = payload[1]
    assert factor_item["answer"] == factor_answer
    assert factor_item["question_type"] == "factor_grid"
    assert factor_item["text_scale"] == "md"
    assert factor_item["options"] is None
    assert factor_item["subquestions"] is None


@pytest.mark.asyncio
async def test_admin_bank_export_json_requires_admin(client, test_db):
    user = await test_db.create_user_by_email("admin.bank.export.nonadmin@example.com")

    response = client.get(
        "/api/admin/bank/tasks/export",
        params={"email": user["email"]},
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_admin_bank_audit_not_written_for_failed_operations(client, test_db):
    admin_user = await test_db.create_user_by_email("admin.bank.audit.failed.ops@example.com")
    await test_db.set_admin(email=admin_user["email"], is_admin=True)

    create_one = client.post(
        "/api/admin/bank/tasks",
        data={
            "email": admin_user["email"],
            "text": "Fail delete version task",
            "answer": "1",
            "question_type": "input",
            "difficulty": "B",
        },
    )
    assert create_one.status_code == 200
    task_delete_id = int(create_one.json()["id"])
    failed_delete = client.delete(
        f"/api/admin/bank/tasks/{task_delete_id}/versions/1",
        params={"email": admin_user["email"]},
    )
    assert failed_delete.status_code == 400

    create_two = client.post(
        "/api/admin/bank/tasks",
        data={
            "email": admin_user["email"],
            "text": "Fail rollback task v1",
            "answer": "1",
            "question_type": "input",
            "difficulty": "B",
        },
    )
    assert create_two.status_code == 200
    task_rollback_id = int(create_two.json()["id"])
    update_two = client.put(
        f"/api/admin/bank/tasks/{task_rollback_id}",
        data={
            "email": admin_user["email"],
            "text": "Fail rollback task v2",
            "answer": "2",
            "question_type": "input",
            "expected_current_version": "1",
        },
    )
    assert update_two.status_code == 200
    failed_rollback = client.post(
        f"/api/admin/bank/tasks/{task_rollback_id}/rollback",
        json={
            "email": admin_user["email"],
            "target_version": 1,
            "expected_current_version": 99,
        },
    )
    assert failed_rollback.status_code == 409

    create_three = client.post(
        "/api/admin/bank/tasks",
        data={
            "email": admin_user["email"],
            "text": "Fail hard delete task",
            "answer": "1",
            "question_type": "input",
            "difficulty": "B",
        },
    )
    assert create_three.status_code == 200
    task_hard_delete_id = int(create_three.json()["id"])
    failed_hard_delete = client.delete(
        f"/api/admin/bank/tasks/{task_hard_delete_id}/permanent",
        params={"email": admin_user["email"]},
    )
    assert failed_hard_delete.status_code == 400

    delete_logs = client.get(
        "/api/admin/bank/audit",
        params={"email": admin_user["email"], "action": "version_delete", "task_id": task_delete_id},
    )
    rollback_logs = client.get(
        "/api/admin/bank/audit",
        params={"email": admin_user["email"], "action": "rollback", "task_id": task_rollback_id},
    )
    hard_delete_logs = client.get(
        "/api/admin/bank/audit",
        params={"email": admin_user["email"], "action": "hard_delete", "task_id": task_hard_delete_id},
    )
    assert delete_logs.status_code == 200
    assert rollback_logs.status_code == 200
    assert hard_delete_logs.status_code == 200
    assert delete_logs.json()["total"] == 0
    assert rollback_logs.json()["total"] == 0
    assert hard_delete_logs.json()["total"] == 0


@pytest.mark.asyncio
async def test_admin_bank_update_version_conflict_returns_409(client, test_db):
    """Update endpoint should enforce optimistic lock when expected version mismatches."""
    admin_user = await test_db.create_user_by_email("admin.bank.lock@example.com")
    await test_db.set_admin(email=admin_user["email"], is_admin=True)
    created = client.post(
        "/api/admin/bank/tasks",
        data={
            "email": admin_user["email"],
            "text": "Lock test",
            "answer": "x",
            "question_type": "input",
            "difficulty": "A",
        },
    )
    assert created.status_code == 200
    task_id = created.json()["id"]

    conflict_response = client.put(
        f"/api/admin/bank/tasks/{task_id}",
        data={
            "email": admin_user["email"],
            "text": "Lock test updated",
            "expected_current_version": "99",
        },
    )
    assert conflict_response.status_code == 409
    conflict_json = conflict_response.json()
    detail = conflict_json.get("detail")
    if detail is None and isinstance(conflict_json.get("error"), dict):
        detail = conflict_json["error"].get("detail")
    if detail is None:
        detail = conflict_json
    assert detail["code"] == "VERSION_CONFLICT"
    assert isinstance(detail.get("current_version"), int)


@pytest.mark.asyncio
async def test_admin_mini_lesson_task_create_with_existing_bank_task(client, test_db):
    """Creating mini-lesson task with bank_task_id should only create placement."""
    admin_user = await test_db.create_user_by_email("admin.minilesson.bank@example.com")
    await test_db.set_admin(email=admin_user["email"], is_admin=True)

    module = await test_db.create_module("Mini Module", sort_order=0)
    section = await test_db.create_section(module["id"], "Mini Section", sort_order=0)
    lesson = await test_db.create_lesson(section["id"], lesson_number=1, title="Mini Lesson", sort_order=0)
    mini_lessons = await test_db.get_mini_lessons_by_lesson(lesson["id"])
    assert len(mini_lessons) >= 1
    mini_lesson_id = mini_lessons[0]["id"]

    bank_task = await test_db.create_bank_task(
        text="Bank linked task text",
        answer="B",
        question_type="mcq",
        difficulty="B",
        topics=["TopicOne"],
        options=[
            {"label": "A", "text": "1"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "3"},
            {"label": "D", "text": "4"},
        ],
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    before_total = (await test_db.get_bank_tasks(limit=100, offset=0))["total"]

    response = client.post(
        f"/api/admin/mini-lessons/{mini_lesson_id}/tasks",
        data={
            "email": admin_user["email"],
            "bank_task_id": str(bank_task["id"]),
            "question_type": "mcq",
            "sort_order": "2",
        },
    )
    assert response.status_code == 200
    created = response.json()
    assert created["bank_task_id"] == bank_task["id"]
    assert created["text"] == "Bank linked task text"
    assert created["answer"] == "B"
    assert created["question_type"] == "mcq"
    assert isinstance(created.get("options"), list)

    after_total = (await test_db.get_bank_tasks(limit=100, offset=0))["total"]
    assert after_total == before_total

    list_response = client.get(
        f"/api/admin/mini-lessons/{mini_lesson_id}/tasks",
        params={"email": admin_user["email"]},
    )
    assert list_response.status_code == 200
    listed = list_response.json()
    assert isinstance(listed, list)
    assert len(listed) == 1
    assert listed[0]["bank_task_id"] == bank_task["id"]


@pytest.mark.asyncio
async def test_admin_mini_lesson_task_update_syncs_linked_bank_metadata(client, test_db):
    """Updating mini-lesson task should sync content + bank metadata to linked bank task."""
    admin_user = await test_db.create_user_by_email("admin.minilesson.sync@example.com")
    await test_db.set_admin(email=admin_user["email"], is_admin=True)

    module = await test_db.create_module("Mini Sync Module", sort_order=0)
    section = await test_db.create_section(module["id"], "Mini Sync Section", sort_order=0)
    lesson = await test_db.create_lesson(section["id"], lesson_number=1, title="Mini Sync Lesson", sort_order=0)
    mini_lessons = await test_db.get_mini_lessons_by_lesson(lesson["id"])
    assert len(mini_lessons) >= 1
    mini_lesson_id = mini_lessons[0]["id"]

    bank_task = await test_db.create_bank_task(
        text="Old mini text",
        answer="Old mini answer",
        question_type="input",
        difficulty="B",
        topics=["OldTopic"],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    placement = await test_db.create_task_in_mini_lesson(
        mini_lesson_id=mini_lesson_id,
        text="Old mini text",
        answer="Old mini answer",
        created_by=admin_user["id"],
        question_type="input",
        sort_order=0,
        bank_task_id=bank_task["id"],
    )

    response = client.put(
        f"/api/admin/tasks/{placement['id']}",
        data={
            "email": admin_user["email"],
            "text": "Updated mini text",
            "answer": "Updated mini answer",
            "question_type": "input",
            "bank_difficulty": "C",
            "bank_topics": json.dumps(["UpdatedTopic", "SecondTopic"]),
        },
    )
    assert response.status_code == 200
    assert response.json().get("success") is True

    updated_bank = await test_db.get_bank_task_by_id(bank_task["id"], include_deleted=True)
    assert updated_bank is not None
    assert updated_bank["text"] == "Updated mini text"
    assert updated_bank["answer"] == "Updated mini answer"
    assert updated_bank["difficulty"] == "C"
    assert set(updated_bank["topics"]) == {"UpdatedTopic", "SecondTopic"}


def test_admin_routes_contract_and_no_duplicates(client):
    """Admin route contract remains stable and has no duplicate method+path routes."""
    admin_routes = []
    for route in client.app.routes:
        path = getattr(route, "path", None)
        methods = getattr(route, "methods", None)
        if not isinstance(path, str) or not path.startswith("/api/admin"):
            continue
        if not isinstance(methods, set):
            continue
        for method in methods:
            if method in {"GET", "POST", "PUT", "DELETE"}:
                admin_routes.append((method, path))

    route_set = set(admin_routes)
    expected_routes = [
        ("GET", "/api/admin/check"),
        ("GET", "/api/admin/roles"),
        ("POST", "/api/admin/roles"),
        ("POST", "/api/admin/roles/restore"),
        ("GET", "/api/admin/tasks"),
        ("GET", "/api/admin/trial-tests"),
        ("GET", "/api/admin/bank/tasks"),
        ("GET", "/api/admin/bank/tasks/export"),
        ("GET", "/api/admin/bank/quality/summary"),
        ("GET", "/api/admin/bank/audit"),
        ("POST", "/api/admin/bank/tasks/import"),
        ("POST", "/api/admin/trial-tests/{test_id}/tasks/from-bank"),
        ("PUT", "/api/admin/reports/tasks/{task_id}"),
        ("PUT", "/api/admin/reports/{report_id}/status"),
        ("DELETE", "/api/admin/bank/tasks/{task_id}/permanent"),
        ("GET", "/api/admin/ops/health/summary"),
        ("GET", "/api/admin/ops/health/timeseries"),
        ("GET", "/api/admin/ops/incidents"),
        ("GET", "/api/admin/statistics"),
        ("GET", "/api/admin/onboarding-statistics"),
    ]
    for method, path in expected_routes:
        assert (method, path) in route_set

    duplicates = {}
    for method, path in admin_routes:
        key = (method, path)
        duplicates[key] = duplicates.get(key, 0) + 1
    duplicate_items = [f"{method} {path} x{count}" for (method, path), count in duplicates.items() if count > 1]
    assert not duplicate_items, f"Found duplicate admin routes: {duplicate_items}"


@pytest.mark.asyncio
async def test_admin_statistics_route_returns_ok(client, test_db):
    admin_user = await test_db.create_user_by_email("admin.statistics@example.com")
    await test_db.set_admin_with_role(
        email=admin_user["email"],
        is_admin=True,
        role="reviewer",
    )

    response = client.get(
        "/api/admin/statistics",
        params={"email": admin_user["email"]},
    )
    assert response.status_code == 200
    payload = response.json()
    assert "question_type_stats" in payload
    assert isinstance(payload["question_type_stats"], list)


@pytest.mark.asyncio
async def test_admin_check_returns_role_and_permissions(client, test_db):
    admin_user = await test_db.create_user_by_email("admin.check.role@example.com")
    await test_db.set_admin_with_role(
        email=admin_user["email"],
        is_admin=True,
        role="reviewer",
    )

    response = client.get(
        "/api/admin/check",
        params={"email": admin_user["email"]},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["is_admin"] is True
    assert payload["role"] == "reviewer"
    assert payload["is_super_admin"] is False
    assert "review_manage" in payload["permissions"]


@pytest.mark.asyncio
async def test_admin_set_role_endpoint_success_and_invalid_role(client, test_db, monkeypatch):
    monkeypatch.setenv("ADMIN_SECRET", "test-admin-secret-123456")
    reviewer_admin = await test_db.create_user_by_email("role.audit.viewer@example.com")
    await test_db.set_admin_with_role(
        email=reviewer_admin["email"],
        is_admin=True,
        role="reviewer",
    )

    target_email = "role.assign.target@example.com"
    ok_response = client.post(
        "/api/admin/set-role",
        params={
            "email": target_email,
            "role": "content_editor",
            "secret": "test-admin-secret-123456",
        },
    )
    assert ok_response.status_code == 200
    created_user = await test_db.get_user_by_email(target_email)
    assert created_user is not None
    assert await test_db.is_admin(email=target_email) is True
    assert await test_db.get_admin_role(email=target_email) == "content_editor"

    audit_response = client.get(
        "/api/admin/bank/audit",
        params={
            "email": reviewer_admin["email"],
            "action": "role_change",
            "actor_email": "legacy_secret",
        },
    )
    assert audit_response.status_code == 200
    audit_items = audit_response.json()["items"]
    matching_item = next(
        (
            item
            for item in audit_items
            if item.get("entity_type") == "admin_user"
            and item.get("metadata", {}).get("target_email") == target_email
        ),
        None,
    )
    assert matching_item is not None
    assert matching_item["actor_email"] == "legacy_secret"
    assert matching_item["metadata"]["source"] == "legacy_set_role"
    assert matching_item["metadata"]["to_role"] == "content_editor"

    bad_response = client.post(
        "/api/admin/set-role",
        params={
            "email": target_email,
            "role": "invalid_role",
            "secret": "test-admin-secret-123456",
        },
    )
    assert bad_response.status_code == 400


@pytest.mark.asyncio
async def test_admin_roles_list_requires_super_admin(client, test_db):
    super_admin = await test_db.create_user_by_email("roles.super@example.com")
    reviewer = await test_db.create_user_by_email("roles.reviewer@example.com")
    await test_db.set_admin_with_role(email=super_admin["email"], is_admin=True, role="super_admin")
    await test_db.set_admin_with_role(email=reviewer["email"], is_admin=True, role="reviewer")

    allowed = client.get(
        "/api/admin/roles",
        params={"email": super_admin["email"], "limit": 20, "offset": 0},
    )
    assert allowed.status_code == 200
    allowed_payload = allowed.json()
    assert isinstance(allowed_payload.get("items"), list)
    assert allowed_payload.get("total", 0) >= 2

    role_filtered = client.get(
        "/api/admin/roles",
        params={"email": super_admin["email"], "role": "reviewer", "limit": 20, "offset": 0},
    )
    assert role_filtered.status_code == 200
    role_payload = role_filtered.json()
    assert role_payload["total"] == 1
    assert role_payload["items"][0]["email"] == reviewer["email"]

    forbidden = client.get(
        "/api/admin/roles",
        params={"email": reviewer["email"], "limit": 20, "offset": 0},
    )
    assert forbidden.status_code == 403

    forbidden_post = client.post(
        "/api/admin/roles",
        params={"email": reviewer["email"]},
        json={"target_email": "x@example.com", "role": "content_editor"},
    )
    assert forbidden_post.status_code == 403


@pytest.mark.asyncio
async def test_admin_roles_post_change_noop_autocreate_and_audit(client, test_db):
    super_admin = await test_db.create_user_by_email("roles.write.super@example.com")
    await test_db.set_admin_with_role(email=super_admin["email"], is_admin=True, role="super_admin")

    target_existing = await test_db.create_user_by_email("roles.target.existing@example.com")
    await test_db.set_admin_with_role(email=target_existing["email"], is_admin=True, role="content_editor")

    changed = client.post(
        "/api/admin/roles",
        params={"email": super_admin["email"]},
        json={"target_email": target_existing["email"], "role": "reviewer"},
    )
    assert changed.status_code == 200
    changed_payload = changed.json()
    assert changed_payload["success"] is True
    assert changed_payload["changed"] is True
    assert isinstance(changed_payload.get("audit_id"), int)
    assert changed_payload["target_user"]["previous_role"] == "content_editor"
    assert changed_payload["target_user"]["new_role"] == "reviewer"
    assert await test_db.get_admin_role(email=target_existing["email"]) == "reviewer"

    # no-op change should not create new audit row
    no_change = client.post(
        "/api/admin/roles",
        params={"email": super_admin["email"]},
        json={"target_email": target_existing["email"], "role": "reviewer"},
    )
    assert no_change.status_code == 200
    no_change_payload = no_change.json()
    assert no_change_payload["success"] is True
    assert no_change_payload["changed"] is False
    assert "audit_id" not in no_change_payload

    # auto-create target user
    auto_target_email = "roles.target.new@example.com"
    auto_create = client.post(
        "/api/admin/roles",
        params={"email": super_admin["email"]},
        json={"target_email": auto_target_email, "role": "content_editor"},
    )
    assert auto_create.status_code == 200
    auto_payload = auto_create.json()
    assert auto_payload["success"] is True
    assert auto_payload["changed"] is True
    assert auto_payload["target_user"]["previous_role"] is None
    assert auto_payload["target_user"]["new_role"] == "content_editor"
    assert await test_db.is_admin(email=auto_target_email) is True
    assert await test_db.get_admin_role(email=auto_target_email) == "content_editor"

    audit = client.get(
        "/api/admin/bank/audit",
        params={
            "email": super_admin["email"],
            "action": "role_change",
            "actor_email": super_admin["email"],
        },
    )
    assert audit.status_code == 200
    items = audit.json()["items"]
    assert any(item.get("metadata", {}).get("target_email") == target_existing["email"] for item in items)
    assert any(item.get("metadata", {}).get("target_email") == auto_target_email for item in items)

    # remove admin via v2 flow
    remove_response = client.post(
        "/api/admin/roles",
        params={"email": super_admin["email"]},
        json={"target_email": target_existing["email"], "remove_admin": True},
    )
    assert remove_response.status_code == 200
    remove_payload = remove_response.json()
    assert remove_payload["success"] is True
    assert remove_payload["changed"] is True
    assert remove_payload["target_user"]["new_role"] is None
    assert await test_db.is_admin(email=target_existing["email"]) is False
    assert await test_db.get_admin_role(email=target_existing["email"]) is None

    # cannot remove own admin access
    self_remove = client.post(
        "/api/admin/roles",
        params={"email": super_admin["email"]},
        json={"target_email": super_admin["email"], "remove_admin": True},
    )
    assert self_remove.status_code == 400


@pytest.mark.asyncio
async def test_admin_tasks_put_supports_cms_and_report_legacy_modes(client, test_db):
    owner_editor = await test_db.create_user_by_email("tasks.owner.editor@example.com")
    other_editor = await test_db.create_user_by_email("tasks.other.editor@example.com")
    reviewer = await test_db.create_user_by_email("tasks.reviewer@example.com")
    await test_db.set_admin_with_role(email=owner_editor["email"], is_admin=True, role="content_editor")
    await test_db.set_admin_with_role(email=other_editor["email"], is_admin=True, role="content_editor")
    await test_db.set_admin_with_role(email=reviewer["email"], is_admin=True, role="reviewer")

    module = await test_db.create_module("Update mode module", sort_order=1)
    section = await test_db.create_section(module["id"], "Update mode section", sort_order=1)
    task = await test_db.create_task_in_section(
        section_id=section["id"],
        text="before",
        answer="before",
        created_by=owner_editor["id"],
    )

    # legacy report mode: query email (reviewer) without form email
    legacy_ok = client.put(
        f"/api/admin/tasks/{task['id']}",
        params={"email": reviewer["email"]},
        data={
            "text": "legacy updated",
            "answer": "legacy answer",
            "question_type": "input",
        },
    )
    assert legacy_ok.status_code == 200
    assert legacy_ok.json().get("success") is True

    # form email has priority over query email. This should stay CMS mode and fail owner check.
    form_priority = client.put(
        f"/api/admin/tasks/{task['id']}",
        params={"email": reviewer["email"]},
        data={
            "email": other_editor["email"],
            "text": "cms updated",
            "answer": "cms answer",
            "question_type": "input",
        },
    )
    assert form_priority.status_code == 403

    missing_email = client.put(
        f"/api/admin/tasks/{task['id']}",
        data={
            "text": "x",
            "answer": "y",
            "question_type": "input",
        },
    )
    assert missing_email.status_code == 400
    missing_detail = _extract_http_detail(missing_email.json())
    if isinstance(missing_detail, str):
        assert "email" in missing_detail.lower()


@pytest.mark.asyncio
async def test_admin_report_task_update_explicit_endpoint_permissions(client, test_db):
    owner_editor = await test_db.create_user_by_email("reports.owner.editor@example.com")
    reviewer = await test_db.create_user_by_email("reports.reviewer@example.com")
    await test_db.set_admin_with_role(email=owner_editor["email"], is_admin=True, role="content_editor")
    await test_db.set_admin_with_role(email=reviewer["email"], is_admin=True, role="reviewer")

    module = await test_db.create_module("Report update module", sort_order=1)
    section = await test_db.create_section(module["id"], "Report update section", sort_order=1)
    task = await test_db.create_task_in_section(
        section_id=section["id"],
        text="before",
        answer="before",
        created_by=owner_editor["id"],
    )

    reviewer_ok = client.put(
        f"/api/admin/reports/tasks/{task['id']}",
        params={"email": reviewer["email"]},
        data={
            "text": "reviewer updated",
            "answer": "reviewer answer",
            "question_type": "input",
        },
    )
    assert reviewer_ok.status_code == 200
    assert reviewer_ok.json().get("success") is True

    editor_forbidden = client.put(
        f"/api/admin/reports/tasks/{task['id']}",
        params={"email": owner_editor["email"]},
        data={
            "text": "editor updated",
            "answer": "editor answer",
            "question_type": "input",
        },
    )
    assert editor_forbidden.status_code == 403


@pytest.mark.asyncio
async def test_admin_roles_last_super_guard_on_demote_and_legacy_set_role(client, test_db, monkeypatch):
    monkeypatch.setenv("ADMIN_SECRET", "legacy-guard-secret-123456")

    lone_super = await test_db.create_user_by_email("roles.last.super@example.com")
    await test_db.set_admin_with_role(email=lone_super["email"], is_admin=True, role="super_admin")

    demote = client.post(
        "/api/admin/roles",
        params={"email": lone_super["email"]},
        json={"target_email": lone_super["email"], "role": "reviewer"},
    )
    assert demote.status_code == 409
    demote_detail = _extract_http_detail(demote.json())
    assert demote_detail["code"] == "LAST_SUPER_ADMIN_REQUIRED"

    legacy_demote = client.post(
        "/api/admin/set-role",
        params={
            "email": lone_super["email"],
            "role": "reviewer",
            "secret": "legacy-guard-secret-123456",
        },
    )
    assert legacy_demote.status_code == 409
    legacy_detail = _extract_http_detail(legacy_demote.json())
    assert legacy_detail["code"] == "LAST_SUPER_ADMIN_REQUIRED"

    backup_super = await test_db.create_user_by_email("roles.backup.super@example.com")
    await test_db.set_admin_with_role(email=backup_super["email"], is_admin=True, role="super_admin")

    demote_after_backup = client.post(
        "/api/admin/roles",
        params={"email": backup_super["email"]},
        json={"target_email": lone_super["email"], "role": "reviewer"},
    )
    assert demote_after_backup.status_code == 200
    assert demote_after_backup.json()["changed"] is True


@pytest.mark.asyncio
async def test_admin_roles_restore_from_audit_success(client, test_db):
    super_admin = await test_db.create_user_by_email("roles.restore.super@example.com")
    await test_db.set_admin_with_role(email=super_admin["email"], is_admin=True, role="super_admin")

    target = await test_db.create_user_by_email("roles.restore.target@example.com")
    await test_db.set_admin_with_role(email=target["email"], is_admin=True, role="reviewer")

    changed = client.post(
        "/api/admin/roles",
        params={"email": super_admin["email"]},
        json={"target_email": target["email"], "role": "content_editor"},
    )
    assert changed.status_code == 200

    audit_list = client.get(
        "/api/admin/bank/audit",
        params={
            "email": super_admin["email"],
            "action": "role_change",
            "actor_email": super_admin["email"],
        },
    )
    assert audit_list.status_code == 200
    target_event = next(
        (
            item
            for item in audit_list.json()["items"]
            if item.get("metadata", {}).get("target_email") == target["email"]
        ),
        None,
    )
    assert target_event is not None

    restored = client.post(
        "/api/admin/roles/restore",
        params={"email": super_admin["email"]},
        json={"audit_id": target_event["id"]},
    )
    assert restored.status_code == 200
    restored_payload = restored.json()
    assert restored_payload["success"] is True
    assert restored_payload["changed"] is True
    assert restored_payload["target_user"]["new_role"] == "reviewer"
    assert restored_payload["restored_from_audit_id"] == target_event["id"]
    assert await test_db.get_admin_role(email=target["email"]) == "reviewer"


@pytest.mark.asyncio
async def test_admin_roles_restore_from_audit_conflict(client, test_db):
    super_admin = await test_db.create_user_by_email("roles.restore.conflict.super@example.com")
    await test_db.set_admin_with_role(email=super_admin["email"], is_admin=True, role="super_admin")

    target = await test_db.create_user_by_email("roles.restore.conflict.target@example.com")
    await test_db.set_admin_with_role(email=target["email"], is_admin=True, role="reviewer")

    first_change = client.post(
        "/api/admin/roles",
        params={"email": super_admin["email"]},
        json={"target_email": target["email"], "role": "content_editor"},
    )
    assert first_change.status_code == 200

    second_change = client.post(
        "/api/admin/roles",
        params={"email": super_admin["email"]},
        json={"target_email": target["email"], "role": "super_admin"},
    )
    assert second_change.status_code == 200

    audit_list = client.get(
        "/api/admin/bank/audit",
        params={
            "email": super_admin["email"],
            "action": "role_change",
            "actor_email": super_admin["email"],
        },
    )
    assert audit_list.status_code == 200
    first_event = next(
        (
            item
            for item in reversed(audit_list.json()["items"])
            if item.get("metadata", {}).get("target_email") == target["email"]
            and item.get("metadata", {}).get("to_role") == "content_editor"
        ),
        None,
    )
    assert first_event is not None

    conflict = client.post(
        "/api/admin/roles/restore",
        params={"email": super_admin["email"]},
        json={"audit_id": first_event["id"]},
    )
    assert conflict.status_code == 409
    conflict_detail = _extract_http_detail(conflict.json())
    assert conflict_detail["code"] == "ROLE_RESTORE_CONFLICT"


@pytest.mark.asyncio
async def test_admin_roles_restore_non_super_invalid_id_and_invalid_event(client, test_db):
    super_admin = await test_db.create_user_by_email("roles.restore.guard.super@example.com")
    reviewer = await test_db.create_user_by_email("roles.restore.guard.reviewer@example.com")
    await test_db.set_admin_with_role(email=super_admin["email"], is_admin=True, role="super_admin")
    await test_db.set_admin_with_role(email=reviewer["email"], is_admin=True, role="reviewer")

    forbidden = client.post(
        "/api/admin/roles/restore",
        params={"email": reviewer["email"]},
        json={"audit_id": 1},
    )
    assert forbidden.status_code == 403

    not_found = client.post(
        "/api/admin/roles/restore",
        params={"email": super_admin["email"]},
        json={"audit_id": 999999},
    )
    assert not_found.status_code == 404
    not_found_detail = _extract_http_detail(not_found.json())
    assert not_found_detail["code"] == "ROLE_RESTORE_AUDIT_NOT_FOUND"

    async with aiosqlite.connect(test_db.db_path) as db_conn:
        cursor = await db_conn.execute(
            """
            INSERT INTO admin_audit_logs
            (
                domain, action, entity_type, entity_id,
                actor_user_id, actor_email, summary, changed_fields_json, metadata_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "bank",
                "rollback",
                "bank_task",
                1,
                super_admin["id"],
                super_admin["email"],
                "Not a role event",
                "[]",
                "{}",
            ),
        )
        invalid_audit_id = int(cursor.lastrowid)
        await db_conn.commit()

    invalid_event = client.post(
        "/api/admin/roles/restore",
        params={"email": super_admin["email"]},
        json={"audit_id": invalid_audit_id},
    )
    assert invalid_event.status_code == 400
    invalid_detail = _extract_http_detail(invalid_event.json())
    assert invalid_detail["code"] == "ROLE_RESTORE_INVALID_EVENT"


@pytest.mark.asyncio
async def test_rbac_content_editor_and_reviewer_matrix(client, test_db):
    content_editor = await test_db.create_user_by_email("rbac.editor@example.com")
    reviewer = await test_db.create_user_by_email("rbac.reviewer@example.com")
    await test_db.set_admin_with_role(
        email=content_editor["email"],
        is_admin=True,
        role="content_editor",
    )
    await test_db.set_admin_with_role(
        email=reviewer["email"],
        is_admin=True,
        role="reviewer",
    )

    # content_editor: content endpoint allowed
    content_ok = client.get(
        "/api/admin/modules",
        params={"email": content_editor["email"]},
    )
    assert content_ok.status_code == 200

    # content_editor: review endpoint denied
    content_denied = client.get(
        "/api/admin/reports",
        params={"email": content_editor["email"]},
    )
    assert content_denied.status_code == 403

    # reviewer: review endpoint allowed
    reviewer_ok = client.get(
        "/api/admin/reports",
        params={"email": reviewer["email"]},
    )
    assert reviewer_ok.status_code == 200

    # reviewer: content endpoint denied
    reviewer_denied = client.get(
        "/api/admin/modules",
        params={"email": reviewer["email"]},
    )
    assert reviewer_denied.status_code == 403


@pytest.mark.asyncio
async def test_rbac_super_critical_requires_super_admin(client, test_db):
    content_editor = await test_db.create_user_by_email("rbac.super.block@example.com")
    await test_db.set_admin_with_role(
        email=content_editor["email"],
        is_admin=True,
        role="content_editor",
    )

    # super-critical endpoint should be blocked for content_editor
    forbidden = client.post(
        "/api/admin/tasks/reset-id-counter",
        params={"email": content_editor["email"]},
    )
    assert forbidden.status_code == 403

    super_admin = await test_db.create_user_by_email("rbac.super.ok@example.com")
    await test_db.set_admin_with_role(
        email=super_admin["email"],
        is_admin=True,
        role="super_admin",
    )

    allowed = client.post(
        "/api/admin/tasks/reset-id-counter",
        params={"email": super_admin["email"]},
    )
    assert allowed.status_code == 200


@pytest.mark.asyncio
async def test_legacy_set_admin_assigns_super_admin_role(client, test_db, monkeypatch):
    monkeypatch.setenv("ADMIN_SECRET", "legacy-admin-secret-123456")
    reviewer_admin = await test_db.create_user_by_email("legacy.audit.viewer@example.com")
    await test_db.set_admin_with_role(
        email=reviewer_admin["email"],
        is_admin=True,
        role="reviewer",
    )
    target_email = "legacy.set.admin@example.com"

    response = client.post(
        "/api/admin/set-admin",
        params={
            "email": target_email,
            "secret": "legacy-admin-secret-123456",
        },
    )
    assert response.status_code == 200
    assert await test_db.is_admin(email=target_email) is True
    assert await test_db.get_admin_role(email=target_email) == "super_admin"

    audit_response = client.get(
        "/api/admin/bank/audit",
        params={
            "email": reviewer_admin["email"],
            "action": "role_change",
            "actor_email": "legacy_secret",
        },
    )
    assert audit_response.status_code == 200
    matching_item = next(
        (
            item
            for item in audit_response.json()["items"]
            if item.get("entity_type") == "admin_user"
            and item.get("metadata", {}).get("target_email") == target_email
            and item.get("metadata", {}).get("source") == "legacy_set_admin"
        ),
        None,
    )
    assert matching_item is not None
    assert matching_item.get("metadata", {}).get("to_role") == "super_admin"
