"""
Rating repository for user ratings and leagues
"""
import aiosqlite
import asyncio
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any
from models.db_models import League, LEAGUE_ORDER
from .base import BaseRepository

logger = logging.getLogger(__name__)


class RatingRepository(BaseRepository):
    """Repository for rating and league operations"""
    
    async def get_rating(self, limit: int = 10, offset: int = 0, league: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get rating - only users with nickname (with pagination)"""
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            if league:
                query = """
                    SELECT * FROM users
                    WHERE league = ? AND nickname IS NOT NULL AND nickname != ''
                    ORDER BY week_points DESC, total_points DESC
                    LIMIT ? OFFSET ?
                """
                async with db.execute(query, (league, limit, offset)) as cursor:
                    rows = await cursor.fetchall()
                    return [dict(row) for row in rows]
            else:
                query = """
                    SELECT * FROM users
                    WHERE nickname IS NOT NULL AND nickname != ''
                    ORDER BY total_points DESC, total_solved DESC
                    LIMIT ? OFFSET ?
                """
                async with db.execute(query, (limit, offset)) as cursor:
                    rows = await cursor.fetchall()
                    return [dict(row) for row in rows]
    
    async def get_rating_count(self, league: Optional[str] = None) -> int:
        """Get total count of users in rating (only with nickname)"""
        async with self._connection() as db:
            if league:
                query = "SELECT COUNT(*) as count FROM users WHERE league = ? AND nickname IS NOT NULL AND nickname != ''"
                async with db.execute(query, (league,)) as cursor:
                    row = await cursor.fetchone()
                    return row[0] if row else 0
            else:
                query = "SELECT COUNT(*) as count FROM users WHERE nickname IS NOT NULL AND nickname != ''"
                async with db.execute(query) as cursor:
                    row = await cursor.fetchone()
                    return row[0] if row else 0

    async def get_league_rating(self, league: str, group: int) -> List[Dict[str, Any]]:
        """Get rating for specific league group"""
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            query = """
                SELECT * FROM users
                WHERE league = ? AND league_group = ?
                ORDER BY week_points DESC, total_points DESC
            """
            async with db.execute(query, (league, group)) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]

    async def get_user_stats(self, user_id: int) -> Dict[str, Any]:
        """Get user statistics"""
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM users WHERE id = ?", (user_id,)) as cursor:
                user = await cursor.fetchone()
                if not user:
                    return {}

            async with db.execute(
                """
                SELECT * FROM users
                WHERE league = ? AND league_group = ?
                ORDER BY week_points DESC, total_points DESC
                """,
                (user["league"], user["league_group"])
            ) as cursor:
                league_rows = await cursor.fetchall()
                league_rating = [dict(row) for row in league_rows]

            position = None
            for idx, u in enumerate(league_rating):
                if u["id"] == user_id:
                    position = idx + 1
                    break

            return {
                **dict(user),
                "league_position": position,
                "league_size": len(league_rating)
            }

    async def reset_week(self, user_repo):
        """Reset weekly statistics and update leagues - optimized with transactions"""
        async with self._connection() as conn:
            try:
                today = datetime.now().date()
                async with conn.execute(
                    "SELECT * FROM weekly_resets WHERE reset_date = ?", (today,)
                ) as cursor:
                    if await cursor.fetchone():
                        return False

                # Start transaction for batch operations
                await conn.execute("BEGIN TRANSACTION")
                
                # Collect all updates to batch them
                promotion_updates = []
                demotion_updates = []
                league_counts = {}  # Cache league counts
                
                for league in LEAGUE_ORDER:
                    async with conn.execute(
                        "SELECT DISTINCT league_group FROM users WHERE league = ?",
                        (league.value,)
                    ) as cursor:
                        groups = [row[0] for row in await cursor.fetchall()]

                    for group in groups:
                        rating = await self.get_league_rating(league.value, group)
                        if len(rating) < 7:
                            continue

                        # Batch promotions
                        for i in range(min(7, len(rating))):
                            user_id = rating[i]["id"]
                            current_league_idx = LEAGUE_ORDER.index(league)
                            if current_league_idx < len(LEAGUE_ORDER) - 1:
                                new_league = LEAGUE_ORDER[current_league_idx + 1]
                                
                                # Cache league count
                                if new_league.value not in league_counts:
                                    async with conn.execute(
                                        "SELECT COUNT(*) as count FROM users WHERE league = ?",
                                        (new_league.value,)
                                    ) as count_cursor:
                                        count_row = await count_cursor.fetchone()
                                        league_counts[new_league.value] = count_row[0] if count_row else 0
                                
                                new_group = (league_counts[new_league.value] // 30)
                                promotion_updates.append((new_league.value, new_group, user_id))
                                
                                # Send notification in background (non-blocking)
                                try:
                                    from utils.notifications import send_league_promotion_notification
                                    from utils.background_tasks import run_in_background
                                    
                                    async def send_notification(user_id, old_league, new_league):
                                        user = await user_repo.get_user_by_id(user_id)
                                        if user and user.get("email"):
                                            await send_league_promotion_notification(
                                                user["email"], old_league, new_league
                                            )
                                    
                                    # Run notification in background
                                    asyncio.create_task(send_notification(user_id, league.value, new_league.value))
                                except Exception as e:
                                    logger.error(f"Error scheduling league promotion notification: {e}", exc_info=True)

                        # Batch demotions
                        for i in range(max(0, len(rating) - 5), len(rating)):
                            user_id = rating[i]["id"]
                            current_league_idx = LEAGUE_ORDER.index(league)
                            if current_league_idx > 0:
                                new_league = LEAGUE_ORDER[current_league_idx - 1]
                                
                                # Cache league count
                                if new_league.value not in league_counts:
                                    async with conn.execute(
                                        "SELECT COUNT(*) as count FROM users WHERE league = ?",
                                        (new_league.value,)
                                    ) as count_cursor:
                                        count_row = await count_cursor.fetchone()
                                        league_counts[new_league.value] = count_row[0] if count_row else 0
                                
                                new_group = (league_counts[new_league.value] // 30)
                                demotion_updates.append((new_league.value, new_group, user_id))

                # Batch execute all updates
                if promotion_updates:
                    await conn.executemany(
                        "UPDATE users SET league = ?, league_group = ? WHERE id = ?",
                        promotion_updates
                    )
                
                if demotion_updates:
                    await conn.executemany(
                        "UPDATE users SET league = ?, league_group = ? WHERE id = ?",
                        demotion_updates
                    )
                
                # Reset weekly stats for all users
                await conn.execute("UPDATE users SET week_solved = 0, week_points = 0")
                await conn.execute("INSERT INTO weekly_resets (reset_date) VALUES (?)", (today,))
                
                # Commit transaction
                await conn.commit()
                return True
            except Exception as e:
                await conn.rollback()
                logger.error(f"Error in reset_week: {e}", exc_info=True)
                raise

