"""Route tests: admin bank quality audit."""
import pytest


@pytest.mark.asyncio
async def test_admin_bank_quality_summary_counts(client, test_db):
    admin_user = await test_db.users.create_user_by_email("admin.bank.quality.summary@example.com")
    await test_db.users.set_admin(email=admin_user["email"], is_admin=True)

    module = await test_db.curriculum.create_module("Quality Module", sort_order=0)
    section = await test_db.curriculum.create_section(module["id"], "Quality Section", sort_order=0)
    trial_test = await test_db.trial_tests.create_trial_test("Quality Trial", sort_order=0, created_by=admin_user["id"])

    dead_no_topics = await test_db.bank_tasks.create_task(
        text="Quality dead no topics",
        answer="1",
        question_type="input",
        difficulty="A",
        topics=[],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    dead_with_topics = await test_db.bank_tasks.create_task(
        text="Quality dead with topics",
        answer="2",
        question_type="input",
        difficulty="B",
        topics=["Algebra"],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    used_in_module = await test_db.bank_tasks.create_task(
        text="Quality used in module",
        answer="3",
        question_type="input",
        difficulty="B",
        topics=["Geometry"],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    used_in_trial_no_topics = await test_db.bank_tasks.create_task(
        text="Quality used in trial no topics",
        answer="4",
        question_type="input",
        difficulty="C",
        topics=[],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    deleted_task = await test_db.bank_tasks.create_task(
        text="Quality deleted task",
        answer="5",
        question_type="input",
        difficulty="A",
        topics=[],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    await test_db.bank_tasks.soft_delete_task(deleted_task["id"], actor_user_id=admin_user["id"])

    await test_db.create_task_in_section(
        section_id=section["id"],
        text="Placement module",
        answer="3",
        created_by=admin_user["id"],
        bank_task_id=used_in_module["id"],
        sort_order=0,
    )
    await test_db.trial_tests.create_trial_test_task(
        trial_test_id=trial_test["id"],
        text="Placement trial",
        answer="4",
        question_type="input",
        created_by=admin_user["id"],
        bank_task_id=used_in_trial_no_topics["id"],
        sort_order=0,
    )

    response = client.get(
        "/api/admin/bank/quality/summary",
        params={"email": admin_user["email"]},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["active_total"] == 4
    assert payload["dead_total"] == 2
    assert payload["no_topics_total"] == 2
    assert payload["default_similarity_threshold"] == pytest.approx(0.92)
    assert dead_no_topics["id"] > 0
    assert dead_with_topics["id"] > 0


@pytest.mark.asyncio
async def test_admin_bank_quality_dead_list_filters_and_pagination(client, test_db):
    admin_user = await test_db.users.create_user_by_email("admin.bank.quality.dead@example.com")
    await test_db.users.set_admin(email=admin_user["email"], is_admin=True)

    module = await test_db.curriculum.create_module("Quality Dead Module", sort_order=0)
    section = await test_db.curriculum.create_section(module["id"], "Quality Dead Section", sort_order=0)

    dead_a = await test_db.bank_tasks.create_task(
        text="Dead filter item A",
        answer="1",
        question_type="input",
        difficulty="A",
        topics=["TopicA"],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    dead_b = await test_db.bank_tasks.create_task(
        text="Dead filter item B",
        answer="2",
        question_type="input",
        difficulty="B",
        topics=["TopicB"],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    used_task = await test_db.bank_tasks.create_task(
        text="Dead filter used item",
        answer="3",
        question_type="input",
        difficulty="A",
        topics=["TopicA"],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    await test_db.create_task_in_section(
        section_id=section["id"],
        text="Used placement",
        answer="3",
        created_by=admin_user["id"],
        bank_task_id=used_task["id"],
        sort_order=0,
    )

    filtered_response = client.get(
        "/api/admin/bank/quality/dead",
        params={
            "email": admin_user["email"],
            "search": "Dead filter item",
            "difficulty": "A",
            "limit": 20,
            "offset": 0,
        },
    )
    assert filtered_response.status_code == 200
    filtered_payload = filtered_response.json()
    assert filtered_payload["total"] == 1
    assert len(filtered_payload["items"]) == 1
    assert filtered_payload["items"][0]["id"] == dead_a["id"]
    assert filtered_payload["items"][0]["active_usage_count"] == 0

    page_one_response = client.get(
        "/api/admin/bank/quality/dead",
        params={"email": admin_user["email"], "limit": 1, "offset": 0},
    )
    assert page_one_response.status_code == 200
    page_one_payload = page_one_response.json()
    assert page_one_payload["total"] == 2
    assert len(page_one_payload["items"]) == 1
    assert page_one_payload["has_more"] is True

    page_two_response = client.get(
        "/api/admin/bank/quality/dead",
        params={"email": admin_user["email"], "limit": 1, "offset": 1},
    )
    assert page_two_response.status_code == 200
    page_two_payload = page_two_response.json()
    assert len(page_two_payload["items"]) == 1
    page_ids = {page_one_payload["items"][0]["id"], page_two_payload["items"][0]["id"]}
    assert page_ids == {dead_a["id"], dead_b["id"]}


@pytest.mark.asyncio
async def test_admin_bank_quality_no_topics_only_tasks_without_topics(client, test_db):
    admin_user = await test_db.users.create_user_by_email("admin.bank.quality.notopics@example.com")
    await test_db.users.set_admin(email=admin_user["email"], is_admin=True)

    module = await test_db.curriculum.create_module("Quality NoTopics Module", sort_order=0)
    section = await test_db.curriculum.create_section(module["id"], "Quality NoTopics Section", sort_order=0)

    no_topics_plain = await test_db.bank_tasks.create_task(
        text="NoTopic plain item",
        answer="1",
        question_type="input",
        difficulty="B",
        topics=[],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    no_topics_used = await test_db.bank_tasks.create_task(
        text="NoTopic used item",
        answer="2",
        question_type="input",
        difficulty="B",
        topics=[],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    with_topics = await test_db.bank_tasks.create_task(
        text="NoTopic should be excluded",
        answer="3",
        question_type="input",
        difficulty="B",
        topics=["Algebra"],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    deleted_no_topics = await test_db.bank_tasks.create_task(
        text="NoTopic deleted item",
        answer="4",
        question_type="input",
        difficulty="B",
        topics=[],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    await test_db.bank_tasks.soft_delete_task(deleted_no_topics["id"], actor_user_id=admin_user["id"])

    await test_db.create_task_in_section(
        section_id=section["id"],
        text="NoTopic usage placement",
        answer="2",
        created_by=admin_user["id"],
        bank_task_id=no_topics_used["id"],
        sort_order=0,
    )

    response = client.get(
        "/api/admin/bank/quality/no-topics",
        params={
            "email": admin_user["email"],
            "search": "NoTopic",
            "difficulty": "B",
            "limit": 20,
            "offset": 0,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    ids = {item["id"] for item in payload["items"]}
    assert no_topics_plain["id"] in ids
    assert no_topics_used["id"] in ids
    assert with_topics["id"] not in ids
    assert deleted_no_topics["id"] not in ids


@pytest.mark.asyncio
async def test_admin_bank_quality_duplicates_threshold_and_pagination(client, test_db):
    admin_user = await test_db.users.create_user_by_email("admin.bank.quality.duplicates@example.com")
    await test_db.users.set_admin(email=admin_user["email"], is_admin=True)

    first_a = await test_db.bank_tasks.create_task(
        text="Quality duplicate candidate 12345",
        answer="1",
        question_type="input",
        difficulty="B",
        topics=["TopicD"],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    first_b = await test_db.bank_tasks.create_task(
        text="Quality duplicate candidate 12346",
        answer="2",
        question_type="input",
        difficulty="B",
        topics=["TopicD"],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    second_a = await test_db.bank_tasks.create_task(
        text="Integral substitution check 2024-A",
        answer="3",
        question_type="input",
        difficulty="A",
        topics=[],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    second_b = await test_db.bank_tasks.create_task(
        text="Integral substitution check 2024-B",
        answer="4",
        question_type="input",
        difficulty="A",
        topics=[],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    await test_db.bank_tasks.create_task(
        text="Totally unrelated item",
        answer="5",
        question_type="input",
        difficulty="C",
        topics=[],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )

    response = client.get(
        "/api/admin/bank/quality/duplicates",
        params={
            "email": admin_user["email"],
            "threshold": 0.92,
            "limit": 10,
            "offset": 0,
            "question_type": "input",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["threshold"] == pytest.approx(0.92)
    assert payload["total_clusters"] >= 2
    assert payload["total_tasks_in_clusters"] >= 4

    first_pair_cluster_found = False
    for cluster in payload["items"]:
        member_ids = {item["id"] for item in cluster["members"]}
        if {first_a["id"], first_b["id"]}.issubset(member_ids):
            first_pair_cluster_found = True
            break
    assert first_pair_cluster_found is True

    page_one_response = client.get(
        "/api/admin/bank/quality/duplicates",
        params={
            "email": admin_user["email"],
            "threshold": 0.92,
            "limit": 1,
            "offset": 0,
            "question_type": "input",
        },
    )
    assert page_one_response.status_code == 200
    page_one_payload = page_one_response.json()
    assert page_one_payload["total_clusters"] >= 2
    assert len(page_one_payload["items"]) == 1

    page_two_response = client.get(
        "/api/admin/bank/quality/duplicates",
        params={
            "email": admin_user["email"],
            "threshold": 0.92,
            "limit": 1,
            "offset": 1,
            "question_type": "input",
        },
    )
    assert page_two_response.status_code == 200
    page_two_payload = page_two_response.json()
    assert len(page_two_payload["items"]) == 1
    assert page_one_payload["items"][0]["cluster_id"] != page_two_payload["items"][0]["cluster_id"]

    strict_response = client.get(
        "/api/admin/bank/quality/duplicates",
        params={
            "email": admin_user["email"],
            "threshold": 0.99,
            "limit": 10,
            "offset": 0,
            "question_type": "input",
        },
    )
    assert strict_response.status_code == 200
    strict_payload = strict_response.json()
    assert strict_payload["total_clusters"] < payload["total_clusters"]
    assert second_a["id"] > 0
    assert second_b["id"] > 0


@pytest.mark.asyncio
async def test_admin_bank_quality_requires_admin(client, test_db):
    user = await test_db.users.create_user_by_email("admin.bank.quality.noadmin@example.com")

    response = client.get(
        "/api/admin/bank/quality/summary",
        params={"email": user["email"]},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_admin_bank_audit_import_confirm_logs_once(client, test_db):
    admin_user = await test_db.users.create_user_by_email("admin.bank.audit.import@example.com")
    await test_db.users.set_admin(email=admin_user["email"], is_admin=True)

    payload_task = {
        "text": "Audit import task",
        "answer": "11",
        "question_type": "input",
        "difficulty": "B",
    }
    dry_run_response = client.post(
        "/api/admin/bank/tasks/import",
        json={"email": admin_user["email"], "mode": "dry_run", "tasks": payload_task},
    )
    assert dry_run_response.status_code == 200
    preview_token = dry_run_response.json()["preview_token"]

    before_confirm_logs = client.get(
        "/api/admin/bank/audit",
        params={"email": admin_user["email"], "action": "import_confirm"},
    )
    assert before_confirm_logs.status_code == 200
    assert before_confirm_logs.json()["total"] == 0

    confirm_response = client.post(
        "/api/admin/bank/tasks/import",
        json={
            "email": admin_user["email"],
            "mode": "confirm",
            "preview_token": preview_token,
            "tasks": payload_task,
        },
    )
    assert confirm_response.status_code == 200
    confirm_payload = confirm_response.json()
    assert confirm_payload["created_count"] == 1

    after_confirm_logs = client.get(
        "/api/admin/bank/audit",
        params={"email": admin_user["email"], "action": "import_confirm"},
    )
    assert after_confirm_logs.status_code == 200
    logs_payload = after_confirm_logs.json()
    assert logs_payload["total"] == 1
    item = logs_payload["items"][0]
    assert item["action"] == "import_confirm"
    assert item["entity_type"] == "bank_import_batch"
    assert item["entity_id"] is None
    assert item["actor_email"] == admin_user["email"]
    assert item["actor_user_id"] == admin_user["id"]
    assert item["metadata"]["created_count"] == 1


@pytest.mark.asyncio
async def test_admin_bank_audit_version_delete_metadata(client, test_db):
    admin_user = await test_db.users.create_user_by_email("admin.bank.audit.version.delete@example.com")
    await test_db.users.set_admin(email=admin_user["email"], is_admin=True)

    create_response = client.post(
        "/api/admin/bank/tasks",
        data={
            "email": admin_user["email"],
            "text": "Audit version delete source",
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
            "text": "Audit version delete updated",
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

    logs_response = client.get(
        "/api/admin/bank/audit",
        params={
            "email": admin_user["email"],
            "action": "version_delete",
            "task_id": task_id,
        },
    )
    assert logs_response.status_code == 200
    payload = logs_response.json()
    assert payload["total"] == 1
    item = payload["items"][0]
    assert item["entity_type"] == "bank_task"
    assert item["entity_id"] == task_id
    assert item["changed_fields"] == ["version_history"]
    assert item["metadata"]["deleted_version_no"] == 2
    assert item["metadata"]["current_version_before"] == 2
    assert item["metadata"]["current_version_after"] == 1
    assert item["metadata"]["was_current_version"] is True


@pytest.mark.asyncio
async def test_admin_bank_audit_rollback_metadata(client, test_db):
    admin_user = await test_db.users.create_user_by_email("admin.bank.audit.rollback@example.com")
    await test_db.users.set_admin(email=admin_user["email"], is_admin=True)

    create_response = client.post(
        "/api/admin/bank/tasks",
        data={
            "email": admin_user["email"],
            "text": "Rollback audit v1",
            "answer": "1",
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
            "text": "Rollback audit v2",
            "answer": "2",
            "question_type": "input",
            "expected_current_version": "1",
        },
    )
    assert update_response.status_code == 200

    rollback_response = client.post(
        f"/api/admin/bank/tasks/{task_id}/rollback",
        json={
            "email": admin_user["email"],
            "target_version": 1,
            "expected_current_version": 2,
            "reason": "audit-check",
        },
    )
    assert rollback_response.status_code == 200

    logs_response = client.get(
        "/api/admin/bank/audit",
        params={"email": admin_user["email"], "action": "rollback", "task_id": task_id},
    )
    assert logs_response.status_code == 200
    payload = logs_response.json()
    assert payload["total"] == 1
    item = payload["items"][0]
    assert item["metadata"]["target_version"] == 1
    assert item["metadata"]["previous_current_version"] == 2
    assert item["metadata"]["new_current_version"] == 3
    assert item["metadata"]["reason"] == "audit-check"
    assert isinstance(item["changed_fields"], list)
    assert len(item["changed_fields"]) > 0


@pytest.mark.asyncio
async def test_admin_bank_audit_hard_delete_persists_after_task_removal(client, test_db):
    admin_user = await test_db.users.create_user_by_email("admin.bank.audit.hard.delete@example.com")
    await test_db.users.set_admin(email=admin_user["email"], is_admin=True)

    create_response = client.post(
        "/api/admin/bank/tasks",
        data={
            "email": admin_user["email"],
            "text": "Hard delete audit task",
            "answer": "A",
            "question_type": "input",
            "difficulty": "B",
        },
    )
    assert create_response.status_code == 200
    task_id = int(create_response.json()["id"])

    to_trash_response = client.delete(
        f"/api/admin/bank/tasks/{task_id}",
        params={"email": admin_user["email"]},
    )
    assert to_trash_response.status_code == 200

    permanent_response = client.delete(
        f"/api/admin/bank/tasks/{task_id}/permanent",
        params={"email": admin_user["email"]},
    )
    assert permanent_response.status_code == 200

    deleted_task = await test_db.bank_tasks.get_task_by_id(task_id, include_deleted=True)
    assert deleted_task is None

    logs_response = client.get(
        "/api/admin/bank/audit",
        params={"email": admin_user["email"], "action": "hard_delete", "task_id": task_id},
    )
    assert logs_response.status_code == 200
    payload = logs_response.json()
    assert payload["total"] == 1
    item = payload["items"][0]
    assert item["action"] == "hard_delete"
    assert item["entity_id"] == task_id
    assert item["metadata"]["current_version_before_delete"] >= 1
    assert "text_preview" in item["metadata"]


@pytest.mark.asyncio
async def test_admin_bank_audit_list_filters_and_pagination(client, test_db):
    admin_a = await test_db.users.create_user_by_email("admin.bank.audit.filter.a@example.com")
    admin_b = await test_db.users.create_user_by_email("admin.bank.audit.filter.b@example.com")
    await test_db.users.set_admin(email=admin_a["email"], is_admin=True)
    await test_db.users.set_admin(email=admin_b["email"], is_admin=True)

    import_task = {"text": "Audit filter import", "answer": "1", "question_type": "input", "difficulty": "B"}
    preview_response = client.post(
        "/api/admin/bank/tasks/import",
        json={"email": admin_a["email"], "mode": "dry_run", "tasks": import_task},
    )
    assert preview_response.status_code == 200
    preview_token = preview_response.json()["preview_token"]
    confirm_response = client.post(
        "/api/admin/bank/tasks/import",
        json={
            "email": admin_a["email"],
            "mode": "confirm",
            "preview_token": preview_token,
            "tasks": import_task,
        },
    )
    assert confirm_response.status_code == 200

    create_a = client.post(
        "/api/admin/bank/tasks",
        data={
            "email": admin_a["email"],
            "text": "Audit filter rollback v1",
            "answer": "1",
            "question_type": "input",
            "difficulty": "B",
        },
    )
    assert create_a.status_code == 200
    task_a_id = int(create_a.json()["id"])
    update_a = client.put(
        f"/api/admin/bank/tasks/{task_a_id}",
        data={
            "email": admin_a["email"],
            "text": "Audit filter rollback v2",
            "answer": "2",
            "question_type": "input",
            "expected_current_version": "1",
        },
    )
    assert update_a.status_code == 200
    rollback_a = client.post(
        f"/api/admin/bank/tasks/{task_a_id}/rollback",
        json={"email": admin_a["email"], "target_version": 1, "expected_current_version": 2},
    )
    assert rollback_a.status_code == 200

    create_b = client.post(
        "/api/admin/bank/tasks",
        data={
            "email": admin_b["email"],
            "text": "Audit filter delete v1",
            "answer": "1",
            "question_type": "input",
            "difficulty": "B",
        },
    )
    assert create_b.status_code == 200
    task_b_id = int(create_b.json()["id"])
    update_b = client.put(
        f"/api/admin/bank/tasks/{task_b_id}",
        data={
            "email": admin_b["email"],
            "text": "Audit filter delete v2",
            "answer": "2",
            "question_type": "input",
            "expected_current_version": "1",
        },
    )
    assert update_b.status_code == 200
    delete_b = client.delete(
        f"/api/admin/bank/tasks/{task_b_id}/versions/2",
        params={"email": admin_b["email"]},
    )
    assert delete_b.status_code == 200

    all_logs = client.get("/api/admin/bank/audit", params={"email": admin_a["email"]})
    assert all_logs.status_code == 200
    all_payload = all_logs.json()
    assert all_payload["total"] >= 3

    rollback_filter = client.get(
        "/api/admin/bank/audit",
        params={"email": admin_a["email"], "action": "rollback"},
    )
    assert rollback_filter.status_code == 200
    rollback_items = rollback_filter.json()["items"]
    assert len(rollback_items) >= 1
    assert all(item["action"] == "rollback" for item in rollback_items)

    task_filter = client.get(
        "/api/admin/bank/audit",
        params={"email": admin_a["email"], "task_id": task_a_id},
    )
    assert task_filter.status_code == 200
    task_items = task_filter.json()["items"]
    assert len(task_items) >= 1
    assert all(item["entity_type"] == "bank_task" and item["entity_id"] == task_a_id for item in task_items)

    actor_filter = client.get(
        "/api/admin/bank/audit",
        params={"email": admin_a["email"], "actor_email": "filter.b@"},
    )
    assert actor_filter.status_code == 200
    actor_items = actor_filter.json()["items"]
    assert len(actor_items) >= 1
    assert all("filter.b@" in item["actor_email"] for item in actor_items)

    page_one = client.get(
        "/api/admin/bank/audit",
        params={"email": admin_a["email"], "limit": 1, "offset": 0},
    )
    page_two = client.get(
        "/api/admin/bank/audit",
        params={"email": admin_a["email"], "limit": 1, "offset": 1},
    )
    assert page_one.status_code == 200
    assert page_two.status_code == 200
    assert len(page_one.json()["items"]) == 1
    assert len(page_two.json()["items"]) == 1
    assert page_one.json()["items"][0]["id"] != page_two.json()["items"][0]["id"]


@pytest.mark.asyncio
async def test_admin_bank_audit_requires_admin(client, test_db):
    user = await test_db.users.create_user_by_email("admin.bank.audit.nonadmin@example.com")

    response = client.get(
        "/api/admin/bank/audit",
        params={"email": user["email"]},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_admin_bank_export_json_returns_import_compatible_active_tasks(client, test_db):
    admin_user = await test_db.users.create_user_by_email("admin.bank.export@example.com")
    await test_db.users.set_admin(email=admin_user["email"], is_admin=True)

    select_answer = '["A","C"]'
    factor_answer = '["2x","-1","x","3"]'

    await test_db.bank_tasks.create_task(
        text="Select export task",
        answer=select_answer,
        question_type="select",
        difficulty="A",
        text_scale="lg",
        topics=["Algebra", "Export"],
        options=[
            {"label": "A", "text": "1"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "3"},
            {"label": "D", "text": "4"},
        ],
        subquestions=[
            {"text": "First", "correct": "A"},
            {"text": "Second", "correct": "C"},
        ],
        image_filename="task.png",
        solution_filename="solution.png",
        created_by=admin_user["id"],
    )
    await test_db.bank_tasks.create_task(
        text="Factor export task",
        answer=factor_answer,
        question_type="factor_grid",
        difficulty="C",
        topics=["Factor"],
        options=None,
        subquestions=None,
        created_by=admin_user["id"],
    )
    deleted_task = await test_db.bank_tasks.create_task(
        text="Deleted export task",
        answer="42",
        question_type="input",
        difficulty="B",
        topics=["Hidden"],
        created_by=admin_user["id"],
    )
    await test_db.bank_tasks.soft_delete_task(deleted_task["id"], actor_user_id=admin_user["id"])

    response = client.get(
        "/api/admin/bank/tasks/export",
        params={"email": admin_user["email"]},
    )

    assert response.status_code == 200
    assert "application/json" in response.headers["content-type"]
    assert "attachment;" in response.headers["content-disposition"]
    assert "bank_tasks_export_" in response.headers["content-disposition"]

    payload = response.json()
    assert isinstance(payload, list)
    assert len(payload) == 2
    assert [item["text"] for item in payload] == ["Select export task", "Factor export task"]

    expected_keys = {
        "text",
        "answer",
        "question_type",
        "text_scale",
        "difficulty",
        "topics",
        "options",
        "subquestions",
        "image_filename",
        "solution_filename",
    }

    select_item = payload[0]
    assert set(select_item.keys()) == expected_keys
    assert select_item["answer"] == select_answer
    assert select_item["question_type"] == "select"
    assert select_item["text_scale"] == "lg"
    assert select_item["difficulty"] == "A"
    assert select_item["topics"] == ["Algebra", "Export"]
    assert select_item["options"][0]["label"] == "A"
    assert select_item["subquestions"][0]["correct"] == "A"
    assert select_item["image_filename"] == "task.png"
    assert select_item["solution_filename"] == "solution.png"
    assert "id" not in select_item
    assert "created_at" not in select_item
    assert "updated_at" not in select_item
    assert "deleted_at" not in select_item
    assert "current_version" not in select_item
    assert "active_usage_count" not in select_item
    assert "created_by" not in select_item

    factor_item = payload[1]
    assert factor_item["answer"] == factor_answer
    assert factor_item["question_type"] == "factor_grid"
    assert factor_item["text_scale"] == "md"
    assert factor_item["options"] is None
    assert factor_item["subquestions"] is None


@pytest.mark.asyncio
async def test_admin_bank_export_json_requires_admin(client, test_db):
    user = await test_db.users.create_user_by_email("admin.bank.export.nonadmin@example.com")

    response = client.get(
        "/api/admin/bank/tasks/export",
        params={"email": user["email"]},
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_admin_bank_audit_not_written_for_failed_operations(client, test_db):
    admin_user = await test_db.users.create_user_by_email("admin.bank.audit.failed.ops@example.com")
    await test_db.users.set_admin(email=admin_user["email"], is_admin=True)

    create_one = client.post(
        "/api/admin/bank/tasks",
        data={
            "email": admin_user["email"],
            "text": "Fail delete version task",
            "answer": "1",
            "question_type": "input",
            "difficulty": "B",
        },
    )
    assert create_one.status_code == 200
    task_delete_id = int(create_one.json()["id"])
    failed_delete = client.delete(
        f"/api/admin/bank/tasks/{task_delete_id}/versions/1",
        params={"email": admin_user["email"]},
    )
    assert failed_delete.status_code == 400

    create_two = client.post(
        "/api/admin/bank/tasks",
        data={
            "email": admin_user["email"],
            "text": "Fail rollback task v1",
            "answer": "1",
            "question_type": "input",
            "difficulty": "B",
        },
    )
    assert create_two.status_code == 200
    task_rollback_id = int(create_two.json()["id"])
    update_two = client.put(
        f"/api/admin/bank/tasks/{task_rollback_id}",
        data={
            "email": admin_user["email"],
            "text": "Fail rollback task v2",
            "answer": "2",
            "question_type": "input",
            "expected_current_version": "1",
        },
    )
    assert update_two.status_code == 200
    failed_rollback = client.post(
        f"/api/admin/bank/tasks/{task_rollback_id}/rollback",
        json={
            "email": admin_user["email"],
            "target_version": 1,
            "expected_current_version": 99,
        },
    )
    assert failed_rollback.status_code == 409

    create_three = client.post(
        "/api/admin/bank/tasks",
        data={
            "email": admin_user["email"],
            "text": "Fail hard delete task",
            "answer": "1",
            "question_type": "input",
            "difficulty": "B",
        },
    )
    assert create_three.status_code == 200
    task_hard_delete_id = int(create_three.json()["id"])
    failed_hard_delete = client.delete(
        f"/api/admin/bank/tasks/{task_hard_delete_id}/permanent",
        params={"email": admin_user["email"]},
    )
    assert failed_hard_delete.status_code == 400

    delete_logs = client.get(
        "/api/admin/bank/audit",
        params={"email": admin_user["email"], "action": "version_delete", "task_id": task_delete_id},
    )
    rollback_logs = client.get(
        "/api/admin/bank/audit",
        params={"email": admin_user["email"], "action": "rollback", "task_id": task_rollback_id},
    )
    hard_delete_logs = client.get(
        "/api/admin/bank/audit",
        params={"email": admin_user["email"], "action": "hard_delete", "task_id": task_hard_delete_id},
    )
    assert delete_logs.status_code == 200
    assert rollback_logs.status_code == 200
    assert hard_delete_logs.status_code == 200
    assert delete_logs.json()["total"] == 0
    assert rollback_logs.json()["total"] == 0
    assert hard_delete_logs.json()["total"] == 0
