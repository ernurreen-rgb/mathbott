"""
Live Quiz game session routes & WebSocket manager (Quizizz-like live game)
"""
import json
import logging
from typing import Optional, Dict, Any
from fastapi import FastAPI, HTTPException, Query, Body, WebSocket, WebSocketDisconnect, Depends
from pydantic import BaseModel, Field
from slowapi import Limiter

from dependencies import get_db, require_internal_identity
from database import Database
from utils.validation import is_task_answer_correct

logger = logging.getLogger(__name__)


class CreateSessionRequest(BaseModel):
    quiz_id: int
    settings: Optional[Dict[str, Any]] = None


class JoinSessionRequest(BaseModel):
    pin_code: str = Field(min_length=6, max_length=6)
    nickname: str = Field(min_length=1, max_length=30)
    email: Optional[str] = None
    avatar_color: Optional[str] = None


class SubmitAnswerRequest(BaseModel):
    participant_id: int
    question_id: int
    answer: str = Field(max_length=5000)
    time_taken_seconds: float = Field(ge=0.0, le=600.0)


class QuizConnectionManager:
    """In-memory WebSocket connection manager for live quiz sessions."""

    def __init__(self):
        # session_id -> dict of client_id -> WebSocket
        self.sessions: Dict[int, Dict[str, WebSocket]] = {}

    async def connect(self, session_id: int, client_id: str, websocket: WebSocket):
        await websocket.accept()
        self.sessions.setdefault(session_id, {})
        self.sessions[session_id][client_id] = websocket

    def disconnect(self, session_id: int, client_id: str):
        if session_id in self.sessions:
            self.sessions[session_id].pop(client_id, None)
            if not self.sessions[session_id]:
                self.sessions.pop(session_id, None)

    async def broadcast(self, session_id: int, message: Dict[str, Any], exclude_client: Optional[str] = None):
        if session_id not in self.sessions:
            return
        payload = json.dumps(message, ensure_ascii=False)
        for client_id, ws in list(self.sessions[session_id].items()):
            if exclude_client and client_id == exclude_client:
                continue
            try:
                await ws.send_text(payload)
            except Exception:
                self.disconnect(session_id, client_id)


quiz_manager = QuizConnectionManager()


def calculate_speed_points(
    base_points: int,
    time_limit: int,
    time_taken: float,
    current_streak: int,
) -> int:
    """Quizizz-style scoring formula with time fraction and streak multiplier."""
    total_time = max(1.0, float(time_limit))
    time_remaining = max(0.0, min(total_time, total_time - time_taken))
    fraction = time_remaining / total_time

    # Base * (0.5 + 0.5 * time_fraction)
    points = int(base_points * (0.5 + 0.5 * fraction))
    # Streak bonus: +100 per streak level after the first, capped at 500
    streak_bonus = min(500, max(0, (current_streak - 1) * 100)) if current_streak > 1 else 0
    return max(100, points + streak_bonus)


def check_question_answer(question: Dict[str, Any], user_answer: Any) -> bool:
    """Validate answer using Mathbott's robust math validation engine."""
    qt = (question.get("question_type") or "mcq").strip().lower()
    task_mock = {
        "question_type": qt if qt in {"mcq", "tf", "input"} else ("select" if qt == "multi_select" else "input"),
        "answer": question.get("correct_answer"),
        "options": question.get("options"),
        "accepted_answers": question.get("accepted_answers"),
    }
    return is_task_answer_correct(task_mock, user_answer)


