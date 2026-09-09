"""Admin-only checks for unsaved task answers."""

import aiosqlite
import pytest


async def _create_admin(test_db, email: str):
    user = await test_db.users.create_user_by_email(email)
    await test_db.users.set_admin(email=user["email"], is_admin=True)
    return user


async def _solution_count(test_db) -> int:
    async with aiosqlite.connect(test_db.db_path) as connection:
        async with connection.execute("SELECT COUNT(*) FROM solutions") as cursor:
            row = await cursor.fetchone()
    return int(row[0] if row else 0)


@pytest.mark.asyncio
async def test_admin_preview_checks_equivalent_algebra_without_persisting(client, test_db):
    admin = await _create_admin(test_db, "admin.preview.algebra@example.com")
    before_count = await _solution_count(test_db)

    response = client.post(
        "/api/admin/task-answer/preview-check",
        params={"email": admin["email"]},
        json={
            "task": {
                "question_type": "input",
                "answer_mode": "written",
                "answer": "x^2-1",
                "options": [],
                "subquestions": [],
            },
            "user_answer": "(x-1)(x+1)",
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "correct": True,
        "question_type": "input",
        "answer_mode": "written",
    }
    assert await _solution_count(test_db) == before_count


@pytest.mark.asyncio
async def test_admin_preview_accepts_configured_alternative_answer(client, test_db):
    admin = await _create_admin(test_db, "admin.preview.alternative@example.com")

    response = client.post(
        "/api/admin/task-answer/preview-check",
        params={"email": admin["email"]},
        json={
            "task": {
                "question_type": "input",
                "answer_mode": "written",
                "answer": "x=1",
                "accepted_answers": ["бір"],
                "options": [],
                "subquestions": [],
            },
            "user_answer": "БІР",
        },
    )

    assert response.status_code == 200
    assert response.json()["correct"] is True


@pytest.mark.asyncio
async def test_admin_preview_checks_written_mcq_by_option_value(client, test_db):
    admin = await _create_admin(test_db, "admin.preview.mcq@example.com")
    task = {
        "question_type": "mcq",
        "answer_mode": "written",
        "answer": "A",
        "options": [
            {"label": "A", "text": r"\frac{1}{2}"},
            {"label": "B", "text": r"\frac{2}{3}"},
            {"label": "C", "text": "1"},
            {"label": "D", "text": "2"},
        ],
        "subquestions": [],
    }

    correct = client.post(
        "/api/admin/task-answer/preview-check",
        params={"email": admin["email"]},
        json={"task": task, "user_answer": "0,5"},
    )
    incorrect = client.post(
        "/api/admin/task-answer/preview-check",
        params={"email": admin["email"]},
        json={"task": task, "user_answer": "0,6"},
    )

    assert correct.status_code == 200
    assert correct.json()["correct"] is True
    assert incorrect.status_code == 200
    assert incorrect.json()["correct"] is False


def test_admin_preview_requires_admin(client, test_user):
    response = client.post(
        "/api/admin/task-answer/preview-check",
        params={"email": test_user["email"]},
        json={
            "task": {
                "question_type": "input",
                "answer_mode": "written",
                "answer": "2",
                "options": [],
                "subquestions": [],
            },
            "user_answer": "2",
        },
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_admin_preview_rejects_incomplete_task_payload(client, test_db):
    admin = await _create_admin(test_db, "admin.preview.invalid@example.com")

    response = client.post(
        "/api/admin/task-answer/preview-check",
        params={"email": admin["email"]},
        json={
            "task": {
                "question_type": "mcq",
                "answer_mode": "written",
                "answer": "A",
                "options": [{"label": "A", "text": "1"}],
            },
            "user_answer": "1",
        },
    )

    assert response.status_code == 400
    assert "requires 4 to 8 options" in str(response.json())
