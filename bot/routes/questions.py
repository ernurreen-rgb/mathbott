"""
Task questions роуты
"""
import logging
from typing import Optional
from fastapi import FastAPI, HTTPException, Query, Form, Request, Depends
from slowapi import Limiter

from dependencies import get_db
from database import Database
from utils.cache import cache
from utils.scoring import build_reward_identity

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
            user = await db.users.get_user_by_email(email)
            if user:
                user_id = user["id"]
        
        questions = await db.progress.get_task_questions(task_id)
        user_progress = {}
        if user_id:
            user_progress = await db.progress.get_user_task_question_progress(user_id, task_id)
        
        result = []
        for i, question in enumerate(questions):
            result.append({
                "index": i,
                "text": question.get("text", ""),
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
            
            user = await db.users.get_user_by_email(email)
            if not user:
                logger.warning(f"User not found: {email}")
                raise HTTPException(status_code=404, detail="User not found")
            
            task = await db.tasks.get_task_by_id(task_id)
            if not task:
                logger.warning(f"Task not found: {task_id}")
                raise HTTPException(status_code=404, detail="Task not found")
            
            logger.info(f"Checking question answer for task {task_id}, question {question_index}")
            is_correct = await db.progress.check_task_question_answer(task_id, question_index, answer)
            logger.info(f"Question answer check result: {is_correct}")
            
            # Record progress
            await db.progress.record_task_question_progress(user["id"], task_id, question_index, is_correct)
            
            # Check if all questions in the task are completed
            all_completed = await db.progress.check_if_task_all_questions_completed(user["id"], task_id)
            logger.info(f"All questions completed: {all_completed}")
            
            if all_completed:
                # Mark task as completed
                await db.progress.update_task_progress(user["id"], task_id, "completed")
                reward = build_reward_identity(task, surface="module")
                award_result = await db.users.award_task_reward_once(
                    user_id=user["id"],
                    reward_key=reward["reward_key"],
                    bank_task_id=reward["bank_task_id"],
                    difficulty=reward["difficulty"],
                    points=reward["points"],
                    source="module",
                    source_ref_id=task_id,
                )
                cache.invalidate_pattern(f"user:stats:{email}")
                cache.invalidate_pattern(f"modules:map:{email}")
                cache.invalidate_pattern("rating:")
                if award_result.get("awarded"):
                    try:
                        await db.users.update_streak(user["id"])
                    except Exception as e:
                        logger.error(f"Failed to update streak: {e}", exc_info=True)
                    try:
                        await db.check_and_unlock_achievements(user["id"])
                    except Exception as e:
                        logger.error(f"Failed to check achievements: {e}", exc_info=True)
            
            questions = await db.progress.get_task_questions(task_id)
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
            raise HTTPException(status_code=500, detail="Internal server error")
