"""
Routes for tasks
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from slowapi import Limiter
from database import Database
from dependencies import get_db, require_internal_identity
from models.requests import TaskCheckRequest
from repositories.module_review_repository import LESSON_LOCKED_MESSAGE
from utils.public_payload import public_options, strip_solution_fields
from utils.validation import is_task_answer_correct, normalize_task_answer_for_compare
from utils.cache import cache

logger = logging.getLogger(__name__)


def setup_tasks_routes(app, db, limiter: Limiter):
    """Setup task routes"""
    
    @app.get("/api/tasks/{task_id}")
    async def get_task_by_id_api(task_id: int):
        """Get task by ID"""
        task = await db.tasks.get_task_by_id(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        
        questions = await db.progress.get_task_questions(task_id)
        public_questions = (
            public_options(questions)
            if task.get("question_type") in {"mcq", "mcq6", "select"}
            else strip_solution_fields(questions)
        )
        
        return {
            "id": task["id"],
            "text": task["text"],
            "text_scale": task.get("text_scale", "md"),
            "questions": public_questions,
            "task_type": task.get("task_type", "standard"),
            "section_id": task.get("section_id")
        }

    @app.post("/api/task/check")
    @limiter.limit("30/minute")
    async def check_task_answer(
        request: Request,
        task_check_request: TaskCheckRequest,
        db: Database = Depends(get_db),
    ):
        """
        Check task answer - optimized version
        
        Validates user's answer against the correct answer and updates progress.
        """
        try:
            user = await require_internal_identity(
                request=request,
                email=str(task_check_request.email),
                db=db,
            )
            user_email = user["email"]
            logger.info(
                "Received check request: task_id=%s, user_id=%s, answer_length=%s",
                task_check_request.task_id,
                user["id"],
                len(task_check_request.answer),
            )

            task = await db.tasks.get_task_by_id(task_check_request.task_id)
            if not task:
                logger.warning(f"Task not found: {task_check_request.task_id}")
                raise HTTPException(status_code=404, detail="Task not found")
            
            # Check if task is deleted
            if task.get("deleted_at"):
                logger.warning(f"Task {task_check_request.task_id} is deleted")
                raise HTTPException(status_code=404, detail="Task not found")

            # A lesson waiting for the mistake review of the lesson before it takes no answers.
            if task.get("mini_lesson_id") and not user.get("is_admin"):
                if await db.module_review.get_mini_lesson_lock(user["id"], int(task["mini_lesson_id"])):
                    raise HTTPException(status_code=423, detail=LESSON_LOCKED_MESSAGE)

            # Check answer directly using already fetched task (no extra DB query)
            qt = (task.get("question_type") or "input").strip().lower()
            user_answer_norm = normalize_task_answer_for_compare(task, task_check_request.answer)
            is_correct = is_task_answer_correct(task, task_check_request.answer)
            
            logger.info(
                f"Answer check: correct={is_correct}, "
                f"question_type={qt}, "
                f"user_answer={str(user_answer_norm)[:20]}"
            )

            # Record solution synchronously to guarantee progress is saved
            try:
                await db.record_solution(
                    user["id"],
                    task_check_request.task_id,
                    task_check_request.answer,
                    is_correct,
                    task_snapshot=task,
                )
                # Invalidate cache for user stats and modules map
                cache.invalidate_pattern(f"user:stats:{user_email}")
                cache.invalidate_pattern(f"modules:map:{user_email}")
            except Exception as e:
                logger.error(f"Failed to record_solution: {e}", exc_info=True)
                raise HTTPException(status_code=503, detail="Could not save the answer. Please retry.")

            # Never reveal the correct answer on a wrong attempt while the task remains retryable.
            result = {
                "correct": is_correct,
                "correct_answer": None,
            }
            logger.info(f"Returning result: {result}")
            return result
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error checking task answer: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Internal server error")
