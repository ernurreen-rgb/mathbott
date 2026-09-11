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
    assert "answer" not in data


@pytest.mark.asyncio
async def test_get_task_by_id_strips_question_solution_fields(client, test_db, test_user):
    module = await test_db.curriculum.create_module("Question Leak Module", sort_order=1)
    section = await test_db.curriculum.create_section(module["id"], "Question Leak Section", sort_order=1)
    task = await test_db.create_task_in_section(
        section["id"],
        "Composite task",
        "unused",
        test_user["id"],
        questions=[
            {
                "text": "Part 1",
                "answer": "4",
                "correct": "4",
                "solution": "Add two and two.",
                "choices": [{"text": "4", "correct": True}],
            }
        ],
    )

    response = client.get(f"/api/tasks/{task['id']}")

    assert response.status_code == 200
    assert response.json()["questions"] == [
        {
            "text": "Part 1",
            "choices": [{"text": "4"}],
        }
    ]


@pytest.mark.asyncio
async def test_task_questions_hide_answers_and_award_once(client, test_db, test_user):
    module = await test_db.curriculum.create_module("Question Flow Module", sort_order=1)
    section = await test_db.curriculum.create_section(module["id"], "Question Flow Section", sort_order=1)
    task = await test_db.create_task_in_section(
        section["id"],
        "Two-part task",
        "unused",
        test_user["id"],
        questions=[
            {"text": "First part", "answer": "alpha"},
            {"text": "Second part", "answer": "beta"},
        ],
        bank_difficulty="A",
    )

    list_response = client.get(
        f"/api/tasks/{task['id']}/questions",
        params={"email": test_user["email"]},
    )
    assert list_response.status_code == 200
    assert list_response.json() == [
        {"index": 0, "text": "First part", "completed": False},
        {"index": 1, "text": "Second part", "completed": False},
    ]

    first = client.post(
        f"/api/tasks/{task['id']}/questions/check",
        data={"question_index": 0, "answer": "alpha", "email": test_user["email"]},
    )
    assert first.status_code == 200
    assert first.json()["all_completed"] is False

    second = client.post(
        f"/api/tasks/{task['id']}/questions/check",
        data={"question_index": 1, "answer": "beta", "email": test_user["email"]},
    )
    assert second.status_code == 200
    assert second.json()["all_completed"] is True

    user_after_completion = await test_db.users.get_user_by_email(test_user["email"])
    assert user_after_completion["total_points"] == 10
    assert user_after_completion["total_solved"] == 1

    repeat = client.post(
        f"/api/tasks/{task['id']}/questions/check",
        data={"question_index": 1, "answer": "beta", "email": test_user["email"]},
    )
    assert repeat.status_code == 200
    assert repeat.json()["all_completed"] is True

    user_after_repeat = await test_db.users.get_user_by_email(test_user["email"])
    assert user_after_repeat["total_points"] == 10
    assert user_after_repeat["total_solved"] == 1


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
async def test_check_task_accepts_equivalent_written_numeric_answer(client, test_db, test_user):
    module = await test_db.curriculum.create_module("Numeric Answer Module", sort_order=1)
    section = await test_db.curriculum.create_section(module["id"], "Numeric Answer Section", sort_order=1)
    task = await test_db.create_task_in_section(
        section["id"], "Write one half", r"\frac{1}{2}", test_user["id"]
    )

    response = client.post(
        "/api/task/check",
        json={
            "task_id": task["id"],
            "answer": "0,5",
            "email": test_user["email"],
        },
    )

    assert response.status_code == 200
    assert response.json()["correct"] is True


