"""
Student routes for module mistake review (Қателерді талдау).
"""
import logging

from fastapi import Depends, FastAPI, HTTPException, Request
from pydantic import BaseModel, Field
from slowapi import Limiter

from database import Database
from dependencies import get_db, require_internal_identity
from repositories.module_review_repository import ModuleReviewError

logger = logging.getLogger(__name__)

_ERROR_STATUS = {"not_found": 404, "conflict": 409}


class ReviewAnswerRequest(BaseModel):
    task_id: int = Field(gt=0)
    bank_task_id: int = Field(gt=0)
    answer: str = Field(max_length=5000)


def setup_module_review_routes(app: FastAPI, db: Database, limiter: Limiter):
    @app.get("/api/mini-lessons/{mini_lesson_id}/review")
    async def get_mini_lesson_review(
        mini_lesson_id: int,
        current_user: dict = Depends(require_internal_identity),
        db: Database = Depends(get_db),
    ):
        try:
            return await db.module_review.get_review(current_user["id"], mini_lesson_id)
        except ModuleReviewError as exc:
            raise HTTPException(status_code=_ERROR_STATUS.get(exc.kind, 400), detail=str(exc))

    @app.post("/api/mini-lessons/{mini_lesson_id}/review/answers")
    @limiter.limit("30/minute")
    async def submit_mini_lesson_review_answer(
        request: Request,
        mini_lesson_id: int,
        payload: ReviewAnswerRequest,
        current_user: dict = Depends(require_internal_identity),
        db: Database = Depends(get_db),
    ):
        try:
            return await db.module_review.submit_answer(
                current_user["id"], mini_lesson_id, payload.task_id, payload.bank_task_id, payload.answer,
            )
        except ModuleReviewError as exc:
            raise HTTPException(status_code=_ERROR_STATUS.get(exc.kind, 400), detail=str(exc))
