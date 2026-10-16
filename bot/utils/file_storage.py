"""
File storage helpers for uploaded images.
"""
import logging
import asyncio
import mimetypes
import os
import re
import shutil
import uuid
from pathlib import Path
from typing import Optional
from functools import lru_cache

from fastapi import HTTPException, UploadFile

from settings import get_settings


_IMAGES_DIR = Path(os.environ.get("IMAGES_DIR", Path(__file__).resolve().parents[2] / "images"))

logger = logging.getLogger(__name__)

ALLOWED_IMAGE_TYPES = {
    "image/jpeg": {".jpg", ".jpeg"},
    "image/png": {".png"},
    "image/gif": {".gif"},
    "image/webp": {".webp"},
}
DEFAULT_MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024
STORED_IMAGE_FILENAME_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")


def _get_max_upload_bytes() -> int:
    return get_settings().image_upload_limit_bytes


def _detect_image_type(content: bytes) -> tuple[Optional[str], Optional[str]]:
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg", ".jpg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png", ".png"
    if content.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif", ".gif"
    if len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp", ".webp"
    return None, None


def get_images_dir() -> Path:
    return _IMAGES_DIR


def uses_object_storage() -> bool:
    return get_settings().image_storage_backend == "s3"


@lru_cache(maxsize=4)
def _make_s3_client(endpoint, region, access_key, secret_key):
    import boto3
    from botocore.config import Config
    return boto3.client(
        "s3", endpoint_url=endpoint or None, region_name=region,
        aws_access_key_id=access_key or None, aws_secret_access_key=secret_key or None,
        config=Config(signature_version="s3v4", connect_timeout=10, read_timeout=15,
                      retries={"max_attempts": 2}, s3={"addressing_style": "path"}),
    )


def get_s3_client():
    settings = get_settings()
    return _make_s3_client(settings.s3_endpoint_url, settings.s3_region,
                           settings.s3_access_key_id, settings.s3_secret_access_key)


async def read_object_image(filename: str):
    """Read from a private bucket without exposing credentials or signed URLs."""
    safe_filename = normalize_stored_image_filename(filename)
    if not safe_filename:
        raise HTTPException(status_code=400, detail="Invalid image filename")
    def read():
        from botocore.exceptions import ClientError
        try:
            result = get_s3_client().get_object(Bucket=get_settings().s3_bucket, Key=safe_filename)
            body = result["Body"]
            try:
                return body.read(), result.get("ContentType", "application/octet-stream")
            finally:
                body.close()
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") in {"NoSuchKey", "404", "NotFound"}:
                raise HTTPException(status_code=404, detail="Image not found") from exc
            raise HTTPException(status_code=503, detail="Image storage is temporarily unavailable") from exc
    return await asyncio.to_thread(read)


def normalize_stored_image_filename(filename: str) -> Optional[str]:
    """Return a safe stored image basename, or None when the value is unsafe."""
    if not isinstance(filename, str):
        return None
    value = filename.strip()
    if not value or Path(value).name != value:
        return None
    if "/" in value or "\\" in value or not STORED_IMAGE_FILENAME_PATTERN.fullmatch(value):
        return None
    ext = Path(value).suffix.lower()
    allowed_exts = {ext for exts in ALLOWED_IMAGE_TYPES.values() for ext in exts}
    if ext not in allowed_exts:
        return None
    return value


def _resolve_image_path(filename: str) -> Optional[Path]:
    safe_filename = normalize_stored_image_filename(filename)
    if not safe_filename:
        return None
    images_dir = _IMAGES_DIR.resolve()
    file_path = (images_dir / safe_filename).resolve()
    if images_dir not in file_path.parents:
        return None
    return file_path


async def save_image_upload(image: UploadFile) -> str:
    declared_content_type = (image.content_type or "").split(";")[0].strip().lower() if image else ""
    if not image or declared_content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Invalid image file")

    ext = Path(image.filename or "").suffix.lower()
    if not ext:
        guessed = mimetypes.guess_extension(declared_content_type)
        ext = guessed if guessed else ".png"
    if ext not in ALLOWED_IMAGE_TYPES[declared_content_type]:
        raise HTTPException(status_code=400, detail="Unsupported image extension")

    logger.info(
        "Image upload received: name=%s, content_type=%s",
        image.filename,
        declared_content_type,
    )

    max_upload_bytes = _get_max_upload_bytes()
    content = await image.read(max_upload_bytes + 1)
    if not content:
        raise HTTPException(status_code=400, detail="Empty image file")
    if len(content) > max_upload_bytes:
        raise HTTPException(status_code=413, detail="Image file is too large")

    detected_content_type, detected_ext = _detect_image_type(content)
    if detected_content_type != declared_content_type:
        raise HTTPException(status_code=400, detail="Invalid image file")
    if detected_ext and ext not in ALLOWED_IMAGE_TYPES[detected_content_type]:
        raise HTTPException(status_code=400, detail="Unsupported image extension")

    filename = f"{uuid.uuid4().hex}{ext}"
    if uses_object_storage():
        try:
            await asyncio.to_thread(get_s3_client().put_object, Bucket=get_settings().s3_bucket,
                                    Key=filename, Body=content, ContentType=detected_content_type)
        except Exception as exc:
            raise HTTPException(status_code=503, detail="Image storage is temporarily unavailable") from exc
    else:
        _IMAGES_DIR.mkdir(parents=True, exist_ok=True)
        file_path = _IMAGES_DIR / filename
        with open(file_path, "wb") as f:
            f.write(content)

    logger.info(
        "Image saved: filename=%s, bytes=%s",
        filename,
        len(content),
    )

    return filename


def delete_image_file(filename: str) -> None:
    """Delete an image file from the images directory."""
    if uses_object_storage():
        safe_filename = normalize_stored_image_filename(filename)
        if safe_filename:
            try:
                get_s3_client().delete_object(Bucket=get_settings().s3_bucket, Key=safe_filename)
            except Exception:
                logger.warning("Image deletion in object storage failed")
        return
    file_path = _resolve_image_path(filename)
    if file_path is None:
        logger.warning("Refusing to delete unsafe image filename: %s", filename)
        return

    if file_path.exists():
        try:
            file_path.unlink()
            logger.info("Image file deleted: %s", file_path.name)
        except Exception as e:
            logger.warning("Failed to delete image file %s: %s", filename, e)


def copy_image_file(filename: str) -> Optional[str]:
    """Create a physical copy of an existing image and return new filename."""
    if uses_object_storage():
        safe_filename = normalize_stored_image_filename(filename)
        if not safe_filename:
            return None
        new_filename = f"{uuid.uuid4().hex}{Path(safe_filename).suffix.lower()}"
        try:
            bucket = get_settings().s3_bucket
            get_s3_client().copy_object(Bucket=bucket, Key=new_filename,
                                       CopySource={"Bucket": bucket, "Key": safe_filename})
            return new_filename
        except Exception:
            logger.warning("Image copy in object storage failed")
            return None
    src_path = _resolve_image_path(filename)
    if src_path is None:
        logger.warning("Refusing to copy unsafe image filename: %s", filename)
        return None

    if not src_path.exists() or not src_path.is_file():
        logger.warning("Source image for copy not found: %s", filename)
        return None

    ext = src_path.suffix.lower() or ".png"
    new_filename = f"{uuid.uuid4().hex}{ext}"
    dst_path = _IMAGES_DIR / new_filename

    try:
        shutil.copy2(src_path, dst_path)
        logger.info("Image file copied: %s -> %s", filename, new_filename)
        return new_filename
    except Exception as e:
        logger.warning("Failed to copy image file %s: %s", filename, e)
        return None
