"""Route tests: rating modules."""
import pytest
from models.db_models import LEAGUE_GROUP_SIZE, League


@pytest.mark.asyncio
async def test_get_rating(client, test_db):
    """Test getting rating"""
    # Create users with nicknames
    user1 = await test_db.users.create_user_by_email("user1@example.com")
    user2 = await test_db.users.create_user_by_email("user2@example.com")
    await test_db.users.update_user_nickname("user1@example.com", "User1")
    await test_db.users.update_user_nickname("user2@example.com", "User2")
    
    # Get rating
    response = client.get("/api/rating?limit=10")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert "limit" in data
    assert "offset" in data
    assert len(data["items"]) >= 2
    assert all("email" not in item for item in data["items"])


@pytest.mark.asyncio
async def test_get_rating_with_pagination(client, test_db):
    """Test getting rating with pagination"""
    # Create multiple users
    for i in range(5):
        email = f"user{i}@example.com"
        await test_db.users.create_user_by_email(email)
        await test_db.users.update_user_nickname(email, f"User{i}")
    
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
    user1 = await test_db.users.create_user_by_email("user1@example.com")
    await test_db.users.update_user_nickname("user1@example.com", "User1")
    
    # Get rating for specific league
    response = client.get("/api/rating?limit=10&league=Қола")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    # All items should be in the specified league
    for item in data["items"]:
        assert item["league"] == "Қола"
        assert "email" not in item


@pytest.mark.asyncio
async def test_get_rating_with_league_group_filter(client, test_db):
    for index in range(LEAGUE_GROUP_SIZE + 1):
        email = f"group-rating-{index}@example.com"
        await test_db.users.create_user_by_email(email)
        await test_db.users.update_user_nickname(email, f"GroupUser{index}")

    response = client.get(
        f"/api/rating?limit=20&league={League.KOLA.value}&group=1"
    )

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert len(data["items"]) == 1
    assert data["items"][0]["league"] == League.KOLA.value
    assert data["items"][0]["league_group"] == 1
    assert data["items"][0]["nickname"] == f"GroupUser{LEAGUE_GROUP_SIZE}"
    assert "email" not in data["items"][0]


@pytest.mark.asyncio
async def test_get_modules_map(client, test_db):
    """Test getting modules map"""
    # Create module
    module = await test_db.curriculum.create_module("Test Module", sort_order=1)
    section = await test_db.curriculum.create_section(module["id"], "Test Section", sort_order=1)
    
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
    module = await test_db.curriculum.create_module("Test Module", sort_order=1)
    section = await test_db.curriculum.create_section(module["id"], "Test Section", sort_order=1)
    
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
    module = await test_db.curriculum.create_module("Test Module", sort_order=1)
    section = await test_db.curriculum.create_section(module["id"], "Test Section", sort_order=1)
    
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
    module = await test_db.curriculum.create_module("Test Module", sort_order=1)
    section = await test_db.curriculum.create_section(module["id"], "Test Section", sort_order=1)
    lesson = await test_db.curriculum.create_lesson(
        section["id"], lesson_number=1, title="Test Lesson", sort_order=1
    )
    
    # Get lesson details
    response = client.get(f"/api/lessons/{lesson['id']}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == lesson["id"]
    assert "mini_lessons" in data


@pytest.mark.asyncio
async def test_get_lesson_details_strips_subquestion_answers(client, test_db, test_user):
    module = await test_db.curriculum.create_module("Lesson Leak Module", sort_order=1)
    section = await test_db.curriculum.create_section(module["id"], "Lesson Leak Section", sort_order=1)
    lesson = await test_db.curriculum.create_lesson(
        section["id"], lesson_number=1, title="Lesson Leak", sort_order=1
    )
    mini_lessons = await test_db.curriculum.get_mini_lessons_by_lesson(lesson["id"])
    await test_db.create_task_in_mini_lesson(
        mini_lessons[0]["id"],
        "Composite lesson task",
        "unused",
        test_user["id"],
        subquestions=[
            {
                "text": "Subquestion",
                "answer": "secret",
                "correct": "secret",
                "solution": "Hidden solution",
                "choices": [{"text": "secret", "correct": True}],
            }
        ],
    )

    response = client.get(f"/api/lessons/{lesson['id']}")

    assert response.status_code == 200
    task = response.json()["mini_lessons"][0]["tasks"][0]
    assert task["subquestions"] == [
        {
            "text": "Subquestion",
            "choices": [{"text": "secret"}],
        }
    ]


def test_get_lesson_details_not_found(client):
    """Test getting non-existent lesson"""
    response = client.get("/api/lessons/99999")
    assert response.status_code == 404
