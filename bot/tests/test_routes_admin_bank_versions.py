"""Route tests: admin bank versions."""
import pytest
import json


@pytest.mark.asyncio
async def test_admin_bank_versions_update_and_rollback(client, test_db):
    """Bank task should track versions and support rollback."""
    admin_user = await test_db.users.create_user_by_email("admin.bank.versions@example.com")
    await test_db.users.set_admin(email=admin_user["email"], is_admin=True)

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
    admin_user = await test_db.users.create_user_by_email("admin.bank.versions.delete@example.com")
    await test_db.users.set_admin(email=admin_user["email"], is_admin=True)

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

    task = await test_db.bank_tasks.get_task_by_id(task_id, include_deleted=True)
    assert task is not None
    assert int(task.get("current_version") or 0) == 2


@pytest.mark.asyncio
async def test_admin_bank_delete_current_version_repoints_to_latest(client, test_db):
    """Deleting current version should move current_version to latest remaining history item."""
    admin_user = await test_db.users.create_user_by_email("admin.bank.versions.current@example.com")
    await test_db.users.set_admin(email=admin_user["email"], is_admin=True)

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

    task = await test_db.bank_tasks.get_task_by_id(task_id, include_deleted=True)
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
    admin_user = await test_db.users.create_user_by_email("admin.bank.versions.last@example.com")
    await test_db.users.set_admin(email=admin_user["email"], is_admin=True)

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
    admin_user = await test_db.users.create_user_by_email("admin.bank.versions.missing@example.com")
    await test_db.users.set_admin(email=admin_user["email"], is_admin=True)

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
    admin_user = await test_db.users.create_user_by_email("admin.bank.usage@example.com")
    await test_db.users.set_admin(email=admin_user["email"], is_admin=True)

    module = await test_db.curriculum.create_module("Usage Module", sort_order=1)
    section = await test_db.curriculum.create_section(module["id"], "Usage Section", sort_order=1)
    trial_test = await test_db.trial_tests.create_trial_test("Usage Trial", sort_order=1, created_by=admin_user["id"])

    bank_task = await test_db.bank_tasks.create_task(
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
    await test_db.trial_tests.create_trial_test_task(
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
    admin_user = await test_db.users.create_user_by_email("admin.bank.dedup@example.com")
    await test_db.users.set_admin(email=admin_user["email"], is_admin=True)

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
async def test_admin_bank_update_version_conflict_returns_409(client, test_db):
    """Update endpoint should enforce optimistic lock when expected version mismatches."""
    admin_user = await test_db.users.create_user_by_email("admin.bank.lock@example.com")
    await test_db.users.set_admin(email=admin_user["email"], is_admin=True)
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
