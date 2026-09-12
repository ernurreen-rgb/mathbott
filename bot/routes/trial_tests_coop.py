"""
Trial tests coop routes (private)
"""
import json
import logging
from typing import Optional, Dict, Any

from fastapi import FastAPI, HTTPException, Query, Body, WebSocket, WebSocketDisconnect, Depends
from slowapi import Limiter
from pydantic import BaseModel, Field, field_validator

from dependencies import get_db
from database import Database
from settings import get_settings
from utils.cache import cache
from utils.internal_proxy_auth import WEBSOCKET_TOKEN_TTL_SECONDS, build_ws_token, verify_ws_token
from utils.public_payload import task_review_snapshot
from utils.scoring import build_reward_identity
from repositories.trial_test_repository import TrialTestAlreadySubmitted
from utils.validation import is_task_answer_correct

logger = logging.getLogger(__name__)


class CoopAnswersRequest(BaseModel):
    email: str
    answers: Dict[int, str] = Field(max_length=200)

    @field_validator("answers")
    @classmethod
    def validate_answers(cls, answers):
        if any(task_id <= 0 or len(answer) > 10000 for task_id, answer in answers.items()):
            raise ValueError("Invalid task id or answer length")
        return answers


class CoopConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, Dict[int, WebSocket]] = {}

    async def connect(self, session_id: int, user_id: int, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.setdefault(session_id, {})
        self.active_connections[session_id][user_id] = websocket

    def disconnect(self, session_id: int, user_id: int):
        if session_id in self.active_connections:
            self.active_connections[session_id].pop(user_id, None)
            if not self.active_connections[session_id]:
                self.active_connections.pop(session_id, None)

    async def broadcast(self, session_id: int, message: Dict[str, Any], sender_id: Optional[int] = None):
        if session_id not in self.active_connections:
            return
        data = json.dumps(message)
        for user_id, ws in list(self.active_connections[session_id].items()):
            if sender_id is not None and user_id == sender_id:
                continue
            try:
                await ws.send_text(data)
            except Exception:
                self.disconnect(session_id, user_id)


def _map_answers(rows):
    result: Dict[int, str] = {}
    for row in rows:
        try:
            task_id = int(row.get("task_id"))
            result[task_id] = row.get("answer", "")
        except Exception:
            continue
    return result


def _answer_to_string(value) -> str:
    if isinstance(value, (list, dict)):
        return json.dumps(value, ensure_ascii=False)
    return "" if value is None else str(value)


def setup_trial_tests_coop_routes(app: FastAPI, db: Database, limiter: Limiter):
    manager = CoopConnectionManager()

    def _is_production() -> bool:
        return get_settings().is_production

    @app.put("/api/trial-tests/coop/session/{session_id}/answers")
    async def save_coop_answers(session_id: int, payload: CoopAnswersRequest, db: Database = Depends(get_db)):
        user = await db.users.get_user_by_email(payload.email)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        try:
            participant = await db.trial_test_coop.save_answers(session_id, user["id"], payload.answers)
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc))
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        except RuntimeError as exc:
            raise HTTPException(status_code=409, detail=str(exc))
        for task_id, answer in payload.answers.items():
            await manager.broadcast(session_id, {"type": "answer_update", "user_id": user["id"],
                "color": participant["color"], "task_id": task_id, "answer": answer})
        return {"ok": True}

    @app.post("/api/trial-tests/{test_id}/coop/session")
    async def create_coop_session(
        test_id: int,
        request: dict = Body(...),
        db: Database = Depends(get_db)
    ):
        try:
            email = request.get("email")
            if not email:
                raise HTTPException(status_code=400, detail="Email is required")

            user = await db.users.get_user_by_email(email)
            if not user:
                user = await db.users.create_user_by_email(email)

            test = await db.trial_tests.get_trial_test_by_id(test_id)
            if not test:
                raise HTTPException(status_code=404, detail="Trial test not found")

            session = await db.trial_test_coop.create_session(test_id, user["id"])
            await db.trial_test_coop.add_participant(session["id"], user["id"], "red")

            return {
                "session_id": session["id"],
                "trial_test_id": test_id,
                "owner_id": user["id"],
                "color": "red"
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error creating coop session: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Internal server error")

    @app.get("/api/trial-tests/coop/session/{session_id}")
    async def get_coop_session(
        session_id: int,
        email: str = Query(...),
        db: Database = Depends(get_db)
    ):
        try:
            user = await db.users.get_user_by_email(email)
            if not user:
                user = await db.users.create_user_by_email(email)

            session = await db.trial_test_coop.get_session(session_id)
            if not session:
                raise HTTPException(status_code=404, detail="Session not found")

            owner_id = session["owner_id"]
            participant = await db.trial_test_coop.get_participant(session_id, user["id"])
            participants = await db.trial_test_coop.list_participants(session_id)
            if not participant and user["id"] != owner_id:
                raise HTTPException(status_code=403, detail="Not a participant")

            if not participant:
                if len(participants) >= 2:
                    raise HTTPException(status_code=400, detail="Session is full")
                participant = await db.trial_test_coop.add_participant(session_id, user["id"], "red")
                participants = await db.trial_test_coop.list_participants(session_id)

            user_answers_rows = await db.trial_test_coop.list_answers_for_user(session_id, user["id"])
            user_answers = _map_answers(user_answers_rows)

            other_answers = {}
            for p in participants:
                if p["user_id"] == user["id"]:
                    continue
                rows = await db.trial_test_coop.list_answers_for_user(session_id, p["user_id"])
                other_answers[p["user_id"]] = _map_answers(rows)

            return {
                "id": session["id"],
                "trial_test_id": session["trial_test_id"],
                "owner_id": owner_id,
                "status": session.get("status", "active"),
                "participants": participants,
                "current_user_id": user["id"],
                "current_user_color": participant.get("color"),
                "is_owner": user["id"] == owner_id,
                "answers": {
                    "user": user_answers,
                    "others": other_answers
                }
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error getting coop session: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Internal server error")

    @app.post("/api/trial-tests/{test_id}/coop/finish")
    async def finish_coop_session(
        test_id: int,
        request: dict = Body(...),
        db: Database = Depends(get_db)
    ):
        try:
            email = request.get("email")
            session_id = request.get("session_id")
            answers = request.get("answers", {})

            if not email or not session_id:
                raise HTTPException(status_code=400, detail="Email and session_id are required")

            user = await db.users.get_user_by_email(email)
            if not user:
                user = await db.users.create_user_by_email(email)

            session = await db.trial_test_coop.get_session(session_id)
            if not session or session.get("trial_test_id") != test_id:
                raise HTTPException(status_code=404, detail="Session not found")

            participant = await db.trial_test_coop.get_participant(session_id, user["id"])
            if not participant:
                raise HTTPException(status_code=403, detail="Not a participant")

            tasks = await db.trial_tests.get_trial_test_tasks(test_id)
            if not tasks:
                raise HTTPException(status_code=404, detail="No tasks found in trial test")

            results = {}
            score = 0
            total = len(tasks)
            had_any_correct = False

            for task in tasks:
                task_id = task["id"]
                user_answer = _answer_to_string(
                    answers.get(str(task_id), answers.get(int(task_id), ""))
                ).strip()

                correct_answer = _answer_to_string(task.get("answer", "")).strip()
                is_correct = is_task_answer_correct(task, user_answer)

                if is_correct:
                    score += 1
                    had_any_correct = True

                results[int(task_id)] = {
                    "answer": user_answer,
                    "correct": is_correct,
                    "correct_answer": task.get("answer"),
                    "task": task_review_snapshot(task)
                }

            percentage = (score / total * 100) if total > 0 else 0.0
            answers_for_db = {int(k): v for k, v in results.items()}
            rewards = []
            for task in tasks:
                task_result = results.get(int(task["id"])) or {}
                if not task_result.get("correct"):
                    continue
                reward = build_reward_identity(task, surface="trial_test_coop")
                rewards.append(
                    {
                        "reward_key": reward["reward_key"],
                        "bank_task_id": reward["bank_task_id"],
                        "difficulty": reward["difficulty"],
                        "points": reward["points"],
                        "source": "trial_test_coop",
                        "source_ref_id": int(task["id"]),
                    }
                )

            submit_result = await db.trial_tests.submit_trial_test_attempt(
                user_id=user["id"],
                trial_test_id=test_id,
                score=score,
                total=total,
                percentage=percentage,
                answers=answers_for_db,
                rewards=rewards,
                should_update_streak=had_any_correct,
                delete_draft=False,
                submit_mode="coop",
                coop_session_id=session_id,
            )

            if submit_result.get("streak_milestone") and user.get("email"):
                try:
                    from utils.notifications import send_streak_notification
                    await send_streak_notification(user["email"], int(submit_result["streak_milestone"]))
                except Exception as e:
                    logger.error(f"Failed to send streak notification after coop finish: {e}", exc_info=True)

            if submit_result.get("awarded_any") or had_any_correct:
                try:
                    await db.check_and_unlock_achievements(user["id"])
                except Exception as e:
                    logger.error(f"Failed to unlock achievements after coop finish: {e}", exc_info=True)

            cache.invalidate_pattern(f"user:stats:{email}")
            saved_result = submit_result["result"]
            return {
                "score": saved_result["score"],
                "total": saved_result["total"],
                "percentage": round(saved_result["percentage"], 2),
                "session_status": submit_result["session_status"],
            }
        except TrialTestAlreadySubmitted:
            raise HTTPException(status_code=409, detail="This participant has already finished the session.")

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error finishing coop session: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Internal server error")

    @app.get("/api/trial-tests/coop/session/{session_id}/results")
    async def get_coop_results(
        session_id: int,
        email: str = Query(...),
        db: Database = Depends(get_db)
    ):
        try:
            user = await db.users.get_user_by_email(email)
            if not user:
                user = await db.users.create_user_by_email(email)

            session = await db.trial_test_coop.get_session(session_id)
            if not session:
                raise HTTPException(status_code=404, detail="Session not found")

            participant = await db.trial_test_coop.get_participant(session_id, user["id"])
            if not participant:
                raise HTTPException(status_code=403, detail="Not a participant")

            results = await db.trial_test_coop.get_results_for_session(session_id)
            participants = await db.trial_test_coop.list_participants(session_id)
            color_by_user = {p["user_id"]: p.get("color") for p in participants}

            for item in results:
                if item.get("answers"):
                    try:
                        item["answers"] = json.loads(item["answers"]) if isinstance(item["answers"], str) else item["answers"]
                    except Exception:
                        item["answers"] = {}
                item["color"] = color_by_user.get(item.get("user_id"))

            return {
                "session_id": session_id,
                "status": session.get("status", "active"),
                "items": results
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error getting coop results: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Internal server error")

    @app.post("/api/trial-tests/{test_id}/coop/invite")
    async def invite_friend_to_coop(
        test_id: int,
        request: dict = Body(...),
        db: Database = Depends(get_db)
    ):
        try:
            email = request.get("email")
            friend_id = request.get("friend_id")
            if not email or not friend_id:
                raise HTTPException(status_code=400, detail="Email and friend_id are required")

            user = await db.users.get_user_by_email(email)
            if not user:
                user = await db.users.create_user_by_email(email)

            # Check if they are friends
            if not await db.friends.are_friends(user["id"], friend_id):
                raise HTTPException(status_code=403, detail="Users are not friends")

            # Create or get existing session
            test = await db.trial_tests.get_trial_test_by_id(test_id)
            if not test:
                raise HTTPException(status_code=404, detail="Trial test not found")

            # Check if user already has an active session for this test
            # For simplicity, create a new session each time
            session = await db.trial_test_coop.create_session(test_id, user["id"])
            await db.trial_test_coop.add_participant(session["id"], user["id"], "red")

            # Create invite
            invite = await db.trial_test_coop.create_invite(session["id"], user["id"], friend_id)

            return {
                "success": True,
                "session_id": session["id"],
                "invite_id": invite.get("id")
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error inviting friend to coop: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Internal server error")

    @app.get("/api/trial-tests/coop/invites")
    async def get_coop_invites(
        email: str = Query(...),
        db: Database = Depends(get_db)
    ):
        try:
            user = await db.users.get_user_by_email(email)
            if not user:
                user = await db.users.create_user_by_email(email)

            invites = await db.trial_test_coop.list_incoming_invites(user["id"])
            return {"items": invites}
        except Exception as e:
            logger.error(f"Error getting coop invites: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Internal server error")

    @app.post("/api/trial-tests/coop/invites/{invite_id}/accept")
    async def accept_coop_invite(
        invite_id: int,
        email: str = Query(...),
        db: Database = Depends(get_db)
    ):
        try:
            user = await db.users.get_user_by_email(email)
            if not user:
                user = await db.users.create_user_by_email(email)

            # Get invite details
            invites = await db.trial_test_coop.list_incoming_invites(user["id"])
            invite = next((i for i in invites if i.get("id") == invite_id), None)
            if not invite:
                raise HTTPException(status_code=404, detail="Invite not found")

            session_id = invite["session_id"]
            session = await db.trial_test_coop.get_session(session_id)
            if not session:
                raise HTTPException(status_code=404, detail="Session not found")

            # Check if session is still active
            if session.get("status") != "active":
                raise HTTPException(status_code=400, detail="Session is not active")

            participants = await db.trial_test_coop.list_participants(session_id)
            if not await db.trial_test_coop.get_participant(session_id, user["id"]) and len(participants) >= 2:
                raise HTTPException(status_code=400, detail="Session is full")

            # Add participant with blue color
            await db.trial_test_coop.add_participant(session_id, user["id"], "blue")
            await db.trial_test_coop.update_invite_status(invite_id, "accepted")

            return {
                "success": True,
                "session_id": session_id,
                "trial_test_id": session.get("trial_test_id")
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error accepting coop invite: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Internal server error")

    @app.post("/api/trial-tests/coop/invites/{invite_id}/decline")
    async def decline_coop_invite(
        invite_id: int,
        email: str = Query(...),
        db: Database = Depends(get_db)
    ):
        try:
            user = await db.users.get_user_by_email(email)
            if not user:
                user = await db.users.create_user_by_email(email)

            invites = await db.trial_test_coop.list_incoming_invites(user["id"])
            invite = next((i for i in invites if i.get("id") == invite_id), None)
            if not invite:
                raise HTTPException(status_code=404, detail="Invite not found")

            await db.trial_test_coop.update_invite_status(invite_id, "declined")
            return {"success": True}
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error declining coop invite: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Internal server error")

    @app.get("/api/trial-tests/coop/session/{session_id}/ws-token")
    async def get_coop_ws_token(
        session_id: int,
        email: str = Query(...),
        db: Database = Depends(get_db),
    ):
        user = await db.users.get_user_by_email(email)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        participant = await db.trial_test_coop.get_participant(session_id, user["id"])
        if not participant:
            raise HTTPException(status_code=403, detail="Not a participant")

        try:
            token = build_ws_token(session_id=session_id, user_email=email)
        except ValueError:
            raise HTTPException(status_code=503, detail="WebSocket token signing is not configured")

        return {
            "token": token,
            "expires_in": WEBSOCKET_TOKEN_TTL_SECONDS,
        }

    @app.websocket("/ws/trial-tests/coop/{session_id}")
    async def coop_ws(websocket: WebSocket, session_id: int):
        email = websocket.query_params.get("email")
        if not email:
            await websocket.close(code=1008)
            return

        if _is_production():
            token = websocket.query_params.get("token") or ""
            is_valid_token, error_code = verify_ws_token(
                session_id=session_id,
                user_email=email,
                token=token,
            )
            if not is_valid_token:
                logger.warning("Rejected coop websocket token: session_id=%s error=%s", session_id, error_code)
                await websocket.close(code=1008)
                return

        user = await db.users.get_user_by_email(email)
        if not user:
            if _is_production():
                await websocket.close(code=1008)
                return
            user = await db.users.create_user_by_email(email)

        participant = await db.trial_test_coop.get_participant(session_id, user["id"])
        if not participant:
            await websocket.close(code=1008)
            return

        await manager.connect(session_id, user["id"], websocket)
        try:
            await manager.broadcast(
                session_id,
                {"type": "presence", "user_id": user["id"], "status": "joined"},
                sender_id=user["id"]
            )
            while True:
                data = await websocket.receive_text()
                try:
                    payload = json.loads(data)
                except Exception:
                    continue

                if payload.get("type") == "answer_update":
                    task_id = payload.get("task_id")
                    answer = payload.get("answer", "")
                    if task_id is None:
                        continue
                    await db.trial_test_coop.upsert_answer(session_id, user["id"], int(task_id), str(answer))
                    await manager.broadcast(
                        session_id,
                        {
                            "type": "answer_update",
                            "user_id": user["id"],
                            "color": participant.get("color"),
                            "task_id": int(task_id),
                            "answer": str(answer),
                        },
                        sender_id=None
                    )
        except WebSocketDisconnect:
            manager.disconnect(session_id, user["id"])
            await manager.broadcast(
                session_id,
                {"type": "presence", "user_id": user["id"], "status": "left"},
                sender_id=user["id"]
            )
        except Exception as e:
            manager.disconnect(session_id, user["id"])
            logger.error(f"WS error: {e}", exc_info=True)
