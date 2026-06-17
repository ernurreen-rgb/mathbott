"""Route tests: tasks."""
import pytest


@pytest.mark.asyncio
async def test_get_task_by_id(client, test_db, test_user):
    """Test getting task by ID"""
    # Create task
    module = await test_db.curriculum.create_module("Test Module", sort_order=1)
    section = await test_db.curriculum.create_section(module["id"], "Test Section", sort_order=1)
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
    module = await test_db.curriculum.create_module("Test Module", sort_order=1)
    section = await test_db.curriculum.create_section(module["id"], "Test Section", sort_order=1)
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
    module = await test_db.curriculum.create_module("Test Module", sort_order=1)
    section = await test_db.curriculum.create_section(module["id"], "Test Section", sort_order=1)
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
    module = await test_db.curriculum.create_module("Factor Grid Module", sort_order=1)
    section = await test_db.curriculum.create_section(module["id"], "Factor Grid Section", sort_order=1)
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
    module = await test_db.curriculum.create_module("Points Module", sort_order=1)
    section = await test_db.curriculum.create_section(module["id"], "Points Section", sort_order=1)
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

    user_after_first = await test_db.users.get_user_by_email(test_user["email"])
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

    user_after_second = await test_db.users.get_user_by_email(test_user["email"])
    assert user_after_second["total_points"] == 10
    assert user_after_second["week_points"] == 10
    assert user_after_second["total_solved"] == 1
    assert user_after_second["week_solved"] == 1


@pytest.mark.asyncio
async def test_check_task_answer_user_not_found(client, test_db, test_user):
    """Test checking answer with non-existent user"""
    # Create task
    module = await test_db.curriculum.create_module("Test Module", sort_order=1)
    section = await test_db.curriculum.create_section(module["id"], "Test Section", sort_order=1)
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
