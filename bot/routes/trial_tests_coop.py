"""
Trial tests coop routes (private)
"""
import json
import logging
from typing import Optional, Dict, Any

from fastapi import FastAPI, HTTPException, Query, Body, WebSocket, WebSocketDisconnect, Depends
from slowapi import Limiter

from dependencies import get_db
from database import Database
from utils.cache import cache
from utils.scoring import build_reward_identity
from utils.validation import normalize_task_answer_for_compare

logger = logging.getLogger(__name__)


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


def setup_trial_tests_coop_routes(app: FastAPI, db: Database, limiter: Limiter):
    manager = CoopConnectionManager()

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

            user = await db.get_user_by_email(email)
            if not user:
                user = await db.create_user_by_email(email)

            test = await db.get_trial_test_by_id(test_id)
            if not test:
                raise HTTPException(status_code=404, detail="Trial test not found")

            session = await db.create_trial_test_coop_session(test_id, user["id"])
            await db.add_trial_test_coop_participant(session["id"], user["id"], "red")

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
            raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

    @app.get("/api/trial-tests/coop/session/{session_id}")
    async def get_coop_session(
        session_id: int,
        email: str = Query(...),
        db: Database = Depends(get_db)
    ):
        try:
            user = await db.get_user_by_email(email)
            if not user:
                user = await db.create_user_by_email(email)

            session = await db.get_trial_test_coop_session(session_id)
            if not session:
                raise HTTPException(status_code=404, detail="Session not found")

            owner_id = session["owner_id"]
            if user["id"] != owner_id:
                if await db.is_blocked_between(owner_id, user["id"]):
                    raise HTTPException(status_code=403, detail="Friendship not allowed")
                if not await db.are_friends(owner_id, user["id"]):
                    await db.create_friendship(owner_id, user["id"])
                    await db.create_friend_request(owner_id, user["id"], status="accepted")

            participant = await db.get_trial_test_coop_participant(session_id, user["id"])
            participants = await db.list_trial_test_coop_participants(session_id)
            if not participant:
                if len(participants) >= 2:
                    raise HTTPException(status_code=400, detail="Session is full")
                color = "red" if user["id"] == owner_id else "blue"
                participant = await db.add_trial_test_coop_participant(session_id, user["id"], color)
                participants = await db.list_trial_test_coop_participants(session_id)

            user_answers_rows = await db.list_trial_test_coop_answers_for_user(session_id, user["id"])
            user_answers = _map_answers(user_answers_rows)

            other_answers = {}
            for p in participants:
                if p["user_id"] == user["id"]:
                    continue
                rows = await db.list_trial_test_coop_answers_for_user(session_id, p["user_id"])
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
            raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

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

            user = await db.get_user_by_email(email)
            if not user:
                user = await db.create_user_by_email(email)

            session = await db.get_trial_test_coop_session(session_id)
            if not session or session.get("trial_test_id") != test_id:
                raise HTTPException(status_code=404, detail="Session not found")

            participant = await db.get_trial_test_coop_participant(session_id, user["id"])
            if not participant:
                raise HTTPException(status_code=403, detail="Not a participant")

            tasks = await db.get_trial_test_tasks(test_id)
            if not tasks:
                raise HTTPException(status_code=404, detail="No tasks found in trial test")

            results = {}
            score = 0
            total = len(tasks)
            had_any_correct = False

            for task in tasks:
                task_id = task["id"]
                user_answer = answers.get(str(task_id), answers.get(int(task_id), "")).strip()

                correct_answer = task.get("answer", "").strip()
                user_normalized = normalize_task_answer_for_compare(task, user_answer)
                correct_normalized = normalize_task_answer_for_compare(task, correct_answer)
                is_correct = user_normalized == correct_normalized

                if is_correct:
                    score += 1
                    had_any_correct = True

                results[int(task_id)] = {
                    "answer": user_answer,
                    "correct": is_correct,
                    "correct_answer": task.get("answer")
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

            submit_result = await db.submit_trial_test_attempt(
                user_id=user["id"],
                trial_test_id=test_id,
                score=score,
                total=total,
                percentage=percentage,
                answers=answers_for_db,
                rewards=rewards,
                should_update_streak=had_any_correct,
                delete_draft=False,
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

            await db.create_trial_test_coop_result_link(session_id, user["id"], submit_result["result"]["id"])
            await db.set_trial_test_coop_participant_finished(session_id, user["id"], True)
            cache.invalidate_pattern(f"user:stats:{email}")
            cache.invalidate_pattern("rating:")

            participants = await db.list_trial_test_coop_participants(session_id)
            if participants and all(p.get("is_finished") for p in participants):
                await db.update_trial_test_coop_session_status(session_id, "completed")
                session_status = "completed"
            else:
                session_status = session.get("status", "active")

            return {
                "score": score,
                "total": total,
                "percentage": round(percentage, 2),
                "session_status": session_status
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error finishing coop session: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

    @app.get("/api/trial-tests/coop/session/{session_id}/results")
    async def get_coop_results(
        session_id: int,
        email: str = Query(...),
        db: Database = Depends(get_db)
    ):
        try:
            user = await db.get_user_by_email(email)
            if not user:
                user = await db.create_user_by_email(email)

            session = await db.get_trial_test_coop_session(session_id)
            if not session:
                raise HTTPException(status_code=404, detail="Session not found")

            participant = await db.get_trial_test_coop_participant(session_id, user["id"])
            if not participant:
                raise HTTPException(status_code=403, detail="Not a participant")

            results = await db.get_trial_test_coop_results(session_id)
            participants = await db.list_trial_test_coop_participants(session_id)
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
            raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

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

            user = await db.get_user_by_email(email)
            if not user:
                user = await db.create_user_by_email(email)

            # Check if they are friends
            if not await db.are_friends(user["id"], friend_id):
                raise HTTPException(status_code=403, detail="Users are not friends")

            # Create or get existing session
            test = await db.get_trial_test_by_id(test_id)
            if not test:
                raise HTTPException(status_code=404, detail="Trial test not found")

            # Check if user already has an active session for this test
            # For simplicity, create a new session each time
            session = await db.create_trial_test_coop_session(test_id, user["id"])
            await db.add_trial_test_coop_participant(session["id"], user["id"], "red")

            # Create invite
            invite = await db.create_trial_test_coop_invite(session["id"], user["id"], friend_id)

            return {
                "success": True,
                "session_id": session["id"],
                "invite_id": invite.get("id")
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error inviting friend to coop: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

    @app.get("/api/trial-tests/coop/invites")
    async def get_coop_invites(
        email: str = Query(...),
        db: Database = Depends(get_db)
    ):
        try:
            user = await db.get_user_by_email(email)
            if not user:
                user = await db.create_user_by_email(email)

            invites = await db.list_trial_test_coop_incoming_invites(user["id"])
            return {"items": invites}
        except Exception as e:
            logger.error(f"Error getting coop invites: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

    @app.post("/api/trial-tests/coop/invites/{invite_id}/accept")
    async def accept_coop_invite(
        invite_id: int,
        email: str = Query(...),
        db: Database = Depends(get_db)
    ):
        try:
            user = await db.get_user_by_email(email)
            if not user:
                user = await db.create_user_by_email(email)

            # Get invite details
            invites = await db.list_trial_test_coop_incoming_invites(user["id"])
            invite = next((i for i in invites if i.get("id") == invite_id), None)
            if not invite:
                raise HTTPException(status_code=404, detail="Invite not found")

            session_id = invite["session_id"]
            session = await db.get_trial_test_coop_session(session_id)
            if not session:
                raise HTTPException(status_code=404, detail="Session not found")

            # Check if session is still active
            if session.get("status") != "active":
                raise HTTPException(status_code=400, detail="Session is not active")

            # Add participant with blue color
            await db.add_trial_test_coop_participant(session_id, user["id"], "blue")
            await db.update_trial_test_coop_invite_status(invite_id, "accepted")

            return {
                "success": True,
                "session_id": session_id,
                "trial_test_id": session.get("trial_test_id")
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error accepting coop invite: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

    @app.post("/api/trial-tests/coop/invites/{invite_id}/decline")
    async def decline_coop_invite(
        invite_id: int,
        email: str = Query(...),
        db: Database = Depends(get_db)
    ):
        try:
            user = await db.get_user_by_email(email)
            if not user:
                user = await db.create_user_by_email(email)

            invites = await db.list_trial_test_coop_incoming_invites(user["id"])
            invite = next((i for i in invites if i.get("id") == invite_id), None)
            if not invite:
                raise HTTPException(status_code=404, detail="Invite not found")

            await db.update_trial_test_coop_invite_status(invite_id, "declined")
            return {"success": True}
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error declining coop invite: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

    @app.websocket("/ws/trial-tests/coop/{session_id}")
    async def coop_ws(websocket: WebSocket, session_id: int):
        email = websocket.query_params.get("email")
        if not email:
            await websocket.close(code=1008)
            return

        user = await db.get_user_by_email(email)
        if not user:
            user = await db.create_user_by_email(email)

        participant = await db.get_trial_test_coop_participant(session_id, user["id"])
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
                    await db.upsert_trial_test_coop_answer(session_id, user["id"], int(task_id), str(answer))
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
