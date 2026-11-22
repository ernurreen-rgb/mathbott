"""
Routes for Quizzes management (Quizizz-like service)
"""
import logging
from typing import Optional, List, Dict, Any, Literal
from fastapi import FastAPI, HTTPException, Query, Depends, Request
from pydantic import BaseModel, Field, model_validator
from slowapi import Limiter

from dependencies import (
    get_db,
    is_content_admin,
    optional_internal_identity,
    require_internal_identity,
)
from database import Database
from utils.quiz import QuizError, public_question

logger = logging.getLogger(__name__)


class CreateQuizRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(default="", max_length=1000)
    cover_image: Optional[str] = None
    is_public: bool = False
    grade: Optional[int] = Field(default=None, ge=1, le=11)
    topic: str = Field(default="", max_length=80)
    questions: List["QuizQuestionItem"] = Field(default_factory=list, max_length=200)


class UpdateQuizRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=1000)
    cover_image: Optional[str] = None
    is_public: Optional[bool] = None
    grade: Optional[int] = Field(default=None, ge=1, le=11)  # an explicit null clears it
    topic: Optional[str] = Field(default=None, max_length=80)
    questions: Optional[List["QuizQuestionItem"]] = Field(default=None, max_length=200)


class QuizQuestionItem(BaseModel):
    question_text: str = Field(min_length=1, max_length=5000)
    question_type: Literal["mcq", "multi_select", "input", "tf"] = "mcq"
    options: Optional[List[Dict[str, Any]]] = None
    correct_answer: str = Field(min_length=1, max_length=1000)
    accepted_answers: Optional[List[str]] = None
    time_limit_seconds: int = Field(default=30, ge=5, le=300)
    points: int = Field(default=1000, ge=100, le=5000)
    sort_order: int = Field(default=0)
    image_filename: Optional[str] = None
    explanation: Optional[str] = None

    @model_validator(mode="after")
    def validate_option_count(self):
        if self.question_type in {"mcq", "multi_select"} and len(self.options or []) not in (4, 6):
            raise ValueError("Multiple-choice questions require exactly 4 or 6 options")
        return self


class BulkCatalogRequest(BaseModel):
    quiz_ids: List[int] = Field(min_length=1, max_length=200)
    grade: Optional[int] = Field(default=None, ge=1, le=11)  # an explicit null clears it
    topic: Optional[str] = Field(default=None, max_length=80)

    @model_validator(mode="after")
    def validate_change(self):
        if "grade" not in self.model_fields_set and self.topic is None:
            raise ValueError("Send a grade or a topic to set")
        return self


