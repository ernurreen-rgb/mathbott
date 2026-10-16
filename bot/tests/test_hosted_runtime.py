"""Hosted storage/cron contracts without calling external services."""
import io
from unittest.mock import AsyncMock

import pytest
from botocore.exceptions import ClientError
from fastapi import HTTPException, UploadFile
from starlette.datastructures import Headers

from settings import get_settings
import utils.file_storage as files

PNG = b"\x89PNG\r\n\x1a\n" + b"test-image"


class MemoryBucket:
    def __init__(self):
        self.objects = {}

    def put_object(self, *, Bucket, Key, Body, ContentType):
        self.objects[Key] = (Body, ContentType)

    def get_object(self, *, Bucket, Key):
        if Key not in self.objects:
            raise ClientError({"Error": {"Code": "NoSuchKey"}}, "GetObject")
        body, content_type = self.objects[Key]
        return {"Body": io.BytesIO(body), "ContentType": content_type}

    def delete_object(self, *, Bucket, Key):
        self.objects.pop(Key, None)

    def copy_object(self, *, Bucket, Key, CopySource):
        self.objects[Key] = self.objects[CopySource["Key"]]


@pytest.mark.asyncio
async def test_object_storage_upload_read_copy_delete_and_validation(monkeypatch, tmp_path):
    bucket = MemoryBucket()
    monkeypatch.setenv("IMAGE_STORAGE_BACKEND", "s3")
    monkeypatch.setenv("S3_BUCKET", "private-test-bucket")
    monkeypatch.setattr(files, "get_s3_client", lambda: bucket)
    monkeypatch.setattr(files, "_IMAGES_DIR", tmp_path / "must-not-be-created")
    upload = UploadFile(io.BytesIO(PNG), filename="image.png", headers=Headers({"content-type": "image/png"}))
    filename = await files.save_image_upload(upload)
    assert await files.read_object_image(filename) == (PNG, "image/png")
    copied = files.copy_image_file(filename)
    assert copied != filename
    assert await files.read_object_image(copied) == (PNG, "image/png")
    files.delete_image_file(filename)
    with pytest.raises(HTTPException) as missing:
        await files.read_object_image(filename)
    assert missing.value.status_code == 404
    files.delete_image_file("../image.png")
    assert not files.get_images_dir().exists()


def test_cron_requires_secret_before_running_maintenance(client, monkeypatch):
    import routes.maintenance as route
    cycle = AsyncMock(return_value={"ok": True})
    monkeypatch.setattr(route, "run_maintenance_cycle", cycle)
    monkeypatch.delenv("CRON_SECRET", raising=False)
    assert client.get("/api/maintenance").status_code == 401
    monkeypatch.setenv("CRON_SECRET", "test-cron-secret")
    assert client.get("/api/maintenance", headers={"Authorization": "Bearer wrong"}).status_code == 401
    cycle.assert_not_called()
    assert client.get("/api/maintenance", headers={"Authorization": "Bearer test-cron-secret"}).json() == {"ok": True}
    cycle.assert_awaited_once()


def test_vercel_defaults_disable_migrations_and_background_loops(monkeypatch):
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.delenv("DATABASE_AUTO_MIGRATE", raising=False)
    monkeypatch.delenv("BACKGROUND_TASKS_ENABLED", raising=False)
    settings = get_settings()
    assert not settings.migrate_on_startup
    assert not settings.run_background_tasks
