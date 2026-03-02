"""
Solution repository for recording and checking solutions
"""
import aiosqlite
import logging
import sqlite3
import asyncio
from typing import Dict, Any, Optional
from .base import BaseRepository
from utils.scoring import build_reward_identity

logger = logging.getLogger(__name__)


class SolutionRepository(BaseRepository):
    """Repository for solution operations"""
    
    async def record_solution(
        self, user_id: int, task_id: int, answer: str, is_correct: bool,
        progress_repo, user_repo, achievement_repo, rating_repo, task_repo, task_snapshot: Optional[Dict[str, Any]] = None
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
                        await db.commit()
                    break
                except sqlite3.OperationalError as e:
                    if "database is locked" not in str(e).lower() or attempt == 5:
                        raise
                    await asyncio.sleep(0.15 * attempt)

            if is_correct:
                task_data = task_snapshot or await task_repo.get_task_by_id(task_id)
                award_result = {"awarded": False, "points": 0}
                if task_data:
                    reward = build_reward_identity(task_data, surface="module")
                    try:
                        award_result = await user_repo.award_task_reward_once(
                            user_id=user_id,
                            reward_key=reward["reward_key"],
                            bank_task_id=reward["bank_task_id"],
                            difficulty=reward["difficulty"],
                            points=reward["points"],
                            source="module",
                            source_ref_id=task_id,
                        )
                    except Exception as e:
                        logger.error(f"Failed to award task reward: {e}", exc_info=True)

                try:
                    await progress_repo.update_task_progress(user_id, task_id, "completed")
                except Exception as e:
                    logger.error(f"Failed to update task progress: {e}", exc_info=True)
                
                try:
                    await user_repo.update_streak(user_id)
                except Exception as e:
                    logger.error(f"Failed to update streak: {e}", exc_info=True)
                
                if award_result.get("awarded"):
                    try:
                        await achievement_repo.check_and_unlock_achievements(user_id, user_repo, rating_repo)
                    except Exception as e:
                        logger.error(f"Failed to check achievements: {e}", exc_info=True)
        except Exception as e:
            logger.error(f"Error recording solution: {e}", exc_info=True)
            raise

