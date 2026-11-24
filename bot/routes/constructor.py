"""
Task constructor (web /task-builder): a signed-in user filters bank tasks, keeps the ones they want in
a saved collection and downloads it as a PDF worksheet or a PPTX deck. The files are built in the
browser; the API serves the tasks and stores the collections and their two background images.

Any signed-in user may use it, students included, and sees the whole bank (twins excepted). Task
lists never carry answers; only the export of the user's own collection does, for its answer key.
"""
import logging
from typing import Any, Dict, List, Literal, Optional

from fastapi import Depends, FastAPI, File, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel, Field, field_validator
from slowapi import Limiter

from database import Database
from dependencies import get_db, require_internal_identity
from repositories.task_collection_repository import (
    MAX_COLLECTION_TASKS,
    MAX_COLLECTIONS_PER_USER,
    TaskCollectionLimitError,
)
from utils.file_storage import delete_image_file_async, save_image_upload

logger = logging.getLogger(__name__)

QUESTION_TYPES = Literal["input", "tf", "mcq", "mcq6", "select"]
IMAGE_KINDS = Literal["title", "background"]
_BACKGROUND_TYPES = {"image/jpeg", "image/png"}
_TITLE_MAX = 120


def _clean_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    return " ".join(value.split())


class CreateCollectionRequest(BaseModel):
    title: str = Field(min_length=1, max_length=_TITLE_MAX)

    @field_validator("title")
    @classmethod
    def _title(cls, value: str) -> str:
        cleaned = _clean_text(value)
        if not cleaned:
            raise ValueError("title must not be empty")
        return cleaned


class UpdateCollectionRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=_TITLE_MAX)
    header_text: Optional[str] = Field(default=None, max_length=_TITLE_MAX)
    task_ids: Optional[List[int]] = Field(default=None, max_length=MAX_COLLECTION_TASKS)

    @field_validator("title")
    @classmethod
    def _title(cls, value: Optional[str]) -> Optional[str]:
        cleaned = _clean_text(value)
        if value is not None and not cleaned:
            raise ValueError("title must not be empty")
        return cleaned

    @field_validator("header_text")
    @classmethod
    def _header(cls, value: Optional[str]) -> Optional[str]:
        return _clean_text(value)

    @field_validator("task_ids")
    @classmethod
    def _task_ids(cls, value: Optional[List[int]]) -> Optional[List[int]]:
        if value is None:
            return None
        if any(task_id <= 0 for task_id in value):
            raise ValueError("task ids must be positive")
        if len(set(value)) != len(value):
            raise ValueError("a task can be in a collection only once")
        return value


def _public_task(task: Dict[str, Any], *, with_answers: bool = False) -> Dict[str, Any]:
    """What the constructor shows of a bank task. Answers only when `with_answers`."""
    options = [
        {"label": str(option.get("label") or ""), "text": str(option.get("text") or "")}
        for option in (task.get("options") or [])
        if isinstance(option, dict)
    ]
    subquestions = []
    for subquestion in task.get("subquestions") or []:
        if not isinstance(subquestion, dict):
            continue
        item = {"text": str(subquestion.get("text") or "")}
        if with_answers:
            item["correct"] = str(subquestion.get("correct") or "")
        subquestions.append(item)
    item = {
        "id": int(task["id"]),
        "text": task.get("text") or "",
        "text_scale": task.get("text_scale") or "md",
        "question_type": task.get("question_type") or "input",
        "answer_mode": task.get("answer_mode") or "choices",
        "difficulty": task.get("difficulty") or "B",
        "topics": list(task.get("topics") or []),
        "image_filename": task.get("image_filename") or None,
        "options": options,
        "subquestions": subquestions,
    }
    if with_answers:
        item["answer"] = task.get("answer") or ""
        item["accepted_answers"] = list(task.get("accepted_answers") or [])
    return item


def _collection_summary(collection: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": int(collection["id"]),
        "title": collection["title"],
        "header_text": collection.get("header_text") or "",
        "title_image": collection.get("title_image"),
        "background_image": collection.get("background_image"),
        "created_at": collection.get("created_at"),
        "updated_at": collection.get("updated_at"),
    }


async def _collection_with_tasks(db: Database, collection: Dict[str, Any], *, with_answers: bool) -> Dict[str, Any]:
    tasks = await db.bank_tasks.get_active_tasks_by_ids(collection["task_ids"])
    return {
        **_collection_summary(collection),
        "tasks": [_public_task(task, with_answers=with_answers) for task in tasks],
    }


async def _owned_collection(db: Database, collection_id: int, user: dict) -> Dict[str, Any]:
    collection = await db.task_collections.get(collection_id, int(user["id"]))
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")
    return collection


