"""
Achievement repository for user achievements
"""
import aiosqlite
import logging
from typing import List, Dict, Any
from .base import BaseRepository

logger = logging.getLogger(__name__)


class AchievementRepository(BaseRepository):
    """Repository for achievement operations"""
    
    async def check_and_unlock_achievements(self, user_id: int, user_repo, rating_repo):
        """Check user stats and unlock achievements"""
        user = await user_repo.get_user_by_id(user_id)
        if not user:
            return []
        
        stats = await rating_repo.get_user_stats(user_id)
        user.update(stats)
        
        unlocked = []
        
        achievements = [
            {"id": "first_solve", "name": "Бірінші есеп", "description": "Бірінші есепті шешіңіз", "icon": "🎯",
             "check": lambda u: u.get("total_solved", 0) >= 1},
            {"id": "ten_solves", "name": "Ондық", "description": "10 есепті шешіңіз", "icon": "🔟",
             "check": lambda u: u.get("total_solved", 0) >= 10},
            {"id": "fifty_solves", "name": "Елудік", "description": "50 есепті шешіңіз", "icon": "💯",
             "check": lambda u: u.get("total_solved", 0) >= 50},
            {"id": "hundred_solves", "name": "Жүздік", "description": "100 есепті шешіңіз", "icon": "🏆",
             "check": lambda u: u.get("total_solved", 0) >= 100},
            {"id": "streak_7", "name": "Қатарынан апта", "description": "7 күн қатарынан есептерді шешіңіз", "icon": "🔥",
             "check": lambda u: u.get("streak", 0) >= 7},
            {"id": "streak_30", "name": "Қатарынан ай", "description": "30 күн қатарынан есептерді шешіңіз", "icon": "⭐",
             "check": lambda u: u.get("streak", 0) >= 30},
            {"id": "top_league", "name": "Элитасы", "description": "Алмас лигасына жетіңіз", "icon": "💎",
             "check": lambda u: u.get("league") == "Алмас"},
            {"id": "top_3", "name": "Үздік 3", "description": "Өз лигаңызда топ-3-ке кіріңіз", "icon": "🥉",
             "check": lambda u: u.get("league_position", 999) <= 3 and u.get("league_position", 0) > 0},
            {"id": "thousand_points", "name": "Мыңдық", "description": "1000 ұпай жинаңыз", "icon": "💵",
             "check": lambda u: u.get("total_points", 0) >= 1000},
            {"id": "bronze_league", "name": "Қола", "description": "Қола лигасына жетіңіз", "icon": "🥉",
             "check": lambda u: u.get("league") == "Қола" and u.get("total_solved", 0) >= 1},
            {"id": "silver_league", "name": "Күміс", "description": "Күміс лигасына жетіңіз", "icon": "🥈",
             "check": lambda u: u.get("league") == "Күміс"},
            {"id": "gold_league", "name": "Алтын", "description": "Алтын лигасына жетіңіз", "icon": "🥇",
             "check": lambda u: u.get("league") == "Алтын"},
            {"id": "platinum_league", "name": "Платина", "description": "Платина лигасына жетіңіз", "icon": "💍",
             "check": lambda u: u.get("league") == "Платина"}
        ]
        
        for achievement in achievements:
            async with self._connection() as db:
                async with db.execute(
                    "SELECT id FROM user_achievements WHERE user_id = ? AND achievement_id = ?",
                    (user_id, achievement["id"])
                ) as cursor:
                    if await cursor.fetchone():
                        continue
            
            if achievement["check"](user):
                async def operation() -> None:
                    async with self._connection() as db:
                        await db.execute(
                            "INSERT INTO user_achievements (user_id, achievement_id) VALUES (?, ?)",
                            (user_id, achievement["id"])
                        )
                        await db.commit()

                await self._run_with_lock_retry(operation)
                unlocked.append(achievement)
                
                try:
                    from utils.notifications import send_achievement_notification
                    user_email = user.get("email")
                    if user_email:
                        await send_achievement_notification(user_email, achievement["name"])
                except Exception as e:
                    logger.error(f"Error sending achievement notification: {e}", exc_info=True)
        
        return unlocked

    async def get_user_achievements(self, user_id: int) -> List[Dict[str, Any]]:
        """Get all achievements for user"""
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """SELECT achievement_id, unlocked_at 
                   FROM user_achievements 
                   WHERE user_id = ?""",
                (user_id,)
            ) as cursor:
                rows = await cursor.fetchall()
                unlocked_ids = {dict(row)["achievement_id"] for row in rows}
        
        all_achievements = {
            "first_solve": {"name": "Бірінші есеп", "description": "Бірінші есепті шешіңіз", "icon": "🎯"},
            "ten_solves": {"name": "Ондық", "description": "10 есепті шешіңіз", "icon": "🔟"},
            "fifty_solves": {"name": "Елудік", "description": "50 есепті шешіңіз", "icon": "💯"},
            "hundred_solves": {"name": "Жүздік", "description": "100 есепті шешіңіз", "icon": "🏆"},
            "streak_7": {"name": "Қатарынан апта", "description": "7 күн қатарынан есептерді шешіңіз", "icon": "🔥"},
            "streak_30": {"name": "Қатарынан ай", "description": "30 күн қатарынан есептерді шешіңіз", "icon": "⭐"},
            "top_league": {"name": "Элитасы", "description": "Алмас лигасына жетіңіз", "icon": "💎"},
            "top_3": {"name": "Үздік 3", "description": "Өз лигаңызда топ-3-ке кіріңіз", "icon": "🥉"},
            "thousand_points": {"name": "Мыңдық", "description": "1000 ұпай жинаңыз", "icon": "💵"},
            "bronze_league": {"name": "Қола", "description": "Қола лигасына жетіңіз", "icon": "🥉"},
            "silver_league": {"name": "Күміс", "description": "Күміс лигасына жетіңіз", "icon": "🥈"},
            "gold_league": {"name": "Алтын", "description": "Алтын лигасына жетіңіз", "icon": "🥇"},
            "platinum_league": {"name": "Платина", "description": "Платина лигасына жетіңіз", "icon": "💍"}
        }
        
        result = []
        for achievement_id, achievement_data in all_achievements.items():
            result.append({
                "id": achievement_id,
                **achievement_data,
                "unlocked": achievement_id in unlocked_ids
            })
        
        return result

