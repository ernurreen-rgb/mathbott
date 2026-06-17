"""Route tests: admin roles."""
import pytest
import aiosqlite
from tests.route_helpers import _extract_http_detail


def test_admin_routes_contract_and_no_duplicates(client):
    """Admin route contract remains stable and has no duplicate method+path routes."""
    admin_routes = []
    for route in client.app.routes:
        path = getattr(route, "path", None)
        methods = getattr(route, "methods", None)
        if not isinstance(path, str) or not path.startswith("/api/admin"):
            continue
        if not isinstance(methods, set):
            continue
        for method in methods:
            if method in {"GET", "POST", "PUT", "DELETE"}:
                admin_routes.append((method, path))

    route_set = set(admin_routes)
    expected_routes = [
        ("GET", "/api/admin/check"),
        ("GET", "/api/admin/roles"),
        ("POST", "/api/admin/roles"),
        ("POST", "/api/admin/roles/restore"),
        ("GET", "/api/admin/tasks"),
        ("GET", "/api/admin/trial-tests"),
        ("GET", "/api/admin/bank/tasks"),
        ("GET", "/api/admin/bank/tasks/export"),
        ("GET", "/api/admin/bank/quality/summary"),
        ("GET", "/api/admin/bank/audit"),
        ("POST", "/api/admin/bank/tasks/import"),
        ("POST", "/api/admin/trial-tests/{test_id}/tasks/from-bank"),
        ("PUT", "/api/admin/reports/tasks/{task_id}"),
        ("PUT", "/api/admin/reports/{report_id}/status"),
        ("DELETE", "/api/admin/bank/tasks/{task_id}/permanent"),
        ("GET", "/api/admin/ops/health/summary"),
        ("GET", "/api/admin/ops/health/timeseries"),
        ("GET", "/api/admin/ops/incidents"),
        ("GET", "/api/admin/statistics"),
        ("GET", "/api/admin/onboarding-statistics"),
        ("GET", "/api/admin/leagues"),
        ("GET", "/api/admin/leagues/participants"),
    ]
    for method, path in expected_routes:
        assert (method, path) in route_set

    duplicates = {}
    for method, path in admin_routes:
        key = (method, path)
        duplicates[key] = duplicates.get(key, 0) + 1
    duplicate_items = [f"{method} {path} x{count}" for (method, path), count in duplicates.items() if count > 1]
    assert not duplicate_items, f"Found duplicate admin routes: {duplicate_items}"