class UpdateQuestionItem(BaseModel):
    question_text: Optional[str] = Field(default=None, min_length=1, max_length=5000)
    question_type: Optional[Literal["mcq", "multi_select", "input", "tf"]] = None
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

    def can_manage(quiz, user):
        if not user:
            return False
        if user['id'] == quiz['created_by']:
            return True
        return is_content_admin(user)

    def ensure_visible(quiz, user):
        if not quiz or (not quiz['is_public'] and not can_manage(quiz, user)):
            raise HTTPException(status_code=404, detail="Quiz not found")

    @app.get("/api/quizzes")
    async def list_quizzes_endpoint(
        my_only: bool = Query(False),
        is_public: Optional[bool] = Query(None),
        email: Optional[str] = Query(None),
        limit: int = Query(50, ge=1, le=100),
        offset: int = Query(0, ge=0),
        db: Database = Depends(get_db),
        current_user: Optional[dict] = Depends(optional_internal_identity),
    ):
        """List public quizzes or user's own quizzes."""
        user_id = current_user['id'] if current_user else None

        if my_only:
            if not user_id:
                return []
            quizzes = await db.quizzes.list_quizzes(created_by=user_id, is_public=is_public, limit=limit, offset=offset)
        else:
            quizzes = await db.quizzes.list_quizzes(is_public=True, limit=limit, offset=offset)

        return [{**quiz, 'is_public': bool(quiz['is_public']), 'can_manage': can_manage(quiz, current_user)} for quiz in quizzes]

    # Declared before /api/quizzes/{quiz_id}, which would otherwise capture "catalog".
    @app.get("/api/quizzes/catalog")
    async def quiz_catalog_endpoint(
        scope: Literal["all", "mine"] = Query("all"),
        visibility: Optional[Literal["public", "private"]] = Query(None),
        q: Optional[str] = Query(None, max_length=100),
        grade: Optional[int] = Query(None, ge=1, le=11),
        topic: Optional[str] = Query(None, max_length=80),
        untagged: bool = Query(False),
        sort: Literal["newest", "popular"] = Query("newest"),
        limit: int = Query(24, ge=1, le=60),
        offset: int = Query(0, ge=0),
        db: Database = Depends(get_db),
        current_user: Optional[dict] = Depends(optional_internal_identity),
    ):
        """A searchable, filterable page of public quizzes (or the caller's own) with filter counts."""
        filters = dict(search=q, grade=grade, topic=topic, untagged=untagged, sort=sort, limit=limit, offset=offset)
        if scope == "mine":
            if not current_user:
                return {"items": [], "total": 0, "limit": limit, "offset": offset,
                        "facets": {"grades": [], "topics": [], "untagged": 0}}
            catalog = await db.quizzes.get_catalog(
                created_by=current_user["id"],
                is_public=None if visibility is None else visibility == "public", **filters)
        else:
            catalog = await db.quizzes.get_catalog(is_public=True, **filters)
        catalog["items"] = [
            {**quiz, 'is_public': bool(quiz['is_public']), 'can_manage': can_manage(quiz, current_user)}
            for quiz in catalog["items"]]
        return catalog

    @app.get("/api/quizzes/{quiz_id}")
    async def get_quiz_endpoint(
        quiz_id: int,
        db: Database = Depends(get_db),
        current_user: Optional[dict] = Depends(optional_internal_identity),
    ):
        """Get a single quiz details."""
        quiz = await db.quizzes.get_quiz_by_id(quiz_id)
        ensure_visible(quiz, current_user)
        return {**quiz, 'is_public': bool(quiz['is_public']), 'can_manage': can_manage(quiz, current_user)}

    @app.get("/api/quizzes/{quiz_id}/questions")
    async def get_quiz_questions_endpoint(
        quiz_id: int,
        db: Database = Depends(get_db),
        current_user: Optional[dict] = Depends(optional_internal_identity),
    ):
        """Get all questions of a quiz."""
        quiz = await db.quizzes.get_quiz_by_id(quiz_id)
        ensure_visible(quiz, current_user)
        questions = await db.quizzes.get_quiz_questions(quiz_id)
        return questions if can_manage(quiz, current_user) else [public_question(q) for q in questions]

    @app.get("/api/quizzes/{quiz_id}/sessions")
    async def get_quiz_sessions_endpoint(
        quiz_id: int,
        db: Database = Depends(get_db),
        current_user: Optional[dict] = Depends(optional_internal_identity),
    ):
        """Get past game sessions and student results hosted by the current user (or all for admin)."""
        quiz = await db.quizzes.get_quiz_by_id(quiz_id)
        ensure_visible(quiz, current_user)
        if not current_user:
            return []
        host_filter = None if is_content_admin(current_user) else current_user["id"]
        return await db.quizzes.get_quiz_sessions(quiz_id, host_id=host_filter)

    @app.post("/api/quizzes/bulk-catalog")
    @limiter.limit("30/minute")
    async def bulk_catalog_endpoint(
        request: Request,
        payload: BulkCatalogRequest,
        current_user: dict = Depends(require_internal_identity),
        db: Database = Depends(get_db),
    ):
        """Set the grade and/or topic of several quizzes at once (author or admin); all or nothing."""
        quiz_ids = list(dict.fromkeys(payload.quiz_ids))
        owners = await db.quizzes.get_quiz_owners(quiz_ids)
        if len(owners) != len(quiz_ids):
            raise HTTPException(status_code=404, detail="Quiz not found")
        if not is_content_admin(current_user) and any(owner != current_user["id"] for owner in owners.values()):
            raise HTTPException(status_code=403, detail="Forbidden: You are not the author of every selected quiz")
        updated = await db.quizzes.set_catalog_fields(
            quiz_ids, topic=payload.topic,
            **({"grade": payload.grade} if "grade" in payload.model_fields_set else {}))
        return {"updated": updated}

    @app.post("/api/quizzes")
    @limiter.limit("30/minute")
    async def create_quiz_endpoint(
        request: Request,
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
            grade=payload.grade,
            topic=payload.topic,
            questions=[q.model_dump() for q in payload.questions],
        )
        return {**quiz, 'is_public': bool(quiz['is_public']), 'can_manage': True}

    @app.put("/api/quizzes/{quiz_id}")
    @limiter.limit("60/minute")
    async def update_quiz_endpoint(
        request: Request,
        quiz_id: int,
        payload: UpdateQuizRequest,
        current_user: dict = Depends(require_internal_identity),
        db: Database = Depends(get_db),
    ):
        """Update an existing quiz (only author or admin)."""
        quiz = await db.quizzes.get_quiz_by_id(quiz_id)
        if not quiz:
            raise HTTPException(status_code=404, detail="Quiz not found")

        if not can_manage(quiz, current_user):
            raise HTTPException(status_code=403, detail="Forbidden: You are not the author of this quiz")

        updated = await db.quizzes.update_quiz(
            quiz_id=quiz_id,
            title=payload.title,
            description=payload.description,
            cover_image=payload.cover_image,
            is_public=payload.is_public,
            questions=[q.model_dump() for q in payload.questions] if payload.questions is not None else None,
            topic=payload.topic,
            **({"grade": payload.grade} if "grade" in payload.model_fields_set else {}),
        )
        return {**updated, 'is_public': bool(updated['is_public']), 'can_manage': can_manage(updated, current_user)}

    @app.post("/api/quizzes/{quiz_id}/fork")
    @limiter.limit("20/minute")
    async def fork_quiz_endpoint(
        request: Request,
        quiz_id: int,
        current_user: dict = Depends(require_internal_identity),
        db: Database = Depends(get_db),
    ):
        """Fork/clone a public quiz to user's own quizzes."""
        quiz = await db.quizzes.get_quiz_by_id(quiz_id)
        if not quiz:
            raise HTTPException(status_code=404, detail="Quiz not found")

        caller_can_manage = can_manage(quiz, current_user)
        if not quiz["is_public"] and not caller_can_manage:
            raise HTTPException(status_code=403, detail="Тек ашық квиздерді көшіріп алуға болады")

        try:
            cloned = await db.quizzes.fork_quiz(
                quiz_id=quiz_id,
                user_id=current_user["id"],
                allow_during_active_session=caller_can_manage,
            )
        except QuizError as exc:
            if exc.kind == "conflict":
                raise HTTPException(status_code=409, detail=str(exc))
            raise HTTPException(status_code=400, detail=str(exc))
        if not cloned:
            raise HTTPException(status_code=400, detail="Квизді көшіру мүмкін болмады")
        return {**cloned, 'is_public': bool(cloned['is_public']), 'can_manage': True}

    @app.delete("/api/quizzes/{quiz_id}")
    @limiter.limit("30/minute")
    async def delete_quiz_endpoint(
        request: Request,
        quiz_id: int,
        current_user: dict = Depends(require_internal_identity),
        db: Database = Depends(get_db),
    ):
        """Delete a quiz (only author or admin)."""
        quiz = await db.quizzes.get_quiz_by_id(quiz_id)
        if not quiz:
            raise HTTPException(status_code=404, detail="Quiz not found")

        if not can_manage(quiz, current_user):
            raise HTTPException(status_code=403, detail="Forbidden: You are not the author of this quiz")

        await db.quizzes.delete_quiz(quiz_id)
        return {"success": True, "deleted_id": quiz_id}

    # --- Questions management ---

    @app.post("/api/quizzes/{quiz_id}/questions")
    @limiter.limit("60/minute")
    async def add_quiz_question_endpoint(
        request: Request,
        quiz_id: int,
        payload: QuizQuestionItem,
        current_user: dict = Depends(require_internal_identity),
        db: Database = Depends(get_db),
    ):
        """Add a question to a quiz."""
        quiz = await db.quizzes.get_quiz_by_id(quiz_id)
        if not quiz:
            raise HTTPException(status_code=404, detail="Quiz not found")

        if not can_manage(quiz, current_user):
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
    @limiter.limit("60/minute")
    async def update_quiz_question_endpoint(
        request: Request,
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

        if not can_manage(quiz, current_user):
            raise HTTPException(status_code=403, detail="Forbidden: You are not the author of this quiz")

        question = await db.quizzes.get_question_by_id(question_id)
        if not question or question["quiz_id"] != quiz_id:
            raise HTTPException(status_code=404, detail="Question not found in this quiz")

        effective_type = payload.question_type or question.get("question_type")
        effective_options = payload.options if payload.options is not None else question.get("options") or []
        if effective_type in {"mcq", "multi_select"} and len(effective_options) not in (4, 6):
            raise HTTPException(status_code=400, detail="Multiple-choice questions require exactly 4 or 6 options")

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
    @limiter.limit("60/minute")
    async def delete_quiz_question_endpoint(
        request: Request,
        quiz_id: int,
        question_id: int,
        current_user: dict = Depends(require_internal_identity),
        db: Database = Depends(get_db),
    ):
        """Delete a question from a quiz."""
        quiz = await db.quizzes.get_quiz_by_id(quiz_id)
        if not quiz:
            raise HTTPException(status_code=404, detail="Quiz not found")

        if not can_manage(quiz, current_user):
            raise HTTPException(status_code=403, detail="Forbidden: You are not the author of this quiz")

        question = await db.quizzes.get_question_by_id(question_id)
        if not question or question["quiz_id"] != quiz_id:
            raise HTTPException(status_code=404, detail="Question not found in this quiz")

        await db.quizzes.delete_question(question_id)
        return {"success": True, "deleted_id": question_id}
