"""
Repository for friends, invites, and blocks
"""
import aiosqlite
import logging
import secrets
from datetime import datetime
from typing import Optional, Dict, Any, List

from .base import BaseRepository

logger = logging.getLogger(__name__)


class FriendsRepository(BaseRepository):
    """Repository for friends and invite operations"""

    async def _fetch_one(self, query: str, params: tuple) -> Optional[Dict[str, Any]]:
        conn = await self._get_connection()
        try:
            await self._configure_connection(conn)
            conn.row_factory = aiosqlite.Row
            async with conn.execute(query, params) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else None
        finally:
            await self._release_connection(conn)

    async def _fetch_all(self, query: str, params: tuple) -> List[Dict[str, Any]]:
        conn = await self._get_connection()
        try:
            await self._configure_connection(conn)
            conn.row_factory = aiosqlite.Row
            async with conn.execute(query, params) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]
        finally:
            await self._release_connection(conn)

    async def is_blocked_between(self, user_id: int, other_id: int) -> bool:
        query = """
            SELECT 1 FROM blocks
            WHERE (blocker_id = ? AND blocked_id = ?)
               OR (blocker_id = ? AND blocked_id = ?)
            LIMIT 1
        """
        row = await self._fetch_one(query, (user_id, other_id, other_id, user_id))
        return row is not None

    async def are_friends(self, user_id: int, other_id: int) -> bool:
        query = "SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ? LIMIT 1"
        row = await self._fetch_one(query, (user_id, other_id))
        return row is not None

    async def create_invite(self, inviter_id: int, expires_at: Optional[str]) -> Dict[str, Any]:
        conn = await self._get_connection()
        try:
            await self._configure_connection(conn)
            token = None
            for _ in range(5):
                token = secrets.token_urlsafe(24)
                try:
                    await conn.execute(
                        """
                        INSERT INTO friend_invites (token, inviter_id, expires_at)
                        VALUES (?, ?, ?)
                        """,
                        (token, inviter_id, expires_at)
                    )
                    await conn.commit()
                    break
                except Exception:
                    token = None
            if not token:
                raise RuntimeError("Failed to create invite token")
            return {
                "token": token,
                "inviter_id": inviter_id,
                "expires_at": expires_at
            }
        finally:
            await self._release_connection(conn)

    async def get_invite_by_token(self, token: str) -> Optional[Dict[str, Any]]:
        return await self._fetch_one(
            "SELECT * FROM friend_invites WHERE token = ?",
            (token,)
        )

    async def mark_invite_accepted(self, token: str, accepted_by: int) -> None:
        conn = await self._get_connection()
        try:
            await self._configure_connection(conn)
            await conn.execute(
                """
                UPDATE friend_invites
                SET status = 'accepted',
                    accepted_by = ?,
                    accepted_at = CURRENT_TIMESTAMP
                WHERE token = ?
                """,
                (accepted_by, token)
            )
            await conn.commit()
        finally:
            await self._release_connection(conn)

    async def expire_invite(self, token: str) -> None:
        conn = await self._get_connection()
        try:
            await self._configure_connection(conn)
            await conn.execute(
                "UPDATE friend_invites SET status = 'expired' WHERE token = ?",
                (token,)
            )
            await conn.commit()
        finally:
            await self._release_connection(conn)

    async def revoke_invite(self, token: str, inviter_id: int) -> None:
        conn = await self._get_connection()
        try:
            await self._configure_connection(conn)
            await conn.execute(
                """
                UPDATE friend_invites
                SET status = 'revoked'
                WHERE token = ? AND inviter_id = ? AND status = 'active'
                """,
                (token, inviter_id)
            )
            await conn.commit()
        finally:
            await self._release_connection(conn)

    async def list_invites_by_inviter(self, inviter_id: int, status: Optional[str] = None) -> List[Dict[str, Any]]:
        if status:
            return await self._fetch_all(
                "SELECT * FROM friend_invites WHERE inviter_id = ? AND status = ? ORDER BY created_at DESC",
                (inviter_id, status)
            )
        return await self._fetch_all(
            "SELECT * FROM friend_invites WHERE inviter_id = ? ORDER BY created_at DESC",
            (inviter_id,)
        )

    async def create_friendship(self, user_id: int, friend_id: int) -> None:
        conn = await self._get_connection()
        try:
            await self._configure_connection(conn)
            await conn.execute(
                "INSERT OR IGNORE INTO friendships (user_id, friend_id) VALUES (?, ?)",
                (user_id, friend_id)
            )
            await conn.execute(
                "INSERT OR IGNORE INTO friendships (user_id, friend_id) VALUES (?, ?)",
                (friend_id, user_id)
            )
            await conn.commit()
        finally:
            await self._release_connection(conn)

    async def delete_friendship(self, user_id: int, friend_id: int) -> None:
        conn = await self._get_connection()
        try:
            await self._configure_connection(conn)
            await conn.execute(
                "DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)",
                (user_id, friend_id, friend_id, user_id)
            )
            await conn.commit()
        finally:
            await self._release_connection(conn)

    async def list_friends(self, user_id: int) -> List[Dict[str, Any]]:
        query = """
            SELECT u.id, u.nickname, u.league, u.total_points, u.total_solved
            FROM friendships f
            JOIN users u ON u.id = f.friend_id
            WHERE f.user_id = ?
            ORDER BY u.total_points DESC, u.total_solved DESC, u.id ASC
        """
        return await self._fetch_all(query, (user_id,))

    async def create_friend_request(self, sender_id: int, receiver_id: int, status: str = "pending") -> None:
        conn = await self._get_connection()
        try:
            await self._configure_connection(conn)
            await conn.execute(
                """
                INSERT OR REPLACE INTO friend_requests (sender_id, receiver_id, status, responded_at)
                VALUES (?, ?, ?, CASE WHEN ? != 'pending' THEN CURRENT_TIMESTAMP ELSE NULL END)
                """,
                (sender_id, receiver_id, status, status)
            )
            await conn.commit()
        finally:
            await self._release_connection(conn)

    async def update_friend_request_status(self, request_id: int, status: str) -> None:
        conn = await self._get_connection()
        try:
            await self._configure_connection(conn)
            await conn.execute(
                """
                UPDATE friend_requests
                SET status = ?, responded_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (status, request_id)
            )
            await conn.commit()
        finally:
            await self._release_connection(conn)

    async def get_friend_request_by_id(self, request_id: int) -> Optional[Dict[str, Any]]:
        return await self._fetch_one(
            "SELECT * FROM friend_requests WHERE id = ?",
            (request_id,)
        )

    async def get_pending_request(self, sender_id: int, receiver_id: int) -> Optional[Dict[str, Any]]:
        return await self._fetch_one(
            """
            SELECT * FROM friend_requests
            WHERE sender_id = ? AND receiver_id = ? AND status = 'pending'
            """,
            (sender_id, receiver_id)
        )

    async def get_pending_request_between(self, user_id: int, other_id: int) -> Optional[Dict[str, Any]]:
        return await self._fetch_one(
            """
            SELECT * FROM friend_requests
            WHERE status = 'pending'
              AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
            """,
            (user_id, other_id, other_id, user_id)
        )

    async def list_incoming_requests(self, user_id: int) -> List[Dict[str, Any]]:
        query = """
            SELECT fr.id, fr.status, fr.created_at, fr.responded_at,
                   u.id as sender_id, u.nickname as sender_nickname, u.league as sender_league
            FROM friend_requests fr
            JOIN users u ON u.id = fr.sender_id
            WHERE fr.receiver_id = ?
            ORDER BY fr.created_at DESC
        """
        return await self._fetch_all(query, (user_id,))

    async def list_outgoing_requests(self, user_id: int) -> List[Dict[str, Any]]:
        query = """
            SELECT fr.id, fr.status, fr.created_at, fr.responded_at,
                   u.id as receiver_id, u.nickname as receiver_nickname, u.league as receiver_league
            FROM friend_requests fr
            JOIN users u ON u.id = fr.receiver_id
            WHERE fr.sender_id = ?
            ORDER BY fr.created_at DESC
        """
        return await self._fetch_all(query, (user_id,))

    async def block_user(self, blocker_id: int, blocked_id: int) -> None:
        conn = await self._get_connection()
        try:
            await self._configure_connection(conn)
            await conn.execute(
                "INSERT OR IGNORE INTO blocks (blocker_id, blocked_id) VALUES (?, ?)",
                (blocker_id, blocked_id)
            )
            await conn.execute(
                "DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)",
                (blocker_id, blocked_id, blocked_id, blocker_id)
            )
            await conn.execute(
                """
                DELETE FROM friend_requests
                WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
                """,
                (blocker_id, blocked_id, blocked_id, blocker_id)
            )
            await conn.commit()
        finally:
            await self._release_connection(conn)

    async def unblock_user(self, blocker_id: int, blocked_id: int) -> None:
        conn = await self._get_connection()
        try:
            await self._configure_connection(conn)
            await conn.execute(
                "DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?",
                (blocker_id, blocked_id)
            )
            await conn.commit()
        finally:
            await self._release_connection(conn)

    async def list_blocked_users(self, blocker_id: int) -> List[Dict[str, Any]]:
        query = """
            SELECT u.id, u.nickname, u.league, u.total_points, u.total_solved, b.created_at as blocked_at
            FROM blocks b
            JOIN users u ON u.id = b.blocked_id
            WHERE b.blocker_id = ?
            ORDER BY b.created_at DESC
        """
        return await self._fetch_all(query, (blocker_id,))
