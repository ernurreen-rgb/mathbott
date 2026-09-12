"""Regression coverage for the September review, including the production pool."""
import asyncio
import json
from unittest.mock import AsyncMock

import pytest
from httpx2 import ASGITransport, AsyncClient

from database import Database
from repositories.bank.versions import BankTaskVersionConflictError
from tests.route_helpers import _proxy_headers


async def make_trial(db, user):
    trial = await db.trial_tests.create_trial_test("Review trial", created_by=user["id"])
    task = await db.trial_tests.create_trial_test_task(
        trial_test_id=trial["id"], text="2+2", answer="4", created_by=user["id"],
    )
    session = await db.trial_test_coop.create_session(trial["id"], user["id"])
    await db.trial_test_coop.add_participant(session["id"], user["id"], "red")
    return trial, task, session


async def make_lesson(db):
    module = await db.curriculum.create_module("Review module", sort_order=1)
    section = await db.curriculum.create_section(module["id"], "Review section", sort_order=1)
    lesson = await db.curriculum.create_lesson(section["id"], lesson_number=1, title="Review lesson", sort_order=1)
    await db.curriculum.ensure_default_mini_lessons(lesson["id"])
    minis = await db.curriculum.get_mini_lessons_by_lesson(lesson["id"])
    return module, section, lesson, minis


@pytest.mark.asyncio
async def test_bank_conflicting_edits_and_rollback_are_serialized(test_db, test_user):
    task = await test_db.bank_tasks.create_task(
        text="Original", answer="4", question_type="input", difficulty="B", created_by=test_user["id"],
    )
    outcomes = await asyncio.gather(*[
        test_db.bank_tasks.update_task(task["id"], text=text, expected_current_version=1)
        for text in ("Editor A", "Editor B")
    ], return_exceptions=True)
    assert sum(isinstance(outcome, BankTaskVersionConflictError) for outcome in outcomes) == 1
    current = await test_db.bank_tasks.get_task_by_id(task["id"])
    assert current["current_version"] == 2
    outcomes = await asyncio.gather(
        test_db.bank_tasks.rollback_task(task["id"], 1, expected_current_version=2),
        test_db.bank_tasks.update_task(task["id"], text="Another editor", expected_current_version=2),
        return_exceptions=True,
    )
    assert sum(isinstance(outcome, BankTaskVersionConflictError) for outcome in outcomes) == 1
    assert (await test_db.bank_tasks.get_task_by_id(task["id"]))["current_version"] == 3


@pytest.mark.asyncio
async def test_noop_bank_saves_release_production_pool_connections(test_db, test_user):
    task = await test_db.bank_tasks.create_task(
        text="Original", answer="4", question_type="input", difficulty="B", created_by=test_user["id"],
    )
    pooled = Database(test_db.db_path, use_pool=True)
    pooled.connection_pool.timeout = 0.5
    await pooled.connection_pool.initialize()
    try:
        results = await asyncio.wait_for(asyncio.gather(*[
            pooled.bank_tasks.update_task(task["id"], text="Original", expected_current_version=1)
            for _ in range(20)
        ]), timeout=5)
        assert all(result["current_version"] == 1 for result in results)
        assert pooled.connection_pool.get_stats()["pool_size"] == pooled.connection_pool.get_stats()["created"]
    finally:
        await pooled.connection_pool.close()


@pytest.mark.asyncio
async def test_failed_progress_write_rolls_back_solution_and_reward(client, test_db, test_user):
    _, _, _, minis = await make_lesson(test_db)
    task = await test_db.create_task_in_mini_lesson(minis[0]["id"], "2+2", "4", test_user["id"])
    async with test_db.tasks._connection() as conn:
        await conn.execute("""CREATE TRIGGER reject_progress BEFORE INSERT ON user_progress
                              BEGIN SELECT RAISE(ABORT, 'simulated write failure'); END""")
        await conn.commit()
    response = client.post("/api/task/check", json={"email": test_user["email"], "task_id": task["id"], "answer": "4"})
    assert response.status_code == 503
    async with test_db.tasks._connection() as conn:
        for table in ("solutions", "user_progress", "user_task_rewards"):
            async with conn.execute(f"SELECT COUNT(*) FROM {table} WHERE user_id = ?", (test_user["id"],)) as cursor:
                assert (await cursor.fetchone())[0] == 0
        await conn.execute("DROP TRIGGER reject_progress")
        await conn.commit()
    for _ in range(2):
        assert client.post("/api/task/check", json={"email": test_user["email"], "task_id": task["id"], "answer": "4"}).status_code == 200
    user = await test_db.users.get_user_by_id(test_user["id"])
    assert user["total_solved"] == 1
    assert user["total_points"] == 15
    assert (await test_db.progress.get_user_task_progress(test_user["id"], task["id"]))["status"] == "completed"


@pytest.mark.asyncio
async def test_coop_finish_retries_preserve_original_result_and_allow_solo(client, test_db, test_user):
    trial, task, session = await make_trial(test_db, test_user)
    path = f"/api/trial-tests/{trial['id']}/coop/finish"
    payload = {"email": test_user["email"], "session_id": session["id"], "answers": {str(task["id"]): "0"}}
    async with AsyncClient(transport=ASGITransport(app=client.app), base_url="http://testserver") as http:
        responses = await asyncio.gather(http.post(path, json=payload), http.post(path, json=payload))
    assert [r.status_code for r in responses] == [200, 200]
    assert all(r.json()["score"] == 0 for r in responses)
    payload["answers"][str(task["id"])] = "4"
    assert client.post(path, json=payload).json()["score"] == 0
    saved = await test_db.trial_tests.get_user_trial_test_results(test_user["id"], trial["id"])
    assert len(saved) == 1
    assert (await test_db.users.get_user_by_id(test_user["id"]))["total_points"] == 0
    solo = client.post(f"/api/trial-tests/{trial['id']}/submit", json={"email": test_user["email"], "answers": payload["answers"]})
    assert solo.status_code == 200
    assert solo.json()["score"] == 1