def setup_constructor_routes(app: FastAPI, db: Database, limiter: Limiter):
    @app.get("/api/constructor/tasks")
    @limiter.limit("60/minute")
    async def list_constructor_tasks(
        request: Request,
        current_user: dict = Depends(require_internal_identity),
        db: Database = Depends(get_db),
        search: Optional[str] = Query(None, max_length=200),
        difficulty: Optional[Literal["A", "B", "C"]] = Query(None),
        topics: Optional[str] = Query(None, max_length=2000, description="Comma-separated topics"),
        topic_match: Literal["any", "all"] = Query("any"),
        question_type: Optional[QUESTION_TYPES] = Query(None),
        limit: int = Query(20, ge=1, le=50),
        offset: int = Query(0, ge=0, le=100_000),
    ):
        topic_names = [name.strip() for name in (topics or "").split(",") if name.strip()][:20]
        result = await db.bank_tasks.list_tasks(
            include_deleted=False,
            search=search,
            difficulty=difficulty,
            topics=topic_names,
            limit=limit,
            offset=offset,
            question_type=question_type,
            topic_match=topic_match,
            sort="newest",
            twins="exclude",
        )
        return {
            "items": [_public_task(task) for task in result["items"]],
            "total": result["total"],
            "limit": result["limit"],
            "offset": result["offset"],
            "has_more": result["has_more"],
        }

    @app.get("/api/constructor/topics")
    @limiter.limit("60/minute")
    async def list_constructor_topics(
        request: Request,
        current_user: dict = Depends(require_internal_identity),
        db: Database = Depends(get_db),
        q: Optional[str] = Query(None, max_length=80),
    ):
        return {"items": await db.bank_tasks.list_topics(query=q, limit=300)}

    @app.get("/api/constructor/collections")
    async def list_task_collections(
        current_user: dict = Depends(require_internal_identity),
        db: Database = Depends(get_db),
    ):
        return {
            "items": await db.task_collections.list_for_user(int(current_user["id"])),
            "max_collections": MAX_COLLECTIONS_PER_USER,
            "max_tasks": MAX_COLLECTION_TASKS,
        }

    @app.post("/api/constructor/collections")
    @limiter.limit("20/minute")
    async def create_task_collection(
        request: Request,
        payload: CreateCollectionRequest,
        current_user: dict = Depends(require_internal_identity),
        db: Database = Depends(get_db),
    ):
        try:
            collection = await db.task_collections.create(int(current_user["id"]), payload.title)
        except TaskCollectionLimitError:
            raise HTTPException(
                status_code=409,
                detail=f"You can keep at most {MAX_COLLECTIONS_PER_USER} collections. Delete one first.",
            )
        return await _collection_with_tasks(db, collection, with_answers=False)

    @app.get("/api/constructor/collections/{collection_id}")
    async def get_task_collection(
        collection_id: int,
        current_user: dict = Depends(require_internal_identity),
        db: Database = Depends(get_db),
    ):
        collection = await _owned_collection(db, collection_id, current_user)
        return await _collection_with_tasks(db, collection, with_answers=False)

    @app.put("/api/constructor/collections/{collection_id}")
    @limiter.limit("60/minute")
    async def update_task_collection(
        request: Request,
        collection_id: int,
        payload: UpdateCollectionRequest,
        current_user: dict = Depends(require_internal_identity),
        db: Database = Depends(get_db),
    ):
        updated = await db.task_collections.update(
            collection_id,
            int(current_user["id"]),
            title=payload.title,
            header_text=payload.header_text,
            task_ids=payload.task_ids,
        )
        if not updated:
            raise HTTPException(status_code=404, detail="Collection not found")
        return await _collection_with_tasks(db, updated, with_answers=False)

    @app.delete("/api/constructor/collections/{collection_id}")
    async def delete_task_collection(
        collection_id: int,
        current_user: dict = Depends(require_internal_identity),
        db: Database = Depends(get_db),
    ):
        found, filenames = await db.task_collections.delete(collection_id, int(current_user["id"]))
        if not found:
            raise HTTPException(status_code=404, detail="Collection not found")
        for filename in filenames:
            await delete_image_file_async(filename)
        return {"deleted": True}

    @app.get("/api/constructor/collections/{collection_id}/export")
    @limiter.limit("30/minute")
    async def export_task_collection(
        request: Request,
        collection_id: int,
        current_user: dict = Depends(require_internal_identity),
        db: Database = Depends(get_db),
    ):
        """The collection with answers, for the answer key of the PDF and the PPTX."""
        collection = await _owned_collection(db, collection_id, current_user)
        return await _collection_with_tasks(db, collection, with_answers=True)

    @app.post("/api/constructor/collections/{collection_id}/images/{kind}")
    @limiter.limit("20/minute")
    async def upload_task_collection_image(
        request: Request,
        collection_id: int,
        kind: IMAGE_KINDS,
        image: UploadFile = File(...),
        current_user: dict = Depends(require_internal_identity),
        db: Database = Depends(get_db),
    ):
        """Set the PPTX title-slide image ("title") or the task-slide background ("background")."""
        await _owned_collection(db, collection_id, current_user)
        declared = (image.content_type or "").split(";")[0].strip().lower()
        if declared not in _BACKGROUND_TYPES:
            raise HTTPException(status_code=400, detail="Upload a JPG or PNG image")
        filename = await save_image_upload(image)
        try:
            found, previous = await db.task_collections.set_image(
                collection_id, int(current_user["id"]), kind, filename
            )
        except BaseException:
            await delete_image_file_async(filename)
            raise
        if not found:
            await delete_image_file_async(filename)
            raise HTTPException(status_code=404, detail="Collection not found")
        if previous and previous != filename:
            await delete_image_file_async(previous)
        collection = await _owned_collection(db, collection_id, current_user)
        return _collection_summary(collection)

    @app.delete("/api/constructor/collections/{collection_id}/images/{kind}")
    async def delete_task_collection_image(
        collection_id: int,
        kind: IMAGE_KINDS,
        current_user: dict = Depends(require_internal_identity),
        db: Database = Depends(get_db),
    ):
        found, previous = await db.task_collections.set_image(collection_id, int(current_user["id"]), kind, None)
        if not found:
            raise HTTPException(status_code=404, detail="Collection not found")
        if previous:
            await delete_image_file_async(previous)
        collection = await _owned_collection(db, collection_id, current_user)
        return _collection_summary(collection)
