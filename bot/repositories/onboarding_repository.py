"""
Repository for user onboarding data and statistics.
"""
import logging
from typing import Any, Dict

import aiosqlite

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
                """INSERT OR REPLACE INTO user_onboarding
                   (user_id, how_did_you_hear, math_level, nickname, completed_at)
                   VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)""",
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

    async def get_onboarding_statistics(self) -> Dict[str, Any]:
        """Get onboarding statistics for admin"""
        try:
            async with self._connection() as db:
                old_row_factory = db.row_factory
                db.row_factory = aiosqlite.Row
                try:
                    # Check if table exists
                    async with db.execute(
                        "SELECT name FROM sqlite_master WHERE type='table' AND name='user_onboarding'"
                    ) as cursor:
                        table_exists = await cursor.fetchone()
                        if not table_exists:
                            # Return empty stats if table doesn't exist yet
                            return {
                                "total_completed": 0,
                                "how_did_you_hear": {},
                                "math_level": {}
                            }

                    # Total completed onboarding
                    async with db.execute("SELECT COUNT(*) as count FROM user_onboarding") as cursor:
                        total_row = await cursor.fetchone()
                        total = total_row[0] if total_row else 0

                    # Statistics by "how did you hear"
                    how_did_you_hear_stats = {}
                    async with db.execute(
                        """SELECT how_did_you_hear, COUNT(*) as count
                           FROM user_onboarding
                           WHERE how_did_you_hear IS NOT NULL
                           GROUP BY how_did_you_hear
                           ORDER BY count DESC"""
                    ) as cursor:
                        rows = await cursor.fetchall()
                        for row in rows:
                            how_did_you_hear_stats[row["how_did_you_hear"]] = row["count"]

                    # Statistics by math level
                    math_level_stats = {}
                    async with db.execute(
                        """SELECT math_level, COUNT(*) as count
                           FROM user_onboarding
                           WHERE math_level IS NOT NULL
                           GROUP BY math_level
                           ORDER BY count DESC"""
                    ) as cursor:
                        rows = await cursor.fetchall()
                        for row in rows:
                            math_level_stats[row["math_level"]] = row["count"]

                    # Level labels mapping
                    level_labels = {
                        "beginner": "Бастапқы деңгей",
                        "intermediate": "Орташа деңгей",
                        "advanced": "Жоғары деңгей",
                        "expert": "Маман деңгейі"
                    }

                    # Format math level stats with labels
                    formatted_math_level_stats = {}
                    for level, count in math_level_stats.items():
                        formatted_math_level_stats[level_labels.get(level, level)] = count

                    return {
                        "total_completed": total,
                        "how_did_you_hear": how_did_you_hear_stats,
                        "math_level": formatted_math_level_stats
                    }
                finally:
                    db.row_factory = old_row_factory
        except Exception as e:
            logger.error(f"Error getting onboarding statistics: {e}", exc_info=True)
            # Return empty stats on error
            return {
                "total_completed": 0,
                "how_did_you_hear": {},
                "math_level": {}
            }
