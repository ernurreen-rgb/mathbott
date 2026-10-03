"""
Routes for Quizzes management (Quizizz-like service)
"""
import logging
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Query, Depends
from pydantic import BaseModel, Field
from slowapi import Limiter

from dependencies import get_db, require_internal_identity
from database import Database

logger = logging.getLogger(__name__)


class CreateQuizRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(default="", max_length=1000)
    cover_image: Optional[str] = None
    is_public: bool = True


class UpdateQuizRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=1000)
    cover_image: Optional[str] = None
    is_public: Optional[bool] = None


class QuizQuestionItem(BaseModel):
    question_text: str = Field(min_length=1, max_length=5000)
    question_type: str = Field(default="mcq")  # mcq, multi_select, input, tf
    options: Optional[List[Dict[str, Any]]] = None
    correct_answer: str = Field(min_length=1, max_length=1000)
    accepted_answers: Optional[List[str]] = None
    time_limit_seconds: int = Field(default=30, ge=5, le=300)
    points: int = Field(default=1000, ge=100, le=5000)
    sort_order: int = Field(default=0)
    image_filename: Optional[str] = None
    explanation: Optional[str] = None


class UpdateQuestionItem(BaseModel):
    question_text: Optional[str] = Field(default=None, min_length=1, max_length=5000)
    question_type: Optional[str] = None
    options: Optional[List[Dict[str, Any]]] = None
    correct_answer: Optional[str] = Field(default=None, min_length=1, max_length=1000)
    accepted_answers: Optional[List[str]] = None
    time_limit_seconds: Optional[int] = Field(default=None, ge=5, le=300)
    points: Optional[int] = Field(default=None, ge=100, le=5000)
    sort_order: Optional[int] = None
    image_filename: Optional[str] = None
    explanation: Optional[str] = None


