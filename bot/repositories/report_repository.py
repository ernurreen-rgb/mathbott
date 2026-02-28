"""
Report repository
"""
import aiosqlite
import logging
from typing import Optional, List, Dict, Any
from .base import BaseRepository

logger = logging.getLogger(__name__)


class ReportRepository(BaseRepository):
    """Repository for report operations"""
    
    async def create_report(self, user_id: int, task_id: int, message: str) -> Dict[str, Any]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """INSERT INTO reports (user_id, task_id, message, status)
                   VALUES (?, ?, ?, 'pending')""",
                (user_id, task_id, message)
            ) as cursor:
                report_id = cursor.lastrowid
            await db.commit()
            async with db.execute(
                """SELECT r.*, u.nickname as user_nickname, u.email as user_email, bt.text as task_text
                   FROM reports r
                   JOIN users u ON r.user_id = u.id
                   LEFT JOIN tasks t ON r.task_id = t.id
                   LEFT JOIN bank_tasks bt ON bt.id = t.bank_task_id
                   WHERE r.id = ?""",
                (report_id,)
            ) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else {}

    async def get_user_reports(self, user_id: int) -> List[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """SELECT r.*, bt.text as task_text, bt.answer as task_answer, bt.question_type as task_question_type
                   FROM reports r
                   LEFT JOIN tasks t ON r.task_id = t.id
                   LEFT JOIN bank_tasks bt ON bt.id = t.bank_task_id
                   WHERE r.user_id = ?
                   ORDER BY r.created_at DESC""",
                (user_id,)
            ) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]

    async def get_all_reports(self, status_filter: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            query = """
                SELECT r.*, u.nickname as user_nickname, u.email as user_email,
                       bt.text as task_text, bt.answer as task_answer,
                       bt.question_type as task_question_type,
                       ml.title as mini_lesson_title,
                       l.title as lesson_title,
                       s.name as section_name, s.description as section_description,
                       m.name as module_name, m.description as module_description,
                       resolver.nickname as resolver_nickname
                FROM reports r
                JOIN users u ON r.user_id = u.id
                LEFT JOIN tasks t ON r.task_id = t.id
                LEFT JOIN bank_tasks bt ON bt.id = t.bank_task_id
                LEFT JOIN mini_lessons ml ON t.mini_lesson_id = ml.id
                LEFT JOIN lessons l ON ml.lesson_id = l.id
                LEFT JOIN sections s ON l.section_id = s.id
                LEFT JOIN modules m ON s.module_id = m.id
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

    async def get_report_by_id(self, report_id: int) -> Optional[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """SELECT r.*, u.nickname as user_nickname, u.email as user_email,
                          bt.text as task_text, bt.answer as task_answer,
                          bt.question_type as task_question_type,
                          resolver.nickname as resolver_nickname
                   FROM reports r
                   JOIN users u ON r.user_id = u.id
                   LEFT JOIN tasks t ON r.task_id = t.id
                   LEFT JOIN bank_tasks bt ON bt.id = t.bank_task_id
                   LEFT JOIN users resolver ON r.resolved_by = resolver.id
                   WHERE r.id = ?""",
                (report_id,)
            ) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else None

    async def update_report_status(self, report_id: int, status: str, resolved_by: Optional[int] = None) -> bool:
        async with self._connection() as db:
            if status == 'resolved' and resolved_by:
                async with db.execute(
                    """UPDATE reports
                       SET status = ?, resolved_at = CURRENT_TIMESTAMP, resolved_by = ?
                       WHERE id = ?""",
                    (status, resolved_by, report_id)
                ) as cursor:
                    await db.commit()
                    return cursor.rowcount > 0
            else:
                async with db.execute(
                    """UPDATE reports SET status = ? WHERE id = ?""",
                    (status, report_id)
                ) as cursor:
                    await db.commit()
                    return cursor.rowcount > 0

    async def can_user_report_task(self, user_id: int, task_id: int) -> bool:
        async with self._connection() as db:
            async with db.execute(
                """SELECT COUNT(*) as count FROM solutions
                   WHERE user_id = ? AND task_id = ?""",
                (user_id, task_id)
            ) as cursor:
                row = await cursor.fetchone()
                return row[0] > 0 if row else False

    async def delete_report(self, report_id: int) -> bool:
        """Delete a report by ID"""
        async with self._connection() as db:
            async with db.execute(
                """DELETE FROM reports WHERE id = ?""",
                (report_id,)
            ) as cursor:
                await db.commit()
                return cursor.rowcount > 0

