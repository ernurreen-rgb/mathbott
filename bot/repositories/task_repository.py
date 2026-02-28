"""
Task repository for module task placements (linked to bank_tasks).
"""
import json
import logging
from typing import Optional, Dict, Any, List

import aiosqlite

from .base import BaseRepository
from .bank_task_repository import BankTaskRepository

logger = logging.getLogger(__name__)


def _difficulty_to_bank_code(value: Any) -> str:
    try:
        n = int(value)
    except Exception:
        return "B"
    if n <= 1:
        return "A"
    if n >= 3:
        return "C"
    return "B"


class TaskRepository(BaseRepository):
    """Repository for module task placement operations."""

    _TASK_SELECT = """
        SELECT
            t.id,
            t.section_id,
            t.mini_lesson_id,
            t.bank_task_id,
            t.task_type,
            t.sort_order,
            t.created_by,
            t.created_at,
            t.updated_at,
            t.deleted_at,
            bt.text AS text,
            bt.answer AS answer,
            bt.question_type AS question_type,
            bt.text_scale AS text_scale,
            bt.options AS options,
            bt.subquestions AS subquestions,
            bt.image_filename AS image_filename,
            bt.solution_filename AS solution_filename,
            bt.difficulty AS difficulty
        FROM tasks t
        LEFT JOIN bank_tasks bt ON bt.id = t.bank_task_id
    """

    @staticmethod
    def _parse_json_field(value: Any) -> Any:
        if value is None:
            return None
        if isinstance(value, (list, dict)):
            return value
        if isinstance(value, str):
            try:
                return json.loads(value)
            except Exception:
                return None
        return None

    async def _create_bank_task(
        self,
        db: aiosqlite.Connection,
        *,
        text: str,
        answer: str,
        question_type: str,
        text_scale: str,
        options: Optional[Any],
        subquestions: Optional[Any],
        image_filename: Optional[str],
        solution_filename: Optional[str],
        created_by: Optional[int],
        difficulty_code: str = "B",
    ) -> int:
        if isinstance(options, str):
            options_value = options
        elif options is None:
            options_value = None
        else:
            options_value = json.dumps(options)

        if isinstance(subquestions, str):
            subquestions_value = subquestions
        elif subquestions is None:
            subquestions_value = None
        else:
            subquestions_value = json.dumps(subquestions)

        cursor = await db.execute(
            """
            INSERT INTO bank_tasks
            (text, answer, question_type, text_scale, options, subquestions, image_filename, solution_filename, difficulty, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                text or "",
                answer or "",
                (question_type or "input").strip() or "input",
                text_scale or "md",
                options_value,
                subquestions_value,
                image_filename,
                solution_filename,
                difficulty_code,
                created_by,
            ),
        )
        return int(cursor.lastrowid)

    async def get_task_by_id(self, task_id: int) -> Optional[Dict[str, Any]]:
        """Get task placement by id with joined bank content."""
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                f"{self._TASK_SELECT} WHERE t.id = ?",
                (task_id,),
            ) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else None

    async def get_random_task(self, exclude_ids: Optional[List[int]] = None) -> Optional[Dict[str, Any]]:
        """Get random active placement task with bank content."""
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            if exclude_ids:
                placeholders = ",".join("?" * len(exclude_ids))
                query = (
                    f"{self._TASK_SELECT} "
                    f"WHERE t.deleted_at IS NULL AND t.id NOT IN ({placeholders}) "
                    "ORDER BY RANDOM() LIMIT 1"
                )
                params: List[Any] = list(exclude_ids)
            else:
                query = f"{self._TASK_SELECT} WHERE t.deleted_at IS NULL ORDER BY RANDOM() LIMIT 1"
                params = []
            async with db.execute(query, params) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else None

    async def create_task(
        self,
        text: str,
        answer: str,
        created_by: int,
        image_filename: Optional[str] = None,
        solution_filename: Optional[str] = None,
        difficulty: int = 1,
        section_id: Optional[int] = None,
        mini_lesson_id: Optional[int] = None,
        question_type: str = "input",
        text_scale: str = "md",
        options: Optional[Any] = None,
        subquestions: Optional[Any] = None,
        task_type: str = "standard",
        sort_order: int = 0,
        bank_task_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Create a task placement. If bank_task_id is missing, create a bank task first."""
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            resolved_bank_task_id = bank_task_id
            if not resolved_bank_task_id:
                resolved_bank_task_id = await self._create_bank_task(
                    db,
                    text=text,
                    answer=answer,
                    question_type=question_type,
                    text_scale=text_scale,
                    options=options,
                    subquestions=subquestions,
                    image_filename=image_filename,
                    solution_filename=solution_filename,
                    created_by=created_by,
                    difficulty_code=_difficulty_to_bank_code(difficulty),
                )

            cursor = await db.execute(
                """
                INSERT INTO tasks
                (section_id, mini_lesson_id, bank_task_id, task_type, sort_order, created_by)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    section_id,
                    mini_lesson_id,
                    resolved_bank_task_id,
                    task_type or "standard",
                    sort_order,
                    created_by,
                ),
            )
            task_id = int(cursor.lastrowid)
            await db.commit()

        task = await self.get_task_by_id(task_id)
        return task or {}

    async def update_task(
        self,
        task_id: int,
        text: Optional[str] = None,
        answer: Optional[str] = None,
        question_type: Optional[str] = None,
        text_scale: Optional[str] = None,
        options: Optional[Any] = None,
        subquestions: Optional[Any] = None,
        image_filename: Optional[str] = None,
        solution_filename: Optional[str] = None,
        task_type: Optional[str] = None,
        sort_order: Optional[int] = None,
    ) -> None:
        """Update placement fields and linked bank task content."""
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT id, bank_task_id FROM tasks WHERE id = ?",
                (task_id,),
            ) as cursor:
                task_row = await cursor.fetchone()
            if not task_row:
                return

            placement_updates: List[str] = []
            placement_params: List[Any] = []
            if task_type is not None:
                placement_updates.append("task_type = ?")
                placement_params.append(task_type)
            if sort_order is not None:
                placement_updates.append("sort_order = ?")
                placement_params.append(sort_order)
            if placement_updates:
                placement_updates.append("updated_at = CURRENT_TIMESTAMP")
                placement_params.append(task_id)
                await db.execute(
                    f"UPDATE tasks SET {', '.join(placement_updates)} WHERE id = ?",
                    placement_params,
                )

            await db.commit()

        bank_task_id = task_row["bank_task_id"]
        if bank_task_id:
            parsed_options = options
            if isinstance(options, str):
                try:
                    parsed_options = json.loads(options) if options.strip() else []
                except Exception:
                    parsed_options = None

            parsed_subquestions = subquestions
            if isinstance(subquestions, str):
                try:
                    parsed_subquestions = json.loads(subquestions) if subquestions.strip() else []
                except Exception:
                    parsed_subquestions = None

            bank_repo = BankTaskRepository(self.db_path)
            await bank_repo.update_task(
                task_id=int(bank_task_id),
                text=text,
                answer=answer,
                question_type=question_type,
                text_scale=text_scale,
                options=parsed_options if options is not None else None,
                subquestions=parsed_subquestions if subquestions is not None else None,
                image_filename=image_filename,
                solution_filename=solution_filename,
                source="task_repository_update",
            )

    async def get_all_tasks(self) -> List[Dict[str, Any]]:
        """Get all placements with joined bank content."""
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                f"{self._TASK_SELECT} ORDER BY t.id DESC"
            ) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]

    async def get_tasks_by_creator(
        self,
        creator_id: int,
        include_deleted: bool = False,
        limit: int = 50,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        """Get placement tasks created by a user."""
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            where = "t.created_by = ?"
            if not include_deleted:
                where += " AND t.deleted_at IS NULL"
            query = (
                f"{self._TASK_SELECT} "
                f"WHERE {where} "
                "ORDER BY t.id DESC LIMIT ? OFFSET ?"
            )
            async with db.execute(query, (creator_id, limit, offset)) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]

    async def get_tasks_count_by_creator(self, creator_id: int, include_deleted: bool = False) -> int:
        async with self._connection() as db:
            where = "created_by = ?"
            if not include_deleted:
                where += " AND deleted_at IS NULL"
            async with db.execute(
                f"SELECT COUNT(*) FROM tasks WHERE {where}",
                (creator_id,),
            ) as cursor:
                row = await cursor.fetchone()
                return int(row[0]) if row else 0

    async def get_deleted_tasks_by_creator(self, creator_id: int) -> List[Dict[str, Any]]:
        """Get soft-deleted placements for a creator."""
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                f"{self._TASK_SELECT} "
                "WHERE t.created_by = ? AND t.deleted_at IS NOT NULL "
                "ORDER BY t.deleted_at DESC",
                (creator_id,),
            ) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]

    async def soft_delete_task(self, task_id: int) -> None:
        async with self._connection() as db:
            await db.execute(
                "UPDATE tasks SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (task_id,),
            )
            await db.commit()

    async def restore_task(self, task_id: int) -> None:
        async with self._connection() as db:
            await db.execute(
                "UPDATE tasks SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (task_id,),
            )
            await db.commit()

    async def cleanup_old_deleted_tasks(self, days: int = 10) -> int:
        """Delete placement tasks that stayed in trash longer than N days."""
        async with self._connection() as db:
            async with db.execute(
                """
                SELECT id FROM tasks
                WHERE deleted_at IS NOT NULL
                  AND deleted_at < datetime('now', '-' || ? || ' days')
                """,
                (days,),
            ) as cursor:
                rows = await cursor.fetchall()
            task_ids = [int(row[0]) for row in rows]
            if not task_ids:
                return 0
            placeholders = ",".join("?" * len(task_ids))
            await db.execute(f"DELETE FROM tasks WHERE id IN ({placeholders})", task_ids)
            await db.commit()
            return len(task_ids)

    async def empty_trash(self, creator_id: Optional[int] = None) -> int:
        async with self._connection() as db:
            if creator_id is not None:
                cursor = await db.execute(
                    "DELETE FROM tasks WHERE deleted_at IS NOT NULL AND created_by = ?",
                    (creator_id,),
                )
            else:
                cursor = await db.execute(
                    "DELETE FROM tasks WHERE deleted_at IS NOT NULL"
                )
            await db.commit()
            return int(cursor.rowcount or 0)

    async def get_tasks_by_section(self, section_id: int) -> List[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                f"{self._TASK_SELECT} "
                "WHERE t.section_id = ? AND t.deleted_at IS NULL "
                "ORDER BY t.sort_order, t.id",
                (section_id,),
            ) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]

    async def get_tasks_by_mini_lesson(self, mini_lesson_id: int) -> List[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                f"{self._TASK_SELECT} "
                "WHERE t.mini_lesson_id = ? AND t.deleted_at IS NULL "
                "ORDER BY t.sort_order, t.id",
                (mini_lesson_id,),
            ) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]

    async def check_answer(self, task_id: int, user_answer: str) -> bool:
        task = await self.get_task_by_id(task_id)
        if not task:
            return False
        correct_answer = (task.get("answer") or "").strip()
        return user_answer.strip().lower() == correct_answer.lower()

    async def get_task_questions(self, task_id: int) -> List[Dict[str, Any]]:
        """
        Legacy helper.
        For bank-only mode we interpret list-like options payload as question list.
        """
        task = await self.get_task_by_id(task_id)
        if not task:
            return []
        options = self._parse_json_field(task.get("options"))
        if isinstance(options, list):
            return [q for q in options if isinstance(q, dict)]
        return []

    async def check_task_question_answer(self, task_id: int, question_index: int, user_answer: str) -> bool:
        questions = await self.get_task_questions(task_id)
        if question_index < 0 or question_index >= len(questions):
            return False
        question = questions[question_index]
        correct_answer = str(question.get("answer", "")).strip()
        return user_answer.strip().lower() == correct_answer.lower()

    async def reset_task_id_counter(self) -> bool:
        """Reset tasks AUTOINCREMENT counter only when table is empty."""
        async with self._connection() as db:
            async with db.execute("SELECT COUNT(*) FROM tasks") as cursor:
                row = await cursor.fetchone()
                count = int(row[0]) if row else 0
            if count > 0:
                return False
            await db.execute("DELETE FROM sqlite_sequence WHERE name = 'tasks'")
            await db.commit()
            return True
