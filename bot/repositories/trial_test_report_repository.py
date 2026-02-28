"""
Trial test report repository
"""
import aiosqlite
import logging
import json
from typing import Optional, List, Dict, Any
from .base import BaseRepository

logger = logging.getLogger(__name__)


class TrialTestReportRepository(BaseRepository):
    """Repository for trial test report operations"""

    async def create_trial_test_report(
        self,
        user_id: int,
        trial_test_id: int,
        trial_test_task_id: int,
        message: str,
    ) -> Dict[str, Any]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """INSERT INTO trial_test_reports (user_id, trial_test_id, trial_test_task_id, message, status)
                   VALUES (?, ?, ?, ?, 'pending')""",
                (user_id, trial_test_id, trial_test_task_id, message),
            ) as cursor:
                report_id = cursor.lastrowid
            await db.commit()
            async with db.execute(
                """SELECT r.*, u.nickname as user_nickname, u.email as user_email,
                          tt.title as trial_test_title,
                          bt.text as task_text, bt.answer as task_answer,
                          bt.question_type as task_question_type,
                          r.trial_test_task_id as task_id
                   FROM trial_test_reports r
                   JOIN users u ON r.user_id = u.id
                   JOIN trial_tests tt ON r.trial_test_id = tt.id
                   JOIN trial_test_tasks ttt ON r.trial_test_task_id = ttt.id
                   LEFT JOIN bank_tasks bt ON bt.id = ttt.bank_task_id
                   WHERE r.id = ?""",
                (report_id,),
            ) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else {}

    async def get_user_trial_test_reports(self, user_id: int) -> List[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """SELECT r.*, tt.title as trial_test_title,
                          bt.text as task_text, bt.answer as task_answer,
                          bt.question_type as task_question_type,
                          r.trial_test_task_id as task_id
                   FROM trial_test_reports r
                   JOIN trial_tests tt ON r.trial_test_id = tt.id
                   JOIN trial_test_tasks ttt ON r.trial_test_task_id = ttt.id
                   LEFT JOIN bank_tasks bt ON bt.id = ttt.bank_task_id
                   WHERE r.user_id = ?
                   ORDER BY r.created_at DESC""",
                (user_id,),
            ) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]

    async def get_all_trial_test_reports(
        self, status_filter: Optional[str] = None, limit: int = 100
    ) -> List[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            query = """
                SELECT r.*, u.nickname as user_nickname, u.email as user_email,
                       tt.title as trial_test_title,
                       bt.text as task_text, bt.answer as task_answer,
                       bt.question_type as task_question_type,
                       resolver.nickname as resolver_nickname,
                       r.trial_test_task_id as task_id
                FROM trial_test_reports r
                JOIN users u ON r.user_id = u.id
                JOIN trial_tests tt ON r.trial_test_id = tt.id
                JOIN trial_test_tasks ttt ON r.trial_test_task_id = ttt.id
                LEFT JOIN bank_tasks bt ON bt.id = ttt.bank_task_id
                LEFT JOIN users resolver ON r.resolved_by = resolver.id
                """
            params = []
            if status_filter:
                query += " WHERE r.status = ?"
                params.append(status_filter)
            query += " ORDER BY r.created_at DESC LIMIT ?"
            params.append(limit)
            async with db.execute(query, tuple(params)) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]

    async def get_trial_test_report_by_id(self, report_id: int) -> Optional[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """SELECT r.*, u.nickname as user_nickname, u.email as user_email,
                          tt.title as trial_test_title,
                          bt.text as task_text, bt.answer as task_answer,
                          bt.question_type as task_question_type,
                          resolver.nickname as resolver_nickname,
                          r.trial_test_task_id as task_id
                   FROM trial_test_reports r
                   JOIN users u ON r.user_id = u.id
                   JOIN trial_tests tt ON r.trial_test_id = tt.id
                   JOIN trial_test_tasks ttt ON r.trial_test_task_id = ttt.id
                   LEFT JOIN bank_tasks bt ON bt.id = ttt.bank_task_id
                   LEFT JOIN users resolver ON r.resolved_by = resolver.id
                   WHERE r.id = ?""",
                (report_id,),
            ) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else None

    async def update_trial_test_report_status(
        self, report_id: int, status: str, resolved_by: Optional[int] = None
    ) -> bool:
        async with self._connection() as db:
            if status == "resolved" and resolved_by:
                async with db.execute(
                    """UPDATE trial_test_reports
                       SET status = ?, resolved_at = CURRENT_TIMESTAMP, resolved_by = ?
                       WHERE id = ?""",
                    (status, resolved_by, report_id),
                ) as cursor:
                    await db.commit()
                    return cursor.rowcount > 0
            else:
                async with db.execute(
                    """UPDATE trial_test_reports SET status = ? WHERE id = ?""",
                    (status, report_id),
                ) as cursor:
                    await db.commit()
                    return cursor.rowcount > 0

    async def delete_trial_test_report(self, report_id: int) -> bool:
        async with self._connection() as db:
            async with db.execute(
                "DELETE FROM trial_test_reports WHERE id = ?",
                (report_id,),
            ) as cursor:
                await db.commit()
                return cursor.rowcount > 0

    async def has_user_reported_trial_test_task(self, user_id: int, task_id: int) -> bool:
        async with self._connection() as db:
            async with db.execute(
                """SELECT COUNT(*) FROM trial_test_reports
                   WHERE user_id = ? AND trial_test_task_id = ?""",
                (user_id, task_id),
            ) as cursor:
                row = await cursor.fetchone()
                return row[0] > 0 if row else False

    async def can_user_report_trial_test_task(self, user_id: int, trial_test_id: int, task_id: int) -> bool:
        """Allow report if user has a result for this test and the task is present in answers."""
        async with self._connection() as db:
            async with db.execute(
                """SELECT answers FROM trial_test_results
                   WHERE user_id = ? AND trial_test_id = ?
                   ORDER BY completed_at DESC LIMIT 1""",
                (user_id, trial_test_id),
            ) as cursor:
                row = await cursor.fetchone()
                if not row or not row[0]:
                    return False
                try:
                    answers = json.loads(row[0]) if isinstance(row[0], str) else row[0]
                except Exception:
                    return False
                return str(task_id) in {str(k) for k in answers.keys()}
