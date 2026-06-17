"""Route tests: users."""
import pytest
import csv
from io import StringIO
import aiosqlite


@pytest.mark.asyncio
async def test_get_user_web(client, test_db):
    """Test getting user web stats"""
    # Create user
    user = await test_db.users.create_user_by_email("testuser@example.com")
    
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
async def test_get_user_web_includes_global_position(client, test_db):
    users = [
        await test_db.users.create_user_by_email("web-rank-1@example.com"),
        await test_db.users.create_user_by_email("web-rank-2@example.com"),
    ]
    await test_db.users.update_user_nickname(users[0]["email"], "WebRank1")
    await test_db.users.update_user_nickname(users[1]["email"], "WebRank2")

    async with aiosqlite.connect(test_db.db_path) as db:
        await db.execute(
            "UPDATE users SET total_points = 200, total_solved = 20 WHERE id = ?",
            (users[0]["id"],),
        )
        await db.execute(
            "UPDATE users SET total_points = 100, total_solved = 10 WHERE id = ?",
            (users[1]["id"],),
        )
        await db.commit()

    response = client.get(f"/api/user/web/{users[1]['email']}")

    assert response.status_code == 200
    assert response.json()["global_position"] == 2


@pytest.mark.asyncio
async def test_get_user_web_auto_create(client, test_db):
    """Test auto-creating user when getting web stats"""
    # Try to get non-existent user (should auto-create)
    response = client.get("/api/user/web/newuser@example.com")
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "newuser@example.com"
    
    # Verify user was created
    user = await test_db.users.get_user_by_email("newuser@example.com")
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
    await test_db.users.update_user_nickname(test_user["email"], "TestUser")
    
    # Get public profile
    response = client.get(f"/api/user/public/{test_user['id']}")
    assert response.status_code == 200
    data = response.json()
    assert data["nickname"] == "TestUser"
    assert "email" not in data  # Should not include email
    assert "is_admin" not in data  # Should not include is_admin


def test_get_public_user_profile_not_found(client):
    """Test getting public profile for non-existent user"""
    response = client.get("/api/user/public/999999")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_public_user_profile_rejects_email_identifier(client, test_user):
    """Public profiles must not be addressable by email."""
    response = client.get(f"/api/user/public/{test_user['email']}")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_user_export_csv_quotes_and_neutralizes_formula_values(client, test_db, test_user):
    await test_db.users.update_user_nickname(test_user["email"], "Nick, With Comma")
    module = await test_db.curriculum.create_module("Export Module", sort_order=1)
    section = await test_db.curriculum.create_section(module["id"], "Export Section", sort_order=1)
    task = await test_db.create_task_in_section(
        section["id"],
        "Export task",
        "42",
        test_user["id"],
    )
    await test_db.record_solution(
        test_user["id"],
        task["id"],
        "=2+2, with comma\nand newline",
        False,
    )

    response = client.get(
        f"/api/export/user/{test_user['email']}",
        params={"format": "csv"},
    )

    assert response.status_code == 200
    rows = list(csv.reader(StringIO(response.text)))
    assert ["Nickname", "Nick, With Comma"] in rows
    assert any(
        row
        and row[0] == str(task["id"])
        and row[1] == "'=2+2, with comma\nand newline"
        for row in rows
    )


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
    user = await test_db.users.get_user_by_email(test_user["email"])
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
