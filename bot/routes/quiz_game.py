"""Live quiz HTTP and WebSocket boundaries for hosts and guest capabilities."""
import json
import logging
from uuid import uuid4
from typing import Optional, Dict, Any
from fastapi import FastAPI, HTTPException, Query, Body, WebSocket, WebSocketDisconnect, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from slowapi import Limiter
from dependencies import get_db, require_internal_identity, optional_internal_identity
from database import Database
from utils.quiz import QuizError, public_question, public_participant
from utils.quiz_ws_auth import issue_quiz_ws_ticket, verify_quiz_ws_ticket, QUIZ_WS_TTL

logger = logging.getLogger(__name__)

class CreateSessionRequest(BaseModel):
    quiz_id: int = Field(gt=0)
    settings: Optional[Dict[str, Any]] = None

class JoinSessionRequest(BaseModel):
    pin_code: str = Field(pattern=r"^[0-9]{6}$")
    nickname: str = Field(min_length=1, max_length=30)
    email: Optional[str] = None
    avatar_color: Optional[str] = Field(default=None, max_length=64)
    participant_token: Optional[str] = Field(default=None, max_length=256)

class UpdateAvatarRequest(BaseModel):
    avatar_color: str = Field(min_length=1, max_length=64)

class SubmitAnswerRequest(BaseModel):
    participant_id: int = Field(gt=0)
    question_id: int = Field(gt=0)
    answer: str = Field(max_length=5000)
    # Accepted for older clients, never used to calculate scores or deadlines.
    time_taken_seconds: Optional[float] = Field(default=None, ge=0, le=600)

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


