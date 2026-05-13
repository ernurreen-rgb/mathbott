"""
File storage helpers for uploaded images.
"""
import logging
import mimetypes
import os
import shutil
import uuid
from pathlib import Path
from typing import Optional

from fastapi import HTTPException, UploadFile


_IMAGES_DIR = Path(__file__).resolve().parents[2] / "images"
_IMAGES_DIR.mkdir(parents=True, exist_ok=True)

logger = logging.getLogger(__name__)

ALLOWED_IMAGE_TYPES = {
    "image/jpeg": {".jpg", ".jpeg"},
    "image/png": {".png"},
    "image/gif": {".gif"},
    "image/webp": {".webp"},
}
DEFAULT_MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024


def _get_max_upload_bytes() -> int:
    raw_value = os.getenv("IMAGE_UPLOAD_MAX_BYTES", "").strip()
    if not raw_value:
        return DEFAULT_MAX_IMAGE_UPLOAD_BYTES
    try:
        return max(1, int(raw_value))
    except ValueError:
        logger.warning("Invalid IMAGE_UPLOAD_MAX_BYTES=%s; using default", raw_value)
        return DEFAULT_MAX_IMAGE_UPLOAD_BYTES


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
    if not filename:
        return
    
    file_path = _IMAGES_DIR / filename
    if file_path.exists():
        try:
            file_path.unlink()
            logger.info("Image file deleted: %s", filename)
        except Exception as e:
            logger.warning("Failed to delete image file %s: %s", filename, e)


def copy_image_file(filename: str) -> Optional[str]:
    """Create a physical copy of an existing image and return new filename."""
    if not filename:
        return None

    src_path = _IMAGES_DIR / filename
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
