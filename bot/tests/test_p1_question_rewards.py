"""Invalid legacy-question requests must never complete tasks or award rewards."""
import pytest


@pytest.mark.asyncio
@pytest.mark.parametrize("question_type,options", [
    ("input", None),
    ("mcq", [{"label": "A", "text": "4"}, {"label": "B", "text": "5"}]),
])
async def test_standard_task_cannot_be_completed_through_legacy_questions(
    client, test_db, test_user, question_type, options,
):
    task = await test_db.tasks.create_task(
        text="Solve 2+2", answer="4", created_by=test_user["id"],
        question_type=question_type, options=options,
    )
    response = client.post(f"/api/tasks/{task['id']}/questions/check", data={
        "email": test_user["email"], "question_index": 0, "answer": "WRONG",
    })
    assert response.status_code == 400
    assert not await test_db.progress.check_if_task_all_questions_completed(test_user["id"], task["id"])
    assert await test_db.progress.get_user_task_progress(test_user["id"], task["id"]) is None
    assert await test_db.progress.get_user_task_question_progress(test_user["id"], task["id"]) == {}
    user = await test_db.users.get_user_by_id(test_user["id"])
    assert "total_points" not in user
    assert user["total_solved"] == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("question_index", [-1, 1, 999])
async def test_invalid_question_index_does_not_record_progress(client, test_db, test_user, question_index):
    task = await test_db.tasks.create_task(
        text="Legacy exercise", answer="unused", created_by=test_user["id"],
        options=[{"text": "First question", "answer": "4"}],
    )
    response = client.post(f"/api/tasks/{task['id']}/questions/check", data={
        "email": test_user["email"], "question_index": question_index, "answer": "4",
    })
    assert response.status_code == 400
    assert await test_db.progress.get_user_task_question_progress(test_user["id"], task["id"]) == {}
    assert "total_points" not in (await test_db.users.get_user_by_id(test_user["id"]))
@pytest.mark.asyncio
async def test_deleted_legacy_task_cannot_award_rewards(client, test_db, test_user):
    task = await test_db.tasks.create_task(
        text="Deleted exercise", answer="unused", created_by=test_user["id"],
        options=[{"text": "Question", "answer": "4"}],
    )
    await test_db.tasks.soft_delete_task(task["id"])
    response = client.post(f"/api/tasks/{task['id']}/questions/check", data={
        "email": test_user["email"], "question_index": 0, "answer": "4",
    })
    assert response.status_code == 404
    assert await test_db.progress.get_user_task_progress(test_user["id"], task["id"]) is None
    assert "total_points" not in (await test_db.users.get_user_by_id(test_user["id"]))
@pytest.mark.asyncio
async def test_wrong_legacy_answer_does_not_complete_a_task(client, test_db, test_user):
    task = await test_db.tasks.create_task(
        text="Legacy exercise", answer="unused", created_by=test_user["id"],
        options=[{"text": "Question", "answer": "4"}],
    )
    path = f"/api/tasks/{task['id']}/questions/check"
    wrong = client.post(path, data={"email": test_user["email"], "question_index": 0, "answer": "5"})
    assert wrong.status_code == 200
    assert wrong.json()["correct"] is False
    assert wrong.json()["all_completed"] is False
    assert "total_points" not in (await test_db.users.get_user_by_id(test_user["id"]))
    assert await test_db.progress.get_user_task_progress(test_user["id"], task["id"]) is None
    correct = client.post(path, data={"email": test_user["email"], "question_index": 0, "answer": "4"})
    assert correct.status_code == 200
    assert correct.json()["all_completed"] is True
    assert "total_points" not in (await test_db.users.get_user_by_id(test_user["id"]))