"""All authoring endpoints accept only four or six multiple-choice answers."""
import json
import pytest


@pytest.mark.asyncio
@pytest.mark.parametrize("question_type", ["mcq", "mcq6"])
@pytest.mark.parametrize("count", [3, 4, 5, 6, 7, 8])
async def test_bank_authoring_option_counts(client, test_db, test_user, question_type, count):
    await test_db.users.set_admin(email=test_user["email"], is_admin=True)
    options = [{"label": label, "text": label} for label in "ABCDEFGH"[:count]]
    response = client.post("/api/admin/bank/tasks", data={
        "email": test_user["email"], "text": f"Options {question_type} {count}", "question_type": question_type,
        "difficulty": "B", "answer": "A", "options": json.dumps(options),
    })
    assert response.status_code == (200 if count in (4, 6) else 400)
    if count in (4, 6):
        assert len(response.json()["options"]) == count
    else:
        assert (await test_db.bank_tasks.list_tasks(limit=10))["total"] == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("question_type", ["mcq", "multi_select"])
@pytest.mark.parametrize("count", [3, 4, 5, 6, 7, 8])
async def test_quiz_authoring_option_counts(client, test_db, test_user, question_type, count):
    response = client.post("/api/quizzes", params={"email": test_user["email"]}, json={
        "title": "Options", "questions": [{"question_text": "Choose", "question_type": question_type,
            "options": [{"id": label, "text": label} for label in "ABCDEFGH"[:count]], "correct_answer": "A"}],
    })
    assert response.status_code == (200 if count in (4, 6) else 422)
    if count in (4, 6):
        questions = await test_db.quizzes.get_quiz_questions(response.json()["id"])
        assert len(questions[0]["options"]) == count
    else:
        assert await test_db.quizzes.list_quizzes(created_by=test_user["id"]) == []


@pytest.mark.asyncio
async def test_partial_quiz_update_checks_effective_option_count(client, test_db, test_user):
    quiz = await test_db.quizzes.create_quiz(title="Editable", created_by=test_user["id"])
    options = [{"id": label, "text": label} for label in "ABCD"]
    question = await test_db.quizzes.add_question(quiz["id"], "Choose", "mcq", options, "A")
    path = f"/api/quizzes/{quiz['id']}/questions/{question['id']}"
    invalid = client.put(path, params={"email": test_user["email"]}, json={"options": options + [{"id": "E", "text": "E"}]})
    assert invalid.status_code == 400
    assert len((await test_db.quizzes.get_question_by_id(question["id"]))["options"]) == 4
    valid = client.put(path, params={"email": test_user["email"]}, json={"options": options + [{"id": "E", "text": "E"}, {"id": "F", "text": "F"}], "correct_answer": "F"})
    assert valid.status_code == 200
    assert len(valid.json()["options"]) == 6


@pytest.mark.asyncio
@pytest.mark.parametrize("question_type", ["mcq", "mcq6"])
@pytest.mark.parametrize("option_count", [4, 6])
@pytest.mark.parametrize("correct_count", [1, 2, 3])
async def test_bank_limits_correct_answers_by_option_count(client, test_db, test_user, question_type, option_count, correct_count):
    await test_db.users.set_admin(email=test_user["email"], is_admin=True)
    response = client.post("/api/admin/bank/tasks", data={
        "email": test_user["email"], "text": "Choose the correct answers", "question_type": question_type,
        "difficulty": "B", "answer": json.dumps(list("ABC"[:correct_count])),
        "options": json.dumps([{"label": label, "text": label} for label in "ABCDEF"[:option_count]]),
    })
    accepted = option_count == 6 or correct_count == 1
    assert response.status_code == (200 if accepted else 400)
    assert (await test_db.bank_tasks.list_tasks(limit=10))["total"] == int(accepted)


@pytest.mark.asyncio
async def test_bank_update_cannot_save_multiple_correct_answers_with_four_options(client, test_db, test_user):
    await test_db.users.set_admin(email=test_user["email"], is_admin=True)
    created = client.post("/api/admin/bank/tasks", data={
        "email": test_user["email"], "text": "Editable question", "question_type": "mcq", "difficulty": "B", "answer": "A",
        "options": json.dumps([{"label": label, "text": label} for label in "ABCD"]),
    })
    assert created.status_code == 200
    task_id = created.json()["id"]
    invalid = client.put(f"/api/admin/bank/tasks/{task_id}", data={"email": test_user["email"], "answer": '["A","B"]'})
    assert invalid.status_code == 400
    assert (await test_db.bank_tasks.get_task_by_id(task_id))["answer"] == "A"
    valid = client.put(f"/api/admin/bank/tasks/{task_id}", data={"email": test_user["email"], "answer": "B"})
    assert valid.status_code == 200
    assert (await test_db.bank_tasks.get_task_by_id(task_id))["answer"] == "B"


@pytest.mark.asyncio
@pytest.mark.parametrize("option_count", [4, 6])
async def test_bank_import_enforces_single_correct_answer_for_four_options(client, test_db, test_user, option_count):
    await test_db.users.set_admin(email=test_user["email"], is_admin=True)
    response = client.post("/api/admin/bank/tasks/import", json={
        "email": test_user["email"], "mode": "dry_run", "tasks": {
            "text": "Imported question", "question_type": "mcq", "answer": ["A", "B"], "difficulty": "B",
            "options": [{"label": label, "text": label} for label in "ABCDEF"[:option_count]],
        },
    })
    assert response.status_code == 200
    assert response.json()["summary"]["valid_count"] == int(option_count == 6)
    assert response.json()["summary"]["invalid_count"] == int(option_count == 4)
