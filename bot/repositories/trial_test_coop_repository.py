"""
Trial test coop repository
"""
import aiosqlite
import logging
from typing import Optional, List, Dict, Any

from .base import BaseRepository

logger = logging.getLogger(__name__)


class TrialTestCoopRepository(BaseRepository):
    """Repository for trial test coop sessions"""

    async def create_session(self, trial_test_id: int, owner_id: int) -> Dict[str, Any]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            await db.execute(
                """
                INSERT INTO trial_test_coop_sessions (trial_test_id, owner_id)
                VALUES (?, ?)
                """,
                (trial_test_id, owner_id)
            )
            await db.commit()
            async with db.execute(
                "SELECT * FROM trial_test_coop_sessions WHERE id = last_insert_rowid()"
            ) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else {}

    async def get_session(self, session_id: int) -> Optional[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM trial_test_coop_sessions WHERE id = ?",
                (session_id,)
            ) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else None

    async def update_session_status(self, session_id: int, status: str) -> None:
        async with self._connection() as db:
            await db.execute(
                "UPDATE trial_test_coop_sessions SET status = ? WHERE id = ?",
                (status, session_id)
            )
            await db.commit()

    async def add_participant(self, session_id: int, user_id: int, color: str) -> Dict[str, Any]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            await db.execute(
                """
                INSERT OR IGNORE INTO trial_test_coop_participants (session_id, user_id, color)
                VALUES (?, ?, ?)
                """,
                (session_id, user_id, color)
            )
            await db.commit()
            async with db.execute(
                """
                SELECT * FROM trial_test_coop_participants
                WHERE session_id = ? AND user_id = ?
                """,
                (session_id, user_id)
            ) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else {}

    async def get_participant(self, session_id: int, user_id: int) -> Optional[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """
                SELECT * FROM trial_test_coop_participants
                WHERE session_id = ? AND user_id = ?
                """,
                (session_id, user_id)
            ) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else None

    async def list_participants(self, session_id: int) -> List[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """
                SELECT p.*, u.nickname
                FROM trial_test_coop_participants p
                JOIN users u ON u.id = p.user_id
                WHERE p.session_id = ?
                ORDER BY p.id ASC
                """,
                (session_id,)
            ) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]

    async def set_participant_finished(self, session_id: int, user_id: int, is_finished: bool = True) -> None:
        async with self._connection() as db:
            await db.execute(
                """
                UPDATE trial_test_coop_participants
                SET is_finished = ?
                WHERE session_id = ? AND user_id = ?
                """,
                (1 if is_finished else 0, session_id, user_id)
            )
            await db.commit()

    async def upsert_answer(self, session_id: int, user_id: int, task_id: int, answer: str) -> None:
        async with self._connection() as db:
            await db.execute(
                """
                INSERT INTO trial_test_coop_answers (session_id, user_id, task_id, answer)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(session_id, user_id, task_id)
                DO UPDATE SET answer = excluded.answer, updated_at = CURRENT_TIMESTAMP
                """,
                (session_id, user_id, task_id, answer)
            )
            await db.commit()

    async def list_answers_for_user(self, session_id: int, user_id: int) -> List[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """
                SELECT * FROM trial_test_coop_answers
                WHERE session_id = ? AND user_id = ?
                """,
                (session_id, user_id)
            ) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]

    async def create_result_link(self, session_id: int, user_id: int, trial_test_result_id: int) -> Dict[str, Any]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            await db.execute(
                """
                INSERT OR REPLACE INTO trial_test_coop_results (session_id, user_id, trial_test_result_id)
                VALUES (?, ?, ?)
                """,
                (session_id, user_id, trial_test_result_id)
            )
            await db.commit()
            async with db.execute(
                """
                SELECT * FROM trial_test_coop_results
                WHERE session_id = ? AND user_id = ?
                """,
                (session_id, user_id)
            ) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else {}

    async def get_results_for_session(self, session_id: int) -> List[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """
                SELECT r.*, tr.score, tr.total, tr.percentage, tr.answers, tr.completed_at,
                       u.nickname, u.email
                FROM trial_test_coop_results r
                JOIN trial_test_results tr ON tr.id = r.trial_test_result_id
                JOIN users u ON u.id = r.user_id
                WHERE r.session_id = ?
                ORDER BY r.id ASC
                """,
                (session_id,)
            ) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]

    async def create_invite(self, session_id: int, sender_id: int, receiver_id: int) -> Dict[str, Any]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            await db.execute(
                """
                INSERT OR IGNORE INTO trial_test_coop_invites (session_id, sender_id, receiver_id)
                VALUES (?, ?, ?)
                """,
                (session_id, sender_id, receiver_id)
            )
            await db.commit()
            async with db.execute(
                """
                SELECT * FROM trial_test_coop_invites
                WHERE session_id = ? AND receiver_id = ?
                """,
                (session_id, receiver_id)
            ) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else {}

    async def get_invite(self, session_id: int, receiver_id: int) -> Optional[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """
                SELECT * FROM trial_test_coop_invites
                WHERE session_id = ? AND receiver_id = ? AND status = 'pending'
                """,
                (session_id, receiver_id)
            ) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else None

    async def update_invite_status(self, invite_id: int, status: str) -> None:
        async with self._connection() as db:
            await db.execute(
                """
                UPDATE trial_test_coop_invites
                SET status = ?, responded_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (status, invite_id)
            )
            await db.commit()

    async def list_incoming_invites(self, receiver_id: int) -> List[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """
                SELECT i.*, s.trial_test_id, s.owner_id, u.nickname as sender_nickname, t.title as test_title
                FROM trial_test_coop_invites i
                JOIN trial_test_coop_sessions s ON s.id = i.session_id
                JOIN users u ON u.id = i.sender_id
                JOIN trial_tests t ON t.id = s.trial_test_id
                WHERE i.receiver_id = ? AND i.status = 'pending'
                ORDER BY i.created_at DESC
                """,
                (receiver_id,)
            ) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]
