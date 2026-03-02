"""
Statistics repository for admin statistics
"""
import aiosqlite
import logging
from datetime import datetime, timedelta
from typing import Dict, Any
from .base import BaseRepository

logger = logging.getLogger(__name__)


class StatisticsRepository(BaseRepository):
    """Repository for statistics operations"""
    
    async def get_admin_statistics(self, task_repo) -> Dict[str, Any]:
        """Get comprehensive admin statistics"""
        try:
            async with self._connection() as db:
                db.row_factory = aiosqlite.Row
                
                stats = {}
            
                # 1. General Platform Statistics
                async with db.execute("SELECT COUNT(*) FROM users") as cursor:
                    stats["total_users"] = (await cursor.fetchone())[0]
                
                async with db.execute("SELECT COUNT(*) FROM tasks WHERE deleted_at IS NULL") as cursor:
                    stats["total_tasks"] = (await cursor.fetchone())[0]
                
                async with db.execute("SELECT COUNT(*) FROM tasks WHERE deleted_at IS NOT NULL") as cursor:
                    stats["deleted_tasks"] = (await cursor.fetchone())[0]
                
                async with db.execute("SELECT COUNT(*) FROM solutions") as cursor:
                    stats["total_solutions"] = (await cursor.fetchone())[0]
                
                async with db.execute("SELECT COUNT(*) FROM solutions WHERE is_correct = 1") as cursor:
                    stats["correct_solutions"] = (await cursor.fetchone())[0]
                
                async with db.execute("SELECT COUNT(*) FROM solutions WHERE is_correct = 0") as cursor:
                    stats["incorrect_solutions"] = (await cursor.fetchone())[0]
                
                async with db.execute("SELECT COUNT(*) FROM trial_tests") as cursor:
                    stats["total_trial_tests"] = (await cursor.fetchone())[0]
                
                async with db.execute("SELECT COUNT(*) FROM trial_test_results") as cursor:
                    stats["total_trial_test_results"] = (await cursor.fetchone())[0]
                
                async with db.execute("SELECT COUNT(*) FROM reports") as cursor:
                    stats["total_reports"] = (await cursor.fetchone())[0]
                
                async with db.execute("SELECT COUNT(*) FROM reports WHERE status = 'pending'") as cursor:
                    stats["pending_reports"] = (await cursor.fetchone())[0]
                
                async with db.execute("SELECT COUNT(*) FROM reports WHERE status = 'resolved'") as cursor:
                    stats["resolved_reports"] = (await cursor.fetchone())[0]
                
                # 2. User Statistics
                today = datetime.now().date()
                week_ago = today - timedelta(days=7)
                month_ago = today - timedelta(days=30)
                
                async with db.execute("SELECT COUNT(*) FROM users WHERE DATE(created_at) = DATE('now')") as cursor:
                    stats["users_registered_today"] = (await cursor.fetchone())[0]
                
                async with db.execute("SELECT COUNT(*) FROM users WHERE DATE(created_at) >= ?", (week_ago.isoformat(),)) as cursor:
                    stats["users_registered_week"] = (await cursor.fetchone())[0]
                
                async with db.execute("SELECT COUNT(*) FROM users WHERE DATE(created_at) >= ?", (month_ago.isoformat(),)) as cursor:
                    stats["users_registered_month"] = (await cursor.fetchone())[0]
                
                async with db.execute("SELECT COUNT(DISTINCT user_id) FROM solutions WHERE DATE(created_at) = DATE('now')") as cursor:
                    stats["active_users_today"] = (await cursor.fetchone())[0]
                
                async with db.execute("SELECT COUNT(DISTINCT user_id) FROM solutions WHERE DATE(created_at) >= ?", (week_ago.isoformat(),)) as cursor:
                    stats["active_users_week"] = (await cursor.fetchone())[0]
                
                async with db.execute("SELECT COUNT(DISTINCT user_id) FROM solutions WHERE DATE(created_at) >= ?", (month_ago.isoformat(),)) as cursor:
                    stats["active_users_month"] = (await cursor.fetchone())[0]
                
                async with db.execute("""SELECT id, email, nickname, total_points, total_solved, week_points, streak
                       FROM users ORDER BY total_points DESC LIMIT 10""") as cursor:
                    stats["top_users_by_points"] = [dict(row) for row in await cursor.fetchall()]
                
                async with db.execute("""SELECT id, email, nickname, total_solved, total_points, week_points, streak
                       FROM users ORDER BY total_solved DESC LIMIT 10""") as cursor:
                    stats["top_users_by_solved"] = [dict(row) for row in await cursor.fetchall()]
                
                async with db.execute("""SELECT id, email, nickname, streak, total_solved, total_points
                       FROM users WHERE streak > 0 ORDER BY streak DESC LIMIT 10""") as cursor:
                    stats["top_users_by_streak"] = [dict(row) for row in await cursor.fetchall()]
                
                async with db.execute("""SELECT AVG(total_solved) as avg_solved, AVG(total_points) as avg_points,
                       AVG(streak) as avg_streak, AVG(week_points) as avg_week_points FROM users""") as cursor:
                    row = await cursor.fetchone()
                    stats["avg_user_stats"] = {
                        "avg_solved": round(row[0] or 0, 2),
                        "avg_points": round(row[1] or 0, 2),
                        "avg_streak": round(row[2] or 0, 2),
                        "avg_week_points": round(row[3] or 0, 2)
                    }
                
                if stats["total_solutions"] > 0:
                    stats["overall_success_rate"] = round((stats["correct_solutions"] / stats["total_solutions"]) * 100, 2)
                else:
                    stats["overall_success_rate"] = 0.0
                
                # 3. Task Statistics
                async with db.execute("""SELECT task_id, COUNT(*) as attempts, 
                       SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct, COUNT(*) as total
                       FROM solutions GROUP BY task_id ORDER BY attempts DESC LIMIT 20""") as cursor:
                    popular_tasks = []
                    for row in await cursor.fetchall():
                        task = await task_repo.get_task_by_id(row[0])
                        if task:
                            success_rate = (row[2] / row[3] * 100) if row[3] > 0 else 0
                            popular_tasks.append({
                                "task_id": row[0],
                                "text": task.get("text", "")[:100],
                                "attempts": row[1],
                                "correct": row[2],
                                "total": row[3],
                                "success_rate": round(success_rate, 2)
                            })
                    stats["popular_tasks"] = popular_tasks
                
                async with db.execute("""SELECT task_id, COUNT(*) as total,
                       SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct
                       FROM solutions GROUP BY task_id HAVING total >= 5
                       ORDER BY (CAST(correct AS REAL) / total) ASC LIMIT 10""") as cursor:
                    difficult_tasks = []
                    for row in await cursor.fetchall():
                        task = await task_repo.get_task_by_id(row[0])
                        if task:
                            success_rate = (row[2] / row[1] * 100) if row[1] > 0 else 0
                            difficult_tasks.append({
                                "task_id": row[0],
                                "text": task.get("text", "")[:100],
                                "attempts": row[1],
                                "correct": row[2],
                                "success_rate": round(success_rate, 2)
                            })
                    stats["difficult_tasks"] = difficult_tasks
                
                async with db.execute("""SELECT task_id, COUNT(*) as total,
                       SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct
                       FROM solutions GROUP BY task_id HAVING total >= 5
                       ORDER BY (CAST(correct AS REAL) / total) DESC LIMIT 10""") as cursor:
                    easy_tasks = []
                    for row in await cursor.fetchall():
                        task = await task_repo.get_task_by_id(row[0])
                        if task:
                            success_rate = (row[2] / row[1] * 100) if row[1] > 0 else 0
                            easy_tasks.append({
                                "task_id": row[0],
                                "text": task.get("text", "")[:100],
                                "attempts": row[1],
                                "correct": row[2],
                                "success_rate": round(success_rate, 2)
                            })
                    stats["easy_tasks"] = easy_tasks
                
                async with db.execute("""SELECT COALESCE(bt.question_type, 'input') as question_type, COUNT(s.id) as total,
                       SUM(CASE WHEN s.is_correct = 1 THEN 1 ELSE 0 END) as correct
                       FROM solutions s
                       JOIN tasks t ON s.task_id = t.id
                       LEFT JOIN bank_tasks bt ON t.bank_task_id = bt.id
                       WHERE t.deleted_at IS NULL
                       GROUP BY COALESCE(bt.question_type, 'input')""") as cursor:
                    question_type_stats = []
                    for row in await cursor.fetchall():
                        success_rate = (row[2] / row[1] * 100) if row[1] > 0 else 0
                        question_type_stats.append({
                            "question_type": row[0] or "input",
                            "total": row[1],
                            "correct": row[2],
                            "success_rate": round(success_rate, 2)
                        })
                    stats["question_type_stats"] = question_type_stats
                
                # 4. Activity Statistics
                async with db.execute("""SELECT CASE CAST(strftime('%w', created_at) AS INTEGER)
                         WHEN 0 THEN 'Sunday' WHEN 1 THEN 'Monday' WHEN 2 THEN 'Tuesday'
                         WHEN 3 THEN 'Wednesday' WHEN 4 THEN 'Thursday' WHEN 5 THEN 'Friday'
                         WHEN 6 THEN 'Saturday' END as day_name, COUNT(*) as count
                       FROM solutions GROUP BY day_name ORDER BY 
                         CASE day_name WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2
                         WHEN 'Wednesday' THEN 3 WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5
                         WHEN 'Saturday' THEN 6 WHEN 'Sunday' THEN 7 END""") as cursor:
                    stats["activity_by_day"] = [dict(row) for row in await cursor.fetchall()]
                
                async with db.execute("""SELECT CAST(strftime('%H', created_at) AS INTEGER) as hour, COUNT(*) as count
                       FROM solutions GROUP BY hour ORDER BY hour""") as cursor:
                    stats["activity_by_hour"] = [dict(row) for row in await cursor.fetchall()]
                
                async with db.execute("""SELECT DATE(created_at) as date, COUNT(*) as count,
                       COUNT(DISTINCT user_id) as unique_users FROM solutions
                       WHERE DATE(created_at) >= DATE('now', '-30 days')
                       GROUP BY DATE(created_at) ORDER BY date""") as cursor:
                    stats["activity_trends"] = [dict(row) for row in await cursor.fetchall()]
                
                # 5. Achievement Statistics
                async with db.execute("""SELECT achievement_id, COUNT(*) as count
                       FROM user_achievements GROUP BY achievement_id ORDER BY count DESC""") as cursor:
                    stats["achievement_distribution"] = [dict(row) for row in await cursor.fetchall()]
                
                # 6. Trial Test Statistics
                async with db.execute("""SELECT tt.id, tt.title, COUNT(ttr.id) as completions,
                       AVG(ttr.percentage) as avg_percentage, COUNT(DISTINCT ttr.user_id) as unique_users
                       FROM trial_tests tt LEFT JOIN trial_test_results ttr ON tt.id = ttr.trial_test_id
                       GROUP BY tt.id, tt.title ORDER BY completions DESC""") as cursor:
                    stats["trial_test_stats"] = [dict(row) for row in await cursor.fetchall()]
                
                async with db.execute("""SELECT CASE
                         WHEN percentage >= 90 THEN '90-100%' WHEN percentage >= 80 THEN '80-89%'
                         WHEN percentage >= 70 THEN '70-79%' WHEN percentage >= 60 THEN '60-69%'
                         WHEN percentage >= 50 THEN '50-59%' ELSE '0-49%' END as range,
                       COUNT(*) as count FROM trial_test_results GROUP BY range ORDER BY range DESC""") as cursor:
                    stats["trial_test_results_distribution"] = [dict(row) for row in await cursor.fetchall()]
                
                # 7. Report Statistics
                async with db.execute("SELECT status, COUNT(*) as count FROM reports GROUP BY status") as cursor:
                    stats["report_status_distribution"] = [dict(row) for row in await cursor.fetchall()]
                
                async with db.execute("""SELECT task_id, COUNT(*) as count FROM reports
                       GROUP BY task_id ORDER BY count DESC LIMIT 10""") as cursor:
                    problematic_tasks = []
                    for row in await cursor.fetchall():
                        task = await task_repo.get_task_by_id(row[0])
                        if task:
                            problematic_tasks.append({
                                "task_id": row[0],
                                "text": task.get("text", "")[:100],
                                "report_count": row[1]
                            })
                    stats["problematic_tasks"] = problematic_tasks
                
                async with db.execute("""SELECT AVG((julianday(resolved_at) - julianday(created_at)) * 24) as avg_hours
                       FROM reports WHERE resolved_at IS NOT NULL""") as cursor:
                    row = await cursor.fetchone()
                    stats["avg_report_resolution_time"] = round(row[0] or 0, 2)
                
                # 8. League Statistics
                async with db.execute("SELECT league, COUNT(*) as count FROM users GROUP BY league ORDER BY count DESC") as cursor:
                    stats["league_distribution"] = [dict(row) for row in await cursor.fetchall()]
                
                async with db.execute("""SELECT league, AVG(total_solved) as avg_solved, AVG(total_points) as avg_points,
                       AVG(week_points) as avg_week_points, AVG(streak) as avg_streak
                       FROM users GROUP BY league""") as cursor:
                    stats["league_averages"] = [dict(row) for row in await cursor.fetchall()]
                
                # 9. Time-based Statistics
                async with db.execute("""SELECT DATE(created_at) as date, COUNT(*) as count FROM users
                       WHERE DATE(created_at) >= DATE('now', '-90 days')
                       GROUP BY DATE(created_at) ORDER BY date""") as cursor:
                    stats["registrations_over_time"] = [dict(row) for row in await cursor.fetchall()]
                
                async with db.execute("""SELECT DATE(created_at) as date, COUNT(*) as count,
                       SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct FROM solutions
                       WHERE DATE(created_at) >= DATE('now', '-90 days')
                       GROUP BY DATE(created_at) ORDER BY date""") as cursor:
                    stats["solutions_over_time"] = [dict(row) for row in await cursor.fetchall()]
                
                # 10. Module Statistics
                try:
                    async with db.execute("""SELECT m.id, m.name, COUNT(DISTINCT up.user_id) as users_with_progress,
                           COUNT(DISTINCT up.task_id) as tasks_completed FROM modules m
                           LEFT JOIN sections s ON m.id = s.module_id
                           LEFT JOIN lessons l ON s.id = l.section_id
                           LEFT JOIN mini_lessons ml ON l.id = ml.lesson_id
                           LEFT JOIN tasks t ON (ml.id = t.mini_lesson_id OR s.id = t.section_id) AND (t.deleted_at IS NULL)
                           LEFT JOIN user_progress up ON t.id = up.task_id AND up.status = 'completed'
                           GROUP BY m.id, m.name ORDER BY users_with_progress DESC""") as cursor:
                        stats["module_progress"] = [dict(row) for row in await cursor.fetchall()]
                except Exception as e:
                    logger.error(f"Error getting module progress: {e}", exc_info=True)
                    stats["module_progress"] = []
                
                return stats
        except Exception as e:
            logger.error(f"Error in get_admin_statistics: {e}", exc_info=True)
            raise
