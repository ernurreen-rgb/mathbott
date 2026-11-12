"""
Repository for user onboarding data and statistics.
"""
import logging
from typing import Any, Dict

import storage as db_driver

from repositories.base import BaseRepository

logger = logging.getLogger(__name__)


class OnboardingRepository(BaseRepository):
    """Onboarding survey persistence and admin statistics"""

    async def is_onboarding_completed(self, user_id: int) -> bool:
        """Check if user has completed onboarding"""
        async with self._connection() as db:
            async with db.execute(
                "SELECT onboarding_completed FROM users WHERE id = ?",
                (user_id,)
            ) as cursor:
                row = await cursor.fetchone()
                return bool(row[0]) if row else False

    async def save_onboarding(self, user_id: int, how_did_you_hear: str, math_level: str, nickname: str) -> bool:
        """Save onboarding data and mark user as completed"""
        async with self._connection() as db:
            # Save onboarding data
            async with db.execute(
                """INSERT INTO user_onboarding
                   (user_id, how_did_you_hear, math_level, nickname, completed_at)
                   VALUES (?, ?, ?, ?, mathbot_datetime('now'))
                   ON CONFLICT (user_id) DO UPDATE SET
                       how_did_you_hear = EXCLUDED.how_did_you_hear, math_level = EXCLUDED.math_level,
                       nickname = EXCLUDED.nickname, completed_at = EXCLUDED.completed_at""",
                (user_id, how_did_you_hear, math_level, nickname)
            ):
                pass
            # Update user nickname
            async with db.execute(
                "UPDATE users SET nickname = ? WHERE id = ?",
                (nickname, user_id)
            ):
                pass
            # Mark onboarding as completed
            async with db.execute(
                "UPDATE users SET onboarding_completed = 1 WHERE id = ?",
                (user_id,)
            ):
                pass
            await db.commit()
            return True
