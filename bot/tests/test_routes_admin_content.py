"""Route tests: admin content."""
import pytest
import json
import aiosqlite


@pytest.mark.asyncio
async def test_admin_trial_task_create_auto_links_bank_task(client, test_db):
    """Creating a trial-test task via admin endpoint should auto-create linked bank task."""
    admin_user = await test_db.users.create_user_by_email("admin.autobank@example.com")
    await test_db.users.set_admin(email=admin_user["email"], is_admin=True)
    trial_test = await test_db.trial_tests.create_trial_test("Auto Bank Test", sort_order=0, created_by=admin_user["id"])

    response = client.post(
        f"/api/admin/trial-tests/{trial_test['id']}/tasks/create",
        data={
            "email": admin_user["email"],
            "text": "x^2 + 1 = 0",
            "answer": "i",
            "question_type": "input",
            "sort_order": "0",
            "bank_difficulty": "C",
            "bank_topics": json.dumps(["Algebra", "Complex"]),
        },
    )
    assert response.status_code == 200
    created_task = response.json()
    assert isinstance(created_task.get("bank_task_id"), int)

    bank_task = await test_db.bank_tasks.get_task_by_id(created_task["bank_task_id"], include_deleted=True)
    assert bank_task is not None
    assert bank_task["text"] == "x^2 + 1 = 0"
    assert bank_task["answer"] == "i"
    assert bank_task["difficulty"] == "C"
    assert bank_task["topics"] == ["Algebra", "Complex"]

    list_response = client.get(
        f"/api/admin/trial-tests/{trial_test['id']}/tasks",
        params={"email": admin_user["email"]},
    )
    assert list_response.status_code == 200
    tasks_payload = list_response.json()
    assert isinstance(tasks_payload.get("tasks"), list)
    assert len(tasks_payload["tasks"]) == 1
    listed = tasks_payload["tasks"][0]
    assert listed["answer"] == "i"
    assert listed["bank_task_id"] == created_task["bank_task_id"]
    assert listed["bank_difficulty"] == "C"
    assert listed["bank_topics"] == ["Algebra", "Complex"]


