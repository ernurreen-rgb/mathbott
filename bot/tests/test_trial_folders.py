"""Tree invariants, legacy compatibility and identity preservation."""
import asyncio
import sqlite3

import pytest
from alembic import command

from migrations.runner import _build_config, run_migrations
from repositories.trial_folder_repository import TrialFolderError


@pytest.mark.asyncio
async def test_nested_conversion_preserves_attempts_and_hides_empty_branches(test_db, test_user):
    repo = test_db.trial_tests
    trial = await repo.create_trial_test("Есептер", category="Алгебра / Геометрия")
    await repo.upsert_trial_test_draft(test_user["id"], trial["id"], {12: "A"}, 2)
    result = await repo.save_trial_test_result(test_user["id"], trial["id"], 1, 2, 50, {})
    root = (await repo.get_trial_test_folders())[0]
    with pytest.raises(TrialFolderError, match="растаңыз"):
        await repo.create_trial_test_folder("Ішкі", root["id"])
    child = await repo.create_trial_test_folder("Ішкі", root["id"], move_existing_tests=True)
    leaf = await repo.create_trial_test_folder("Модуль", child["id"], move_existing_tests=True)
    empty = await repo.create_trial_test_folder("Бос", root["id"])
    moved = await repo.get_trial_test_by_id(trial["id"])
    assert moved["folder_id"] == leaf["id"] and moved["category"] == root["name"]
    assert (await repo.get_trial_test_draft(test_user["id"], trial["id"]))["current_task_index"] == 2
    assert (await repo.get_user_trial_test_results(test_user["id"]))[0]["id"] == result["id"]
    assert {f["id"] for f in await repo.get_trial_test_folders()} == {root["id"], child["id"], leaf["id"]}
    assert empty["id"] in {f["id"] for f in await repo.get_trial_test_folders(include_empty=True)}
    assert all(f["test_count"] == 1 for f in await repo.get_trial_test_folders())
    assert [t["id"] for t in await repo.get_trial_tests(folder_id=leaf["id"])] == [trial["id"]]
    assert await repo.get_trial_tests(folder_id=root["id"]) == []
    with pytest.raises(TrialFolderError):
        await repo.create_trial_test("Ескі клиент", category=root["name"])
    await repo.update_trial_test_folder(root["id"], name="Жаңа атау")
    assert (await repo.get_trial_test_by_id(trial["id"]))["category"] == "Жаңа атау"
    other = await repo.create_trial_test_folder("Басқа")
    await repo.update_trial_test_folder(child["id"], parent_id=other["id"], move=True)
    assert (await repo.get_trial_test_by_id(trial["id"]))["category"] == "Басқа"


@pytest.mark.asyncio
async def test_invalid_moves_duplicates_and_nonempty_delete(test_db):
    repo = test_db.trial_tests
    root = await repo.create_trial_test_folder("Бір")
    child = await repo.create_trial_test_folder("Екі", root["id"])
    trial = await repo.create_trial_test("Тест", folder_id=child["id"])
    with pytest.raises(TrialFolderError):
        await repo.create_trial_test_folder(" Бір ")
    with pytest.raises(TrialFolderError):
        await repo.update_trial_test_folder(root["id"], parent_id=child["id"], move=True)
    with pytest.raises(TrialFolderError):
        await repo.update_trial_test_folder(child["id"], parent_id=child["id"], move=True)
    with pytest.raises(TrialFolderError):
        await repo.delete_trial_test_folder(root["id"])
    with pytest.raises(TrialFolderError):
        await repo.delete_trial_test_folder(child["id"])
    other = await repo.create_trial_test_folder("Үш")
    with pytest.raises(TrialFolderError):
        await repo.update_trial_test_folder(other["id"], parent_id=child["id"], move=True)
    await repo.update_trial_test(trial["id"], folder_id=other["id"])
    await repo.delete_trial_test_folder(child["id"])
    await repo.delete_trial_test_folder(root["id"])
    assert (await repo.get_trial_test_by_id(trial["id"]))["folder_id"] == other["id"]


