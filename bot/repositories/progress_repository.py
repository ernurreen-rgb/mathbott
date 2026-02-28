"""
Progress repository for user progress tracking
"""
import aiosqlite
import json
import logging
import sqlite3
import asyncio
from typing import Optional, Dict, Any, List
from .base import BaseRepository

logger = logging.getLogger(__name__)


class ProgressRepository(BaseRepository):
    """Repository for user progress operations"""
    
    async def update_task_progress(self, user_id: int, task_id: int, status: str = "completed"):
        """Update or create user progress for a task"""
        for attempt in range(1, 6):
            try:
                async with self._connection() as db:
                    async with db.execute(
                        "SELECT id FROM user_progress WHERE user_id = ? AND task_id = ?",
                        (user_id, task_id)
                    ) as cursor:
                        existing = await cursor.fetchone()
                    
                    if existing:
                        await db.execute(
                            """UPDATE user_progress 
                               SET status = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                               WHERE user_id = ? AND task_id = ?""",
                            (status, user_id, task_id)
                        )
                    else:
                        completed_at = "CURRENT_TIMESTAMP" if status == "completed" else "NULL"
                        await db.execute(
                            f"""INSERT INTO user_progress (user_id, task_id, status, completed_at)
                               VALUES (?, ?, ?, {completed_at})""",
                            (user_id, task_id, status)
                        )
                    await db.commit()
                return
            except sqlite3.OperationalError as e:
                if "database is locked" not in str(e).lower() or attempt == 5:
                    raise
                await asyncio.sleep(0.15 * attempt)
    
    async def check_if_task_all_questions_completed(self, user_id: int, task_id: int) -> bool:
        """Check if all questions in a task are completed correctly"""
        # This method needs access to task repository, so we'll keep it in database.py for now
        # or pass task_repo as dependency
        return False  # Placeholder
    
    async def get_user_task_progress(self, user_id: int, task_id: int) -> Optional[Dict[str, Any]]:
        """Get user progress for a specific task"""
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM user_progress WHERE user_id = ? AND task_id = ?",
                (user_id, task_id)
            ) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else None

    async def get_user_progress_for_section(self, user_id: int, section_id: int) -> Dict[int, str]:
        """Get progress for all tasks in a section (returns dict: task_id -> status)"""
        async with self._connection() as db:
            async with db.execute(
                """SELECT task_id, status FROM user_progress 
                   WHERE user_id = ? AND task_id IN (
                       SELECT id FROM tasks WHERE section_id = ? AND deleted_at IS NULL
                   )""",
                (user_id, section_id)
            ) as cursor:
                rows = await cursor.fetchall()
                return {row[0]: row[1] for row in rows}

    async def get_user_progress_for_module(self, user_id: int, module_id: int) -> Dict[int, str]:
        """Get progress for all tasks in a module (returns dict: task_id -> status)"""
        async with self._connection() as db:
            async with db.execute(
                """SELECT task_id, status FROM user_progress 
                   WHERE user_id = ? AND task_id IN (
                       SELECT t.id FROM tasks t
                       JOIN sections s ON t.section_id = s.id
                       WHERE s.module_id = ? AND t.deleted_at IS NULL
                   )""",
                (user_id, module_id)
            ) as cursor:
                rows = await cursor.fetchall()
                return {row[0]: row[1] for row in rows}

    async def get_user_progress_for_mini_lesson(self, user_id: int, mini_lesson_id: int) -> Dict[int, str]:
        """Get progress for all tasks in a mini-lesson (task_id -> status)."""
        async with self._connection() as db:
            async with db.execute(
                """SELECT task_id, status FROM user_progress
                   WHERE user_id = ? AND task_id IN (
                       SELECT id FROM tasks WHERE mini_lesson_id = ? AND deleted_at IS NULL
                   )""",
                (user_id, mini_lesson_id),
            ) as cursor:
                rows = await cursor.fetchall()
                return {row[0]: row[1] for row in rows}

    async def calculate_mini_lesson_completion(self, user_id: int, mini_lesson_id: int) -> Dict[str, Any]:
        """Calculate mini-lesson completion (based on tasks)."""
        async with self._connection() as db:
            async with db.execute(
                """
                SELECT
                    COUNT(t.id) AS total,
                    SUM(CASE WHEN up.status = 'completed' THEN 1 ELSE 0 END) AS completed_count
                FROM tasks t
                LEFT JOIN user_progress up
                    ON up.task_id = t.id AND up.user_id = ?
                WHERE t.mini_lesson_id = ? AND t.deleted_at IS NULL
                """,
                (user_id, mini_lesson_id),
            ) as cursor:
                row = await cursor.fetchone()
                total = int((row[0] or 0) if row else 0)
                completed_count = int((row[1] or 0) if row else 0)

        all_completed = total > 0 and completed_count == total
        return {
            "completed": all_completed,
            "total": total,
            "completed_count": completed_count,
            "progress": completed_count / total if total else 0.0,
        }

    async def calculate_lesson_completion(self, user_id: int, lesson_id: int, curriculum_repo) -> Dict[str, Any]:
        """Calculate lesson completion (based on 4 mini-lessons)."""
        mini_lessons = await curriculum_repo.get_mini_lessons_by_lesson(lesson_id)
        if len(mini_lessons) < 4:
            await curriculum_repo.ensure_default_mini_lessons(lesson_id)
            mini_lessons = await curriculum_repo.get_mini_lessons_by_lesson(lesson_id)

        if not mini_lessons:
            return {"completed": False, "total_mini_lessons": 0, "completed_mini_lessons": 0, "progress": 0.0}

        counts_by_mini: Dict[int, Dict[str, int]] = {}
        async with self._connection() as db:
            async with db.execute(
                """
                SELECT
                    ml.id AS mini_id,
                    COUNT(t.id) AS total,
                    SUM(CASE WHEN up.status = 'completed' THEN 1 ELSE 0 END) AS completed_count
                FROM mini_lessons ml
                LEFT JOIN tasks t
                    ON t.mini_lesson_id = ml.id AND t.deleted_at IS NULL
                LEFT JOIN user_progress up
                    ON up.task_id = t.id AND up.user_id = ?
                WHERE ml.lesson_id = ?
                GROUP BY ml.id
                """,
                (user_id, lesson_id),
            ) as cursor:
                rows = await cursor.fetchall()
                for r in rows:
                    mini_id = int(r[0])
                    total = int(r[1] or 0)
                    completed_count = int(r[2] or 0)
                    counts_by_mini[mini_id] = {"total": total, "completed_count": completed_count}

        completed_mini = 0
        for ml in mini_lessons:
            c = counts_by_mini.get(int(ml["id"]), {"total": 0, "completed_count": 0})
            total = c["total"]
            completed_count = c["completed_count"]
            if total > 0 and completed_count == total:
                completed_mini += 1

        return {
            "completed": completed_mini == len(mini_lessons),
            "total_mini_lessons": len(mini_lessons),
            "completed_mini_lessons": completed_mini,
            "progress": completed_mini / len(mini_lessons) if mini_lessons else 0.0,
        }

    async def calculate_section_completion(self, user_id: int, section_id: int) -> Dict[str, Any]:
        """Calculate section completion status - optimized with single query"""
        EXPECTED_LESSONS_PER_SECTION = 10
        
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            
            async with db.execute(
                "SELECT COUNT(*) as count FROM lessons WHERE section_id = ?",
                (section_id,)
            ) as cursor:
                lessons_count = (await cursor.fetchone())[0]
            
            if lessons_count > 0:
                async with db.execute(
                    """
                    SELECT
                        l.id AS lesson_id,
                        COUNT(DISTINCT ml.id) AS total_mini_lessons,
                        COUNT(DISTINCT CASE 
                            WHEN ml.id IS NOT NULL AND 
                                 (SELECT COUNT(*) FROM tasks t2 
                                  WHERE t2.mini_lesson_id = ml.id AND t2.deleted_at IS NULL) = 
                                 (SELECT COUNT(*) FROM user_progress up2 
                                  JOIN tasks t3 ON t3.id = up2.task_id 
                                  WHERE up2.user_id = ? AND t3.mini_lesson_id = ml.id AND up2.status = 'completed')
                            THEN ml.id 
                            ELSE NULL 
                        END) AS completed_mini_lessons
                    FROM lessons l
                    LEFT JOIN mini_lessons ml ON ml.lesson_id = l.id
                    WHERE l.section_id = ?
                    GROUP BY l.id
                    """,
                    (user_id, section_id),
                ) as cursor:
                    rows = await cursor.fetchall()
                    completed_lessons = 0
                    total_lessons = max(len(rows), EXPECTED_LESSONS_PER_SECTION)
                    
                    for row in rows:
                        total_mini = int(row[1] or 0)
                        completed_mini = int(row[2] or 0)
                        if total_mini > 0 and completed_mini == total_mini:
                            completed_lessons += 1
                
                all_completed = completed_lessons == total_lessons
                progress = completed_lessons / total_lessons if total_lessons else 0.0
                
                return {
                    "completed": all_completed,
                    "total": total_lessons,
                    "completed_count": completed_lessons,
                    "progress": progress,
                    "total_lessons": total_lessons,
                    "completed_lessons": completed_lessons,
                }

        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            
            async with db.execute(
                "SELECT COUNT(*) as count FROM tasks WHERE section_id = ? AND deleted_at IS NULL",
                (section_id,)
            ) as cursor:
                tasks_count = (await cursor.fetchone())[0]
            
            if tasks_count == 0:
                return {
                    "completed": False,
                    "total": EXPECTED_LESSONS_PER_SECTION,
                    "completed_count": 0,
                    "progress": 0.0,
                    "total_lessons": EXPECTED_LESSONS_PER_SECTION,
                    "completed_lessons": 0,
                }
            
            async with db.execute(
                """
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN up.status = 'completed' THEN 1 ELSE 0 END) as completed_count
                FROM tasks t
                LEFT JOIN user_progress up ON up.task_id = t.id AND up.user_id = ?
                WHERE t.section_id = ? AND t.deleted_at IS NULL
                """,
                (user_id, section_id),
            ) as cursor:
                row = await cursor.fetchone()
                total = int(row[0] or 0)
                completed_count = int(row[1] or 0)
            
            all_completed = completed_count == total
            return {
                "completed": all_completed,
                "total": total,
                "completed_count": completed_count,
                "progress": completed_count / total if total else 0.0
            }

    async def calculate_module_completion(self, user_id: int, module_id: int, curriculum_repo) -> Dict[str, Any]:
        """Calculate module completion status"""
        sections = await curriculum_repo.get_sections_by_module(module_id)
        if not sections:
            return {"completed": False, "total_sections": 0, "completed_sections": 0, "progress": 0.0}

        sections_sorted = sorted(sections, key=lambda s: (s.get("sort_order", 0), s["id"]))

        total_lessons = 0
        completed_lessons = 0
        completed_sections = 0
        current_lesson_position = 0

        section_ids = [s["id"] for s in sections_sorted]
        if not section_ids:
            return {"completed": False, "total_sections": 0, "completed_sections": 0, "progress": 0.0}
        
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            
            placeholders = ','.join('?' * len(section_ids))
            async with db.execute(
                f"""
                SELECT 
                    l.id AS lesson_id,
                    l.section_id,
                    l.sort_order,
                    l.lesson_number,
                    COUNT(DISTINCT ml.id) AS total_mini_lessons,
                    COUNT(DISTINCT CASE 
                        WHEN ml.id IS NOT NULL AND 
                             (SELECT COUNT(*) FROM tasks t2 
                              WHERE t2.mini_lesson_id = ml.id AND t2.deleted_at IS NULL) = 
                             (SELECT COUNT(*) FROM user_progress up2 
                              JOIN tasks t3 ON t3.id = up2.task_id 
                              WHERE up2.user_id = ? AND t3.mini_lesson_id = ml.id AND up2.status = 'completed')
                        THEN ml.id 
                        ELSE NULL 
                    END) AS completed_mini_lessons
                FROM lessons l
                LEFT JOIN mini_lessons ml ON ml.lesson_id = l.id
                WHERE l.section_id IN ({placeholders})
                GROUP BY l.id, l.section_id, l.sort_order, l.lesson_number
                ORDER BY l.section_id, l.sort_order, l.lesson_number, l.id
                """,
                (user_id, *section_ids),
            ) as cursor:
                lesson_rows = await cursor.fetchall()
        
        lessons_by_section: Dict[int, List[Dict]] = {}
        for row in lesson_rows:
            section_id = row["section_id"]
            if section_id not in lessons_by_section:
                lessons_by_section[section_id] = []
            lessons_by_section[section_id].append({
                "id": row["lesson_id"],
                "sort_order": row["sort_order"],
                "lesson_number": row["lesson_number"],
                "total_mini_lessons": int(row["total_mini_lessons"] or 0),
                "completed_mini_lessons": int(row["completed_mini_lessons"] or 0),
            })
        
        for section in sections_sorted:
            section_id = section["id"]
            lessons = lessons_by_section.get(section_id, [])
            
            if not lessons:
                continue

            lessons_sorted = sorted(lessons, key=lambda l: (l.get("sort_order", 0), l.get("lesson_number", 0), l["id"]))
            
            section_total_lessons = len(lessons_sorted)
            total_lessons += section_total_lessons
            
            section_completed_lessons = 0
            first_incomplete_lesson = None
            
            for lesson in lessons_sorted:
                total_mini = lesson.get("total_mini_lessons", 0)
                completed_mini = lesson.get("completed_mini_lessons", 0)
                is_completed = total_mini > 0 and completed_mini == total_mini
                
                if is_completed:
                    section_completed_lessons += 1
                elif first_incomplete_lesson is None:
                    first_incomplete_lesson = lesson
            
            if section_completed_lessons == section_total_lessons and section_total_lessons > 0:
                completed_sections += 1
                completed_lessons += section_completed_lessons
            else:
                if current_lesson_position == 0:
                    if first_incomplete_lesson:
                        lesson_number = first_incomplete_lesson.get("lesson_number")
                        if lesson_number:
                            current_lesson_position = lesson_number
                        else:
                            current_lesson_position = lessons_sorted.index(first_incomplete_lesson) + 1
                    else:
                        current_lesson_position = section_completed_lessons + 1
                    completed_lessons += section_completed_lessons + 1
                else:
                    completed_lessons += section_completed_lessons

        progress_percentage = completed_lessons / total_lessons if total_lessons > 0 else 0.0
        all_completed = completed_lessons >= total_lessons and total_lessons > 0

        return {
            "completed": all_completed,
            "total_sections": len(sections_sorted),
            "completed_sections": completed_sections,
            "total_lessons": total_lessons,
            "completed_lessons": completed_lessons,
            "progress": progress_percentage,
        }

    async def get_task_questions(self, task_id: int) -> List[Dict[str, Any]]:
        """Get legacy question-list payload for a placement task."""
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """
                SELECT bt.options
                FROM tasks t
                LEFT JOIN bank_tasks bt ON bt.id = t.bank_task_id
                WHERE t.id = ?
                """,
                (task_id,),
            ) as cursor:
                row = await cursor.fetchone()
                if not row or not row[0]:
                    return []
                try:
                    payload = json.loads(row[0]) if isinstance(row[0], str) else row[0]
                    if isinstance(payload, list) and payload and isinstance(payload[0], dict):
                        if "answer" in payload[0]:
                            return payload
                    return []
                except (json.JSONDecodeError, TypeError):
                    return []

    async def check_task_question_answer(self, task_id: int, question_index: int, user_answer: str) -> bool:
        """Check if answer for a specific question in a task is correct"""
        questions = await self.get_task_questions(task_id)
        if question_index < 0 or question_index >= len(questions):
            return False
        
        question = questions[question_index]
        correct_answer = question.get("answer", "").strip().lower()
        user_answer_clean = user_answer.strip().lower() if user_answer else ""
        return correct_answer == user_answer_clean

    async def record_task_question_progress(self, user_id: int, task_id: int, question_index: int, is_correct: bool):
        """Record user progress for a question in a task"""
        async with self._connection() as db:
            async with db.execute(
                """SELECT id FROM user_task_question_progress 
                   WHERE user_id = ? AND task_id = ? AND question_index = ?""",
                (user_id, task_id, question_index)
            ) as cursor:
                existing = await cursor.fetchone()
            
            if existing:
                await db.execute(
                    """UPDATE user_task_question_progress 
                       SET is_correct = ?, completed_at = CURRENT_TIMESTAMP
                       WHERE user_id = ? AND task_id = ? AND question_index = ?""",
                    (1 if is_correct else 0, user_id, task_id, question_index)
                )
            else:
                await db.execute(
                    """INSERT INTO user_task_question_progress (user_id, task_id, question_index, is_correct)
                       VALUES (?, ?, ?, ?)""",
                    (user_id, task_id, question_index, 1 if is_correct else 0)
                )
            await db.commit()

    async def get_user_task_question_progress(self, user_id: int, task_id: int) -> Dict[int, bool]:
        """Get user progress for all questions in a task (returns dict: question_index -> is_correct)"""
        async with self._connection() as db:
            async with db.execute(
                """SELECT question_index, is_correct FROM user_task_question_progress 
                   WHERE user_id = ? AND task_id = ?""",
                (user_id, task_id)
            ) as cursor:
                rows = await cursor.fetchall()
                return {row[0]: bool(row[1]) for row in rows}

