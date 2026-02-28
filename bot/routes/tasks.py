"""
Routes for tasks
"""
import logging
import asyncio
from fastapi import APIRouter, HTTPException, Request
from slowapi import Limiter
from models.requests import TaskCheckRequest
from utils.validation import normalize_task_answer_for_compare
from utils.cache import cache

logger = logging.getLogger(__name__)


def setup_tasks_routes(app, db, limiter: Limiter):
    """Setup task routes"""
    
    @app.get("/api/tasks/{task_id}")
    async def get_task_by_id_api(task_id: int):
        """Get task by ID"""
        task = await db.get_task_by_id(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        
        questions = await db.get_task_questions(task_id)
        
        return {
            "id": task["id"],
            "text": task["text"],
            "text_scale": task.get("text_scale", "md"),
            "answer": task.get("answer"),
            "questions": questions,
            "task_type": task.get("task_type", "standard"),
            "section_id": task.get("section_id")
        }

    @app.post("/api/task/check")
    @limiter.limit("10/minute")
    async def check_task_answer(request: Request, task_check_request: TaskCheckRequest):
        """
        Check task answer - optimized version
        
        Validates user's answer against the correct answer and updates progress.
        
        **Example Request:**
        ```json
        POST /api/task/check
        {
          "task_id": 123,
          "answer": "42",
          "email": "user@example.com"
        }
        ```
        
        **Example Response (Correct):**
        ```json
        {
          "correct": true,
          "correct_answer": null
        }
        ```
        
        **Example Response (Incorrect):**
        ```json
        {
          "correct": false,
          "correct_answer": "42"
        }
        ```
        
        **Error Codes:**
        - 200: Success
        - 404: User or task not found
        - 429: Rate limit exceeded (10 requests per minute)
        - 500: Internal server error
        """
        try:
            logger.info(f"Received check request: task_id={task_check_request.task_id}, email={task_check_request.email}, answer_length={len(task_check_request.answer)}")
            
            # Get user and task in parallel
            user_task, task_task = await asyncio.gather(
                db.get_user_by_email(task_check_request.email),
                db.get_task_by_id(task_check_request.task_id),
                return_exceptions=True
            )
            
            logger.info(f"Fetched user and task: user={user_task is not None and not isinstance(user_task, Exception)}, task={task_task is not None and not isinstance(task_task, Exception)}")
            
            if isinstance(user_task, Exception) or not user_task:
                logger.warning(f"User not found: {task_check_request.email}")
                raise HTTPException(status_code=404, detail="User not found")
            user = user_task
            
            if isinstance(task_task, Exception) or not task_task:
                logger.warning(f"Task not found: {task_check_request.task_id}")
                raise HTTPException(status_code=404, detail="Task not found")
            task = task_task
            
            # Check if task is deleted
            if task.get("deleted_at"):
                logger.warning(f"Task {task_check_request.task_id} is deleted")
                raise HTTPException(status_code=404, detail="Task not found")

            # Check answer directly using already fetched task (no extra DB query)
            correct_answer = (task.get("answer") or "").strip()
            qt = (task.get("question_type") or "input").strip().lower()
            user_answer_norm = normalize_task_answer_for_compare(task, task_check_request.answer)
            correct_answer_norm = normalize_task_answer_for_compare(task, correct_answer)
            if qt in {"mcq", "mcq6", "select"}:
                is_correct = correct_answer_norm == user_answer_norm
            elif qt == "tf":
                is_correct = correct_answer_norm == user_answer_norm
            else:
                is_correct = correct_answer_norm == user_answer_norm
            
            logger.info(
                f"Answer check: correct={is_correct}, "
                f"question_type={qt}, "
                f"correct_answer={correct_answer[:20] if correct_answer else 'None'}, "
                f"user_answer={str(user_answer_norm)[:20]}"
            )

            # Record solution synchronously to guarantee progress is saved
            try:
                await db.record_solution(user["id"], task_check_request.task_id, task_check_request.answer, is_correct)
                # Invalidate cache for user stats and modules map
                cache.invalidate_pattern(f"user:stats:{task_check_request.email}")
                cache.invalidate_pattern(f"modules:map:{task_check_request.email}")
                cache.invalidate_pattern("rating:")  # Invalidate all rating caches
            except Exception as e:
                logger.error(f"Failed to record_solution: {e}", exc_info=True)
                # Don't fail the check response; user can retry

            result = {
                "correct": is_correct,
                "correct_answer": task["answer"] if not is_correct else None
            }
            logger.info(f"Returning result: {result}")
            return result
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error checking task answer: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

