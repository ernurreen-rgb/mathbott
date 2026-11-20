"""
Repository for Quizzes (Quizizz-like game service)
"""
import json
import logging
import storage as db_driver
from typing import Dict, Any, List, Optional

from .base import BaseRepository
from .quiz_sessions import QuizSessionsMixin
from .quiz_entry_limits import QuizEntryLimitsMixin
from utils.quiz import QuizError

logger = logging.getLogger(__name__)

KEEP = object()  # update_quiz: leave the grade as it is

CATALOG_SORTS = {
    "newest": "q.created_at DESC, q.id DESC",
    "popular": "play_count DESC, q.id DESC",
}
# The server locale may be plain C, where LOWER() leaves Cyrillic untouched; PostgreSQL 17's
# built-in pg_c_utf8 collation lowercases every script the same way on any server.
_CATALOG_SEARCH_SQL = " OR ".join(
    f"LOWER(q.{column} COLLATE \"pg_c_utf8\") LIKE ? ESCAPE '\\'" for column in ("title", "topic", "description"))


def _clean_topic(topic: Optional[str]) -> str:
    return " ".join(str(topic or "").split())


class QuizRepository(QuizSessionsMixin, QuizEntryLimitsMixin, BaseRepository):
    """Repository handling quizzes, questions, game sessions and participants."""

    # --- Quiz CRUD ---

    async def create_quiz(
        self,
        title: str,
        created_by: int,
        description: str = "",
        cover_image: Optional[str] = None,
        is_public: bool = False,
        questions: Optional[List[Dict[str, Any]]] = None,
        grade: Optional[int] = None,
        topic: str = "",
    ) -> Dict[str, Any]:
        async with self._write_transaction() as db:
            cursor = await db.execute(
                """
                INSERT INTO quizzes (title, description, cover_image, created_by, is_public, grade, topic)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (title, description, cover_image, created_by, 1 if is_public else 0, grade, _clean_topic(topic)),
            )
            quiz_id = cursor.lastrowid
            for question in questions or []:
                await self._insert_question(db, quiz_id=quiz_id, **question)
        return await self.get_quiz_by_id(quiz_id)

    async def get_quiz_by_id(self, quiz_id: int) -> Optional[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = db_driver.Row
            async with db.execute(
                """
                SELECT q.*, u.nickname as author_nickname,
                       (SELECT COUNT(*) FROM quiz_questions WHERE quiz_id = q.id) as question_count
                FROM quizzes q
                LEFT JOIN users u ON u.id = q.created_by
                WHERE q.id = ?
                """,
                (quiz_id,),
            ) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else None

    async def update_quiz(
        self,
        quiz_id: int,
        title: Optional[str] = None,
        description: Optional[str] = None,
        cover_image: Optional[str] = None,
        is_public: Optional[bool] = None,
        questions: Optional[List[Dict[str, Any]]] = None,
        grade: Any = KEEP,
        topic: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        updates = []
        params = []
        if grade is not KEEP:  # None clears the grade, so "unchanged" needs its own marker
            updates.append("grade = ?")
            params.append(grade)
        if topic is not None:
            updates.append("topic = ?")
            params.append(_clean_topic(topic))
        if title is not None:
            updates.append("title = ?")
            params.append(title)
        if description is not None:
            updates.append("description = ?")
            params.append(description)
        if cover_image is not None:
            updates.append("cover_image = ?")
            params.append(cover_image)
        if is_public is not None:
            updates.append("is_public = ?")
            params.append(1 if is_public else 0)

        if updates:
            updates.append("updated_at = mathbot_datetime('now')")
            params.append(quiz_id)

        async with self._write_transaction() as db:
            if updates:
                await db.execute(
                    f"UPDATE quizzes SET {', '.join(updates)} WHERE id = ?",
                    params,
                )
            if questions is not None:
                await db.execute("DELETE FROM quiz_questions WHERE quiz_id = ?", (quiz_id,))
                for question in questions:
                    await self._insert_question(db, quiz_id=quiz_id, **question)

        return await self.get_quiz_by_id(quiz_id)

    async def has_active_session(self, quiz_id: int) -> bool:
        """Return True if any live session for this quiz is currently in lobby or in_progress."""
        async with self._connection() as db:
            async with db.execute(
                "SELECT 1 FROM quiz_sessions WHERE quiz_id = ? AND status IN ('lobby', 'in_progress') LIMIT 1",
                (quiz_id,),
            ) as cursor:
                return bool(await cursor.fetchone())

    async def fork_quiz(
        self,
        quiz_id: int,
        user_id: int,
        title_override: Optional[str] = None,
        *,
        allow_during_active_session: bool = False,
    ) -> Optional[Dict[str, Any]]:
        quiz = await self.get_quiz_by_id(quiz_id)
        if not quiz:
            return None
        questions = await self.get_quiz_questions(quiz_id)

        title = title_override or f"{quiz['title']} (Көшірме)"
        async with self._write_transaction() as db:
            if not allow_during_active_session:
                async with db.execute(
                    "SELECT 1 FROM quiz_sessions WHERE quiz_id = ? AND status IN ('lobby', 'in_progress') LIMIT 1",
                    (quiz_id,),
                ) as cursor:
                    if await cursor.fetchone():
                        raise QuizError(
                            "conflict",
                            "Белсенді ойын жүріп жатқан кезде бұл квизді көшіруге болмайды.",
                        )
            cursor = await db.execute(
                """
                INSERT INTO quizzes (title, description, cover_image, created_by, is_public, grade, topic)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (title, quiz.get("description") or "", quiz.get("cover_image"), user_id, 0,
                 quiz.get("grade"), quiz.get("topic") or ""),
            )
            new_quiz_id = cursor.lastrowid
            for q in questions:
                await self._insert_question(
                    db,
                    quiz_id=new_quiz_id,
                    question_text=q["question_text"],
                    question_type=q.get("question_type", "mcq"),
                    options=q.get("options") or [],
                    correct_answer=q.get("correct_answer") or "",
                    accepted_answers=q.get("accepted_answers") or [],
                    time_limit_seconds=q.get("time_limit_seconds", 30),
                    points=q.get("points", 1000),
                    sort_order=q.get("sort_order", 0),
                    image_filename=q.get("image_filename"),
                    explanation=q.get("explanation"),
                )
        return await self.get_quiz_by_id(new_quiz_id)

    async def get_quiz_owners(self, quiz_ids: List[int]) -> Dict[int, int]:
        """Map each existing quiz id to its author's user id."""
        if not quiz_ids:
            return {}
        async with self._connection() as db:
            cursor = await db.execute(
                f"SELECT id, created_by FROM quizzes WHERE id IN ({','.join('?' * len(quiz_ids))})", quiz_ids)
            return {row[0]: row[1] for row in await cursor.fetchall()}

    async def set_catalog_fields(self, quiz_ids: List[int], grade: Any = KEEP, topic: Optional[str] = None) -> int:
        """Put several quizzes into one grade and/or topic; returns how many rows changed."""
        updates = []
        params: List[Any] = []
        if grade is not KEEP:
            updates.append("grade = ?")
            params.append(grade)
        if topic is not None:
            updates.append("topic = ?")
            params.append(_clean_topic(topic))
        if not updates or not quiz_ids:
            return 0
        async with self._write_transaction() as db:
            cursor = await db.execute(
                f"""UPDATE quizzes SET {', '.join(updates)}, updated_at = mathbot_datetime('now')
                    WHERE id IN ({','.join('?' * len(quiz_ids))})""",
                [*params, *quiz_ids])
            return cursor.rowcount or 0

    async def delete_quiz(self, quiz_id: int) -> bool:
        async with self._write_transaction() as db:
            cursor = await db.execute("DELETE FROM quizzes WHERE id = ?", (quiz_id,))
            return (cursor.rowcount or 0) > 0

    async def list_quizzes(
        self,
        created_by: Optional[int] = None,
        is_public: Optional[bool] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        conditions = []
        params: List[Any] = []
        if created_by is not None:
            conditions.append("q.created_by = ?")
            params.append(created_by)
        if is_public is not None:
            conditions.append("q.is_public = ?")
            params.append(1 if is_public else 0)

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        query = f"""
            SELECT q.*, u.nickname as author_nickname,
                   (SELECT COUNT(*) FROM quiz_questions WHERE quiz_id = q.id) as question_count
            FROM quizzes q
            LEFT JOIN users u ON u.id = q.created_by
            {where}
            ORDER BY q.created_at DESC
            LIMIT ? OFFSET ?
        """
        params.extend([limit, offset])

        async with self._connection() as db:
            db.row_factory = db_driver.Row
            async with db.execute(query, params) as cursor:
                rows = await cursor.fetchall()
                return [dict(r) for r in rows]

    async def get_catalog(
        self,
        created_by: Optional[int] = None,
        is_public: Optional[bool] = None,
        search: Optional[str] = None,
        grade: Optional[int] = None,
        topic: Optional[str] = None,
        untagged: bool = False,
        sort: str = "newest",
        limit: int = 24,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """One catalog page plus the grade and topic counts for its filters.

        Each facet is counted with every other filter applied but not its own, so the
        counts show what picking another grade or topic would return.
        """
        words = (search or "").lower().split()[:8]
        topic = _clean_topic(topic)

        def where(skip: Optional[str] = None):
            conditions: List[str] = []
            params: List[Any] = []
            if created_by is not None:
                conditions.append("q.created_by = ?")
                params.append(created_by)
            if is_public is not None:
                conditions.append("q.is_public = ?")
                params.append(1 if is_public else 0)
            for word in words:  # every word must appear somewhere, in any order
                conditions.append(f"({_CATALOG_SEARCH_SQL})")
                params.extend([self._contains_like_pattern(word)] * 3)
            if grade is not None and skip != "grade":
                conditions.append("q.grade = ?")
                params.append(grade)
            if skip != "topic":
                if untagged:
                    conditions.append("q.topic = ''")
                elif topic:
                    conditions.append("q.topic = ?")
                    params.append(topic)
            return (f"WHERE {' AND '.join(conditions)}" if conditions else ""), params

        clause, params = where()
        grade_clause, grade_params = where(skip="grade")
        topic_clause, topic_params = where(skip="topic")
        async with self._connection() as db:
            db.row_factory = db_driver.Row
            cursor = await db.execute(f"SELECT COUNT(*) AS total FROM quizzes q {clause}", params)
            total = (await cursor.fetchone())["total"]
            cursor = await db.execute(f"""
                SELECT q.*, u.nickname AS author_nickname, s.question_count, s.duration_seconds,
                       (SELECT COUNT(*) FROM quiz_sessions qs WHERE qs.quiz_id = q.id) AS play_count
                FROM quizzes q
                LEFT JOIN users u ON u.id = q.created_by
                LEFT JOIN LATERAL (
                    SELECT COUNT(*) AS question_count, COALESCE(SUM(time_limit_seconds), 0) AS duration_seconds
                    FROM quiz_questions WHERE quiz_id = q.id
                ) s ON TRUE
                {clause}
                ORDER BY {CATALOG_SORTS.get(sort, CATALOG_SORTS["newest"])}
                LIMIT ? OFFSET ?
            """, [*params, limit, offset])
            items = [dict(row) for row in await cursor.fetchall()]
            cursor = await db.execute(f"""
                SELECT q.grade, COUNT(*) AS count FROM quizzes q {grade_clause}
                GROUP BY q.grade ORDER BY q.grade
            """, grade_params)
            grades = [dict(row) for row in await cursor.fetchall() if row["grade"] is not None]
            cursor = await db.execute(f"""
                SELECT q.topic, COUNT(*) AS count FROM quizzes q {topic_clause}
                GROUP BY q.topic ORDER BY q.topic
            """, topic_params)
            topics = [dict(row) for row in await cursor.fetchall()]
        return {
            "items": items, "total": total, "limit": limit, "offset": offset,
            "facets": {
                "grades": grades,
                "topics": [row for row in topics if row["topic"]],
                "untagged": next((row["count"] for row in topics if not row["topic"]), 0),
            },
        }

    # --- Questions CRUD ---

    async def add_question(
        self,
        quiz_id: int,
        question_text: str,
        question_type: str = "mcq",
        options: Optional[List[Dict[str, Any]]] = None,
        correct_answer: str = "",
        accepted_answers: Optional[List[str]] = None,
        time_limit_seconds: int = 30,
        points: int = 1000,
        sort_order: int = 0,
        image_filename: Optional[str] = None,
        explanation: Optional[str] = None,
    ) -> Dict[str, Any]:
        async with self._write_transaction() as db:
            question_id = await self._insert_question(
                db, quiz_id, question_text, question_type, options, correct_answer,
                accepted_answers, time_limit_seconds, points, sort_order, image_filename, explanation,
            )
        return await self.get_question_by_id(question_id)

    @staticmethod
    async def _insert_question(db, quiz_id, question_text, question_type="mcq", options=None,
                               correct_answer="", accepted_answers=None, time_limit_seconds=30,
                               points=1000, sort_order=0, image_filename=None, explanation=None):
        cursor = await db.execute("""INSERT INTO quiz_questions
            (quiz_id, question_text, question_type, options, correct_answer, accepted_answers,
             time_limit_seconds, points, sort_order, image_filename, explanation)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (quiz_id, question_text, question_type, json.dumps(options or [], ensure_ascii=False),
             correct_answer, json.dumps(accepted_answers or [], ensure_ascii=False), time_limit_seconds,
             points, sort_order, image_filename, explanation))
        return cursor.lastrowid

    async def get_question_by_id(self, question_id: int) -> Optional[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = db_driver.Row
            async with db.execute(
                "SELECT * FROM quiz_questions WHERE id = ?", (question_id,)
            ) as cursor:
                row = await cursor.fetchone()
                if not row:
                    return None
                data = dict(row)
                data["options"] = json.loads(data["options"]) if data.get("options") else []
                data["accepted_answers"] = json.loads(data["accepted_answers"]) if data.get("accepted_answers") else []
                return data

    async def get_quiz_questions(self, quiz_id: int) -> List[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = db_driver.Row
            async with db.execute(
                "SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY sort_order ASC, id ASC",
                (quiz_id,),
            ) as cursor:
                rows = await cursor.fetchall()
                result = []
                for row in rows:
                    data = dict(row)
                    data["options"] = json.loads(data["options"]) if data.get("options") else []
                    data["accepted_answers"] = json.loads(data["accepted_answers"]) if data.get("accepted_answers") else []
                    result.append(data)
                return result

    async def update_question(
        self,
        question_id: int,
        question_text: Optional[str] = None,
        question_type: Optional[str] = None,
        options: Optional[List[Dict[str, Any]]] = None,
        correct_answer: Optional[str] = None,
        accepted_answers: Optional[List[str]] = None,
        time_limit_seconds: Optional[int] = None,
        points: Optional[int] = None,
        sort_order: Optional[int] = None,
        image_filename: Optional[str] = None,
        explanation: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        updates = []
        params = []
        if question_text is not None:
            updates.append("question_text = ?")
            params.append(question_text)
        if question_type is not None:
            updates.append("question_type = ?")
            params.append(question_type)
        if options is not None:
            updates.append("options = ?")
            params.append(json.dumps(options, ensure_ascii=False))
        if correct_answer is not None:
            updates.append("correct_answer = ?")
            params.append(correct_answer)
        if accepted_answers is not None:
            updates.append("accepted_answers = ?")
            params.append(json.dumps(accepted_answers, ensure_ascii=False))
        if time_limit_seconds is not None:
            updates.append("time_limit_seconds = ?")
            params.append(time_limit_seconds)
        if points is not None:
            updates.append("points = ?")
            params.append(points)
        if sort_order is not None:
            updates.append("sort_order = ?")
            params.append(sort_order)
        if image_filename is not None:
            updates.append("image_filename = ?")
            params.append(image_filename)
        if explanation is not None:
            updates.append("explanation = ?")
            params.append(explanation)

        if not updates:
            return await self.get_question_by_id(question_id)

        params.append(question_id)
        async with self._write_transaction() as db:
            await db.execute(
                f"UPDATE quiz_questions SET {', '.join(updates)} WHERE id = ?",
                params,
            )
        return await self.get_question_by_id(question_id)

    async def delete_question(self, question_id: int) -> bool:
        async with self._write_transaction() as db:
            cursor = await db.execute("DELETE FROM quiz_questions WHERE id = ?", (question_id,))
            return (cursor.rowcount or 0) > 0