@pytest.mark.asyncio
async def test_check_task_accepts_equivalent_written_algebraic_answer(client, test_db, test_user):
    module = await test_db.curriculum.create_module("Algebraic Answer Module", sort_order=1)
    section = await test_db.curriculum.create_section(module["id"], "Algebraic Answer Section", sort_order=1)
    task = await test_db.create_task_in_section(
        section["id"], "Factor the expression", "x^2-1", test_user["id"]
    )

    response = client.post(
        "/api/task/check",
        json={
            "task_id": task["id"],
            "answer": "(x-1)(x+1)",
            "email": test_user["email"],
        },
    )

    assert response.status_code == 200
    assert response.json()["correct"] is True


@pytest.mark.asyncio
async def test_check_task_accepts_equivalent_written_solution_set(client, test_db, test_user):
    module = await test_db.curriculum.create_module("Solution Set Module", sort_order=1)
    section = await test_db.curriculum.create_section(module["id"], "Solution Set Section", sort_order=1)
    task = await test_db.create_task_in_section(
        section["id"],
        "Write the solution set",
        r"x\in\mathbb{R},x\ne1",
        test_user["id"],
    )

    response = client.post(
        "/api/task/check",
        json={
            "task_id": task["id"],
            "answer": "x≠1; x∈ℝ",
            "email": test_user["email"],
        },
    )

    assert response.status_code == 200
    assert response.json()["correct"] is True


@pytest.mark.asyncio
async def test_check_task_accepts_configured_alternative_without_exposing_it(client, test_db, test_user):
    module = await test_db.curriculum.create_module("Alternative Answer Module", sort_order=1)
    section = await test_db.curriculum.create_section(module["id"], "Alternative Answer Section", sort_order=1)
    task = await test_db.create_task_in_section(
        section["id"],
        "Write the answer",
        "x=1",
        test_user["id"],
        question_type="input",
        accepted_answers=["бір"],
    )

    public_task = client.get(f"/api/tasks/{task['id']}")
    response = client.post(
        "/api/task/check",
        json={"task_id": task["id"], "answer": "Бір", "email": test_user["email"]},
    )

    assert public_task.status_code == 200
    assert "accepted_answers" not in public_task.json()
    assert response.status_code == 200
    assert response.json()["correct"] is True


@pytest.mark.asyncio
async def test_check_mcq_accepts_written_option_value(client, test_db, test_user):
    """Students can write the answer while legacy MCQ labels remain compatible."""
    module = await test_db.curriculum.create_module("Written MCQ Module", sort_order=1)
    section = await test_db.curriculum.create_section(module["id"], "Written MCQ Section", sort_order=1)
    task = await test_db.create_task_in_section(
        section["id"],
        "Find the value",
        "A",
        test_user["id"],
        question_type="mcq",
        options=[
            {"label": "A", "text": r"\text{-}\frac{16}{25}"},
            {"label": "B", "text": r"\frac{16}{25}"},
            {"label": "C", "text": "1"},
            {"label": "D", "text": "2"},
        ],
    )

    written = client.post(
        "/api/task/check",
        json={
            "task_id": task["id"],
            "answer": r"-\frac{16}{25}",
            "email": test_user["email"],
        },
    )
    assert written.status_code == 200
    assert written.json()["correct"] is True

    equivalent_decimal = client.post(
        "/api/task/check",
        json={
            "task_id": task["id"],
            "answer": "-0.64",
            "email": test_user["email"],
        },
    )
    assert equivalent_decimal.status_code == 200
    assert equivalent_decimal.json()["correct"] is True

    legacy_label = client.post(
        "/api/task/check",
        json={"task_id": task["id"], "answer": "A", "email": test_user["email"]},
    )
    assert legacy_label.status_code == 200
    assert legacy_label.json()["correct"] is True


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
    assert user_after_first["total_solved"] == 1

    second = client.post(
        "/api/task/check",
        json={"task_id": task["id"], "answer": "4", "email": test_user["email"]},
    )
    assert second.status_code == 200
    assert second.json()["correct"] is True

    user_after_second = await test_db.users.get_user_by_email(test_user["email"])
    assert user_after_second["total_points"] == 10
    assert user_after_second["total_solved"] == 1


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
