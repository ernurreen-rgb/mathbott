"""Route tests: admin bank import."""
import pytest
import json


@pytest.mark.asyncio
async def test_admin_bank_import_mode_required(client, test_db):
    admin_user = await test_db.users.create_user_by_email("admin.bank.import.mode@example.com")
    await test_db.users.set_admin(email=admin_user["email"], is_admin=True)

    response = client.post(
        "/api/admin/bank/tasks/import",
        json={
            "email": admin_user["email"],
            "tasks": {"text": "No mode", "answer": "1", "question_type": "input", "difficulty": "B"},
        },
    )
    assert response.status_code == 400
    payload = response.json()
    detail = payload.get("detail")
    if detail is None and isinstance(payload.get("error"), dict):
        detail = payload["error"].get("detail")
    if detail is None:
        detail = payload
    assert isinstance(detail, dict)
    assert detail.get("code") == "IMPORT_MODE_REQUIRED"


@pytest.mark.asyncio
async def test_admin_bank_import_dry_run_single_select_task(client, test_db):
    admin_user = await test_db.users.create_user_by_email("admin.bank.import.dryrun.single@example.com")
    await test_db.users.set_admin(email=admin_user["email"], is_admin=True)
    before_total = (await test_db.bank_tasks.list_tasks(limit=100, offset=0))["total"]

    task_payload = {
        "text": "Import select question",
        "answer": ["D", "B"],
        "question_type": "select",
        "options": [
            {"label": "A", "text": "14"},
            {"label": "B", "text": "15"},
            {"label": "C", "text": "16"},
            {"label": "D", "text": "17"},
        ],
        "subquestions": [
            {"text": "Degree", "correct": "D"},
            {"text": "Coefficient", "correct": "B"},
        ],
        "difficulty": "B",
        "topics": ["Algebra", "Monomial"],
        "image_filename": None,
        "solution_filename": None,
    }
    response = client.post(
        "/api/admin/bank/tasks/import",
        json={
            "email": admin_user["email"],
            "mode": "dry_run",
            "tasks": task_payload,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["mode"] == "dry_run"
    assert isinstance(payload.get("preview_token"), str)
    assert payload["summary"]["total_tasks"] == 1
    assert payload["summary"]["valid_count"] == 1
    assert payload["summary"]["invalid_count"] == 0
    assert payload["summary"]["duplicate_count"] == 0
    assert payload["summary"]["can_confirm"] is True
    assert payload["summary"]["requires_dedup_confirmation"] is False
    assert payload["validation_errors"] == []
    assert payload["duplicate_conflicts"] == []

    after_total = (await test_db.bank_tasks.list_tasks(limit=100, offset=0))["total"]
    assert after_total == before_total


@pytest.mark.asyncio
async def test_admin_bank_import_dry_run_mcq_accepts_eight_options(client, test_db):
    admin_user = await test_db.users.create_user_by_email("admin.bank.import.mcq8@example.com")
    await test_db.users.set_admin(email=admin_user["email"], is_admin=True)

    response = client.post(
        "/api/admin/bank/tasks/import",
        json={
            "email": admin_user["email"],
            "mode": "dry_run",
            "tasks": {
                "text": "Import eight-option MCQ",
                "answer": "H",
                "question_type": "mcq",
                "options": [
                    {"label": label, "text": f"Option {label}"}
                    for label in ["A", "B", "C", "D", "E", "F", "G", "H"]
                ],
                "difficulty": "B",
            },
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"]["total_tasks"] == 1
    assert payload["summary"]["valid_count"] == 1
    assert payload["summary"]["invalid_count"] == 0
    assert payload["validation_errors"] == []


@pytest.mark.asyncio
async def test_admin_bank_import_dry_run_mixed_validation_errors(client, test_db):
    admin_user = await test_db.users.create_user_by_email("admin.bank.import.dryrun.validation@example.com")
    await test_db.users.set_admin(email=admin_user["email"], is_admin=True)
    before_total = (await test_db.bank_tasks.list_tasks(limit=100, offset=0))["total"]

    response = client.post(
        "/api/admin/bank/tasks/import",
        json={
            "email": admin_user["email"],
            "mode": "dry_run",
            "tasks": [
                {
                    "text": "Atomic valid task",
                    "answer": "10",
                    "question_type": "input",
                    "difficulty": "B",
                },
                {
                    "text": "Atomic invalid task",
                    "answer": "A",
                    "question_type": "mcq",
                    "difficulty": "B",
                },
            ],
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["mode"] == "dry_run"
    assert payload["summary"]["total_tasks"] == 2
    assert payload["summary"]["invalid_count"] >= 1
    assert payload["summary"]["can_confirm"] is False
    assert isinstance(payload["validation_errors"], list)
    assert any(item.get("index") == 1 for item in payload["validation_errors"])

    after_total = (await test_db.bank_tasks.list_tasks(limit=100, offset=0))["total"]
    assert after_total == before_total


@pytest.mark.asyncio
async def test_admin_bank_import_dry_run_dedup_all_conflicts(client, test_db):
    admin_user = await test_db.users.create_user_by_email("admin.bank.import.dryrun.conflicts@example.com")
    await test_db.users.set_admin(email=admin_user["email"], is_admin=True)

    await test_db.bank_tasks.create_task(
        text="Dry-run duplicate one",
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
    await test_db.bank_tasks.create_task(
        text="Dry-run duplicate two",
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

    response = client.post(
        "/api/admin/bank/tasks/import",
        json={
            "email": admin_user["email"],
            "mode": "dry_run",
            "tasks": [
                {"text": "Dry-run duplicate one", "answer": "2", "question_type": "input", "difficulty": "B"},
                {"text": "Dry-run duplicate two", "answer": "3", "question_type": "input", "difficulty": "B"},
            ],
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["mode"] == "dry_run"
    assert payload["summary"]["duplicate_count"] == 2
    assert payload["summary"]["requires_dedup_confirmation"] is True
    conflicts = payload.get("duplicate_conflicts") or []
    assert isinstance(conflicts, list)
    assert len(conflicts) == 2
    assert {int(item["index"]) for item in conflicts} == {0, 1}


@pytest.mark.asyncio
async def test_admin_bank_import_confirm_success_after_dry_run(client, test_db):
    admin_user = await test_db.users.create_user_by_email("admin.bank.import.confirm.success@example.com")
    await test_db.users.set_admin(email=admin_user["email"], is_admin=True)
    before_total = (await test_db.bank_tasks.list_tasks(limit=100, offset=0))["total"]

    tasks_payload = {
        "text": "Confirm select question",
        "answer": ["D", "B"],
        "question_type": "select",
        "options": [
            {"label": "A", "text": "14"},
            {"label": "B", "text": "15"},
            {"label": "C", "text": "16"},
            {"label": "D", "text": "17"},
        ],
        "subquestions": [
            {"text": "Degree", "correct": "D"},
            {"text": "Coefficient", "correct": "B"},
        ],
        "difficulty": "B",
        "topics": ["Algebra"],
    }

    preview_response = client.post(
        "/api/admin/bank/tasks/import",
        json={"email": admin_user["email"], "mode": "dry_run", "tasks": tasks_payload},
    )
    assert preview_response.status_code == 200
    preview_payload = preview_response.json()
    token = preview_payload["preview_token"]
    assert isinstance(token, str) and token

    confirm_response = client.post(
        "/api/admin/bank/tasks/import",
        json={
            "email": admin_user["email"],
            "mode": "confirm",
            "preview_token": token,
            "tasks": tasks_payload,
        },
    )
    assert confirm_response.status_code == 200
    confirm_payload = confirm_response.json()
    assert confirm_payload["mode"] == "confirm"
    assert confirm_payload["created_count"] == 1
    assert len(confirm_payload["created_ids"]) == 1
    task_id = int(confirm_payload["created_ids"][0])
    created = await test_db.bank_tasks.get_task_by_id(task_id, include_deleted=True)
    assert created is not None
    assert created["question_type"] == "select"
    assert created["answer"] == json.dumps(["D", "B"], ensure_ascii=False)

    after_total = (await test_db.bank_tasks.list_tasks(limit=100, offset=0))["total"]
    assert after_total == before_total + 1


@pytest.mark.asyncio
async def test_admin_bank_create_factor_grid_canonicalizes_answer(client, test_db):
    admin_user = await test_db.users.create_user_by_email("admin.bank.factor.grid@example.com")
    await test_db.users.set_admin(email=admin_user["email"], is_admin=True)

    response = client.post(
        "/api/admin/bank/tasks",
        data={
            "text": "2x^2 + 5x - 3 = 0",
            "answer": '["x","3","2x","-1"]',
            "question_type": "factor_grid",
            "difficulty": "B",
            "email": admin_user["email"],
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["question_type"] == "factor_grid"
    assert payload["answer"] == '["2x", "-1", "x", "3"]'


@pytest.mark.asyncio
async def test_admin_bank_create_mcq_accepts_eight_options(client, test_db):
    admin_user = await test_db.users.create_user_by_email("admin.bank.mcq8@example.com")
    await test_db.users.set_admin(email=admin_user["email"], is_admin=True)
    options = [{"label": label, "text": f"Option {label}"} for label in ["A", "B", "C", "D", "E", "F", "G", "H"]]

    response = client.post(
        "/api/admin/bank/tasks",
        data={
            "text": "Eight option MCQ",
            "answer": "H",
            "question_type": "mcq",
            "difficulty": "B",
            "options": json.dumps(options),
            "email": admin_user["email"],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["question_type"] == "mcq"
    assert payload["answer"] == "H"
    assert len(payload["options"]) == 8
    assert payload["options"][-1]["label"] == "H"


@pytest.mark.asyncio
async def test_admin_bank_import_confirm_dedup_conflict(client, test_db):
    admin_user = await test_db.users.create_user_by_email("admin.bank.import.confirm.conflict@example.com")
    await test_db.users.set_admin(email=admin_user["email"], is_admin=True)
    await test_db.bank_tasks.create_task(
        text="Confirm duplicate anchor",
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
    before_total = (await test_db.bank_tasks.list_tasks(limit=100, offset=0))["total"]

    tasks_payload = {
        "text": "Confirm duplicate anchor",
        "answer": "2",
        "question_type": "input",
        "difficulty": "B",
    }
    preview_response = client.post(
        "/api/admin/bank/tasks/import",
        json={"email": admin_user["email"], "mode": "dry_run", "tasks": tasks_payload},
    )
    assert preview_response.status_code == 200
    token = preview_response.json()["preview_token"]

    confirm_response = client.post(
        "/api/admin/bank/tasks/import",
        json={
            "email": admin_user["email"],
            "mode": "confirm",
            "preview_token": token,
            "tasks": tasks_payload,
        },
    )
    assert confirm_response.status_code == 409
    payload = confirm_response.json()
    detail = payload.get("detail")
    if detail is None and isinstance(payload.get("error"), dict):
        detail = payload["error"].get("detail")
    if detail is None:
        detail = payload
    assert detail.get("code") == "SIMILAR_TASKS_FOUND"
    assert isinstance(detail.get("conflicts"), list)
    assert len(detail["conflicts"]) >= 1
    assert detail.get("task_index") == 0
    assert isinstance(detail.get("similar_tasks"), list)
    assert len(detail["similar_tasks"]) >= 1

    after_total = (await test_db.bank_tasks.list_tasks(limit=100, offset=0))["total"]
    assert after_total == before_total


@pytest.mark.asyncio
async def test_admin_bank_import_confirm_dedup_force(client, test_db):
    admin_user = await test_db.users.create_user_by_email("admin.bank.import.confirm.force@example.com")
    await test_db.users.set_admin(email=admin_user["email"], is_admin=True)
    await test_db.bank_tasks.create_task(
        text="Confirm force duplicate",
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
    before_total = (await test_db.bank_tasks.list_tasks(limit=100, offset=0))["total"]

    tasks_payload = {
        "text": "Confirm force duplicate",
        "answer": "2",
        "question_type": "input",
        "difficulty": "B",
    }
    preview_response = client.post(
        "/api/admin/bank/tasks/import",
        json={"email": admin_user["email"], "mode": "dry_run", "tasks": tasks_payload},
    )
    assert preview_response.status_code == 200
    token = preview_response.json()["preview_token"]

    confirm_response = client.post(
        "/api/admin/bank/tasks/import",
        json={
            "email": admin_user["email"],
            "mode": "confirm",
            "preview_token": token,
            "dedup_confirmed": True,
            "tasks": tasks_payload,
        },
    )
    assert confirm_response.status_code == 200
    payload = confirm_response.json()
    assert payload["mode"] == "confirm"
    assert payload["created_count"] == 1
    assert len(payload["created_ids"]) == 1

    after_total = (await test_db.bank_tasks.list_tasks(limit=100, offset=0))["total"]
    assert after_total == before_total + 1


@pytest.mark.asyncio
async def test_admin_bank_import_confirm_payload_mismatch(client, test_db):
    admin_user = await test_db.users.create_user_by_email("admin.bank.import.confirm.mismatch@example.com")
    await test_db.users.set_admin(email=admin_user["email"], is_admin=True)

    preview_response = client.post(
        "/api/admin/bank/tasks/import",
        json={
            "email": admin_user["email"],
            "mode": "dry_run",
            "tasks": {"text": "Preview payload", "answer": "1", "question_type": "input", "difficulty": "B"},
        },
    )
    assert preview_response.status_code == 200
    token = preview_response.json()["preview_token"]

    confirm_response = client.post(
        "/api/admin/bank/tasks/import",
        json={
            "email": admin_user["email"],
            "mode": "confirm",
            "preview_token": token,
            "tasks": {"text": "Changed payload", "answer": "1", "question_type": "input", "difficulty": "B"},
        },
    )
    assert confirm_response.status_code == 400
    payload = confirm_response.json()
    detail = payload.get("detail")
    if detail is None and isinstance(payload.get("error"), dict):
        detail = payload["error"].get("detail")
    if detail is None:
        detail = payload
    assert isinstance(detail, dict)
    assert detail.get("code") == "IMPORT_PREVIEW_PAYLOAD_MISMATCH"


@pytest.mark.asyncio
async def test_admin_bank_import_confirm_invalid_token(client, test_db):
    admin_user = await test_db.users.create_user_by_email("admin.bank.import.confirm.token@example.com")
    await test_db.users.set_admin(email=admin_user["email"], is_admin=True)

    confirm_response = client.post(
        "/api/admin/bank/tasks/import",
        json={
            "email": admin_user["email"],
            "mode": "confirm",
            "preview_token": "invalid-token",
            "tasks": {"text": "Payload", "answer": "1", "question_type": "input", "difficulty": "B"},
        },
    )
    assert confirm_response.status_code == 400
    payload = confirm_response.json()
    detail = payload.get("detail")
    if detail is None and isinstance(payload.get("error"), dict):
        detail = payload["error"].get("detail")
    if detail is None:
        detail = payload
    assert isinstance(detail, dict)
    assert detail.get("code") == "IMPORT_PREVIEW_TOKEN_INVALID"


@pytest.mark.asyncio
async def test_admin_bank_import_confirm_validation_failure_atomic(client, test_db):
    admin_user = await test_db.users.create_user_by_email("admin.bank.import.confirm.validation@example.com")
    await test_db.users.set_admin(email=admin_user["email"], is_admin=True)
    before_total = (await test_db.bank_tasks.list_tasks(limit=100, offset=0))["total"]

    tasks_payload = [
        {"text": "Atomic valid", "answer": "10", "question_type": "input", "difficulty": "B"},
        {"text": "Atomic invalid", "answer": "A", "question_type": "mcq", "difficulty": "B"},
    ]
    preview_response = client.post(
        "/api/admin/bank/tasks/import",
        json={"email": admin_user["email"], "mode": "dry_run", "tasks": tasks_payload},
    )
    assert preview_response.status_code == 200
    token = preview_response.json()["preview_token"]

    confirm_response = client.post(
        "/api/admin/bank/tasks/import",
        json={
            "email": admin_user["email"],
            "mode": "confirm",
            "preview_token": token,
            "tasks": tasks_payload,
        },
    )
    assert confirm_response.status_code == 400
    payload = confirm_response.json()
    detail = payload.get("detail")
    if detail is None and isinstance(payload.get("error"), dict):
        detail = payload["error"].get("detail")
    if detail is None:
        detail = payload
    assert detail.get("code") == "IMPORT_VALIDATION_FAILED"
    assert isinstance(detail.get("errors"), list)
    assert any(item.get("index") == 1 for item in detail["errors"])

    after_total = (await test_db.bank_tasks.list_tasks(limit=100, offset=0))["total"]
    assert after_total == before_total
