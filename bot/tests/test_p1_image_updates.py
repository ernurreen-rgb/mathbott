"""Image edits preserve existing bytes on rejection and keep historical images."""
import base64
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

import utils.file_storage as storage

PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aUgAAAABJRU5ErkJggg=="
)


@pytest.fixture
def images_dir(tmp_path, monkeypatch):
    directory = tmp_path / "images"
    directory.mkdir()
    monkeypatch.setattr(storage, "_IMAGES_DIR", directory)
    (directory / "original.png").write_bytes(PNG)
    return directory


async def make_image_task(test_db, test_user, kind):
    await test_db.users.set_admin(email=test_user["email"], is_admin=True)
    bank = await test_db.bank_tasks.create_task(
        text="Original image exercise", answer="4", question_type="input", difficulty="B",
        image_filename="original.png", created_by=test_user["id"],
    )
    if kind == "bank":
        return bank, "PUT", f"/api/admin/bank/tasks/{bank['id']}"
    trial = await test_db.trial_tests.create_trial_test("Image trial", created_by=test_user["id"])
    task = await test_db.trial_tests.create_trial_test_task(
        trial_test_id=trial["id"], text=bank["text"], answer="4",
        bank_task_id=bank["id"], created_by=test_user["id"],
    )
    path = f"/api/admin/trial-tests/{trial['id']}/tasks/{task['id']}"
    return bank, ("POST" if kind == "trial-post" else "PUT"), (path + "/update" if kind == "trial-post" else path)


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["bank", "trial-put", "trial-post"])
async def test_rejected_image_upload_preserves_current_file(client, test_db, test_user, images_dir, kind):
    bank, method, path = await make_image_task(test_db, test_user, kind)
    response = client.request(method, path, data={"email": test_user["email"]},
                              files={"image": ("replacement.png", b"not an image", "image/png")})
    assert response.status_code == 400
    assert (images_dir / "original.png").read_bytes() == PNG
    saved = await test_db.bank_tasks.get_task_by_id(bank["id"])
    assert saved["image_filename"] == "original.png"
    assert saved["current_version"] == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["bank", "trial-put", "trial-post"])
@pytest.mark.parametrize("remove_image", [False, True])
async def test_successful_image_edit_keeps_files_for_rollback(
    client, test_db, test_user, images_dir, kind, remove_image,
):
    bank, method, path = await make_image_task(test_db, test_user, kind)
    form = {"email": test_user["email"]}
    kwargs = {"data": form}
    if remove_image:
        form["remove_image"] = "true"
    else:
        kwargs["files"] = {"image": ("replacement.png", PNG, "image/png")}
    response = client.request(method, path, **kwargs)
    assert response.status_code == 200
    saved = await test_db.bank_tasks.get_task_by_id(bank["id"])
    assert saved["current_version"] == 2
    if remove_image:
        assert not saved["image_filename"]
    else:
        assert saved["image_filename"] != "original.png"
        assert (images_dir / saved["image_filename"]).read_bytes() == PNG
    assert (images_dir / "original.png").read_bytes() == PNG

    rollback = client.post(f"/api/admin/bank/tasks/{bank['id']}/rollback", json={
        "email": test_user["email"], "target_version": 1, "expected_current_version": 2,
    })
    assert rollback.status_code == 200
    assert rollback.json()["image_filename"] == "original.png"
    assert client.get("/api/images/original.png").content == PNG


@pytest.mark.asyncio
@pytest.mark.parametrize("remove_image", [False, True])
async def test_version_conflict_preserves_old_image_and_discards_uncommitted_upload(
    client, test_db, test_user, images_dir, remove_image,
):
    bank, method, path = await make_image_task(test_db, test_user, "bank")
    form = {"email": test_user["email"], "expected_current_version": "0"}
    kwargs = {"data": form}
    if remove_image:
        form["remove_image"] = "true"
    else:
        kwargs["files"] = {"image": ("replacement.png", PNG, "image/png")}
    response = client.request(method, path, **kwargs)
    assert response.status_code == 409
    assert (await test_db.bank_tasks.get_task_by_id(bank["id"]))["image_filename"] == "original.png"
    assert {file.name for file in images_dir.iterdir()} == {"original.png"}


@pytest.mark.asyncio
async def test_duplicate_conflict_happens_before_image_changes(client, test_db, test_user, images_dir):
    bank, method, path = await make_image_task(test_db, test_user, "bank")
    duplicate = await test_db.bank_tasks.create_task(
        text="A different duplicated exercise", answer="5", question_type="input", difficulty="B",
        created_by=test_user["id"],
    )
    response = client.request(method, path, data={"email": test_user["email"], "text": duplicate["text"]},
                              files={"image": ("replacement.png", PNG, "image/png")})
    assert response.status_code == 409
    assert (await test_db.bank_tasks.get_task_by_id(bank["id"]))["image_filename"] == "original.png"
    assert {file.name for file in images_dir.iterdir()} == {"original.png"}


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["bank", "trial-put", "trial-post"])
async def test_database_error_cannot_delete_the_previous_image(
    client, test_db, test_user, images_dir, monkeypatch, kind,
):
    bank, method, path = await make_image_task(test_db, test_user, kind)
    monkeypatch.setattr(test_db.bank_tasks, "update_task", AsyncMock(side_effect=RuntimeError("Write failed")))
    with TestClient(client.app, raise_server_exceptions=False) as failing_client:
        response = failing_client.request(method, path, data={"email": test_user["email"]},
                                          files={"image": ("replacement.png", PNG, "image/png")})
    assert response.status_code == 500
    assert (images_dir / "original.png").read_bytes() == PNG
    assert (await test_db.bank_tasks.get_task_by_id(bank["id"]))["image_filename"] == "original.png"
