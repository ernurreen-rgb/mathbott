"""Rollback restores presentation and content from the selected snapshot."""
import json

import pytest


@pytest.mark.asyncio
@pytest.mark.parametrize("original_scale,current_scale", [
    ("sm", "lg"), ("md", "sm"), ("24", "16:24"), ("16:24", "lg"),
])
async def test_scale_only_rollback_restores_size_and_records_history(client, test_db, original_scale, current_scale):
    admin = await test_db.users.create_user_by_email("rollback.scale@example.com")
    await test_db.users.set_admin(email=admin["email"], is_admin=True)
    created = client.post("/api/admin/bank/tasks", data={
        "email": admin["email"], "text": "Restore display size", "answer": "1",
        "question_type": "input", "text_scale": original_scale,
    })
    assert created.status_code == 200
    task_id = created.json()["id"]
    updated = client.put(f"/api/admin/bank/tasks/{task_id}", data={
        "email": admin["email"], "text_scale": current_scale, "expected_current_version": "1",
    })
    assert updated.status_code == 200
    assert updated.json()["text_scale"] == current_scale
    assert updated.json()["current_version"] == 2

    payload = {"email": admin["email"], "target_version": 1, "expected_current_version": 1}
    assert client.post(f"/api/admin/bank/tasks/{task_id}/rollback", json=payload).status_code == 409
    before = await test_db.bank_tasks.get_task_by_id(task_id)
    assert before["text_scale"] == current_scale
    assert before["current_version"] == 2

    payload.update(expected_current_version=2, reason="restore typography")
    response = client.post(f"/api/admin/bank/tasks/{task_id}/rollback", json=payload)
    assert response.status_code == 200
    assert response.json()["text_scale"] == original_scale
    assert response.json()["current_version"] == 3
    persisted = await test_db.bank_tasks.get_task_by_id(task_id)
    assert persisted["text_scale"] == original_scale
    assert persisted["current_version"] == 3
    version = await test_db.bank_tasks.get_task_version(task_id, 3)
    assert version["event_type"] == "rollback"
    assert version["rollback_from_version"] == 1
    assert version["changed_fields"] == ["text_scale"]
    assert version["snapshot"]["text_scale"] == original_scale
    assert (await test_db.bank_tasks.get_task_version(task_id, 1))["snapshot"]["text_scale"] == original_scale
    assert (await test_db.bank_tasks.get_task_version(task_id, 2))["snapshot"]["text_scale"] == current_scale
    audit = await test_db.bank_tasks.list_admin_audit_logs(action="rollback", task_id=task_id)
    assert audit["total"] == 1
    assert audit["items"][0]["changed_fields"] == ["text_scale"]
    assert audit["items"][0]["metadata"] == {
        "target_version": 1, "previous_current_version": 2, "new_current_version": 3, "reason": "restore typography",
    }

    # A stale editor stays rejected; an unchanged rollback creates no new version.
    assert client.post(f"/api/admin/bank/tasks/{task_id}/rollback", json=payload).status_code == 409
    payload["expected_current_version"] = 3
    unchanged = client.post(f"/api/admin/bank/tasks/{task_id}/rollback", json=payload)
    assert unchanged.status_code == 200
    assert unchanged.json()["current_version"] == 3
    assert (await test_db.bank_tasks.list_task_versions(task_id))["total"] == 3


@pytest.mark.asyncio
@pytest.mark.parametrize("legacy_scale", ["missing", None, ""])
async def test_legacy_snapshot_without_scale_restores_default(test_db, legacy_scale):
    repo = test_db.bank_tasks
    task = await repo.create_task(text="Legacy snapshot", answer="1", question_type="input", difficulty="B")
    await repo.update_task(task["id"], text_scale="lg", expected_current_version=1)
    snapshot = (await repo.get_task_version(task["id"], 1))["snapshot"]
    if legacy_scale == "missing":
        snapshot.pop("text_scale")
    else:
        snapshot["text_scale"] = legacy_scale
    async with repo._write_transaction() as conn:
        await conn.execute(
            "UPDATE bank_task_versions SET snapshot_json = ? WHERE bank_task_id = ? AND version_no = ?",
            (json.dumps(snapshot), task["id"], 1),
        )

    rolled = await repo.rollback_task(task["id"], target_version=1, expected_current_version=2)
    assert rolled["text_scale"] == "md"
    assert rolled["current_version"] == 3
    version = await repo.get_task_version(task["id"], 3)
    assert version["snapshot"]["text_scale"] == "md"
    assert version["changed_fields"] == ["text_scale"]


@pytest.mark.asyncio
async def test_rollback_restores_every_snapshot_content_field(test_db):
    repo = test_db.bank_tasks
    original = {
        "text": "Original content", "answer": "A", "question_type": "mcq", "answer_mode": "written",
        "accepted_answers": ["1/2", "0.5"], "text_scale": "16:24", "difficulty": "A",
        "topics": ["Algebra", "Geometry"],
        "options": [{"label": "A", "text": "1/2"}, {"label": "B", "text": "2"}],
        "subquestions": [{"text": "Original part", "correct": "A"}],
        "image_filename": "original.png", "solution_filename": "original-solution.png",
    }
    task = await repo.create_task(**original)
    initial = await repo.get_task_version(task["id"], 1)
    # New snapshot fields must receive an explicit round-trip fixture too.
    assert set(initial["snapshot"]) == set(original) == set(repo.SNAPSHOT_FIELDS)
    assert initial["snapshot"] == original
    updated = await repo.update_task(
        task["id"], text="Changed content", answer="B", question_type="select", answer_mode="choices",
        accepted_answers=["2"], text_scale="sm", difficulty="C", topics=["Trigonometry"],
        options=[{"label": "A", "text": "0"}, {"label": "B", "text": "2"}],
        subquestions=[{"text": "Changed part", "correct": "B"}],
        image_filename="changed.png", solution_filename="changed-solution.png", expected_current_version=1,
    )
    assert all(updated[field] != original[field] for field in original)

    rolled = await repo.rollback_task(task["id"], target_version=1, expected_current_version=2)
    assert {field: rolled[field] for field in original} == original
    assert rolled["id"] == task["id"]
    assert rolled["created_at"] == task["created_at"]
    assert rolled["current_version"] == 3
    version = await repo.get_task_version(task["id"], 3)
    assert version["snapshot"] == original
    assert set(version["changed_fields"]) == set(original)
