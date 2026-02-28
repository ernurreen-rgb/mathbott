"""
Task questions роуты
"""
import logging
import aiosqlite
from typing import Optional
from fastapi import FastAPI, HTTPException, Query, Form, Request, Depends
from slowapi import Limiter

from dependencies import get_db
from database import Database

logger = logging.getLogger(__name__)


def setup_questions_routes(app: FastAPI, db: Database, limiter: Limiter):
    """Настроить questions роуты"""
    
    @app.get("/api/tasks/{task_id}/questions")
    async def get_task_questions(
        task_id: int,
        email: Optional[str] = Query(None),
        db: Database = Depends(get_db)
    ):
        """Get all questions for a task with user progress"""
        user_id = None
        if email:
            user = await db.get_user_by_email(email)
            if user:
                user_id = user["id"]
        
        questions = await db.get_task_questions(task_id)
        user_progress = {}
        if user_id:
            user_progress = await db.get_user_task_question_progress(user_id, task_id)
        
        result = []
        for i, question in enumerate(questions):
            result.append({
                "index": i,
                "text": question.get("text", ""),
                "answer": question.get("answer", ""),
                "completed": user_progress.get(i, False)
            })
        
        return result
    
    @app.post("/api/tasks/{task_id}/questions/check")
    @limiter.limit("10/minute")
    async def check_task_question_answer(
        request: Request,
        task_id: int,
        question_index: int = Form(...),
        answer: str = Form(...),
        email: str = Form(...),
        db: Database = Depends(get_db)
    ):
        """Check answer for a specific question in a task"""
        try:
            logger.info(f"Received question check request: task_id={task_id}, question_index={question_index}, email={email}, answer_length={len(answer)}")
            
            user = await db.get_user_by_email(email)
            if not user:
                logger.warning(f"User not found: {email}")
                raise HTTPException(status_code=404, detail="User not found")
            
            task = await db.get_task_by_id(task_id)
            if not task:
                logger.warning(f"Task not found: {task_id}")
                raise HTTPException(status_code=404, detail="Task not found")
            
            logger.info(f"Checking question answer for task {task_id}, question {question_index}")
            is_correct = await db.check_task_question_answer(task_id, question_index, answer)
            logger.info(f"Question answer check result: {is_correct}")
            
            # Record progress
            await db.record_task_question_progress(user["id"], task_id, question_index, is_correct)
            
            # Check if all questions in the task are completed
            all_completed = await db.check_if_task_all_questions_completed(user["id"], task_id)
            logger.info(f"All questions completed: {all_completed}")
            
            if all_completed:
                # Mark task as completed
                await db.update_task_progress(user["id"], task_id, "completed")
                # Update user stats (similar to record_solution)
                async with aiosqlite.connect(db.db_path) as db_conn:
                    await db_conn.execute(
                        """UPDATE users SET
                           total_solved = total_solved + 1,
                           week_solved = week_solved + 1,
                           week_points = week_points + 10,
                           total_points = total_points + 10,
                           last_active = CURRENT_TIMESTAMP
                           WHERE id = ?""",
                        (user["id"],)
                    )
                    await db_conn.commit()
                # Update streak and achievements
                try:
                    await db.update_streak(user["id"])
                except Exception as e:
                    logger.error(f"Failed to update streak: {e}", exc_info=True)
                try:
                    await db.check_and_unlock_achievements(user["id"])
                except Exception as e:
                    logger.error(f"Failed to check achievements: {e}", exc_info=True)
            
            questions = await db.get_task_questions(task_id)
            correct_answer = None
            if not is_correct and question_index < len(questions):
                correct_answer = questions[question_index].get("answer")
            
            result = {
                "correct": is_correct,
                "correct_answer": correct_answer,
                "all_completed": all_completed
            }
            logger.info(f"Returning question check result: {result}")
            return result
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error checking question answer: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
