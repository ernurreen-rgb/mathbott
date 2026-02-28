"""
File storage helpers for uploaded images.
"""
import logging
import mimetypes
import shutil
import uuid
from pathlib import Path
from typing import Optional

from fastapi import HTTPException, UploadFile


_IMAGES_DIR = Path(__file__).resolve().parents[2] / "images"
_IMAGES_DIR.mkdir(parents=True, exist_ok=True)

logger = logging.getLogger(__name__)


def get_images_dir() -> Path:
    return _IMAGES_DIR


async def save_image_upload(image: UploadFile) -> str:
    if not image or not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Invalid image file")

    ext = Path(image.filename or "").suffix.lower()
    if not ext:
        guessed = mimetypes.guess_extension(image.content_type or "")
        ext = guessed if guessed else ".png"

    filename = f"{uuid.uuid4().hex}{ext}"
    file_path = _IMAGES_DIR / filename

    logger.info(
        "Image upload received: name=%s, content_type=%s",
        image.filename,
        image.content_type,
    )

    content = await image.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty image file")

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
