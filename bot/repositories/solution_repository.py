"""Record a solution and its required effects as one transaction."""
import logging
from typing import Dict, Any, Optional

from .base import BaseRepository
from utils.scoring import build_reward_identity, calculate_next_streak

logger = logging.getLogger(__name__)


class SolutionRepository(BaseRepository):
    async def record_solution(
        self, user_id: int, task_id: int, answer: str, is_correct: bool,
        progress_repo, user_repo, achievement_repo, task_repo,
        task_snapshot: Optional[Dict[str, Any]] = None,
    ):
        task = task_snapshot or await task_repo.get_task_by_id(task_id)
        if not task:
            raise ValueError("Task not found")
        reward = build_reward_identity(task, surface="module")
        awarded = False
        milestone = None
        async with self._write_transaction() as db:
            await db.execute(
                "INSERT INTO solutions (user_id, task_id, answer, is_correct) VALUES (?, ?, ?, ?)",
                (user_id, task_id, answer, is_correct),
            )
            if is_correct:
                cursor = await db.execute(
                    """INSERT INTO user_task_rewards
                       (user_id, reward_key, bank_task_id, difficulty, points_awarded, source, source_ref_id)
                       VALUES (?, ?, ?, ?, ?, 'module', ?)
                       ON CONFLICT(user_id, reward_key) DO NOTHING""",
                    (user_id, reward["reward_key"], reward["bank_task_id"],
                     reward["difficulty"], reward["points"], task_id),
                )
                awarded = cursor.rowcount == 1
                if awarded:
                    await db.execute(
                        """UPDATE users SET total_points = total_points + ?,
                           total_solved = total_solved + 1, last_active = CURRENT_TIMESTAMP
                           WHERE id = ?""",
                        (reward["points"], user_id),
                    )
                await db.execute(
                    """INSERT INTO user_progress (user_id, task_id, status, completed_at)
                       VALUES (?, ?, 'completed', CURRENT_TIMESTAMP)
                       ON CONFLICT(user_id, task_id) DO UPDATE SET
                           status = 'completed',
                           completed_at = COALESCE(user_progress.completed_at, CURRENT_TIMESTAMP),
                           updated_at = CURRENT_TIMESTAMP""",
                    (user_id, task_id),
                )
                async with db.execute(
                    "SELECT streak, last_streak_date FROM users WHERE id = ?", (user_id,)
                ) as cursor:
                    user = await cursor.fetchone()
                if user:
                    streak, streak_date = calculate_next_streak(int(user[0] or 0), user[1])
                    await db.execute(
                        "UPDATE users SET streak = ?, last_streak_date = ? WHERE id = ?",
                        (streak, streak_date, user_id),
                    )
                    if streak > int(user[0] or 0) and streak in (7, 30, 100):
                        milestone = streak

        # Optional effects run only after durable progress has committed.
        if awarded:
            try:
                await achievement_repo.check_and_unlock_achievements(user_id, user_repo)
            except Exception:
                logger.exception("Failed to check achievements")
        if milestone:
            try:
                from utils.notifications import send_streak_notification
                user = await user_repo.get_user_by_id(user_id)
                if user and user.get("email"):
                    await send_streak_notification(user["email"], milestone)
            except Exception:
                logger.exception("Failed to send streak notification")
