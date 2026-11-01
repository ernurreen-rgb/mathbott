"""Committed bank images outlive task deletion and remain readable by snapshots."""
import json

import pytest

from tests.test_hosted_runtime import MemoryBucket, PNG
from utils.public_payload import task_review_snapshot
import utils.file_storage as files


@pytest.fixture(params=["local", "s3"])
def stored_image(request, tmp_path, monkeypatch):
    filename = "retained-history.png"
    monkeypatch.setenv("IMAGE_STORAGE_BACKEND", request.param)
    monkeypatch.setattr(files, "_IMAGES_DIR", tmp_path / "images")
    if request.param == "local":
        files.get_images_dir().mkdir()
        (files.get_images_dir() / filename).write_bytes(PNG)
    else:
        bucket = MemoryBucket()
        bucket.put_object(Bucket="retention-test", Key=filename, Body=PNG, ContentType="image/png")
        monkeypatch.setenv("S3_BUCKET", "retention-test")
        monkeypatch.setattr(files, "get_s3_client", lambda: bucket)
    return filename


async def remove_bank_task(test_db, client, task_id, email, removal):
    await test_db.bank_tasks.soft_delete_task(task_id)
    if removal == "cleanup":
        async with test_db.bank_tasks._connection() as connection:
            await connection.execute(
                "UPDATE bank_tasks SET deleted_at = '2000-01-01 00:00:00' WHERE id = ?", (task_id,),
            )
            await connection.commit()
        assert await test_db.bank_tasks.cleanup_old_deleted_tasks(days=30) == 1
        assert await test_db.bank_tasks.cleanup_old_deleted_tasks(days=30) == 0
    else:
        response = client.delete(f"/api/admin/bank/tasks/{task_id}/permanent", params={"email": email})
        assert response.status_code == 200
        assert response.json() == {"success": True}
    assert await test_db.bank_tasks.get_task_by_id(task_id, include_deleted=True) is None


@pytest.mark.asyncio
@pytest.mark.parametrize("removal", ["cleanup", "permanent"])
@pytest.mark.parametrize("reference", ["solo", "coop", "quiz_snapshot", "shared_version"])
async def test_purging_bank_task_preserves_referenced_image(
    client, test_db, test_user, stored_image, removal, reference,
):
    await test_db.users.set_admin(email=test_user["email"], is_admin=True)
    bank = await test_db.bank_tasks.create_task(
        text="Image exercise", answer="4", question_type="input", difficulty="B",
        image_filename=stored_image, created_by=test_user["id"],
    )

    if reference in {"solo", "coop"}:
        trial = await test_db.trial_tests.create_trial_test("Image history", created_by=test_user["id"])
        task = await test_db.trial_tests.create_trial_test_task(
            trial["id"], "", "", bank_task_id=bank["id"], created_by=test_user["id"],
        )
        session_id = None
        if reference == "coop":
            session = await test_db.trial_test_coop.create_session(trial["id"], test_user["id"])
            session_id = session["id"]
            await test_db.trial_test_coop.add_participant(session_id, test_user["id"], "red")
        await test_db.trial_tests.submit_trial_test_attempt(
            user_id=test_user["id"], trial_test_id=trial["id"], score=0, total=1, percentage=0,
            answers={task["id"]: {"answer": "", "correct": False, "correct_answer": "4",
                                   "task": task_review_snapshot(task)}},
            completions=[], should_update_streak=False, submit_mode=reference, coop_session_id=session_id,
        )
    elif reference == "quiz_snapshot":
        quiz = await test_db.quizzes.create_quiz(
            "Frozen image", test_user["id"], questions=[{
                "question_text": "Image exercise", "question_type": "input", "correct_answer": "4",
                "image_filename": stored_image,
            }],
        )
        session = await test_db.quizzes.create_session(quiz["id"], test_user["id"])
        question = (await test_db.quizzes.get_quiz_questions(quiz["id"]))[0]
        await test_db.quizzes.update_question(question["id"], image_filename="")
    else:
        shared = await test_db.bank_tasks.create_task(
            text="Other image exercise", answer="5", question_type="input", difficulty="B",
            image_filename=stored_image, created_by=test_user["id"],
        )
        await test_db.bank_tasks.update_task(shared["id"], image_filename="")

    image_url = f"/api/images/{stored_image}"
    assert client.get(image_url).content == PNG
    await remove_bank_task(test_db, client, bank["id"], test_user["email"], removal)

    if reference in {"solo", "coop"}:
        results = await test_db.trial_tests.get_user_trial_test_results(test_user["id"], trial["id"])
        assert len(results) == 1
        assert json.loads(results[0]["answers"])[str(task["id"])]["task"]["image_filename"] == stored_image
    elif reference == "quiz_snapshot":
        async with test_db.quizzes._connection() as connection:
            async with connection.execute(
                "SELECT snapshot_json FROM quiz_session_questions WHERE session_id = ?", (session["id"],),
            ) as cursor:
                snapshot = await cursor.fetchone()
        assert snapshot is not None
        assert json.loads(snapshot[0])["image_filename"] == stored_image
    else:
        assert await test_db.bank_tasks.get_task_by_id(shared["id"]) is not None
        version = await test_db.bank_tasks.get_task_version(shared["id"], 1)
        assert version["snapshot"]["image_filename"] == stored_image

    response = client.get(image_url)
    assert response.status_code == 200
    assert response.content == PNG


@pytest.mark.asyncio
async def test_cleanup_keeps_recently_deleted_tasks_and_their_images(client, test_db, test_user, stored_image):
    bank = await test_db.bank_tasks.create_task(
        text="Recent image", answer="4", question_type="input", difficulty="B",
        image_filename=stored_image, created_by=test_user["id"],
    )
    await test_db.bank_tasks.soft_delete_task(bank["id"])
    assert await test_db.bank_tasks.cleanup_old_deleted_tasks(days=30) == 0
    assert await test_db.bank_tasks.get_task_by_id(bank["id"], include_deleted=True) is not None
    assert client.get(f"/api/images/{stored_image}").content == PNG