@pytest.mark.asyncio
async def test_coop_http_saves_validate_membership_and_finished_state(client, test_db, test_user):
    trial, task, session = await make_trial(test_db, test_user)
    path = f"/api/trial-tests/coop/session/{session['id']}/answers"
    payload = {"email": test_user["email"], "answers": {str(task["id"]): "4"}}
    assert client.put(path, json=payload).status_code == 200
    state = client.get(f"/api/trial-tests/coop/session/{session['id']}", params={"email": test_user["email"]}).json()
    assert state["answers"]["user"][str(task["id"])] == "4"
    other = await test_db.users.create_user_by_email("outsider@example.com")
    assert client.put(path, json={**payload, "email": other["email"]}).status_code == 403
    assert client.put(path, json={**payload, "answers": {"999999": "4"}}).status_code == 422
    finish = client.post(f"/api/trial-tests/{trial['id']}/coop/finish", json={**payload, "session_id": session["id"]})
    assert finish.status_code == 200
    assert client.put(path, json=payload).status_code == 409


@pytest.mark.asyncio
async def test_coop_http_save_requires_matching_signed_identity(client, test_db, test_user, monkeypatch):
    _, task, session = await make_trial(test_db, test_user)
    path = f"/api/trial-tests/coop/session/{session['id']}/answers"
    secret = "review-test-secret"
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("INTERNAL_PROXY_SHARED_SECRET", secret)
    payload = {"email": test_user["email"], "answers": {str(task["id"]): "4"}}
    assert client.put(path, json=payload).status_code == 401
    body = json.dumps(payload)
    def headers(email):
        return {**_proxy_headers("PUT", path, "", email, secret, body=body, content_type="application/json"),
                "Content-Type": "application/json"}
    assert client.put(path, content=body, headers=headers("different@example.com")).status_code == 403
    assert client.put(path, content=body, headers=headers(test_user["email"])).status_code == 200


@pytest.mark.asyncio
async def test_coop_finish_persists_final_unsynced_answer(client, test_db, test_user):
    trial, task, session = await make_trial(test_db, test_user)
    await test_db.trial_test_coop.save_answers(session["id"], test_user["id"], {task["id"]: "old"})
    response = client.post(f"/api/trial-tests/{trial['id']}/coop/finish", json={
        "email": test_user["email"], "session_id": session["id"], "answers": {str(task["id"]): "4"},
    })
    assert response.status_code == 200
    saved = await test_db.trial_test_coop.list_answers_for_user(session["id"], test_user["id"])
    assert saved[0]["answer"] == "4"


@pytest.mark.asyncio
async def test_progress_agrees_for_empty_partial_and_completed_lessons(client, test_db, test_user):
    module, section, lesson, minis = await make_lesson(test_db)
    async def counts():
        return [await test_db.calculate_module_completion(test_user["id"], module["id"]),
                await test_db.progress.calculate_section_completion(test_user["id"], section["id"]),
                await test_db.calculate_lesson_completion(test_user["id"], lesson["id"])]
    assert all(p["progress"] == 0 and not p["completed"] for p in await counts())
    tasks = [await test_db.create_task_in_mini_lesson(ml["id"], "2+2", "4", test_user["id"]) for ml in minis]
    assert all(p["progress"] == 0 and not p["completed"] for p in await counts())
    for task in tasks:
        await test_db.record_solution(test_user["id"], task["id"], "4", True)
    assert all(p["progress"] == 1 and p["completed"] for p in await counts())
    async with test_db.tasks._connection() as conn:
        await conn.execute("UPDATE tasks SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?", (tasks[0]["id"],))
        await conn.commit()
    assert all(not p["completed"] for p in await counts())


@pytest.mark.asyncio
async def test_lesson_image_and_trial_snapshot_survive_content_edit(client, test_db, test_user):
    _, _, lesson, minis = await make_lesson(test_db)
    task = await test_db.create_task_in_mini_lesson(minis[0]["id"], "2+2", "4", test_user["id"])
    await test_db.bank_tasks.update_task(task["bank_task_id"], image_filename="diagram.png")
    lesson_data = client.get(f"/api/lessons/{lesson['id']}").json()
    assert lesson_data["mini_lessons"][0]["tasks"][0]["image_filename"] == "diagram.png"
    trial, task, _ = await make_trial(test_db, test_user)
    assert client.post(f"/api/trial-tests/{trial['id']}/submit", json={"email": test_user["email"], "answers": {str(task["id"]): "4"}}).status_code == 200
    await test_db.bank_tasks.update_task(task["bank_task_id"], text="3+3", answer="6")
    await test_db.trial_tests.remove_task_from_trial_test(trial["id"], task["id"])
    result = client.get(f"/api/trial-tests/{trial['id']}/results", params={"email": test_user["email"]}).json()[0]
    answer = result["answers"][str(task["id"])]
    assert answer["task"]["text"] == "2+2"
    assert answer["correct_answer"] == "4"
    assert "answer" not in answer["task"]


def test_healthcheck_reports_unavailable_database(client, test_db, monkeypatch):
    monkeypatch.setattr(test_db.users, "get_user_by_email", AsyncMock(side_effect=RuntimeError("DB unavailable")))
    response = client.get("/api/health")
    assert response.status_code == 503
    assert response.json()["database"] == "error"