def setup_quizzes_routes(app: FastAPI, db: Database, limiter: Limiter):
    """Setup Quizzes CRUD routes."""

    @app.get("/api/quizzes")
    async def list_quizzes_endpoint(
        my_only: bool = Query(False),
        email: Optional[str] = Query(None),
        limit: int = Query(50, ge=1, le=100),
        offset: int = Query(0, ge=0),
        db: Database = Depends(get_db),
    ):
        """List public quizzes or user's own quizzes."""
        user_id = None
        if email:
            user = await db.users.get_user_by_email(email)
            if user:
                user_id = user["id"]

        if my_only:
            if not user_id:
                return []
            quizzes = await db.quizzes.list_quizzes(created_by=user_id, limit=limit, offset=offset)
        else:
            quizzes = await db.quizzes.list_quizzes(is_public=True, limit=limit, offset=offset)

        return quizzes

    @app.get("/api/quizzes/{quiz_id}")
    async def get_quiz_endpoint(
        quiz_id: int,
        db: Database = Depends(get_db),
    ):
        """Get a single quiz details."""
        quiz = await db.quizzes.get_quiz_by_id(quiz_id)
        if not quiz:
            raise HTTPException(status_code=404, detail="Quiz not found")
        return quiz

    @app.get("/api/quizzes/{quiz_id}/questions")
    async def get_quiz_questions_endpoint(
        quiz_id: int,
        db: Database = Depends(get_db),
    ):
        """Get all questions of a quiz."""
        quiz = await db.quizzes.get_quiz_by_id(quiz_id)
        if not quiz:
            raise HTTPException(status_code=404, detail="Quiz not found")
        return await db.quizzes.get_quiz_questions(quiz_id)

    @app.post("/api/quizzes")
    async def create_quiz_endpoint(
        payload: CreateQuizRequest,
        current_user: dict = Depends(require_internal_identity),
        db: Database = Depends(get_db),
    ):
        """Create a new quiz (requires authenticated user)."""
        quiz = await db.quizzes.create_quiz(
            title=payload.title,
            created_by=current_user["id"],
            description=payload.description or "",
            cover_image=payload.cover_image,
            is_public=payload.is_public,
        )
        return quiz

    @app.put("/api/quizzes/{quiz_id}")
    async def update_quiz_endpoint(
        quiz_id: int,
        payload: UpdateQuizRequest,
        current_user: dict = Depends(require_internal_identity),
        db: Database = Depends(get_db),
    ):
        """Update an existing quiz (only author or admin)."""
        quiz = await db.quizzes.get_quiz_by_id(quiz_id)
        if not quiz:
            raise HTTPException(status_code=404, detail="Quiz not found")

        is_admin = bool(current_user.get("is_admin"))
        if quiz["created_by"] != current_user["id"] and not is_admin:
            raise HTTPException(status_code=403, detail="Forbidden: You are not the author of this quiz")

        updated = await db.quizzes.update_quiz(
            quiz_id=quiz_id,
            title=payload.title,
            description=payload.description,
            cover_image=payload.cover_image,
            is_public=payload.is_public,
        )
        return updated

    @app.delete("/api/quizzes/{quiz_id}")
    async def delete_quiz_endpoint(
        quiz_id: int,
        current_user: dict = Depends(require_internal_identity),
        db: Database = Depends(get_db),
    ):
        """Delete a quiz (only author or admin)."""
        quiz = await db.quizzes.get_quiz_by_id(quiz_id)
        if not quiz:
            raise HTTPException(status_code=404, detail="Quiz not found")

        is_admin = bool(current_user.get("is_admin"))
        if quiz["created_by"] != current_user["id"] and not is_admin:
            raise HTTPException(status_code=403, detail="Forbidden: You are not the author of this quiz")

        await db.quizzes.delete_quiz(quiz_id)
        return {"success": True, "deleted_id": quiz_id}

    # --- Questions management ---

    @app.post("/api/quizzes/{quiz_id}/questions")
    async def add_quiz_question_endpoint(
        quiz_id: int,
        payload: QuizQuestionItem,
        current_user: dict = Depends(require_internal_identity),
        db: Database = Depends(get_db),
    ):
        """Add a question to a quiz."""
        quiz = await db.quizzes.get_quiz_by_id(quiz_id)
        if not quiz:
            raise HTTPException(status_code=404, detail="Quiz not found")

        is_admin = bool(current_user.get("is_admin"))
        if quiz["created_by"] != current_user["id"] and not is_admin:
            raise HTTPException(status_code=403, detail="Forbidden: You are not the author of this quiz")

        question = await db.quizzes.add_question(
            quiz_id=quiz_id,
            question_text=payload.question_text,
            question_type=payload.question_type,
            options=payload.options,
            correct_answer=payload.correct_answer,
            accepted_answers=payload.accepted_answers,
            time_limit_seconds=payload.time_limit_seconds,
            points=payload.points,
            sort_order=payload.sort_order,
            image_filename=payload.image_filename,
            explanation=payload.explanation,
        )
        return question

    @app.put("/api/quizzes/{quiz_id}/questions/{question_id}")
    async def update_quiz_question_endpoint(
        quiz_id: int,
        question_id: int,
        payload: UpdateQuestionItem,
        current_user: dict = Depends(require_internal_identity),
        db: Database = Depends(get_db),
    ):
        """Update a question in a quiz."""
        quiz = await db.quizzes.get_quiz_by_id(quiz_id)
        if not quiz:
            raise HTTPException(status_code=404, detail="Quiz not found")

        is_admin = bool(current_user.get("is_admin"))
        if quiz["created_by"] != current_user["id"] and not is_admin:
            raise HTTPException(status_code=403, detail="Forbidden: You are not the author of this quiz")

        question = await db.quizzes.get_question_by_id(question_id)
        if not question or question["quiz_id"] != quiz_id:
            raise HTTPException(status_code=404, detail="Question not found in this quiz")

        updated = await db.quizzes.update_question(
            question_id=question_id,
            question_text=payload.question_text,
            question_type=payload.question_type,
            options=payload.options,
            correct_answer=payload.correct_answer,
            accepted_answers=payload.accepted_answers,
            time_limit_seconds=payload.time_limit_seconds,
            points=payload.points,
            sort_order=payload.sort_order,
            image_filename=payload.image_filename,
            explanation=payload.explanation,
        )
        return updated

    @app.delete("/api/quizzes/{quiz_id}/questions/{question_id}")
    async def delete_quiz_question_endpoint(
        quiz_id: int,
        question_id: int,
        current_user: dict = Depends(require_internal_identity),
        db: Database = Depends(get_db),
    ):
        """Delete a question from a quiz."""
        quiz = await db.quizzes.get_quiz_by_id(quiz_id)
        if not quiz:
            raise HTTPException(status_code=404, detail="Quiz not found")

        is_admin = bool(current_user.get("is_admin"))
        if quiz["created_by"] != current_user["id"] and not is_admin:
            raise HTTPException(status_code=403, detail="Forbidden: You are not the author of this quiz")

        question = await db.quizzes.get_question_by_id(question_id)
        if not question or question["quiz_id"] != quiz_id:
            raise HTTPException(status_code=404, detail="Question not found in this quiz")

        await db.quizzes.delete_question(question_id)
        return {"success": True, "deleted_id": question_id}