def test_legacy_admin_bootstrap_routes_disabled_in_production(test_db, monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("ALLOW_LEGACY_ADMIN_BOOTSTRAP", "true")
    from app import create_app, get_rate_limit_key
    from fastapi.testclient import TestClient
    from routes import register_routes
    from slowapi import Limiter

    app = create_app()
    app.state.db = test_db
    app.state.limiter = Limiter(key_func=get_rate_limit_key)
    register_routes(app, app.state.db, app.state.limiter)
    client = TestClient(app)
    route_set = {
        (method, getattr(route, "path", None))
        for route in client.app.routes
        for method in (getattr(route, "methods", None) or set())
    }

    assert ("POST", "/api/admin/set-admin") not in route_set
    assert ("POST", "/api/admin/set-role") not in route_set


@pytest.mark.asyncio
async def test_admin_statistics_route_returns_ok(client, test_db):
    admin_user = await test_db.users.create_user_by_email("admin.statistics@example.com")
    await test_db.users.set_admin_with_role(
        email=admin_user["email"],
        is_admin=True,
        role="reviewer",
    )

    response = client.get(
        "/api/admin/statistics",
        params={"email": admin_user["email"]},
    )
    assert response.status_code == 200
    payload = response.json()
    assert "question_type_stats" in payload
    assert isinstance(payload["question_type_stats"], list)


@pytest.mark.asyncio
async def test_admin_leagues_routes_return_groups_and_participants(client, test_db):
    admin_user = await test_db.users.create_user_by_email("admin.leagues@example.com")
    await test_db.users.set_admin_with_role(
        email=admin_user["email"],
        is_admin=True,
        role="reviewer",
    )
    first_user = await test_db.users.create_user_by_email("league.one@example.com")
    second_user = await test_db.users.create_user_by_email("league.two@example.com")
    await test_db.users.update_user_nickname(first_user["email"], "League One")
    await test_db.users.update_user_nickname(second_user["email"], "League Two")

    league_name = "Test League"
    async with aiosqlite.connect(test_db.db_path) as db:
        await db.execute(
            """
            UPDATE users
            SET league = ?, league_group = 2, total_points = 200, week_points = 20, total_solved = 12, week_solved = 2
            WHERE id = ?
            """,
            (league_name, first_user["id"]),
        )
        await db.execute(
            """
            UPDATE users
            SET league = ?, league_group = 2, total_points = 300, week_points = 10, total_solved = 15, week_solved = 1
            WHERE id = ?
            """,
            (league_name, second_user["id"]),
        )
        await db.commit()

    groups_response = client.get(
        "/api/admin/leagues",
        params={"email": admin_user["email"]},
    )
    assert groups_response.status_code == 200
    groups = groups_response.json()["items"]
    target_group = next(
        item for item in groups if item["league"] == league_name and item["league_group"] == 2
    )
    assert target_group["total_users"] == 2
    assert target_group["named_users"] == 2

    participants_response = client.get(
        "/api/admin/leagues/participants",
        params={"email": admin_user["email"], "league": league_name, "group": 2},
    )
    assert participants_response.status_code == 200
    payload = participants_response.json()
    assert payload["total"] == 2
    assert [item["email"] for item in payload["items"]] == [
        first_user["email"],
        second_user["email"],
    ]
    assert payload["items"][0]["week_points"] == 20


@pytest.mark.asyncio
async def test_admin_check_returns_role_and_permissions(client, test_db):
    admin_user = await test_db.users.create_user_by_email("admin.check.role@example.com")
    await test_db.users.set_admin_with_role(
        email=admin_user["email"],
        is_admin=True,
        role="reviewer",
    )

    response = client.get(
        "/api/admin/check",
        params={"email": admin_user["email"]},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["is_admin"] is True
    assert payload["role"] == "reviewer"
    assert payload["is_super_admin"] is False
    assert "review_manage" in payload["permissions"]


@pytest.mark.asyncio
async def test_admin_set_role_endpoint_success_and_invalid_role(client, test_db, monkeypatch):
    monkeypatch.setenv("ADMIN_SECRET", "test-admin-secret-123456")
    reviewer_admin = await test_db.users.create_user_by_email("role.audit.viewer@example.com")
    await test_db.users.set_admin_with_role(
        email=reviewer_admin["email"],
        is_admin=True,
        role="reviewer",
    )

    target_email = "role.assign.target@example.com"
    ok_response = client.post(
        "/api/admin/set-role",
        params={
            "email": target_email,
            "role": "content_editor",
            "secret": "test-admin-secret-123456",
        },
    )
    assert ok_response.status_code == 200
    created_user = await test_db.users.get_user_by_email(target_email)
    assert created_user is not None
    assert await test_db.users.is_admin(email=target_email) is True
    assert await test_db.users.get_admin_role(email=target_email) == "content_editor"

    audit_response = client.get(
        "/api/admin/bank/audit",
        params={
            "email": reviewer_admin["email"],
            "action": "role_change",
            "actor_email": "legacy_secret",
        },
    )
    assert audit_response.status_code == 200
    audit_items = audit_response.json()["items"]
    matching_item = next(
        (
            item
            for item in audit_items
            if item.get("entity_type") == "admin_user"
            and item.get("metadata", {}).get("target_email") == target_email
        ),
        None,
    )
    assert matching_item is not None
    assert matching_item["actor_email"] == "legacy_secret"
    assert matching_item["metadata"]["source"] == "legacy_set_role"
    assert matching_item["metadata"]["to_role"] == "content_editor"

    bad_response = client.post(
        "/api/admin/set-role",
        params={
            "email": target_email,
            "role": "invalid_role",
            "secret": "test-admin-secret-123456",
        },
    )
    assert bad_response.status_code == 400


@pytest.mark.asyncio
async def test_admin_roles_list_requires_super_admin(client, test_db):
    super_admin = await test_db.users.create_user_by_email("roles.super@example.com")
    reviewer = await test_db.users.create_user_by_email("roles.reviewer@example.com")
    await test_db.users.set_admin_with_role(email=super_admin["email"], is_admin=True, role="super_admin")
    await test_db.users.set_admin_with_role(email=reviewer["email"], is_admin=True, role="reviewer")

    allowed = client.get(
        "/api/admin/roles",
        params={"email": super_admin["email"], "limit": 20, "offset": 0},
    )
    assert allowed.status_code == 200
    allowed_payload = allowed.json()
    assert isinstance(allowed_payload.get("items"), list)
    assert allowed_payload.get("total", 0) >= 2

    role_filtered = client.get(
        "/api/admin/roles",
        params={"email": super_admin["email"], "role": "reviewer", "limit": 20, "offset": 0},
    )
    assert role_filtered.status_code == 200
    role_payload = role_filtered.json()
    assert role_payload["total"] == 1
    assert role_payload["items"][0]["email"] == reviewer["email"]

    forbidden = client.get(
        "/api/admin/roles",
        params={"email": reviewer["email"], "limit": 20, "offset": 0},
    )
    assert forbidden.status_code == 403

    forbidden_post = client.post(
        "/api/admin/roles",
        params={"email": reviewer["email"]},
        json={"target_email": "x@example.com", "role": "content_editor"},
    )
    assert forbidden_post.status_code == 403


@pytest.mark.asyncio
async def test_admin_roles_post_change_noop_autocreate_and_audit(client, test_db):
    super_admin = await test_db.users.create_user_by_email("roles.write.super@example.com")
    await test_db.users.set_admin_with_role(email=super_admin["email"], is_admin=True, role="super_admin")

    target_existing = await test_db.users.create_user_by_email("roles.target.existing@example.com")
    await test_db.users.set_admin_with_role(email=target_existing["email"], is_admin=True, role="content_editor")

    changed = client.post(
        "/api/admin/roles",
        params={"email": super_admin["email"]},
        json={"target_email": target_existing["email"], "role": "reviewer"},
    )
    assert changed.status_code == 200
    changed_payload = changed.json()
    assert changed_payload["success"] is True
    assert changed_payload["changed"] is True
    assert isinstance(changed_payload.get("audit_id"), int)
    assert changed_payload["target_user"]["previous_role"] == "content_editor"
    assert changed_payload["target_user"]["new_role"] == "reviewer"
    assert await test_db.users.get_admin_role(email=target_existing["email"]) == "reviewer"

    # no-op change should not create new audit row
    no_change = client.post(
        "/api/admin/roles",
        params={"email": super_admin["email"]},
        json={"target_email": target_existing["email"], "role": "reviewer"},
    )
    assert no_change.status_code == 200
    no_change_payload = no_change.json()
    assert no_change_payload["success"] is True
    assert no_change_payload["changed"] is False
    assert "audit_id" not in no_change_payload

    # auto-create target user
    auto_target_email = "roles.target.new@example.com"
    auto_create = client.post(
        "/api/admin/roles",
        params={"email": super_admin["email"]},
        json={"target_email": auto_target_email, "role": "content_editor"},
    )
    assert auto_create.status_code == 200
    auto_payload = auto_create.json()
    assert auto_payload["success"] is True
    assert auto_payload["changed"] is True
    assert auto_payload["target_user"]["previous_role"] is None
    assert auto_payload["target_user"]["new_role"] == "content_editor"
    assert await test_db.users.is_admin(email=auto_target_email) is True
    assert await test_db.users.get_admin_role(email=auto_target_email) == "content_editor"

    audit = client.get(
        "/api/admin/bank/audit",
        params={
            "email": super_admin["email"],
            "action": "role_change",
            "actor_email": super_admin["email"],
        },
    )
    assert audit.status_code == 200
    items = audit.json()["items"]
    assert any(item.get("metadata", {}).get("target_email") == target_existing["email"] for item in items)
    assert any(item.get("metadata", {}).get("target_email") == auto_target_email for item in items)

    # remove admin via v2 flow
    remove_response = client.post(
        "/api/admin/roles",
        params={"email": super_admin["email"]},
        json={"target_email": target_existing["email"], "remove_admin": True},
    )
    assert remove_response.status_code == 200
    remove_payload = remove_response.json()
    assert remove_payload["success"] is True
    assert remove_payload["changed"] is True
    assert remove_payload["target_user"]["new_role"] is None
    assert await test_db.users.is_admin(email=target_existing["email"]) is False
    assert await test_db.users.get_admin_role(email=target_existing["email"]) is None

    # cannot remove own admin access
    self_remove = client.post(
        "/api/admin/roles",
        params={"email": super_admin["email"]},
        json={"target_email": super_admin["email"], "remove_admin": True},
    )
    assert self_remove.status_code == 400


@pytest.mark.asyncio
async def test_admin_tasks_put_supports_cms_and_report_legacy_modes(client, test_db):
    owner_editor = await test_db.users.create_user_by_email("tasks.owner.editor@example.com")
    other_editor = await test_db.users.create_user_by_email("tasks.other.editor@example.com")
    reviewer = await test_db.users.create_user_by_email("tasks.reviewer@example.com")
    await test_db.users.set_admin_with_role(email=owner_editor["email"], is_admin=True, role="content_editor")
    await test_db.users.set_admin_with_role(email=other_editor["email"], is_admin=True, role="content_editor")
    await test_db.users.set_admin_with_role(email=reviewer["email"], is_admin=True, role="reviewer")

    module = await test_db.curriculum.create_module("Update mode module", sort_order=1)
    section = await test_db.curriculum.create_section(module["id"], "Update mode section", sort_order=1)
    task = await test_db.create_task_in_section(
        section_id=section["id"],
        text="before",
        answer="before",
        created_by=owner_editor["id"],
    )

    # legacy report mode: query email (reviewer) without form email
    legacy_ok = client.put(
        f"/api/admin/tasks/{task['id']}",
        params={"email": reviewer["email"]},
        data={
            "text": "legacy updated",
            "answer": "legacy answer",
            "question_type": "input",
        },
    )
    assert legacy_ok.status_code == 200
    assert legacy_ok.json().get("success") is True

    # form email has priority over query email. This should stay CMS mode and fail owner check.
    form_priority = client.put(
        f"/api/admin/tasks/{task['id']}",
        params={"email": reviewer["email"]},
        data={
            "email": other_editor["email"],
            "text": "cms updated",
            "answer": "cms answer",
            "question_type": "input",
        },
    )
    assert form_priority.status_code == 403

    missing_email = client.put(
        f"/api/admin/tasks/{task['id']}",
        data={
            "text": "x",
            "answer": "y",
            "question_type": "input",
        },
    )
    assert missing_email.status_code == 400
    missing_detail = _extract_http_detail(missing_email.json())
    if isinstance(missing_detail, str):
        assert "email" in missing_detail.lower()


@pytest.mark.asyncio
async def test_admin_report_task_update_explicit_endpoint_permissions(client, test_db):
    owner_editor = await test_db.users.create_user_by_email("reports.owner.editor@example.com")
    reviewer = await test_db.users.create_user_by_email("reports.reviewer@example.com")
    await test_db.users.set_admin_with_role(email=owner_editor["email"], is_admin=True, role="content_editor")
    await test_db.users.set_admin_with_role(email=reviewer["email"], is_admin=True, role="reviewer")

    module = await test_db.curriculum.create_module("Report update module", sort_order=1)
    section = await test_db.curriculum.create_section(module["id"], "Report update section", sort_order=1)
    task = await test_db.create_task_in_section(
        section_id=section["id"],
        text="before",
        answer="before",
        created_by=owner_editor["id"],
    )

    reviewer_ok = client.put(
        f"/api/admin/reports/tasks/{task['id']}",
        params={"email": reviewer["email"]},
        data={
            "text": "reviewer updated",
            "answer": "reviewer answer",
            "question_type": "input",
        },
    )
    assert reviewer_ok.status_code == 200
    assert reviewer_ok.json().get("success") is True

    editor_forbidden = client.put(
        f"/api/admin/reports/tasks/{task['id']}",
        params={"email": owner_editor["email"]},
        data={
            "text": "editor updated",
            "answer": "editor answer",
            "question_type": "input",
        },
    )
    assert editor_forbidden.status_code == 403


@pytest.mark.asyncio
async def test_admin_roles_last_super_guard_on_demote_and_legacy_set_role(client, test_db, monkeypatch):
    monkeypatch.setenv("ADMIN_SECRET", "legacy-guard-secret-123456")

    lone_super = await test_db.users.create_user_by_email("roles.last.super@example.com")
    await test_db.users.set_admin_with_role(email=lone_super["email"], is_admin=True, role="super_admin")

    demote = client.post(
        "/api/admin/roles",
        params={"email": lone_super["email"]},
        json={"target_email": lone_super["email"], "role": "reviewer"},
    )
    assert demote.status_code == 409
    demote_detail = _extract_http_detail(demote.json())
    assert demote_detail["code"] == "LAST_SUPER_ADMIN_REQUIRED"

    legacy_demote = client.post(
        "/api/admin/set-role",
        params={
            "email": lone_super["email"],
            "role": "reviewer",
            "secret": "legacy-guard-secret-123456",
        },
    )
    assert legacy_demote.status_code == 409
    legacy_detail = _extract_http_detail(legacy_demote.json())
    assert legacy_detail["code"] == "LAST_SUPER_ADMIN_REQUIRED"

    backup_super = await test_db.users.create_user_by_email("roles.backup.super@example.com")
    await test_db.users.set_admin_with_role(email=backup_super["email"], is_admin=True, role="super_admin")

    demote_after_backup = client.post(
        "/api/admin/roles",
        params={"email": backup_super["email"]},
        json={"target_email": lone_super["email"], "role": "reviewer"},
    )
    assert demote_after_backup.status_code == 200
    assert demote_after_backup.json()["changed"] is True


@pytest.mark.asyncio
async def test_admin_roles_restore_from_audit_success(client, test_db):
    super_admin = await test_db.users.create_user_by_email("roles.restore.super@example.com")
    await test_db.users.set_admin_with_role(email=super_admin["email"], is_admin=True, role="super_admin")

    target = await test_db.users.create_user_by_email("roles.restore.target@example.com")
    await test_db.users.set_admin_with_role(email=target["email"], is_admin=True, role="reviewer")

    changed = client.post(
        "/api/admin/roles",
        params={"email": super_admin["email"]},
        json={"target_email": target["email"], "role": "content_editor"},
    )
    assert changed.status_code == 200

    audit_list = client.get(
        "/api/admin/bank/audit",
        params={
            "email": super_admin["email"],
            "action": "role_change",
            "actor_email": super_admin["email"],
        },
    )
    assert audit_list.status_code == 200
    target_event = next(
        (
            item
            for item in audit_list.json()["items"]
            if item.get("metadata", {}).get("target_email") == target["email"]
        ),
        None,
    )
    assert target_event is not None

    restored = client.post(
        "/api/admin/roles/restore",
        params={"email": super_admin["email"]},
        json={"audit_id": target_event["id"]},
    )
    assert restored.status_code == 200
    restored_payload = restored.json()
    assert restored_payload["success"] is True
    assert restored_payload["changed"] is True
    assert restored_payload["target_user"]["new_role"] == "reviewer"
    assert restored_payload["restored_from_audit_id"] == target_event["id"]
    assert await test_db.users.get_admin_role(email=target["email"]) == "reviewer"


@pytest.mark.asyncio
async def test_admin_roles_restore_from_audit_conflict(client, test_db):
    super_admin = await test_db.users.create_user_by_email("roles.restore.conflict.super@example.com")
    await test_db.users.set_admin_with_role(email=super_admin["email"], is_admin=True, role="super_admin")

    target = await test_db.users.create_user_by_email("roles.restore.conflict.target@example.com")
    await test_db.users.set_admin_with_role(email=target["email"], is_admin=True, role="reviewer")

    first_change = client.post(
        "/api/admin/roles",
        params={"email": super_admin["email"]},
        json={"target_email": target["email"], "role": "content_editor"},
    )
    assert first_change.status_code == 200

    second_change = client.post(
        "/api/admin/roles",
        params={"email": super_admin["email"]},
        json={"target_email": target["email"], "role": "super_admin"},
    )
    assert second_change.status_code == 200

    audit_list = client.get(
        "/api/admin/bank/audit",
        params={
            "email": super_admin["email"],
            "action": "role_change",
            "actor_email": super_admin["email"],
        },
    )
    assert audit_list.status_code == 200
    first_event = next(
        (
            item
            for item in reversed(audit_list.json()["items"])
            if item.get("metadata", {}).get("target_email") == target["email"]
            and item.get("metadata", {}).get("to_role") == "content_editor"
        ),
        None,
    )
    assert first_event is not None

    conflict = client.post(
        "/api/admin/roles/restore",
        params={"email": super_admin["email"]},
        json={"audit_id": first_event["id"]},
    )
    assert conflict.status_code == 409
    conflict_detail = _extract_http_detail(conflict.json())
    assert conflict_detail["code"] == "ROLE_RESTORE_CONFLICT"


@pytest.mark.asyncio
async def test_admin_roles_restore_non_super_invalid_id_and_invalid_event(client, test_db):
    super_admin = await test_db.users.create_user_by_email("roles.restore.guard.super@example.com")
    reviewer = await test_db.users.create_user_by_email("roles.restore.guard.reviewer@example.com")
    await test_db.users.set_admin_with_role(email=super_admin["email"], is_admin=True, role="super_admin")
    await test_db.users.set_admin_with_role(email=reviewer["email"], is_admin=True, role="reviewer")

    forbidden = client.post(
        "/api/admin/roles/restore",
        params={"email": reviewer["email"]},
        json={"audit_id": 1},
    )
    assert forbidden.status_code == 403

    not_found = client.post(
        "/api/admin/roles/restore",
        params={"email": super_admin["email"]},
        json={"audit_id": 999999},
    )
    assert not_found.status_code == 404
    not_found_detail = _extract_http_detail(not_found.json())
    assert not_found_detail["code"] == "ROLE_RESTORE_AUDIT_NOT_FOUND"

    async with aiosqlite.connect(test_db.db_path) as db_conn:
        cursor = await db_conn.execute(
            """
            INSERT INTO admin_audit_logs
            (
                domain, action, entity_type, entity_id,
                actor_user_id, actor_email, summary, changed_fields_json, metadata_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "bank",
                "rollback",
                "bank_task",
                1,
                super_admin["id"],
                super_admin["email"],
                "Not a role event",
                "[]",
                "{}",
            ),
        )
        invalid_audit_id = int(cursor.lastrowid)
        await db_conn.commit()

    invalid_event = client.post(
        "/api/admin/roles/restore",
        params={"email": super_admin["email"]},
        json={"audit_id": invalid_audit_id},
    )
    assert invalid_event.status_code == 400
    invalid_detail = _extract_http_detail(invalid_event.json())
    assert invalid_detail["code"] == "ROLE_RESTORE_INVALID_EVENT"


@pytest.mark.asyncio
async def test_rbac_content_editor_and_reviewer_matrix(client, test_db):
    content_editor = await test_db.users.create_user_by_email("rbac.editor@example.com")
    reviewer = await test_db.users.create_user_by_email("rbac.reviewer@example.com")
    await test_db.users.set_admin_with_role(
        email=content_editor["email"],
        is_admin=True,
        role="content_editor",
    )
    await test_db.users.set_admin_with_role(
        email=reviewer["email"],
        is_admin=True,
        role="reviewer",
    )

    # content_editor: content endpoint allowed
    content_ok = client.get(
        "/api/admin/modules",
        params={"email": content_editor["email"]},
    )
    assert content_ok.status_code == 200

    # content_editor: review endpoint denied
    content_denied = client.get(
        "/api/admin/reports",
        params={"email": content_editor["email"]},
    )
    assert content_denied.status_code == 403

    # reviewer: review endpoint allowed
    reviewer_ok = client.get(
        "/api/admin/reports",
        params={"email": reviewer["email"]},
    )
    assert reviewer_ok.status_code == 200

    # reviewer: content endpoint denied
    reviewer_denied = client.get(
        "/api/admin/modules",
        params={"email": reviewer["email"]},
    )
    assert reviewer_denied.status_code == 403


@pytest.mark.asyncio
async def test_rbac_super_critical_requires_super_admin(client, test_db):
    content_editor = await test_db.users.create_user_by_email("rbac.super.block@example.com")
    await test_db.users.set_admin_with_role(
        email=content_editor["email"],
        is_admin=True,
        role="content_editor",
    )

    # super-critical endpoint should be blocked for content_editor
    forbidden = client.post(
        "/api/admin/tasks/reset-id-counter",
        params={"email": content_editor["email"]},
    )
    assert forbidden.status_code == 403

    super_admin = await test_db.users.create_user_by_email("rbac.super.ok@example.com")
    await test_db.users.set_admin_with_role(
        email=super_admin["email"],
        is_admin=True,
        role="super_admin",
    )

    allowed = client.post(
        "/api/admin/tasks/reset-id-counter",
        params={"email": super_admin["email"]},
    )
    assert allowed.status_code == 200


@pytest.mark.asyncio
async def test_legacy_set_admin_assigns_super_admin_role(client, test_db, monkeypatch):
    monkeypatch.setenv("ADMIN_SECRET", "legacy-admin-secret-123456")
    reviewer_admin = await test_db.users.create_user_by_email("legacy.audit.viewer@example.com")
    await test_db.users.set_admin_with_role(
        email=reviewer_admin["email"],
        is_admin=True,
        role="reviewer",
    )
    target_email = "legacy.set.admin@example.com"

    response = client.post(
        "/api/admin/set-admin",
        params={
            "email": target_email,
            "secret": "legacy-admin-secret-123456",
        },
    )
    assert response.status_code == 200
    assert await test_db.users.is_admin(email=target_email) is True
    assert await test_db.users.get_admin_role(email=target_email) == "super_admin"

    audit_response = client.get(
        "/api/admin/bank/audit",
        params={
            "email": reviewer_admin["email"],
            "action": "role_change",
            "actor_email": "legacy_secret",
        },
    )
    assert audit_response.status_code == 200
    matching_item = next(
        (
            item
            for item in audit_response.json()["items"]
            if item.get("entity_type") == "admin_user"
            and item.get("metadata", {}).get("target_email") == target_email
            and item.get("metadata", {}).get("source") == "legacy_set_admin"
        ),
        None,
    )
    assert matching_item is not None
    assert matching_item.get("metadata", {}).get("to_role") == "super_admin"
