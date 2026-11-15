"""
Browser push subscriptions for the daily streak reminder.
"""
from typing import Any, Dict, List

from .base import BaseRepository

_CLAIM_COLUMNS = ("id", "user_id", "endpoint", "p256dh", "auth", "streak", "last_streak_date")


def _chunks(values: List[Any], size: int = 500) -> List[List[Any]]:
    # Keeps IN lists well below the PostgreSQL parameter limit.
    return [values[index:index + size] for index in range(0, len(values), size)]


class PushRepository(BaseRepository):
    async def save_subscription(self, user_id: int, endpoint: str, p256dh: str, auth: str) -> None:
        """Store a device. An endpoint that is already known (another account signed in on the
        same browser) moves to this user, because the browser only ever has one subscription."""
        async with self._write_transaction() as db:
            await db.execute(
                """INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
                   ON CONFLICT (endpoint) DO UPDATE
                   SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth""",
                (user_id, endpoint, p256dh, auth),
            )

    async def delete_subscription(self, user_id: int, endpoint: str) -> bool:
        async with self._write_transaction() as db:
            async with db.execute(
                "DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?", (user_id, endpoint)
            ) as cursor:
                return cursor.rowcount > 0

    async def delete_endpoints(self, endpoints: List[str]) -> int:
        """Drop devices the push service reported as gone (expired or unsubscribed)."""
        deleted = 0
        if not endpoints:
            return deleted
        async with self._write_transaction() as db:
            for chunk in _chunks(list(dict.fromkeys(endpoints))):
                placeholders = ",".join(["?"] * len(chunk))
                async with db.execute(
                    f"DELETE FROM push_subscriptions WHERE endpoint IN ({placeholders})", tuple(chunk)
                ) as cursor:
                    deleted += max(cursor.rowcount, 0)
        return deleted

    async def count_other_devices(self, user_id: int, endpoint: str) -> int:
        """Devices of this user other than `endpoint` (re-enabling one device is not a new device)."""
        async with self._connection() as db:
            async with db.execute(
                "SELECT COUNT(*) FROM push_subscriptions WHERE user_id = ? AND endpoint <> ?", (user_id, endpoint)
            ) as cursor:
                row = await cursor.fetchone()
                return int(row[0]) if row else 0

    async def claim_due_reminders(self, today: str, limit: int) -> List[Dict[str, Any]]:
        """Mark up to `limit` devices as reminded on `today` and return them.

        A device is due when its student has solved nothing today, by the same UTC date
        the streak uses. Claiming before sending means another cron run on the same day
        skips these devices, even if the two runs overlap.
        """
        async with self._write_transaction() as db:
            async with db.execute(
                """UPDATE push_subscriptions AS ps SET last_reminded_on = ?
                   FROM users AS u
                   WHERE u.id = ps.user_id AND ps.id IN (
                       SELECT s.id FROM push_subscriptions AS s
                       JOIN users AS su ON su.id = s.user_id
                       WHERE (s.last_reminded_on IS NULL OR s.last_reminded_on <> ?)
                         AND (su.last_streak_date IS NULL OR LEFT(su.last_streak_date, 10) <> ?)
                       ORDER BY s.id
                       LIMIT ?
                   )
                   RETURNING ps.id, ps.user_id, ps.endpoint, ps.p256dh, ps.auth, u.streak, u.last_streak_date""",
                (today, today, today, limit),
            ) as cursor:
                rows = await cursor.fetchall()
        return [dict(zip(_CLAIM_COLUMNS, row)) for row in rows]