@pytest.mark.asyncio
async def test_concurrent_test_and_subfolder_writes_cannot_mix(test_db):
    repo = test_db.trial_tests
    root = await repo.create_trial_test_folder("Concurrent")
    results = await asyncio.gather(
        repo.create_trial_test("Тест", folder_id=root["id"]),
        repo.create_trial_test_folder("Ішкі", root["id"]), return_exceptions=True)
    assert sum(isinstance(r, TrialFolderError) for r in results) == 1
    folders = await repo.get_trial_test_folders(include_empty=True)
    assert all(not (f["child_count"] and f["direct_test_count"]) for f in folders)
    results = await asyncio.gather(repo.create_trial_test_folder("Duplicate"),
                                   repo.create_trial_test_folder("Duplicate"), return_exceptions=True)
    assert sum(isinstance(r, TrialFolderError) for r in results) == 1


@pytest.mark.asyncio
async def test_folder_api_permissions_validation_and_legacy(client, test_db, test_user):
    admin = await test_db.users.create_user_by_email("tree-admin@example.com")
    await test_db.users.set_admin(email=admin["email"], is_admin=True)
    query = {"email": admin["email"]}
    base = "/api/admin/trial-tests/folders"
    for method in ("get", "post", "patch", "delete"):
        url = base if method in ("get", "post") else base + "/1"
        kwargs = {"json": {"name": "Denied"}} if method in ("post", "patch") else {}
        assert getattr(client, method)(url, params={"email": test_user["email"]}, **kwargs).status_code == 403
    created = client.post(base, params=query, json={"name": " Алгебра "})
    assert created.status_code == 200, created.text
    folder_id = created.json()["id"]
    assert client.get("/api/trial-tests/folders").json() == []
    assert client.post(base, params=query, json={"name": "Алгебра"}).status_code == 409
    assert client.post(base, params=query, json={"name": " "}).status_code == 400
    assert client.patch(f"{base}/{folder_id}", params=query, json={"name": None}).status_code == 400
    trial = client.post("/api/admin/trial-tests", data={"email": admin["email"], "title": "Тест", "folder_id": folder_id})
    assert trial.status_code == 200, trial.text
    assert trial.json()["folder_id"] == folder_id
    response = client.post(base, params=query, json={"name": "Ішкі", "parent_id": folder_id, "move_existing_tests": True})
    assert response.status_code == 200, response.text
    child_id = response.json()["id"]
    assert client.get("/api/trial-tests", params={"folder_id": child_id}).json()[0]["id"] == trial.json()["id"]
    assert client.get("/api/trial-tests", params={"category": "Алгебра"}).json()[0]["id"] == trial.json()["id"]
    assert client.post("/api/admin/trial-tests", data={"email": admin["email"], "title": "Ескі", "category": "Алгебра"}).status_code == 409
    assert client.delete(f"{base}/{child_id}", params=query).status_code == 409
    assert client.patch(f"{base}/{child_id}", params=query, json={"parent_id": None}).status_code == 200
    assert client.get("/api/trial-tests", params={"folder_id": child_id}).json()[0]["category"] == "Ішкі"
    assert client.delete(f"{base}/{folder_id}", params=query).status_code == 200


def test_folder_migration_preserves_ids_rows_and_literal_slashes(tmp_path):
    path = str(tmp_path / "folders.db")
    command.upgrade(_build_config(path), "0013_quiz_entry_limits")
    with sqlite3.connect(path) as db:
        db.execute("INSERT INTO users (id, email) VALUES (7, 'migration@example.com')")
        db.execute("INSERT INTO trial_tests (id, title, category) VALUES (41, 'Old', ' Алгебра / Геометрия ')")
        db.execute("INSERT INTO trial_tests (id, title, category) VALUES (42, 'Default', ' ')")
        db.execute("INSERT INTO trial_test_drafts (user_id, trial_test_id, answers) VALUES (7, 41, '{\"1\":\"A\"}')")
        db.execute("INSERT INTO trial_test_results (id, user_id, trial_test_id, answers, attempt_id) VALUES (91, 7, 41, '{}', 'preserved')")
        before = {t: db.execute(f"SELECT * FROM {t}").fetchall() for t in ("trial_test_drafts", "trial_test_results")}
    run_migrations(path)
    run_migrations(path)
    with sqlite3.connect(path) as db:
        assert {r[0] for r in db.execute("SELECT name FROM trial_test_folders")} == {"Алгебра / Геометрия", "Жалпы"}
        assert db.execute("SELECT COUNT(*) FROM trial_tests WHERE folder_id IS NULL").fetchone()[0] == 0
        assert [r[0] for r in db.execute("SELECT id FROM trial_tests ORDER BY id")] == [41, 42]
        for table, rows in before.items():
            assert db.execute(f"SELECT * FROM {table}").fetchall() == rows
        assert not db.execute("PRAGMA foreign_key_check").fetchall()