def setup_quiz_game_routes(app: FastAPI, db: Database, limiter: Limiter):
    """Setup live game sessions & WebSocket endpoints."""

    @app.post("/api/quiz-sessions")
    async def create_game_session(
        payload: CreateSessionRequest,
        current_user: dict = Depends(require_internal_identity),
        db: Database = Depends(get_db),
    ):
        """Host launches a new game room."""
        quiz = await db.quizzes.get_quiz_by_id(payload.quiz_id)
        if not quiz:
            raise HTTPException(status_code=404, detail="Quiz not found")

        questions = await db.quizzes.get_quiz_questions(payload.quiz_id)
        if not questions:
            raise HTTPException(status_code=400, detail="Quiz has no questions. Add questions before hosting.")

        session = await db.quizzes.create_session(
            quiz_id=payload.quiz_id,
            host_id=current_user["id"],
            settings=payload.settings or {},
        )
        return session

    @app.get("/api/quiz-sessions/{session_id}")
    async def get_game_session(
        session_id: int,
        db: Database = Depends(get_db),
    ):
        """Get session details (title, PIN, status, participants)."""
        session = await db.quizzes.get_session_by_id(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        participants = await db.quizzes.list_participants(session_id)
        session["participants"] = participants
        return session

    @app.get("/api/quiz-sessions/pin/{pin_code}")
    async def get_game_session_by_pin(
        pin_code: str,
        db: Database = Depends(get_db),
    ):
        """Lookup active lobby by 6-digit PIN."""
        session = await db.quizzes.get_session_by_pin(pin_code)
        if not session:
            raise HTTPException(status_code=404, detail="Game session with this PIN not found or already finished")
        return session

    @app.post("/api/quiz-sessions/join")
    async def join_game_session(
        payload: JoinSessionRequest,
        db: Database = Depends(get_db),
    ):
        """Join a game room by PIN code."""
        session = await db.quizzes.get_session_by_pin(payload.pin_code)
        if not session:
            raise HTTPException(status_code=404, detail="Invalid PIN or game already finished")

        user_id = None
        if payload.email:
            user = await db.users.get_user_by_email(payload.email)
            if user:
                user_id = user["id"]

        participant = await db.quizzes.join_session(
            session_id=session["id"],
            nickname=payload.nickname.strip(),
            user_id=user_id,
            avatar_color=payload.avatar_color,
        )

        # Notify host and lobby participants via WebSocket
        await quiz_manager.broadcast(
            session["id"],
            {
                "type": "player_joined",
                "participant": participant,
            },
        )

        return {
            "session": session,
            "participant": participant,
        }

    @app.post("/api/quiz-sessions/{session_id}/start")
    async def start_game_session(
        session_id: int,
        current_user: dict = Depends(require_internal_identity),
        db: Database = Depends(get_db),
    ):
        """Host starts the live game."""
        session = await db.quizzes.get_session_by_id(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        is_admin = bool(current_user.get("is_admin"))
        if session["host_id"] != current_user["id"] and not is_admin:
            raise HTTPException(status_code=403, detail="Forbidden: Only host can start game")

        updated = await db.quizzes.update_session_status(session_id, "in_progress")

        # Broadcast game start to all waiting players
        await quiz_manager.broadcast(
            session_id,
            {
                "type": "game_started",
                "session_id": session_id,
            },
        )
        return updated

    @app.post("/api/quiz-sessions/{session_id}/finish")
    async def finish_game_session(
        session_id: int,
        current_user: dict = Depends(require_internal_identity),
        db: Database = Depends(get_db),
    ):
        """Host ends the live game and locks final scores."""
        session = await db.quizzes.get_session_by_id(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        is_admin = bool(current_user.get("is_admin"))
        if session["host_id"] != current_user["id"] and not is_admin:
            raise HTTPException(status_code=403, detail="Forbidden: Only host can finish game")

        await db.quizzes.update_session_status(session_id, "finished")
        stats = await db.quizzes.get_session_stats(session_id)

        # Broadcast game over and podium to everyone
        await quiz_manager.broadcast(
            session_id,
            {
                "type": "game_over",
                "session_id": session_id,
                "stats": stats,
            },
        )
        return stats

    @app.get("/api/quiz-sessions/{session_id}/questions")
    async def get_session_questions_for_play(
        session_id: int,
        is_host: bool = Query(False),
        db: Database = Depends(get_db),
    ):
        """
        Get questions for playing.
        If player: correct answers and explanations are stripped to prevent inspection cheating!
        """
        session = await db.quizzes.get_session_by_id(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        questions = await db.quizzes.get_quiz_questions(session["quiz_id"])
        if is_host:
            return questions

        # Sanitize for students during gameplay
        sanitized = []
        for q in questions:
            item = dict(q)
            # Remove answer key for student device
            item.pop("correct_answer", None)
            item.pop("accepted_answers", None)
            item.pop("explanation", None)
            # Clean options: remove is_correct flags
            clean_options = []
            for opt in (item.get("options") or []):
                clean_opt = {k: v for k, v in opt.items() if k != "is_correct"}
                clean_options.append(clean_opt)
            item["options"] = clean_options
            sanitized.append(item)

        return sanitized

    @app.post("/api/quiz-sessions/{session_id}/answers")
    async def submit_question_answer(
        session_id: int,
        payload: SubmitAnswerRequest,
        db: Database = Depends(get_db),
    ):
        """Submit answer for a question with speed score calculation."""
        session = await db.quizzes.get_session_by_id(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        if session["status"] == "finished":
            raise HTTPException(status_code=400, detail="Game session is finished")

        participant = await db.quizzes.get_participant(session_id, payload.participant_id)
        if not participant:
            raise HTTPException(status_code=404, detail="Participant not found")

        question = await db.quizzes.get_question_by_id(payload.question_id)
        if not question or question["quiz_id"] != session["quiz_id"]:
            raise HTTPException(status_code=404, detail="Question not found in this quiz")

        # Validate answer via math engine
        is_correct = check_question_answer(question, payload.answer)

        # Calculate points
        points_awarded = 0
        current_streak = participant.get("streak", 0)
        if is_correct:
            points_awarded = calculate_speed_points(
                base_points=question.get("points", 1000),
                time_limit=question.get("time_limit_seconds", 30),
                time_taken=payload.time_taken_seconds,
                current_streak=current_streak + 1,
            )

        updated_participant = await db.quizzes.record_answer(
            session_id=session_id,
            participant_id=payload.participant_id,
            question_id=payload.question_id,
            user_answer=payload.answer,
            is_correct=is_correct,
            time_taken_seconds=payload.time_taken_seconds,
            points_awarded=points_awarded,
        )

        leaderboard = await db.quizzes.get_session_leaderboard(session_id)

        # Broadcast live leaderboard update to Host and all players
        await quiz_manager.broadcast(
            session_id,
            {
                "type": "leaderboard_update",
                "leaderboard": leaderboard,
                "last_answer": {
                    "participant_id": payload.participant_id,
                    "nickname": participant["nickname"],
                    "is_correct": is_correct,
                    "points_awarded": points_awarded,
                },
            },
        )

        return {
            "is_correct": is_correct,
            "points_awarded": points_awarded,
            "streak": updated_participant.get("streak", 0),
            "total_score": updated_participant.get("score", 0),
            "correct_answer": question.get("correct_answer") if not is_correct else None,
            "explanation": question.get("explanation"),
        }

    @app.post("/api/quiz-sessions/{session_id}/complete")
    async def mark_participant_completed(
        session_id: int,
        participant_id: int = Body(..., embed=True),
        db: Database = Depends(get_db),
    ):
        """Mark that a participant finished all questions."""
        await db.quizzes.set_participant_finished(session_id, participant_id)
        leaderboard = await db.quizzes.get_session_leaderboard(session_id)

        await quiz_manager.broadcast(
            session_id,
            {
                "type": "player_finished",
                "participant_id": participant_id,
                "leaderboard": leaderboard,
            },
        )
        return {"success": True}

    @app.get("/api/quiz-sessions/{session_id}/leaderboard")
    async def get_session_leaderboard_endpoint(
        session_id: int,
        db: Database = Depends(get_db),
    ):
        """Get current live leaderboard."""
        return await db.quizzes.get_session_leaderboard(session_id)

    @app.get("/api/quiz-sessions/{session_id}/stats")
    async def get_session_stats_endpoint(
        session_id: int,
        db: Database = Depends(get_db),
    ):
        """Get post-game stats, podium and question-by-question breakdown."""
        return await db.quizzes.get_session_stats(session_id)

    # --- WebSocket live sync endpoint ---

    @app.websocket("/ws/quiz/{session_id}")
    async def quiz_websocket_endpoint(
        websocket: WebSocket,
        session_id: int,
        client_id: Optional[str] = Query(None),
        role: Optional[str] = Query("player"),
    ):
        """
        WebSocket endpoint for live game sync.
        Host and players connect to receive real-time player joins, answers, and leaderboard movement.
        """
        c_id = client_id or f"{role}_{id(websocket)}"
        await quiz_manager.connect(session_id, c_id, websocket)

        try:
            while True:
                data = await websocket.receive_text()
                # WebSocket client messages (e.g. heartbeat / ping)
                try:
                    payload = json.loads(data)
                    msg_type = payload.get("type")
                    if msg_type == "ping":
                        await websocket.send_text(json.dumps({"type": "pong"}))
                except Exception:
                    continue
        except WebSocketDisconnect:
            quiz_manager.disconnect(session_id, c_id)
        except Exception as e:
            quiz_manager.disconnect(session_id, c_id)
            logger.debug(f"Quiz WS disconnect for {c_id}: {e}")
