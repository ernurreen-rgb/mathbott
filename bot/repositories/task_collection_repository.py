"""
Task collections of the task constructor (migration 0020_task_collections).

A collection belongs to one user: every read and write here is scoped by user_id, so one user can
never see or change another user's collection, even by guessing its id.
"""
import json
from typing import Any, Dict, List, Optional, Tuple

import storage as db_driver

from .bank.twins import NOT_DRAFT_TWIN_SQL
from .base import BaseRepository

MAX_COLLECTIONS_PER_USER = 50
MAX_COLLECTION_TASKS = 100
IMAGE_COLUMNS = {"title": "title_image", "background": "background_image"}
_NOW = "to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')"


def _lock_key(user_id: int) -> str:
    return f"task_collections:{int(user_id)}"


class TaskCollectionLimitError(Exception):
    """The user already has MAX_COLLECTIONS_PER_USER collections."""


def _task_ids(value: Any) -> List[int]:
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except ValueError:
            return []
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, int) and not isinstance(item, bool) and item > 0]


def _serialize(row: Any) -> Dict[str, Any]:
    item = dict(row)
    item["task_ids"] = _task_ids(item.get("task_ids"))
    return item


class TaskCollectionRepository(BaseRepository):
    async def list_for_user(self, user_id: int) -> List[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = db_driver.Row
            async with db.execute(
                """SELECT id, title, header_text, task_ids, title_image, background_image, created_at, updated_at
                   FROM task_collections WHERE user_id = ?
                   ORDER BY updated_at DESC, id DESC""",
                (user_id,),
            ) as cursor:
                rows = await cursor.fetchall()
            items = [_serialize(row) for row in rows]
            all_ids = list(dict.fromkeys(tid for item in items for tid in item["task_ids"]))
            active_ids = set(await self._existing_bank_task_ids(db, all_ids)) if all_ids else set()
        for item in items:
            raw_ids = item.pop("task_ids")
            item["task_count"] = sum(1 for tid in dict.fromkeys(raw_ids) if tid in active_ids)
        return items

    async def get(self, collection_id: int, user_id: int) -> Optional[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = db_driver.Row
            async with db.execute(
                "SELECT * FROM task_collections WHERE id = ? AND user_id = ?", (collection_id, user_id)
            ) as cursor:
                row = await cursor.fetchone()
        return _serialize(row) if row else None

    async def create(self, user_id: int, title: str) -> Dict[str, Any]:
        async with self._write_transaction(lock_key=_lock_key(user_id)) as db:
            db.row_factory = db_driver.Row
            async with db.execute("SELECT COUNT(*) FROM task_collections WHERE user_id = ?", (user_id,)) as cursor:
                row = await cursor.fetchone()
            if int(row[0]) >= MAX_COLLECTIONS_PER_USER:
                raise TaskCollectionLimitError()
            # Inherit the teacher's latest design settings (PDF header, PPTX font, slide images).
            async with db.execute(
                """SELECT header_text, pptx_font, title_image, background_image
                   FROM task_collections
                   WHERE user_id = ?
                   ORDER BY updated_at DESC, id DESC
                   LIMIT 1""",
                (user_id,),
            ) as cursor:
                template = await cursor.fetchone()
            if template:
                async with db.execute(
                    """INSERT INTO task_collections (user_id, title, header_text, pptx_font, title_image, background_image)
                       VALUES (?, ?, ?, ?, ?, ?) RETURNING *""",
                    (
                        user_id,
                        title,
                        template["header_text"] or "",
                        template["pptx_font"] or "JUZ40 FONTS",
                        template["title_image"],
                        template["background_image"],
                    ),
                ) as cursor:
                    created = await cursor.fetchone()
            else:
                async with db.execute(
                    "INSERT INTO task_collections (user_id, title) VALUES (?, ?) RETURNING *", (user_id, title)
                ) as cursor:
                    created = await cursor.fetchone()
        return _serialize(created)

    async def update(
        self,
        collection_id: int,
        user_id: int,
        *,
        title: Optional[str] = None,
        header_text: Optional[str] = None,
        task_ids: Optional[List[int]] = None,
        pptx_font: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Change the given fields. task_ids keeps only bank tasks that exist and are not deleted."""
        assignments: List[str] = []
        params: List[Any] = []
        if title is not None:
            assignments.append("title = ?")
            params.append(title)
        if header_text is not None:
            assignments.append("header_text = ?")
            params.append(header_text)
        if pptx_font is not None:
            assignments.append("pptx_font = ?")
            params.append(pptx_font)
        async with self._write_transaction(lock_key=_lock_key(user_id)) as db:
            db.row_factory = db_driver.Row
            if task_ids is not None:
                kept = await self._existing_bank_task_ids(db, task_ids)
                assignments.append("task_ids = CAST(? AS JSONB)")
                params.append(json.dumps(kept[:MAX_COLLECTION_TASKS]))
            assignments.append(f"updated_at = {_NOW}")
            async with db.execute(
                f"UPDATE task_collections SET {', '.join(assignments)} WHERE id = ? AND user_id = ? RETURNING *",
                (*params, collection_id, user_id),
            ) as cursor:
                row = await cursor.fetchone()
        return _serialize(row) if row else None

    async def set_image(
        self, collection_id: int, user_id: int, kind: str, filename: Optional[str]
    ) -> Tuple[bool, Optional[str]]:
        """Point the title or background image at `filename` (None removes it).

        Returns (found, previous filename to delete) — only when no other collection still uses it."""
        column = IMAGE_COLUMNS[kind]
        async with self._write_transaction(lock_key=_lock_key(user_id)) as db:
            async with db.execute(
                f"SELECT {column} FROM task_collections WHERE id = ? AND user_id = ?", (collection_id, user_id)
            ) as cursor:
                row = await cursor.fetchone()
            if not row:
                return False, None
            previous = row[0]
            await db.execute(
                f"UPDATE task_collections SET {column} = ?, updated_at = {_NOW} WHERE id = ? AND user_id = ?",
                (filename, collection_id, user_id),
            )
            deletable = (
                previous
                if previous and previous != filename and not await self._is_image_referenced(db, previous)
                else None
            )
        return True, deletable

    async def delete(self, collection_id: int, user_id: int) -> Tuple[bool, List[str]]:
        """Delete the collection. Returns (found, unreferenced image filenames) so the caller removes only unused files."""
        async with self._write_transaction(lock_key=_lock_key(user_id)) as db:
            async with db.execute(
                "DELETE FROM task_collections WHERE id = ? AND user_id = ? RETURNING title_image, background_image",
                (collection_id, user_id),
            ) as cursor:
                row = await cursor.fetchone()
            if not row:
                return False, []
            candidates = list(dict.fromkeys(name for name in row if name))
            deletable = [name for name in candidates if not await self._is_image_referenced(db, name)]
        return True, deletable

    async def record_download(
        self,
        collection_id: int,
        user_id: int,
        *,
        collection_title: str,
        fmt: str,
        include_answers: bool,
        task_count: int,
    ) -> None:
        """Record a PDF or PPTX export event once migration 0024 is applied."""
        async with self._write_transaction() as db:
            if not await self._has_collection_download_tracking(db):
                return
            await db.execute(
                """INSERT INTO task_collection_downloads
                       (collection_id, collection_title, user_id, format, include_answers, task_count)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    int(collection_id),
                    (collection_title or "")[:120],
                    int(user_id),
                    fmt,
                    1 if include_answers else 0,
                    max(0, int(task_count)),
                ),
            )

    async def _is_image_referenced(self, db, filename: str) -> bool:
        async with db.execute(
            "SELECT 1 FROM task_collections WHERE title_image = ? OR background_image = ? LIMIT 1",
            (filename, filename),
        ) as cursor:
            return (await cursor.fetchone()) is not None

    async def _existing_bank_task_ids(self, db, task_ids: List[int]) -> List[int]:
        unique_ids = list(dict.fromkeys(task_ids))
        if not unique_ids:
            return []
        existing: set[int] = set()
        chunk_size = 500
        for start in range(0, len(unique_ids), chunk_size):
            chunk = unique_ids[start:start + chunk_size]
            placeholders = ",".join(["?"] * len(chunk))
            async with db.execute(
                f"SELECT bt.id FROM bank_tasks bt WHERE bt.id IN ({placeholders}) AND bt.deleted_at IS NULL AND {NOT_DRAFT_TWIN_SQL}",
                tuple(chunk),
            ) as cursor:
                existing.update(int(row[0]) for row in await cursor.fetchall())
        return [task_id for task_id in unique_ids if task_id in existing]
