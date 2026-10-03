"""
Repository for Quizzes (Quizizz-like game service)
"""
import json
import logging
import random
import aiosqlite
from typing import Dict, Any, List, Optional

from .base import BaseRepository

logger = logging.getLogger(__name__)


class QuizRepository(BaseRepository):
    """Repository handling quizzes, questions, game sessions and participants."""

    # --- Quiz CRUD ---

    async def create_quiz(
        self,
        title: str,
        created_by: int,
        description: str = "",
        cover_image: Optional[str] = None,
        is_public: bool = True,
    ) -> Dict[str, Any]:
        async with self._write_transaction() as db:
            cursor = await db.execute(
                """
                INSERT INTO quizzes (title, description, cover_image, created_by, is_public)
                VALUES (?, ?, ?, ?, ?)
                """,
                (title, description, cover_image, created_by, 1 if is_public else 0),
            )
            quiz_id = cursor.lastrowid
        return await self.get_quiz_by_id(quiz_id)

    async def get_quiz_by_id(self, quiz_id: int) -> Optional[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
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
    ) -> Optional[Dict[str, Any]]:
        updates = []
        params = []
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

        if not updates:
            return await self.get_quiz_by_id(quiz_id)

        updates.append("updated_at = CURRENT_TIMESTAMP")
        params.append(quiz_id)

        async with self._write_transaction() as db:
            await db.execute(
                f"UPDATE quizzes SET {', '.join(updates)} WHERE id = ?",
                params,
            )
        return await self.get_quiz_by_id(quiz_id)

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
        elif is_public is not None:
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
            db.row_factory = aiosqlite.Row
            async with db.execute(query, params) as cursor:
                rows = await cursor.fetchall()
                return [dict(r) for r in rows]

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
        options_json = json.dumps(options or [], ensure_ascii=False)
        accepted_json = json.dumps(accepted_answers or [], ensure_ascii=False) if accepted_answers else None

        async with self._write_transaction() as db:
            cursor = await db.execute(
                """
                INSERT INTO quiz_questions (
                    quiz_id, question_text, question_type, options, correct_answer,
                    accepted_answers, time_limit_seconds, points, sort_order,
                    image_filename, explanation
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    quiz_id, question_text, question_type, options_json, correct_answer,
                    accepted_json, time_limit_seconds, points, sort_order,
                    image_filename, explanation,
                ),
            )
            question_id = cursor.lastrowid
        return await self.get_question_by_id(question_id)

    async def get_question_by_id(self, question_id: int) -> Optional[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
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
            db.row_factory = aiosqlite.Row
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

    # --- Live Game Sessions ---

    async def create_session(
        self,
        quiz_id: int,
        host_id: int,
        settings: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Create a new game lobby with a unique 6-digit PIN."""
        settings_json = json.dumps(settings or {}, ensure_ascii=False)
        async with self._write_transaction() as db:
            for _ in range(10):
                pin = f"{random.randint(100000, 999999)}"
                cursor = await db.execute(
                    "SELECT 1 FROM quiz_sessions WHERE pin_code = ? AND status != 'finished'",
                    (pin,),
                )
                if not await cursor.fetchone():
                    break
            else:
                pin = f"{random.randint(100000, 999999)}"

            cursor = await db.execute(
                """
                INSERT INTO quiz_sessions (quiz_id, host_id, pin_code, status, settings)
                VALUES (?, ?, ?, 'lobby', ?)
                """,
                (quiz_id, host_id, pin, settings_json),
            )
            session_id = cursor.lastrowid

        return await self.get_session_by_id(session_id)

    async def get_session_by_id(self, session_id: int) -> Optional[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """
                SELECT s.*, q.title as quiz_title, q.description as quiz_description,
                       u.nickname as host_nickname
                FROM quiz_sessions s
                JOIN quizzes q ON q.id = s.quiz_id
                JOIN users u ON u.id = s.host_id
                WHERE s.id = ?
                """,
                (session_id,),
            ) as cursor:
                row = await cursor.fetchone()
                if not row:
                    return None
                data = dict(row)
                data["settings"] = json.loads(data["settings"]) if data.get("settings") else {}
                return data

    async def get_session_by_pin(self, pin_code: str) -> Optional[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """
                SELECT s.*, q.title as quiz_title, q.description as quiz_description,
                       u.nickname as host_nickname
                FROM quiz_sessions s
                JOIN quizzes q ON q.id = s.quiz_id
                JOIN users u ON u.id = s.host_id
                WHERE s.pin_code = ? AND s.status != 'finished'
                """,
                (pin_code.strip(),),
            ) as cursor:
                row = await cursor.fetchone()
                if not row:
                    return None
                data = dict(row)
                data["settings"] = json.loads(data["settings"]) if data.get("settings") else {}
                return data

    async def update_session_status(self, session_id: int, status: str) -> Optional[Dict[str, Any]]:
        time_field = ""
        if status == "in_progress":
            time_field = ", started_at = CURRENT_TIMESTAMP"
        elif status == "finished":
            time_field = ", finished_at = CURRENT_TIMESTAMP"

        async with self._write_transaction() as db:
            await db.execute(
                f"UPDATE quiz_sessions SET status = ? {time_field} WHERE id = ?",
                (status, session_id),
            )
        return await self.get_session_by_id(session_id)

    # --- Participants ---

    async def join_session(
        self,
        session_id: int,
        nickname: str,
        user_id: Optional[int] = None,
        avatar_color: Optional[str] = None,
    ) -> Dict[str, Any]:
        color = avatar_color or random.choice(
            ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"]
        )
        async with self._write_transaction() as db:
            # Check if nickname already exists in session
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM quiz_participants WHERE session_id = ? AND nickname = ?",
                (session_id, nickname),
            ) as cursor:
                existing = await cursor.fetchone()
                if existing:
                    # Update activity and return existing participant
                    p_id = existing["id"]
                    await db.execute(
                        "UPDATE quiz_participants SET last_active_at = CURRENT_TIMESTAMP WHERE id = ?",
                        (p_id,),
                    )
                    return dict(existing)

            cursor = await db.execute(
                """
                INSERT INTO quiz_participants (session_id, user_id, nickname, avatar_color)
                VALUES (?, ?, ?, ?)
                """,
                (session_id, user_id, nickname, color),
            )
            participant_id = cursor.lastrowid

        return await self.get_participant(session_id, participant_id)

    async def get_participant(self, session_id: int, participant_id: int) -> Optional[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM quiz_participants WHERE session_id = ? AND id = ?",
                (session_id, participant_id),
            ) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else None

    async def list_participants(self, session_id: int) -> List[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM quiz_participants WHERE session_id = ? ORDER BY score DESC, correct_count DESC",
                (session_id,),
            ) as cursor:
                rows = await cursor.fetchall()
                return [dict(r) for r in rows]

    # --- Answers and Scoring ---

    async def get_participant_answer(
        self,
        session_id: int,
        participant_id: int,
        question_id: int,
    ) -> Optional[Dict[str, Any]]:
        """Get an existing answer record for a participant on a question."""
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """
                SELECT * FROM quiz_answers
                WHERE session_id = ? AND participant_id = ? AND question_id = ?
                """,
                (session_id, participant_id, question_id),
            ) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else None

    async def record_answer(
        self,
        session_id: int,
        participant_id: int,
        question_id: int,
        user_answer: str,
        is_correct: bool,
        time_taken_seconds: float,
        points_awarded: int,
    ) -> Dict[str, Any]:
        """Record an answer and atomically update participant score, streak and stats."""
        async with self._write_transaction() as db:
            # Insert answer record
            await db.execute(
                """
                INSERT INTO quiz_answers (
                    session_id, participant_id, question_id, user_answer,
                    is_correct, time_taken_seconds, points_awarded
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(session_id, participant_id, question_id) DO UPDATE SET
                    user_answer = excluded.user_answer,
                    is_correct = excluded.is_correct,
                    time_taken_seconds = excluded.time_taken_seconds,
                    points_awarded = excluded.points_awarded,
                    answered_at = CURRENT_TIMESTAMP
                """,
                (
                    session_id, participant_id, question_id, user_answer,
                    1 if is_correct else 0, time_taken_seconds, points_awarded,
                ),
            )

            # Update participant score and streak
            if is_correct:
                await db.execute(
                    """
                    UPDATE quiz_participants
                    SET score = score + ?,
                        streak = streak + 1,
                        correct_count = correct_count + 1,
                        total_answered = total_answered + 1,
                        last_active_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (points_awarded, participant_id),
                )
            else:
                await db.execute(
                    """
                    UPDATE quiz_participants
                    SET streak = 0,
                        total_answered = total_answered + 1,
                        last_active_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (participant_id,),
                )

        return await self.get_participant(session_id, participant_id)

    async def set_participant_finished(self, session_id: int, participant_id: int) -> None:
        async with self._write_transaction() as db:
            await db.execute(
                "UPDATE quiz_participants SET is_finished = 1, last_active_at = CURRENT_TIMESTAMP WHERE id = ?",
                (participant_id,),
            )

    async def get_session_leaderboard(self, session_id: int) -> List[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """
                SELECT id, session_id, user_id, nickname, avatar_color,
                       score, streak, correct_count, total_answered, is_finished
                FROM quiz_participants
                WHERE session_id = ?
                ORDER BY score DESC, correct_count DESC, id ASC
                """,
                (session_id,),
            ) as cursor:
                rows = await cursor.fetchall()
                return [dict(r) for r in rows]

    async def get_session_stats(self, session_id: int) -> Dict[str, Any]:
        """Aggregate stats for host post-game report."""
        leaderboard = await self.get_session_leaderboard(session_id)
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            # Question accuracy stats
            async with db.execute(
                """
                SELECT q.id as question_id, q.question_text, q.sort_order,
                       COUNT(a.id) as total_answers,
                       SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) as correct_answers,
                       AVG(a.time_taken_seconds) as avg_time
                FROM quiz_answers a
                JOIN quiz_questions q ON q.id = a.question_id
                WHERE a.session_id = ?
                GROUP BY q.id
                ORDER BY q.sort_order ASC
                """,
                (session_id,),
            ) as cursor:
                question_stats = [dict(r) for r in await cursor.fetchall()]

        total_players = len(leaderboard)
        podium = leaderboard[:3] if len(leaderboard) >= 3 else leaderboard

        return {
            "session_id": session_id,
            "total_players": total_players,
            "leaderboard": leaderboard,
            "podium": podium,
            "question_stats": question_stats,
        }
