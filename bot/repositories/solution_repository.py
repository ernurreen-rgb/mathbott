"""
Solution repository for recording and checking solutions
"""
import aiosqlite
import logging
import sqlite3
import asyncio
from typing import Dict, Any
from .base import BaseRepository

logger = logging.getLogger(__name__)


class SolutionRepository(BaseRepository):
    """Repository for solution operations"""
    
    async def record_solution(
        self, user_id: int, task_id: int, answer: str, is_correct: bool,
        progress_repo, user_repo, achievement_repo
    ):
        """Record user solution"""
        try:
            for attempt in range(1, 6):
                try:
                    async with self._connection() as db:
                        await db.execute(
                            """INSERT INTO solutions (user_id, task_id, answer, is_correct)
                               VALUES (?, ?, ?, ?)""",
                            (user_id, task_id, answer, is_correct)
                        )
                        if is_correct:
                            await db.execute(
                                """UPDATE users SET
                                   total_solved = total_solved + 1,
                                   week_solved = week_solved + 1,
                                   week_points = week_points + 10,
                                   total_points = total_points + 10,
                                   last_active = CURRENT_TIMESTAMP
                                   WHERE id = ?""",
                                (user_id,)
                            )
                            await db.commit()
                    break
                except sqlite3.OperationalError as e:
                    if "database is locked" not in str(e).lower() or attempt == 5:
                        raise
                    await asyncio.sleep(0.15 * attempt)

            if is_correct:
                try:
                    await progress_repo.update_task_progress(user_id, task_id, "completed")
                except Exception as e:
                    logger.error(f"Failed to update task progress: {e}", exc_info=True)
                
                try:
                    await user_repo.update_streak(user_id)
                except Exception as e:
                    logger.error(f"Failed to update streak: {e}", exc_info=True)
                
                try:
                    await achievement_repo.check_and_unlock_achievements(user_id)
                except Exception as e:
                    logger.error(f"Failed to check achievements: {e}", exc_info=True)
        except Exception as e:
            logger.error(f"Error recording solution: {e}", exc_info=True)
            raise

