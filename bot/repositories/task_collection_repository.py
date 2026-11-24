"""
Task collections of the task constructor (migration 0020_task_collections).

A collection belongs to one user: every read and write here is scoped by user_id, so one user can
never see or change another user's collection, even by guessing its id.
"""
import json
from typing import Any, Dict, List, Optional, Tuple

import storage as db_driver

from .base import BaseRepository

MAX_COLLECTIONS_PER_USER = 50
MAX_COLLECTION_TASKS = 100
IMAGE_COLUMNS = {"title": "title_image", "background": "background_image"}
_NOW = "to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')"
_LOCK_KEY = "task_collections"


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
        for item in items:
            item["task_count"] = len(item.pop("task_ids"))
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
        async with self._write_transaction(lock_key=_LOCK_KEY) as db:
            db.row_factory = db_driver.Row
            async with db.execute("SELECT COUNT(*) FROM task_collections WHERE user_id = ?", (user_id,)) as cursor:
                row = await cursor.fetchone()
            if int(row[0]) >= MAX_COLLECTIONS_PER_USER:
                raise TaskCollectionLimitError()
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
        async with self._write_transaction(lock_key=_LOCK_KEY) as db:
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

        Returns (found, previous filename) so the caller can delete the replaced file."""
        column = IMAGE_COLUMNS[kind]
        async with self._write_transaction(lock_key=_LOCK_KEY) as db:
            async with db.execute(
                f"SELECT {column} FROM task_collections WHERE id = ? AND user_id = ?", (collection_id, user_id)
            ) as cursor:
                row = await cursor.fetchone()
            if not row:
                return False, None
            await db.execute(
                f"UPDATE task_collections SET {column} = ?, updated_at = {_NOW} WHERE id = ? AND user_id = ?",
                (filename, collection_id, user_id),
            )
        return True, row[0]

    async def delete(self, collection_id: int, user_id: int) -> Tuple[bool, List[str]]:
        """Delete the collection. Returns (found, its image filenames) so the caller removes the files."""
        async with self._write_transaction(lock_key=_LOCK_KEY) as db:
            async with db.execute(
                "DELETE FROM task_collections WHERE id = ? AND user_id = ? RETURNING title_image, background_image",
                (collection_id, user_id),
            ) as cursor:
                row = await cursor.fetchone()
        if not row:
            return False, []
        return True, [name for name in row if name]

    async def _existing_bank_task_ids(self, db, task_ids: List[int]) -> List[int]:
        unique_ids = list(dict.fromkeys(task_ids))
        if not unique_ids:
            return []
        placeholders = ",".join(["?"] * len(unique_ids))
        async with db.execute(
            f"SELECT id FROM bank_tasks WHERE id IN ({placeholders}) AND deleted_at IS NULL", tuple(unique_ids)
        ) as cursor:
            existing = {int(row[0]) for row in await cursor.fetchall()}
        return [task_id for task_id in unique_ids if task_id in existing]