@pytest.mark.asyncio
async def test_admin_trial_task_update_syncs_linked_bank_task(client, test_db):
    """Updating linked trial task should sync values to bank task."""
    admin_user = await test_db.users.create_user_by_email("admin.sync@example.com")
    await test_db.users.set_admin(email=admin_user["email"], is_admin=True)
    trial_test = await test_db.trial_tests.create_trial_test("Sync Test", sort_order=0, created_by=admin_user["id"])
    bank_task = await test_db.bank_tasks.create_task(
        text="Old text",
        answer="A",
        question_type="input",
        difficulty="B",
        topics=["OldTopic"],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    trial_task = await test_db.trial_tests.create_trial_test_task(
        trial_test_id=trial_test["id"],
        text="Old text",
        answer="A",
        question_type="input",
        sort_order=0,
        created_by=admin_user["id"],
        bank_task_id=bank_task["id"],
    )

    response = client.post(
        f"/api/admin/trial-tests/{trial_test['id']}/tasks/{trial_task['id']}/update",
        data={
            "email": admin_user["email"],
            "text": "Updated text",
            "answer": "Updated answer",
            "question_type": "input",
            "bank_difficulty": "A",
            "bank_topics": json.dumps(["NewTopic", "SecondTopic"]),
        },
    )
    assert response.status_code == 200
    assert response.json().get("success") is True

    updated_bank_task = await test_db.bank_tasks.get_task_by_id(bank_task["id"], include_deleted=True)
    assert updated_bank_task is not None
    assert updated_bank_task["text"] == "Updated text"
    assert updated_bank_task["answer"] == "Updated answer"
    assert updated_bank_task["difficulty"] == "A"
    assert updated_bank_task["topics"] == ["NewTopic", "SecondTopic"]


@pytest.mark.asyncio
async def test_admin_bank_list_order_survives_task_update(client, test_db):
    """Updating a bank task should not move it to the top of the active bank list."""
    admin_user = await test_db.users.create_user_by_email("admin.bank.order@example.com")
    await test_db.users.set_admin(email=admin_user["email"], is_admin=True)

    older_task = await test_db.bank_tasks.create_task(
        text="Stable order older task",
        answer="A",
        question_type="input",
        difficulty="B",
        topics=[],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    newer_task = await test_db.bank_tasks.create_task(
        text="Stable order newer task",
        answer="B",
        question_type="input",
        difficulty="B",
        topics=[],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )

    async with aiosqlite.connect(test_db.db_path) as db:
        await db.execute(
            "UPDATE bank_tasks SET created_at = ?, updated_at = ? WHERE id = ?",
            ("2026-01-01 00:00:01", "2026-01-01 00:00:01", older_task["id"]),
        )
        await db.execute(
            "UPDATE bank_tasks SET created_at = ?, updated_at = ? WHERE id = ?",
            ("2026-01-01 00:00:02", "2026-01-01 00:00:02", newer_task["id"]),
        )
        await db.commit()

    update_response = client.put(
        f"/api/admin/bank/tasks/{older_task['id']}",
        data={
            "email": admin_user["email"],
            "text": "Stable order older task edited",
            "expected_current_version": "1",
        },
    )
    assert update_response.status_code == 200

    list_response = client.get(
        "/api/admin/bank/tasks",
        params={"email": admin_user["email"], "limit": 10, "offset": 0},
    )
    assert list_response.status_code == 200
    listed_ids = [item["id"] for item in list_response.json()["items"]]
    visible_pair = [task_id for task_id in listed_ids if task_id in {older_task["id"], newer_task["id"]}]
    assert visible_pair == [newer_task["id"], older_task["id"]]


@pytest.mark.asyncio
async def test_admin_trial_task_update_does_not_create_bank_for_legacy_unlinked(client, test_db):
    """Legacy unlinked trial task should not create new bank task on update."""
    admin_user = await test_db.users.create_user_by_email("admin.legacy@example.com")
    await test_db.users.set_admin(email=admin_user["email"], is_admin=True)
    trial_test = await test_db.trial_tests.create_trial_test("Legacy Test", sort_order=0, created_by=admin_user["id"])

    # Create a true legacy unlinked placement row (bank_task_id=NULL) bypassing modern helper.
    async with aiosqlite.connect(test_db.db_path) as db:
        await db.execute(
            """
            INSERT INTO trial_test_tasks (trial_test_id, bank_task_id, sort_order, created_by)
            VALUES (?, NULL, ?, ?)
            """,
            (trial_test["id"], 0, admin_user["id"]),
        )
        await db.commit()
        async with db.execute("SELECT id FROM trial_test_tasks ORDER BY id DESC LIMIT 1") as cursor:
            row = await cursor.fetchone()
            trial_task_id = int(row[0]) if row else None

    assert trial_task_id is not None

    before = await test_db.bank_tasks.list_tasks(limit=50, offset=0)
    before_total = before["total"]

    response = client.post(
        f"/api/admin/trial-tests/{trial_test['id']}/tasks/{trial_task_id}/update",
        data={
            "email": admin_user["email"],
            "text": "Legacy task updated",
            "answer": "84",
            "question_type": "input",
            "bank_difficulty": "C",
            "bank_topics": json.dumps(["ShouldNotPersist"]),
        },
    )
    assert response.status_code == 200
    assert response.json().get("success") is True

    after = await test_db.bank_tasks.list_tasks(limit=50, offset=0)
    assert after["total"] == before_total


@pytest.mark.asyncio
async def test_admin_trial_slot_upsert_with_existing_bank_task(client, test_db):
    """Slot upsert with bank_task_id should create/update only one placement in that slot."""
    admin_user = await test_db.users.create_user_by_email("admin.slot.bank@example.com")
    await test_db.users.set_admin(email=admin_user["email"], is_admin=True)
    assert await test_db.users.is_admin(email=admin_user["email"]) is True
    trial_test = await test_db.trial_tests.create_trial_test("Slot Test", sort_order=0, created_by=admin_user["id"])

    bank_task_a = await test_db.bank_tasks.create_task(
        text="Bank A",
        answer="A",
        question_type="mcq",
        difficulty="B",
        topics=["TopicA"],
        options=[
            {"label": "A", "text": "1"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "3"},
            {"label": "D", "text": "4"},
        ],
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    bank_task_b = await test_db.bank_tasks.create_task(
        text="Bank B",
        answer="B",
        question_type="mcq",
        difficulty="C",
        topics=["TopicB"],
        options=[
            {"label": "A", "text": "10"},
            {"label": "B", "text": "20"},
            {"label": "C", "text": "30"},
            {"label": "D", "text": "40"},
        ],
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )

    create_response = client.put(
        f"/api/admin/trial-tests/{trial_test['id']}/slots/3",
        json={"email": admin_user["email"], "bank_task_id": bank_task_a["id"]},
    )
    assert create_response.status_code == 200
    created = create_response.json()
    assert created["sort_order"] == 2
    assert created["bank_task_id"] == bank_task_a["id"]
    assert created["text"] == "Bank A"

    replace_response = client.put(
        f"/api/admin/trial-tests/{trial_test['id']}/slots/3",
        json={"email": admin_user["email"], "bank_task_id": bank_task_b["id"]},
    )
    assert replace_response.status_code == 200
    replaced = replace_response.json()
    assert replaced["sort_order"] == 2
    assert replaced["bank_task_id"] == bank_task_b["id"]
    assert replaced["text"] == "Bank B"

    list_response = client.get(
        f"/api/admin/trial-tests/{trial_test['id']}/tasks",
        params={"email": admin_user["email"]},
    )
    assert list_response.status_code == 200
    payload = list_response.json()
    assert payload["expected_tasks_count"] == 40
    assert len(payload["tasks"]) == 1
    assert payload["tasks"][0]["sort_order"] == 2
    assert payload["tasks"][0]["bank_task_id"] == bank_task_b["id"]


@pytest.mark.asyncio
async def test_admin_trial_slot_upsert_inline_creates_bank_task(client, test_db):
    """Inline slot upsert should create bank task and link placement to it."""
    admin_user = await test_db.users.create_user_by_email("admin.slot.inline@example.com")
    await test_db.users.set_admin(email=admin_user["email"], is_admin=True)
    trial_test = await test_db.trial_tests.create_trial_test("Inline Slot Test", sort_order=0, created_by=admin_user["id"])

    before = await test_db.bank_tasks.list_tasks(limit=100, offset=0)

    response = client.put(
        f"/api/admin/trial-tests/{trial_test['id']}/slots/1",
        json={
            "email": admin_user["email"],
            "text": "Inline slot text",
            "answer": "C",
            "question_type": "mcq",
            "options": [
                {"label": "A", "text": "a"},
                {"label": "B", "text": "b"},
                {"label": "C", "text": "c"},
                {"label": "D", "text": "d"},
            ],
            "bank_difficulty": "A",
            "bank_topics": ["InlineTopic", "SecondTopic"],
        },
    )
    assert response.status_code == 200
    created = response.json()
    assert isinstance(created.get("bank_task_id"), int)
    assert created["sort_order"] == 0
    assert created["text"] == "Inline slot text"
    assert created["bank_difficulty"] == "A"
    assert created["bank_topics"] == ["InlineTopic", "SecondTopic"]

    after = await test_db.bank_tasks.list_tasks(limit=100, offset=0)
    assert after["total"] == before["total"] + 1
    created_bank = await test_db.bank_tasks.get_task_by_id(created["bank_task_id"], include_deleted=True)
    assert created_bank is not None
    assert created_bank["text"] == "Inline slot text"
    assert created_bank["difficulty"] == "A"
    assert created_bank["topics"] == ["InlineTopic", "SecondTopic"]


@pytest.mark.asyncio
async def test_admin_trial_slot_clear_soft_deletes_slot_placement(client, test_db):
    """Clearing slot should remove active placement from slot listing."""
    admin_user = await test_db.users.create_user_by_email("admin.slot.clear@example.com")
    await test_db.users.set_admin(email=admin_user["email"], is_admin=True)
    trial_test = await test_db.trial_tests.create_trial_test("Clear Slot Test", sort_order=0, created_by=admin_user["id"])
    bank_task = await test_db.bank_tasks.create_task(
        text="Clear me",
        answer="42",
        question_type="input",
        difficulty="B",
        topics=["Cleanup"],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )

    create_response = client.put(
        f"/api/admin/trial-tests/{trial_test['id']}/slots/2",
        json={"email": admin_user["email"], "bank_task_id": bank_task["id"]},
    )
    assert create_response.status_code == 200

    clear_response = client.delete(
        f"/api/admin/trial-tests/{trial_test['id']}/slots/2",
        params={"email": admin_user["email"]},
    )
    assert clear_response.status_code == 200
    assert clear_response.json()["cleared"] == 1

    list_response = client.get(
        f"/api/admin/trial-tests/{trial_test['id']}/tasks",
        params={"email": admin_user["email"]},
    )
    assert list_response.status_code == 200
    assert list_response.json()["tasks"] == []


@pytest.mark.asyncio
async def test_admin_bank_permanent_delete_removes_trial_placements(client, test_db):
    """Permanent bank delete should remove linked trial placements from active content."""
    admin_user = await test_db.users.create_user_by_email("admin.bank.delete@example.com")
    await test_db.users.set_admin(email=admin_user["email"], is_admin=True)
    trial_test = await test_db.trial_tests.create_trial_test("Delete Cascade Test", sort_order=0, created_by=admin_user["id"])
    bank_task = await test_db.bank_tasks.create_task(
        text="Cascade bank task",
        answer="1",
        question_type="input",
        difficulty="B",
        topics=["Cascade"],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )

    link_response = client.put(
        f"/api/admin/trial-tests/{trial_test['id']}/slots/1",
        json={"email": admin_user["email"], "bank_task_id": bank_task["id"]},
    )
    assert link_response.status_code == 200

    to_trash_response = client.delete(
        f"/api/admin/bank/tasks/{bank_task['id']}",
        params={"email": admin_user["email"]},
    )
    assert to_trash_response.status_code == 200
    assert to_trash_response.json()["success"] is True

    permanent_response = client.delete(
        f"/api/admin/bank/tasks/{bank_task['id']}/permanent",
        params={"email": admin_user["email"]},
    )
    assert permanent_response.status_code == 200
    assert permanent_response.json()["success"] is True

    list_response = client.get(
        f"/api/admin/trial-tests/{trial_test['id']}/tasks",
        params={"email": admin_user["email"]},
    )
    assert list_response.status_code == 200
    assert list_response.json()["tasks"] == []

    deleted_bank = await test_db.bank_tasks.get_task_by_id(bank_task["id"], include_deleted=True)
    assert deleted_bank is None


@pytest.mark.asyncio
async def test_admin_mini_lesson_task_create_with_existing_bank_task(client, test_db):
    """Creating mini-lesson task with bank_task_id should only create placement."""
    admin_user = await test_db.users.create_user_by_email("admin.minilesson.bank@example.com")
    await test_db.users.set_admin(email=admin_user["email"], is_admin=True)

    module = await test_db.curriculum.create_module("Mini Module", sort_order=0)
    section = await test_db.curriculum.create_section(module["id"], "Mini Section", sort_order=0)
    lesson = await test_db.curriculum.create_lesson(section["id"], lesson_number=1, title="Mini Lesson", sort_order=0)
    mini_lessons = await test_db.curriculum.get_mini_lessons_by_lesson(lesson["id"])
    assert len(mini_lessons) >= 1
    mini_lesson_id = mini_lessons[0]["id"]

    bank_task = await test_db.bank_tasks.create_task(
        text="Bank linked task text",
        answer="B",
        question_type="mcq",
        difficulty="B",
        topics=["TopicOne"],
        options=[
            {"label": "A", "text": "1"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "3"},
            {"label": "D", "text": "4"},
        ],
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    before_total = (await test_db.bank_tasks.list_tasks(limit=100, offset=0))["total"]

    response = client.post(
        f"/api/admin/mini-lessons/{mini_lesson_id}/tasks",
        data={
            "email": admin_user["email"],
            "bank_task_id": str(bank_task["id"]),
            "question_type": "mcq",
            "sort_order": "2",
        },
    )
    assert response.status_code == 200
    created = response.json()
    assert created["bank_task_id"] == bank_task["id"]
    assert created["text"] == "Bank linked task text"
    assert created["answer"] == "B"
    assert created["question_type"] == "mcq"
    assert isinstance(created.get("options"), list)

    after_total = (await test_db.bank_tasks.list_tasks(limit=100, offset=0))["total"]
    assert after_total == before_total

    list_response = client.get(
        f"/api/admin/mini-lessons/{mini_lesson_id}/tasks",
        params={"email": admin_user["email"]},
    )
    assert list_response.status_code == 200
    listed = list_response.json()
    assert isinstance(listed, list)
    assert len(listed) == 1
    assert listed[0]["bank_task_id"] == bank_task["id"]


@pytest.mark.asyncio
async def test_admin_mini_lesson_task_update_syncs_linked_bank_metadata(client, test_db):
    """Updating mini-lesson task should sync content + bank metadata to linked bank task."""
    admin_user = await test_db.users.create_user_by_email("admin.minilesson.sync@example.com")
    await test_db.users.set_admin(email=admin_user["email"], is_admin=True)

    module = await test_db.curriculum.create_module("Mini Sync Module", sort_order=0)
    section = await test_db.curriculum.create_section(module["id"], "Mini Sync Section", sort_order=0)
    lesson = await test_db.curriculum.create_lesson(section["id"], lesson_number=1, title="Mini Sync Lesson", sort_order=0)
    mini_lessons = await test_db.curriculum.get_mini_lessons_by_lesson(lesson["id"])
    assert len(mini_lessons) >= 1
    mini_lesson_id = mini_lessons[0]["id"]

    bank_task = await test_db.bank_tasks.create_task(
        text="Old mini text",
        answer="Old mini answer",
        question_type="input",
        difficulty="B",
        topics=["OldTopic"],
        options=None,
        subquestions=None,
        image_filename=None,
        solution_filename=None,
        created_by=admin_user["id"],
    )
    placement = await test_db.create_task_in_mini_lesson(
        mini_lesson_id=mini_lesson_id,
        text="Old mini text",
        answer="Old mini answer",
        created_by=admin_user["id"],
        question_type="input",
        sort_order=0,
        bank_task_id=bank_task["id"],
    )

    response = client.put(
        f"/api/admin/tasks/{placement['id']}",
        data={
            "email": admin_user["email"],
            "text": "Updated mini text",
            "answer": "Updated mini answer",
            "question_type": "input",
            "bank_difficulty": "C",
            "bank_topics": json.dumps(["UpdatedTopic", "SecondTopic"]),
        },
    )
    assert response.status_code == 200
    assert response.json().get("success") is True

    updated_bank = await test_db.bank_tasks.get_task_by_id(bank_task["id"], include_deleted=True)
    assert updated_bank is not None
    assert updated_bank["text"] == "Updated mini text"
    assert updated_bank["answer"] == "Updated mini answer"
    assert updated_bank["difficulty"] == "C"
    assert set(updated_bank["topics"]) == {"UpdatedTopic", "SecondTopic"}