def setup_quiz_game_routes(app: FastAPI, db: Database, limiter: Limiter):
    @app.exception_handler(QuizError)
    async def handle_quiz_error(request: Request, exc: QuizError):
        codes = {'unauthorized': 401, 'forbidden': 403, 'not_found': 404, 'conflict': 409, 'invalid': 400}
        return JSONResponse({'detail': str(exc)}, status_code=codes.get(exc.kind, 400))

    def token(request: Request):
        return request.headers.get('X-Quiz-Participant-Token', '')

    async def access(session_id, request, user, db, host_only=False):
        session = await db.quizzes.get_session_by_id(session_id)
        if not session:
            raise HTTPException(404, 'Session not found')
        if user and (session['host_id'] == user['id'] or user.get('is_admin')):
            return session, None
        if host_only:
            raise HTTPException(403, 'Only the host may access this operation')
        participant = await db.quizzes.authenticate_participant(session_id, token(request))
        return session, participant

    async def broadcast_scores(session_id, db, event='answer_submitted'):
        if not quiz_manager.sessions.get(session_id):
            return  # Polling deployments have no WebSocket audience to build a leaderboard for.
        await quiz_manager.broadcast(session_id, {'type': event, 'session_id': session_id,
            'leaderboard': await db.quizzes.get_session_leaderboard(session_id)})

    @app.post('/api/quiz-sessions')
    async def create_game_session(payload: CreateSessionRequest,
                                  current_user: dict = Depends(require_internal_identity), db: Database = Depends(get_db)):
        return await db.quizzes.create_session(payload.quiz_id, current_user['id'], payload.settings)

    @app.get('/api/quiz-sessions/pin/{pin_code}')
    async def lookup_session(pin_code: str, db: Database = Depends(get_db)):
        session = await db.quizzes.get_session_by_pin(pin_code)
        if not session:
            raise HTTPException(404, 'Session not found')
        return {k: session[k] for k in ('id', 'pin_code', 'quiz_title', 'status')}

    @app.post('/api/quiz-sessions/join')
    async def join_game_session(payload: JoinSessionRequest,
                                user: Optional[dict] = Depends(optional_internal_identity), db: Database = Depends(get_db)):
        session = await db.quizzes.get_session_by_pin(payload.pin_code)
        if not session:
            raise HTTPException(404, 'Invalid PIN or finished game')
        user_id = user['id'] if user else None
        if not user_id and payload.email:
            found_user = await db.users.get_user_by_email(payload.email)
            if found_user:
                user_id = found_user['id']
        joined = await db.quizzes.join_session(session['id'], payload.nickname,
            user_id=user_id, avatar_color=payload.avatar_color, participant_token=payload.participant_token)
        credential = joined.pop('participant_token')
        await quiz_manager.broadcast(session['id'], {'type': 'participant_joined', 'participant': joined})
        return {'session': session, 'participant': joined, 'participant_token': credential}

    @app.patch('/api/quiz-sessions/{session_id}/avatar')
    async def update_participant_avatar(session_id: int, payload: UpdateAvatarRequest, request: Request,
                                        db: Database = Depends(get_db)):
        participant = await db.quizzes.update_participant_avatar(session_id, payload.avatar_color, token(request))
        await quiz_manager.broadcast(session_id, {'type': 'participant_updated', 'participant': participant})
        return participant

    @app.get('/api/quiz-sessions/{session_id}')
    async def get_game_session(session_id: int, request: Request,
                               user: Optional[dict] = Depends(optional_internal_identity), db: Database = Depends(get_db)):
        session, _ = await access(session_id, request, user, db)
        return {**session, 'participants': await db.quizzes.list_participants(session_id)}

    @app.post('/api/quiz-sessions/{session_id}/start')
    async def start_game_session(session_id: int, request: Request,
                                 user: dict = Depends(require_internal_identity), db: Database = Depends(get_db)):
        await access(session_id, request, user, db, host_only=True)
        session = await db.quizzes.update_session_status(session_id, 'in_progress')
        await quiz_manager.broadcast(session_id, {'type': 'game_started', 'session_id': session_id})
        return session

    @app.post('/api/quiz-sessions/{session_id}/finish')
    async def finish_game_session(session_id: int, request: Request,
                                  user: dict = Depends(require_internal_identity), db: Database = Depends(get_db)):
        await access(session_id, request, user, db, host_only=True)
        await db.quizzes.update_session_status(session_id, 'finished')
        stats = await db.quizzes.get_session_stats(session_id)
        await quiz_manager.broadcast(session_id, {'type': 'game_finished', 'session_id': session_id, 'stats': stats})
        return stats

    @app.get('/api/quiz-sessions/{session_id}/questions')
    async def session_questions(session_id: int, request: Request, is_host: bool = Query(False),
                                 user: Optional[dict] = Depends(optional_internal_identity), db: Database = Depends(get_db)):
        _, participant = await access(session_id, request, user, db, host_only=is_host)
        if participant:
            # Only already-activated questions are released to players; this GET never resets clocks.
            progress = await db.quizzes.get_player_progress(session_id, token(request))
            return [progress['current_question']] if progress['current_question'] else []
        questions = await db.quizzes.get_session_questions(session_id)
        return questions if is_host else [public_question(q) for q in questions]

    @app.get('/api/quiz-sessions/{session_id}/progress')
    async def player_progress(session_id: int, request: Request, db: Database = Depends(get_db)):
        return await db.quizzes.get_player_progress(session_id, token(request))

    @app.post('/api/quiz-sessions/{session_id}/current-question')
    async def current_question(session_id: int, request: Request, db: Database = Depends(get_db)):
        return await db.quizzes.activate_question(session_id, token(request))

    @app.post('/api/quiz-sessions/{session_id}/next')
    async def next_question(session_id: int, request: Request, question_id: int = Body(..., embed=True), db: Database = Depends(get_db)):
        progress = await db.quizzes.activate_question(session_id, token(request), advance=True, question_id=question_id)
        if progress['participant']['is_finished']:
            await broadcast_scores(session_id, db, 'participant_finished')
        return progress

    @app.post('/api/quiz-sessions/{session_id}/answers')
    async def submit_answer(session_id: int, payload: SubmitAnswerRequest, request: Request, db: Database = Depends(get_db)):
        result = await db.quizzes.record_answer(session_id, payload.participant_id, payload.question_id,
                                                payload.answer, token(request))
        if not result.pop('reused'):
            await broadcast_scores(session_id, db)
        return result

    @app.post('/api/quiz-sessions/{session_id}/complete')
    async def complete(session_id: int, request: Request, participant_id: int = Body(..., embed=True), db: Database = Depends(get_db)):
        await db.quizzes.set_participant_finished(session_id, participant_id, token(request))
        await broadcast_scores(session_id, db, 'participant_finished')
        return {'success': True}

    @app.get('/api/quiz-sessions/{session_id}/leaderboard')
    async def leaderboard(session_id: int, request: Request,
                          user: Optional[dict] = Depends(optional_internal_identity), db: Database = Depends(get_db)):
        await access(session_id, request, user, db)
        return await db.quizzes.get_session_leaderboard(session_id)

    @app.get('/api/quiz-sessions/{session_id}/stats')
    async def stats(session_id: int, request: Request,
                     user: Optional[dict] = Depends(optional_internal_identity), db: Database = Depends(get_db)):
        session, participant = await access(session_id, request, user, db)
        if participant and session['status'] != 'finished':
            raise HTTPException(403, 'Stats are available after the game finishes')
        return await db.quizzes.get_session_stats(session_id)

    @app.get('/api/quiz-sessions/{session_id}/results')
    async def session_results(session_id: int, request: Request,
                              user: Optional[dict] = Depends(optional_internal_identity), db: Database = Depends(get_db)):
        """Get comprehensive session results including all participants, scores, and accuracy."""
        await access(session_id, request, user, db)
        results = await db.quizzes.get_session_full_results(session_id)
        if not results:
            raise HTTPException(404, 'Session results not found')
        return results

    @app.get('/api/quiz-sessions/user/history')
    async def user_quiz_history(current_user: dict = Depends(require_internal_identity), db: Database = Depends(get_db)):
        """Get all quiz sessions taken by the authenticated user."""
        return await db.quizzes.get_user_quiz_history(current_user['id'])

    @app.get('/api/quiz-sessions/{session_id}/ws-token')
    async def ws_ticket(session_id: int, request: Request,
                         user: Optional[dict] = Depends(optional_internal_identity), db: Database = Depends(get_db)):
        _, participant = await access(session_id, request, user, db)
        try:
            ticket = issue_quiz_ws_ticket(session_id, 'player' if participant else 'host',
                participant['id'] if participant else user['id'], participant['token_hash'] if participant else '')
        except ValueError:
            raise HTTPException(503, 'WebSocket signing is not configured')
        return {'token': ticket, 'expires_in': QUIZ_WS_TTL}

    @app.websocket('/ws/quiz/{session_id}')
    async def quiz_socket(websocket: WebSocket, session_id: int):
        claims = verify_quiz_ws_ticket(session_id, websocket.query_params.get('token', ''))
        session = await db.quizzes.get_session_by_id(session_id)
        if not claims or not session:
            await websocket.close(code=1008)
            return
        if claims['role'] == 'host':
            user = await db.users.get_user_by_id(claims['actor_id'])
            allowed = user and (session['host_id'] == user['id'] or user.get('is_admin'))
        else:
            participant = await db.quizzes.get_participant(session_id, claims['actor_id'])
            allowed = participant and participant['token_hash'] == claims.get('credential')
        if not allowed:
            await websocket.close(code=1008)
            return
        client_id = str(uuid4())
        await quiz_manager.connect(session_id, client_id, websocket)
        try:
            await websocket.send_json({'type': 'session_state', 'status': session['status']})
            while True:
                data = await websocket.receive_text()
                if len(data) > 1024:
                    await websocket.close(code=1009)
                    break
                try:
                    payload = json.loads(data)
                    if isinstance(payload, dict) and payload.get('type') == 'ping':
                        await websocket.send_json({'type': 'pong'})
                except ValueError:
                    continue
        except WebSocketDisconnect:
            pass
        finally:
            quiz_manager.disconnect(session_id, client_id)
