"""
Trial test repository (placement model with bank_tasks as content source).
"""
import aiosqlite
import json
import logging
from datetime import date, datetime
from typing import Optional, List, Dict, Any

from .base import BaseRepository
from .bank_task_repository import BankTaskRepository

logger = logging.getLogger(__name__)


class TrialTestRepository(BaseRepository):
    """Repository for trial test operations."""

    _TRIAL_TASK_SELECT = """
        SELECT
            ttt.id,
            ttt.trial_test_id,
            ttt.bank_task_id,
            ttt.sort_order,
            ttt.created_by,
            ttt.created_at,
            ttt.updated_at,
            ttt.deleted_at,
            bt.text AS text,
            bt.answer AS answer,
            bt.question_type AS question_type,
            bt.text_scale AS text_scale,
            bt.options AS options,
            bt.subquestions AS subquestions,
            bt.image_filename AS image_filename,
            bt.solution_filename AS solution_filename,
            bt.difficulty AS bank_difficulty
        FROM trial_test_tasks ttt
        LEFT JOIN bank_tasks bt ON bt.id = ttt.bank_task_id
    """

    @staticmethod
    def _to_json_or_none(value: Optional[Any]) -> Optional[str]:
        if value is None:
            return None
        if isinstance(value, str):
            return value
        return json.dumps(value)

    @staticmethod
    def _calculate_next_streak(current_streak: int, last_streak_date_value: Any) -> tuple[int, str]:
        """Match the user streak rules while staying inside one submit transaction."""
        today = date.today()
        last_streak_date = None

        if last_streak_date_value:
            try:
                if isinstance(last_streak_date_value, str):
                    raw_value = last_streak_date_value.split()[0]
                    last_streak_date = datetime.strptime(raw_value, "%Y-%m-%d").date()
                elif isinstance(last_streak_date_value, datetime):
                    last_streak_date = last_streak_date_value.date()
                else:
                    last_streak_date = last_streak_date_value
            except Exception:
                last_streak_date = None

        if last_streak_date is None:
            return 1, today.isoformat()

        days_diff = (today - last_streak_date).days
        if days_diff == 0:
            new_streak = current_streak
        elif days_diff == 1:
            new_streak = current_streak + 1
        else:
            new_streak = 1
        return new_streak, today.isoformat()

    async def _create_bank_task_for_inline(
        self,
        db: aiosqlite.Connection,
        *,
        text: str,
        answer: str,
        question_type: str,
        text_scale: str,
        options: Optional[List[Dict[str, Any]]],
        subquestions: Optional[List[Dict[str, Any]]],
        image_filename: Optional[str],
        solution_filename: Optional[str],
        created_by: Optional[int],
        difficulty: str = "B",
    ) -> int:
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
                self._to_json_or_none(options),
                self._to_json_or_none(subquestions),
                image_filename,
                solution_filename,
                difficulty,
                created_by,
            ),
        )
        return int(cursor.lastrowid)

    async def create_trial_test(
        self,
        title: str,
        description: Optional[str] = None,
        sort_order: int = 0,
        created_by: Optional[int] = None,
        expected_tasks_count: int = 40,
    ) -> Dict[str, Any]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            await db.execute(
                """
                INSERT INTO trial_tests (title, description, sort_order, expected_tasks_count, created_by)
                VALUES (?, ?, ?, ?, ?)
                """,
                (title, description, sort_order, max(1, int(expected_tasks_count or 40)), created_by),
            )
            await db.commit()
            async with db.execute("SELECT * FROM trial_tests WHERE id = last_insert_rowid()") as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else {}

    async def get_trial_tests(self) -> List[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """
                SELECT t.*, COUNT(tt.id) AS task_count
                FROM trial_tests t
                LEFT JOIN trial_test_tasks tt
                  ON t.id = tt.trial_test_id
                 AND tt.deleted_at IS NULL
                GROUP BY t.id
                ORDER BY t.sort_order ASC, t.created_at DESC
                """
            ) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]

    async def get_trial_test_by_id(self, test_id: int) -> Optional[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM trial_tests WHERE id = ?", (test_id,)) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else None

    async def update_trial_test(
        self,
        test_id: int,
        title: Optional[str] = None,
        description: Optional[str] = None,
        sort_order: Optional[int] = None,
        expected_tasks_count: Optional[int] = None,
    ) -> Optional[Dict[str, Any]]:
        async with self._connection() as db:
            updates = []
            params = []
            if title is not None:
                updates.append("title = ?")
                params.append(title)
            if description is not None:
                updates.append("description = ?")
                params.append(description)
            if sort_order is not None:
                updates.append("sort_order = ?")
                params.append(sort_order)
            if expected_tasks_count is not None:
                updates.append("expected_tasks_count = ?")
                params.append(max(1, int(expected_tasks_count)))
            if not updates:
                return await self.get_trial_test_by_id(test_id)

            updates.append("updated_at = CURRENT_TIMESTAMP")
            params.append(test_id)
            await db.execute(f"UPDATE trial_tests SET {', '.join(updates)} WHERE id = ?", params)
            await db.commit()
        return await self.get_trial_test_by_id(test_id)

    async def delete_trial_test(self, test_id: int) -> bool:
        async with self._connection() as db:
            await db.execute("DELETE FROM trial_tests WHERE id = ?", (test_id,))
            await db.commit()
            return True

    async def create_trial_test_task(
        self,
        trial_test_id: int,
        text: str,
        answer: str,
        question_type: str = "input",
        text_scale: str = "md",
        options: Optional[List[Dict[str, str]]] = None,
        subquestions: Optional[List[Dict[str, Any]]] = None,
        image_filename: Optional[str] = None,
        solution_filename: Optional[str] = None,
        created_by: Optional[int] = None,
        sort_order: int = 0,
        bank_task_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Create trial-test placement task.
        If bank_task_id is omitted, create a bank task inline first.
        """
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            resolved_bank_task_id = bank_task_id
            if not resolved_bank_task_id:
                resolved_bank_task_id = await self._create_bank_task_for_inline(
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
                    difficulty="B",
                )

            try:
                cursor = await db.execute(
                    """
                    INSERT INTO trial_test_tasks
                    (trial_test_id, bank_task_id, sort_order, created_by)
                    VALUES (?, ?, ?, ?)
                    """,
                    (trial_test_id, resolved_bank_task_id, sort_order, created_by),
                )
            except aiosqlite.IntegrityError:
                async with db.execute(
                    """
                    SELECT COALESCE(MAX(sort_order), -1)
                    FROM trial_test_tasks
                    WHERE trial_test_id = ? AND deleted_at IS NULL
                    """,
                    (trial_test_id,),
                ) as cursor_max:
                    max_row = await cursor_max.fetchone()
                next_sort = int(max_row[0]) + 1 if max_row and max_row[0] is not None else 0
                cursor = await db.execute(
                    """
                    INSERT INTO trial_test_tasks
                    (trial_test_id, bank_task_id, sort_order, created_by)
                    VALUES (?, ?, ?, ?)
                    """,
                    (trial_test_id, resolved_bank_task_id, next_sort, created_by),
                )
            task_id = int(cursor.lastrowid)
            await db.commit()

        task = await self.get_trial_test_task(task_id)
        return task or {}

    async def get_trial_test_task(self, task_id: int) -> Optional[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                f"{self._TRIAL_TASK_SELECT} WHERE ttt.id = ? AND ttt.deleted_at IS NULL",
                (task_id,),
            ) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else None

    async def update_trial_test_task(
        self,
        task_id: int,
        text: Optional[str] = None,
        answer: Optional[str] = None,
        question_type: Optional[str] = None,
        text_scale: Optional[str] = None,
        options: Optional[List[Dict[str, Any]]] = None,
        subquestions: Optional[List[Dict[str, Any]]] = None,
        sort_order: Optional[int] = None,
        image_filename: Optional[str] = None,
        solution_filename: Optional[str] = None,
    ) -> None:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT id, bank_task_id FROM trial_test_tasks WHERE id = ? AND deleted_at IS NULL",
                (task_id,),
            ) as cursor:
                placement = await cursor.fetchone()
            if not placement:
                return

            if sort_order is not None:
                await db.execute(
                    """
                    UPDATE trial_test_tasks
                    SET sort_order = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (sort_order, task_id),
                )

            await db.commit()

        bank_task_id = placement["bank_task_id"]
        if bank_task_id:
            bank_repo = BankTaskRepository(self.db_path)
            await bank_repo.update_task(
                task_id=int(bank_task_id),
                text=text,
                answer=answer,
                question_type=question_type,
                text_scale=text_scale,
                options=options if options is not None else None,
                subquestions=subquestions if subquestions is not None else None,
                image_filename=image_filename,
                solution_filename=solution_filename,
                source="trial_test_repository_update",
            )

    async def remove_task_from_trial_test(self, trial_test_id: int, task_id: int) -> bool:
        async with self._connection() as db:
            await db.execute(
                """
                UPDATE trial_test_tasks
                SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                WHERE trial_test_id = ? AND id = ? AND deleted_at IS NULL
                """,
                (trial_test_id, task_id),
            )
            await db.commit()
            return True

    async def remove_tasks_by_bank_task_id(self, bank_task_id: int) -> int:
        """Soft-delete all active placements linked to a bank task."""
        async with self._connection() as db:
            cursor = await db.execute(
                """
                UPDATE trial_test_tasks
                SET deleted_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE bank_task_id = ?
                  AND deleted_at IS NULL
                """,
                (bank_task_id,),
            )
            await db.commit()
            return int(cursor.rowcount or 0)

    async def get_trial_test_tasks(self, trial_test_id: int) -> List[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                f"{self._TRIAL_TASK_SELECT} "
                "WHERE ttt.trial_test_id = ? AND ttt.deleted_at IS NULL "
                "ORDER BY ttt.sort_order, ttt.id",
                (trial_test_id,),
            ) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]

    async def upsert_trial_test_slot(
        self,
        trial_test_id: int,
        slot_index: int,
        *,
        bank_task_id: Optional[int],
        created_by: Optional[int],
    ) -> Dict[str, Any]:
        """
        Upsert one slot placement by sort_order.
        slot_index is 1-based in API; stored sort_order is 0-based.
        """
        sort_order = max(0, int(slot_index) - 1)
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """
                SELECT id FROM trial_test_tasks
                WHERE trial_test_id = ? AND sort_order = ? AND deleted_at IS NULL
                LIMIT 1
                """,
                (trial_test_id, sort_order),
            ) as cursor:
                existing = await cursor.fetchone()

            if existing:
                task_id = int(existing["id"])
                await db.execute(
                    """
                    UPDATE trial_test_tasks
                    SET bank_task_id = ?, created_by = COALESCE(created_by, ?), updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (bank_task_id, created_by, task_id),
                )
            else:
                cursor = await db.execute(
                    """
                    INSERT INTO trial_test_tasks (trial_test_id, bank_task_id, sort_order, created_by)
                    VALUES (?, ?, ?, ?)
                    """,
                    (trial_test_id, bank_task_id, sort_order, created_by),
                )
                task_id = int(cursor.lastrowid)

            await db.commit()

        task = await self.get_trial_test_task(task_id)
        return task or {}

    async def clear_trial_test_slot(self, trial_test_id: int, slot_index: int) -> int:
        """Soft-delete active placement in slot (1-based index)."""
        sort_order = max(0, int(slot_index) - 1)
        async with self._connection() as db:
            cursor = await db.execute(
                """
                UPDATE trial_test_tasks
                SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                WHERE trial_test_id = ? AND sort_order = ? AND deleted_at IS NULL
                """,
                (trial_test_id, sort_order),
            )
            await db.commit()
            return int(cursor.rowcount or 0)

    async def save_trial_test_result(
        self,
        user_id: int,
        trial_test_id: int,
        score: int,
        total: int,
        percentage: float,
        answers: Dict[int, Dict[str, Any]],
    ) -> Dict[str, Any]:
        async def operation() -> Dict[str, Any]:
            async with self._connection() as db:
                db.row_factory = aiosqlite.Row
                answers_json = json.dumps(answers)
                await db.execute(
                    """
                    INSERT INTO trial_test_results (user_id, trial_test_id, score, total, percentage, answers)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (user_id, trial_test_id, score, total, percentage, answers_json),
                )
                await db.commit()
                async with db.execute("SELECT * FROM trial_test_results WHERE id = last_insert_rowid()") as cursor:
                    row = await cursor.fetchone()
                    return dict(row) if row else {}

        return await self._run_with_lock_retry(operation)

    async def submit_trial_test_attempt(
        self,
        *,
        user_id: int,
        trial_test_id: int,
        score: int,
        total: int,
        percentage: float,
        answers: Dict[int, Dict[str, Any]],
        rewards: List[Dict[str, Any]],
        should_update_streak: bool,
        delete_draft: bool = True,
    ) -> Dict[str, Any]:
        """Persist a trial-test submit in one transaction to minimize SQLite lock windows."""

        async def operation() -> Dict[str, Any]:
            async with self._connection() as db:
                db.row_factory = aiosqlite.Row
                try:
                    await db.execute("BEGIN IMMEDIATE")

                    answers_json = json.dumps(answers)
                    cursor = await db.execute(
                        """
                        INSERT INTO trial_test_results (user_id, trial_test_id, score, total, percentage, answers)
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        (user_id, trial_test_id, score, total, percentage, answers_json),
                    )
                    result_id = int(cursor.lastrowid)

                    awarded_any = False
                    awarded_count = 0
                    awarded_points = 0
                    for reward in rewards:
                        before_changes = db.total_changes
                        await db.execute(
                            """
                            INSERT INTO user_task_rewards
                            (user_id, reward_key, bank_task_id, difficulty, points_awarded, source, source_ref_id)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                            ON CONFLICT(user_id, reward_key) DO NOTHING
                            """,
                            (
                                user_id,
                                reward["reward_key"],
                                reward.get("bank_task_id"),
                                reward["difficulty"],
                                int(reward["points"]),
                                reward["source"],
                                reward.get("source_ref_id"),
                            ),
                        )
                        if db.total_changes > before_changes:
                            awarded_any = True
                            awarded_count += 1
                            awarded_points += int(reward["points"])

                    if awarded_count > 0:
                        await db.execute(
                            """
                            UPDATE users SET
                                total_points = total_points + ?,
                                week_points = week_points + ?,
                                total_solved = total_solved + ?,
                                week_solved = week_solved + ?,
                                last_active = CURRENT_TIMESTAMP
                            WHERE id = ?
                            """,
                            (awarded_points, awarded_points, awarded_count, awarded_count, user_id),
                        )

                    streak_milestone = None
                    if should_update_streak:
                        async with db.execute(
                            "SELECT streak, last_streak_date FROM users WHERE id = ?",
                            (user_id,),
                        ) as cursor_user:
                            user_row = await cursor_user.fetchone()

                        if user_row:
                            current_streak = int(user_row["streak"] or 0)
                            new_streak, streak_date = self._calculate_next_streak(
                                current_streak,
                                user_row["last_streak_date"],
                            )
                            await db.execute(
                                "UPDATE users SET streak = ?, last_streak_date = ? WHERE id = ?",
                                (new_streak, streak_date, user_id),
                            )
                            if new_streak > current_streak and new_streak in (7, 30, 100):
                                streak_milestone = new_streak

                    if delete_draft:
                        await db.execute(
                            "DELETE FROM trial_test_drafts WHERE user_id = ? AND trial_test_id = ?",
                            (user_id, trial_test_id),
                        )

                    await db.commit()

                    async with db.execute(
                        "SELECT * FROM trial_test_results WHERE id = ?",
                        (result_id,),
                    ) as cursor_result:
                        result_row = await cursor_result.fetchone()

                    return {
                        "result": dict(result_row) if result_row else {"id": result_id},
                        "awarded_any": awarded_any,
                        "streak_milestone": streak_milestone,
                    }
                except Exception:
                    await db.rollback()
                    raise

        return await self._run_with_lock_retry(operation)

    async def get_user_trial_test_results(self, user_id: int, trial_test_id: Optional[int] = None) -> List[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            if trial_test_id:
                async with db.execute(
                    """
                    SELECT * FROM trial_test_results
                    WHERE user_id = ? AND trial_test_id = ?
                    ORDER BY completed_at DESC
                    """,
                    (user_id, trial_test_id),
                ) as cursor:
                    rows = await cursor.fetchall()
                    return [dict(row) for row in rows]
            async with db.execute(
                """
                SELECT * FROM trial_test_results
                WHERE user_id = ?
                ORDER BY completed_at DESC
                """,
                (user_id,),
            ) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]

    async def get_trial_test_draft(self, user_id: int, trial_test_id: int) -> Optional[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """
                SELECT answers, current_task_index FROM trial_test_drafts
                WHERE user_id = ? AND trial_test_id = ?
                """,
                (user_id, trial_test_id),
            ) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else None

    async def upsert_trial_test_draft(
        self,
        user_id: int,
        trial_test_id: int,
        answers: Dict[int, str],
        current_task_index: int,
    ) -> None:
        async def operation() -> None:
            async with self._connection() as db:
                answers_json = json.dumps({str(k): v for k, v in answers.items()})
                await db.execute(
                    """
                    INSERT INTO trial_test_drafts (user_id, trial_test_id, answers, current_task_index, updated_at)
                    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(user_id, trial_test_id) DO UPDATE SET
                      answers = excluded.answers,
                      current_task_index = excluded.current_task_index,
                      updated_at = CURRENT_TIMESTAMP
                    """,
                    (user_id, trial_test_id, answers_json, current_task_index),
                )
                await db.commit()

        await self._run_with_lock_retry(operation)

    async def delete_trial_test_draft(self, user_id: int, trial_test_id: int) -> None:
        async def operation() -> None:
            async with self._connection() as db:
                await db.execute(
                    "DELETE FROM trial_test_drafts WHERE user_id = ? AND trial_test_id = ?",
                    (user_id, trial_test_id),
                )
                await db.commit()

        await self._run_with_lock_retry(operation)

    async def get_user_trial_test_draft_ids(self, user_id: int) -> List[int]:
        async with self._connection() as db:
            async with db.execute(
                "SELECT trial_test_id FROM trial_test_drafts WHERE user_id = ?",
                (user_id,),
            ) as cursor:
                rows = await cursor.fetchall()
                return [int(row[0]) for row in rows]
