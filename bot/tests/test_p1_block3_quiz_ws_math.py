"""Regression tests for P1 Block 3 (H-21..H-27): Live Quizzes, WebSockets, Math Engine, AI Twins & Push.

Run from bot/: python -m pytest tests/test_p1_block3_quiz_ws_math.py
"""
import asyncio
import json
import os
import unittest
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
from fastapi import FastAPI
from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.testclient import TestClient

from repositories.push_repository import PushRepository
from repositories.quiz_sessions import QuizSessionsMixin
from routes.presence import PresenceConnectionManager, setup_presence_routes
from routes.quiz_game import QuizConnectionManager, quiz_manager, setup_quiz_game_routes
from services.ai_twins import AiTwinError, TwinDraft, _Solved, generate_twin_drafts, solve_task
from utils.internal_proxy_auth import build_presence_ws_token
from utils.math_algebra import canonicalize_algebraic_expression
from utils.math_final_form import matches_key_form
from utils.math_statements import canonicalize_math_statement
from utils.quiz import QuizError, check_question_answer, public_question, token_hash
from utils.quiz_ws_auth import issue_quiz_ws_ticket, verify_quiz_ws_ticket
from utils.validation import is_task_answer_correct


class _FakeCursor:
    def __init__(self, rows=None, *, rowcount=1, lastrowid=1):
        self._rows = list(rows or [])
        self.rowcount = rowcount
        self.lastrowid = lastrowid

    def __await__(self):
        async def _self():
            return self
        return _self().__await__()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def fetchone(self):
        return self._rows[0] if self._rows else None

    async def fetchall(self):
        return list(self._rows)


class H21H22H23QuizSessionsTests(unittest.TestCase):
    def test_h21_record_answer_measures_elapsed_before_lock_wait_and_h22_marks_last_question_finished(self):
        valid_token = "a" * 40
        valid_hash = token_hash(valid_token)
        q1 = {
            "id": 101,
            "quiz_id": 1,
            "question_text": "2+2?",
            "question_type": "input",
            "correct_answer": "4",
            "options": [],
            "accepted_answers": [],
            "time_limit_seconds": 10,
            "points": 1000,
            "sort_order": 0,
        }
        q2 = {
            "id": 102,
            "quiz_id": 1,
            "question_text": "3+3?",
            "question_type": "input",
            "correct_answer": "6",
            "options": [],
            "accepted_answers": [],
            "time_limit_seconds": 10,
            "points": 1000,
            "sort_order": 1,
        }
        state = {
            "participant": {
                "id": 7,
                "session_id": 10,
                "user_id": None,
                "nickname": "Almas",
                "avatar_color": "#fff:fox",
                "token_hash": valid_hash,
                "score": 0,
                "streak": 0,
                "correct_count": 0,
                "total_answered": 0,
                "current_question_index": 0,
                "question_started_at": 1000.0,
                "question_order": None,
                "is_finished": 0,
                "joined_at": "2026-01-01",
                "last_active_at": "2026-01-01",
            },
            "answers": [],
            "clock": 1002.0,  # 2 seconds elapsed at submission
        }

        class FakeConn:
            row_factory = None

            def execute(self, sql, params=()):
                s = " ".join(sql.split())
                if "SELECT snapshot_json, position FROM quiz_session_questions" in s:
                    qid = params[1]
                    q = q1 if qid == 101 else q2
                    pos = 0 if qid == 101 else 1
                    return _FakeCursor([{"snapshot_json": json.dumps(q), "position": pos}])
                if "SELECT snapshot_json FROM quiz_session_questions WHERE session_id = ? AND question_id = ?" in s:
                    qid = params[1]
                    q = q1 if qid == 101 else q2
                    return _FakeCursor([{"snapshot_json": json.dumps(q)}])
                if "SELECT snapshot_json FROM quiz_session_questions WHERE session_id = ? AND position = ?" in s:
                    pos = params[1]
                    q = q1 if pos == 0 else q2
                    return _FakeCursor([{"snapshot_json": json.dumps(q)}])
                if "SELECT COUNT(*) AS n FROM quiz_session_questions" in s:
                    return _FakeCursor([{"n": 2}])
                if "SELECT * FROM quiz_participants WHERE session_id = ? AND token_hash = ?" in s:
                    return _FakeCursor([dict(state["participant"])])
                if "SELECT * FROM quiz_participants WHERE id = ?" in s:
                    return _FakeCursor([dict(state["participant"])])
                if "SELECT * FROM quiz_answers WHERE session_id = ? AND participant_id = ? AND question_id = ?" in s:
                    qid = params[2]
                    found = [a for a in state["answers"] if a["question_id"] == qid]
                    return _FakeCursor(found)
                if "SELECT status, settings FROM quiz_sessions WHERE id = ?" in s:
                    return _FakeCursor([{"status": "in_progress", "settings": "{}"}])
                if "FROM quiz_sessions s JOIN quizzes q" in s:
                    return _FakeCursor([{
                        "id": 10,
                        "status": "in_progress",
                        "pin_code": "123456",
                        "quiz_title": "Test",
                        "host_nickname": "Teacher",
                        "question_count": 2,
                    }])
                if "SELECT COUNT(*) + 1 AS rank FROM quiz_participants" in s:
                    return _FakeCursor([{"rank": 1}])
                if s.startswith("INSERT INTO quiz_answers"):
                    state["answers"].append({
                        "session_id": params[0],
                        "participant_id": params[1],
                        "question_id": params[2],
                        "user_answer": params[3],
                        "is_correct": params[4],
                        "time_taken_seconds": params[5],
                        "points_awarded": params[6],
                    })
                    return _FakeCursor()
                if s.startswith("UPDATE quiz_participants SET score = score + ?"):
                    points, streak, inc_correct, should_finish, _, _ = params
                    state["participant"]["score"] += points
                    state["participant"]["streak"] = streak
                    state["participant"]["correct_count"] += inc_correct
                    state["participant"]["total_answered"] += 1
                    if should_finish == 1:
                        state["participant"]["is_finished"] = 1
                    return _FakeCursor()
                return _FakeCursor()

        class DummyQuizRepo(QuizSessionsMixin):
            @asynccontextmanager
            async def _connection(self):
                yield FakeConn()

            @asynccontextmanager
            async def _write_transaction(self, *, lock_key=None):
                # Simulate 15 seconds waiting on a contended write lock (past the 10s question limit!).
                state["clock"] += 15.0
                yield FakeConn()

        repo = DummyQuizRepo()
        with patch("repositories.quiz_sessions.time.time", side_effect=lambda: state["clock"]):
            # Answer Q1 (not last): submitted at t=1002.0 (elapsed=2.0s), lock acquired at t=1017.0.
            res1 = asyncio.run(repo.record_answer(10, 7, 101, "4", valid_token))

        self.assertTrue(res1["is_correct"])
        self.assertGreater(res1["points_awarded"], 0)
        self.assertAlmostEqual(state["answers"][0]["time_taken_seconds"], 2.0, places=5)
        self.assertEqual(res1["progress"]["participant"]["is_finished"], 0)
        self.assertIsNone(res1["progress"]["rank"])

        # Advance to Q2 (last question) and answer at t=2003.0 (elapsed=3.0s) with 15s lock wait.
        state["participant"]["current_question_index"] = 1
        state["participant"]["question_started_at"] = 2000.0
        state["clock"] = 2003.0
        with patch("repositories.quiz_sessions.time.time", side_effect=lambda: state["clock"]):
            res2 = asyncio.run(repo.record_answer(10, 7, 102, "6", valid_token))

        self.assertTrue(res2["is_correct"])
        self.assertAlmostEqual(state["answers"][1]["time_taken_seconds"], 3.0, places=5)
        self.assertEqual(res2["progress"]["participant"]["is_finished"], 1)
        self.assertEqual(res2["progress"]["rank"], 1)

    def test_h23_join_session_prevents_sybil_clones_and_handles_broken_tokens_without_401(self):
        participants: list[dict] = []
        next_id = [1]

        class FakeConn:
            row_factory = None

            def execute(self, sql, params=()):
                s = " ".join(sql.split())
                if "SELECT * FROM quiz_sessions WHERE id = ?" in s:
                    return _FakeCursor([{"id": 50, "status": "lobby", "settings": "{}"}])
                if "SELECT * FROM quiz_participants WHERE session_id = ? AND nickname = ?" in s:
                    sid, nick = params
                    return _FakeCursor([dict(p) for p in participants if p["session_id"] == sid and p["nickname"] == nick])
                if "SELECT * FROM quiz_participants WHERE session_id = ? AND user_id = ? ORDER BY id LIMIT 1" in s:
                    sid, uid = params
                    return _FakeCursor([dict(p) for p in participants if p["session_id"] == sid and p["user_id"] == uid][:1])
                if "SELECT id FROM quiz_participants WHERE session_id = ? AND user_id = ? AND id != ? LIMIT 1" in s:
                    sid, uid, pid = params
                    return _FakeCursor([{"id": p["id"]} for p in participants if p["session_id"] == sid and p["user_id"] == uid and p["id"] != pid][:1])
                if "SELECT * FROM quiz_participants WHERE session_id = ? AND token_hash = ?" in s:
                    sid, th = params
                    return _FakeCursor([dict(p) for p in participants if p["session_id"] == sid and p["token_hash"] == th])
                if "SELECT COUNT(*) FROM quiz_participants WHERE session_id = ?" in s:
                    return _FakeCursor([(len(participants),)])
                if s.startswith("INSERT INTO quiz_participants"):
                    sid, uid, nick, color, th = params
                    pid = next_id[0]
                    next_id[0] += 1
                    participants.append({
                        "id": pid,
                        "session_id": sid,
                        "user_id": uid,
                        "nickname": nick,
                        "avatar_color": color,
                        "token_hash": th,
                        "score": 0,
                        "streak": 0,
                        "correct_count": 0,
                        "total_answered": 0,
                        "is_finished": 0,
                        "joined_at": "2026-01-01",
                        "last_active_at": "2026-01-01",
                    })
                    return _FakeCursor(lastrowid=pid)
                if "UPDATE quiz_participants SET token_hash = ? WHERE id = ?" in s:
                    th, pid = params
                    for p in participants:
                        if p["id"] == pid:
                            p["token_hash"] = th
                    return _FakeCursor()
                if "UPDATE quiz_participants SET avatar_color = ? WHERE id = ?" in s:
                    color, pid = params
                    for p in participants:
                        if p["id"] == pid:
                            p["avatar_color"] = color
                    return _FakeCursor()
                if "UPDATE quiz_participants SET user_id = ? WHERE id = ? AND user_id IS NULL" in s:
                    uid, pid = params
                    for p in participants:
                        if p["id"] == pid and p["user_id"] is None:
                            p["user_id"] = uid
                    return _FakeCursor()
                if "SELECT user_id FROM quiz_participants WHERE id = ?" in s:
                    pid = params[0]
                    return _FakeCursor([{"user_id": p["user_id"]} for p in participants if p["id"] == pid])
                if "SELECT * FROM quiz_participants WHERE id = ?" in s:
                    pid = params[0]
                    return _FakeCursor([dict(p) for p in participants if p["id"] == pid])
                return _FakeCursor()

        class DummyQuizRepo(QuizSessionsMixin):
            @asynccontextmanager
            async def _write_transaction(self, *, lock_key=None):
                yield FakeConn()

        repo = DummyQuizRepo()

        # 1. Joining with a malformed/short participant_token must NOT fail with 401.
        joined1 = asyncio.run(repo.join_session(50, "Almas", user_id=11, participant_token="broken"))
        self.assertEqual(joined1["nickname"], "Almas")
        self.assertEqual(len(participants), 1)

        # 2. Another user trying the taken nickname with a malformed token gets 409 conflict, not 401.
        with self.assertRaises(QuizError) as ctx:
            asyncio.run(repo.join_session(50, "Almas", user_id=22, participant_token="short"))
        self.assertEqual(ctx.exception.kind, "conflict")

        # 3. Same authenticated user_id=11 trying a second nickname reconnects instead of creating a Sybil clone.
        rejoined_user = asyncio.run(repo.join_session(50, "SpyAccount", user_id=11))
        self.assertEqual(rejoined_user["id"], joined1["id"])
        self.assertEqual(rejoined_user["nickname"], "Almas")
        self.assertEqual(len(participants), 1)

        # 4. Guest joins, then tries Sybil join with their token under a second nickname -> reconnects, no clone.
        guest1 = asyncio.run(repo.join_session(50, "GuestOne"))
        self.assertEqual(len(participants), 2)
        guest_sybil = asyncio.run(repo.join_session(50, "GuestSpy", participant_token=guest1["participant_token"]))
        self.assertEqual(guest_sybil["id"], guest1["id"])
        self.assertEqual(guest_sybil["nickname"], "GuestOne")
        self.assertEqual(len(participants), 2)

        # 5. Claiming GuestOne onto user_id=11 (who already owns Almas in session 50) must be rejected with conflict.
        with self.assertRaises(QuizError) as claim_ctx:
            asyncio.run(repo.claim_participant(50, guest1["participant_token"], user_id=11))
        self.assertEqual(claim_ctx.exception.kind, "conflict")


class H24QuizAccessAndResultsSanitizationTests(unittest.TestCase):
    def _build_app(self):
        fake_db = MagicMock()
        session_row = {
            "id": 9,
            "quiz_id": 3,
            "host_id": 1,
            "pin_code": "654321",
            "status": "in_progress",
            "settings": {},
        }
        admin_user = {"id": 1, "email": "teacher@example.com", "is_admin": 1, "admin_role": "super_admin"}
        player_row = {
            "id": 44,
            "session_id": 9,
            "user_id": 1,
            "nickname": "TeacherAsPlayer",
            "token_hash": "h" * 64,
            "is_finished": 0,
        }
        fake_db.users.get_user_by_email = AsyncMock(return_value=admin_user)
        fake_db.quizzes.get_session_by_id = AsyncMock(return_value=session_row)
        fake_db.quizzes.authenticate_participant = AsyncMock(return_value=player_row)
        fake_db.quizzes.get_player_progress = AsyncMock(return_value={
            "current_question": {"id": 101, "question_text": "Q1", "options": []},
        })
        fake_db.quizzes.get_session_questions = AsyncMock(return_value=[
            {"id": 101, "question_text": "Q1", "correct_answer": "A", "options": []},
            {"id": 102, "question_text": "Q2", "correct_answer": "B", "options": []},
        ])
        fake_db.quizzes.get_session_full_results = AsyncMock(return_value={
            "session": {**session_row, "status": "finished"},
            "participants": [
                {"id": 44, "user_id": 1, "nickname": "Me", "score": 1000, "answers": [{"question_id": 101}]},
                {"id": 45, "user_id": 999, "nickname": "Classmate", "score": 800, "answers": [{"question_id": 101}]},
            ],
            "question_stats": [],
            "total_players": 2,
        })

        app = FastAPI()
        app.state.db = fake_db
        limiter = Limiter(key_func=get_remote_address)
        app.state.limiter = limiter
        setup_quiz_game_routes(app, fake_db, limiter)
        return app, fake_db, session_row

    def test_h24_host_playing_with_participant_token_gets_player_role_and_results_strip_user_id(self):
        app, fake_db, session_row = self._build_app()
        player_headers = {"X-Quiz-Participant-Token": "p" * 40}

        async def _run():
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://quiz.test") as client:
                # 1. Host playing with participant token must only receive current question, NOT all questions.
                q_resp = await client.get(
                    "/api/quiz-sessions/9/questions",
                    params={"email": "teacher@example.com"},
                    headers=player_headers,
                )
                self.assertEqual(q_resp.status_code, 200)
                self.assertEqual(len(q_resp.json()), 1)
                self.assertEqual(q_resp.json()[0]["id"], 101)

                # 2. WS token for host playing with participant token must carry role='player'.
                ws_resp = await client.get(
                    "/api/quiz-sessions/9/ws-token",
                    params={"email": "teacher@example.com"},
                    headers=player_headers,
                )
                self.assertEqual(ws_resp.status_code, 200)
                claims = verify_quiz_ws_ticket(9, ws_resp.json()["token"], consume=False)
                self.assertIsNotNone(claims)
                self.assertEqual(claims["role"], "player")
                self.assertEqual(claims["actor_id"], 44)

                # 3. In-progress stats blocked for host when acting as player.
                stats_resp = await client.get(
                    "/api/quiz-sessions/9/stats",
                    params={"email": "teacher@example.com"},
                    headers=player_headers,
                )
                self.assertEqual(stats_resp.status_code, 403)

                # 4. After finish, /results for participant must NOT leak classmates' user_id or answers.
                session_row["status"] = "finished"
                res_player = await client.get("/api/quiz-sessions/9/results", headers=player_headers)
                self.assertEqual(res_player.status_code, 200)
                participants = res_player.json()["participants"]
                for p in participants:
                    self.assertNotIn("user_id", p)
                other = next(p for p in participants if p["id"] == 45)
                self.assertEqual(other["answers"], [])

                # 5. Host without participant token still gets full results.
                res_host = await client.get("/api/quiz-sessions/9/results", params={"email": "teacher@example.com"})
                self.assertEqual(res_host.status_code, 200)
                other_host = next(p for p in res_host.json()["participants"] if p["id"] == 45)
                self.assertEqual(other_host["user_id"], 999)
                self.assertEqual(len(other_host["answers"]), 1)

        with patch.dict(os.environ, {"ENVIRONMENT": "development", "INTERNAL_PROXY_SECRET": "test-secret-123456"}, clear=False):
            asyncio.run(_run())


class H25WebSocketLimitsCleanupAndBroadcastTests(unittest.TestCase):
    def test_h25_quiz_manager_per_actor_limit_and_close_session(self):
        mgr = QuizConnectionManager()
        mgr.MAX_WS_PER_ACTOR = 2

        class FakeWS:
            def __init__(self):
                self.accepted = False
                self.closed_codes = []

            async def accept(self):
                self.accepted = True

            async def close(self, code=1000, reason=""):
                self.closed_codes.append(code)

        async def _run():
            ws1, ws2, ws3, ws_other = FakeWS(), FakeWS(), FakeWS(), FakeWS()
            self.assertTrue(await mgr.connect(1, "c1", ws1, actor_key="player:10"))
            self.assertTrue(await mgr.connect(1, "c2", ws2, actor_key="player:10"))
            # 3rd socket for same actor rejected with 1013
            self.assertFalse(await mgr.connect(1, "c3", ws3, actor_key="player:10"))
            self.assertEqual(ws3.closed_codes, [1013])
            # Different actor still allowed
            self.assertTrue(await mgr.connect(1, "c4", ws_other, actor_key="player:11"))

            closed_count = await mgr.close_session(1)
            self.assertEqual(closed_count, 3)
            self.assertEqual(mgr.total_connections(), 0)
            self.assertEqual(ws1.closed_codes, [1000])
            self.assertEqual(ws_other.closed_codes, [1000])
            # After close_session, actor counters are cleaned up
            ws_rejoin = FakeWS()
            self.assertTrue(await mgr.connect(2, "c5", ws_rejoin, actor_key="player:10"))

        asyncio.run(_run())

    def test_h25_presence_manager_per_user_limit_and_broadcast_offline_on_dead_socket(self):
        mgr = PresenceConnectionManager()
        mgr.MAX_WS_PER_USER = 2

        class FakeWS:
            def __init__(self, *, fail_send=False):
                self.fail_send = fail_send
                self.sent = []
                self.closed_codes = []

            async def accept(self):
                return None

            async def close(self, code=1000):
                self.closed_codes.append(code)

            async def send_text(self, text):
                if self.fail_send:
                    raise RuntimeError("broken pipe")
                self.sent.append(json.loads(text))

        async def _run():
            u1_a, u1_b, u1_c = FakeWS(), FakeWS(), FakeWS()
            u2_dead = FakeWS(fail_send=True)
            self.assertIsNotNone(await mgr.connect({"id": 1, "nickname": "Alice"}, u1_a))
            self.assertIsNotNone(await mgr.connect({"id": 1, "nickname": "Alice"}, u1_b))
            # 3rd socket for user 1 rejected with 1013
            self.assertIsNone(await mgr.connect({"id": 1, "nickname": "Alice"}, u1_c))
            self.assertEqual(u1_c.closed_codes, [1013])

            self.assertIsNotNone(await mgr.connect({"id": 2, "nickname": "Bob"}, u2_dead))
            await mgr.broadcast({"type": "ping_all"})
            # Bob's dead socket should have been removed AND Alice notified that Bob went offline!
            self.assertNotIn(2, mgr.active_connections)
            offline_events = [m for m in u1_a.sent if m.get("type") == "presence_update" and m.get("status") == "offline"]
            self.assertEqual(len(offline_events), 1)
            self.assertEqual(offline_events[0]["user"]["id"], 2)

        asyncio.run(_run())

    def test_h25_presence_ws_disconnects_on_cancelled_error(self):
        fake_db = MagicMock()
        fake_db.users.get_user_by_email = AsyncMock(return_value={"id": 77, "email": "u@example.com", "nickname": "U"})

        captured_manager = []
        orig_init = PresenceConnectionManager.__init__

        def _spy_init(self):
            orig_init(self)
            captured_manager.append(self)

        app = FastAPI()
        app.state.db = fake_db
        limiter = Limiter(key_func=get_remote_address)
        app.state.limiter = limiter

        with patch.object(PresenceConnectionManager, "__init__", _spy_init):
            setup_presence_routes(app, fake_db, limiter)
        mgr = captured_manager[-1]

        ws_route = next(r for r in app.routes if getattr(r, "path", None) == "/ws/presence")

        class CancellingWS:
            def __init__(self, token):
                self.query_params = {"email": "u@example.com", "token": token}
                self.closed_codes = []

            async def accept(self):
                return None

            async def send_text(self, text):
                return None

            async def receive_text(self):
                raise asyncio.CancelledError()

            async def close(self, code=1000):
                self.closed_codes.append(code)

        async def _run():
            with patch.dict(os.environ, {"INTERNAL_PROXY_SECRET": "presence-secret-123456"}, clear=False):
                token = build_presence_ws_token(user_email="u@example.com")
                ws = CancellingWS(token)
                with self.assertRaises(asyncio.CancelledError):
                    await ws_route.endpoint(ws)
            self.assertEqual(mgr.total_connections(), 0)
            self.assertNotIn(77, mgr.active_connections)

        asyncio.run(_run())

    def test_h25_quiz_ws_times_out_idle_socket(self):
        fake_db = MagicMock()
        fake_db.quizzes.get_session_by_id = AsyncMock(return_value={"id": 33, "host_id": 1, "status": "in_progress"})
        fake_db.users.get_user_by_id = AsyncMock(return_value={"id": 1, "is_admin": 0})
        app = FastAPI()
        app.state.db = fake_db
        limiter = Limiter(key_func=get_remote_address)
        app.state.limiter = limiter
        setup_quiz_game_routes(app, fake_db, limiter)

        ws_route = next(r for r in app.routes if getattr(r, "path", None) == "/ws/quiz/{session_id}")

        class SilentWS:
            def __init__(self, token):
                self.query_params = {"token": token}
                self.sent = []
                self.closed_codes = []

            async def accept(self):
                return None

            async def send_json(self, payload):
                self.sent.append(payload)

            async def receive_text(self):
                await asyncio.sleep(5.0)
                return ""

            async def close(self, code=1000, reason=""):
                self.closed_codes.append(code)

        async def _run():
            with patch.dict(os.environ, {"INTERNAL_PROXY_SECRET": "quiz-ws-secret-123456"}, clear=False), \
                 patch.object(quiz_manager, "WS_RECEIVE_TIMEOUT_SECONDS", 0.05):
                ticket = issue_quiz_ws_ticket(33, "host", 1)
                ws = SilentWS(ticket)
                await ws_route.endpoint(ws, 33)
            self.assertEqual(ws.closed_codes, [1001])
            self.assertNotIn(33, quiz_manager.sessions)

        asyncio.run(_run())


class H26MathEngineTests(unittest.TestCase):
    @staticmethod
    def _input(key: str) -> dict:
        return {"question_type": "input", "answer": key}

    def test_h26_multivariate_proportional_cancellation_and_same_denominator_addition(self):
        self.assertEqual(canonicalize_algebraic_expression("(x - y)/(y - x)"), "-1")
        self.assertEqual(canonicalize_algebraic_expression("2x/(x + y) + 2y/(x + y)"), "2")
        self.assertEqual(canonicalize_algebraic_expression("(2x^2 - 2xy)/(xy - x^2)"), "-2")
        self.assertEqual(canonicalize_algebraic_expression("1/(x - y) + 1/(y - x)"), "0")

        # 9 terms of 1/x^10 (would reach degree 90 > _MAX_TOTAL_DEGREE=64 without same-denominator handling)
        sum_nine = " + ".join(["1/x^10"] * 9)
        self.assertEqual(
            canonicalize_algebraic_expression(sum_nine),
            canonicalize_algebraic_expression("9/x^10"),
        )

    def test_h26_multi_clause_interval_preserves_variable_names_and_supports_greek(self):
        # False positive prevented: swapped variable assignments must NOT match.
        self.assertNotEqual(
            canonicalize_math_statement(r"x \in (1; 2); y \in (3; 4)"),
            canonicalize_math_statement(r"y \in (1; 2); x \in (3; 4)"),
        )
        self.assertFalse(
            is_task_answer_correct(
                self._input(r"x \in (1; 2); y \in (3; 4)"),
                r"y \in (1; 2); x \in (3; 4)",
            )
        )
        # Reordered clauses for the same variables MUST still match.
        self.assertTrue(
            is_task_answer_correct(
                self._input(r"x \in (1; 2); y \in (3; 4)"),
                r"y \in (3; 4); x \in (1; 2)",
            )
        )
        # Greek single-variable interval matches bare interval.
        self.assertTrue(is_task_answer_correct(self._input(r"\alpha \in (0; \pi)"), r"(0; \pi)"))
        self.assertTrue(is_task_answer_correct(self._input(r"(0; \pi)"), r"\alpha \in (0; \pi)"))
        # Greek multi-clause system preserves variable identity.
        self.assertFalse(
            is_task_answer_correct(
                self._input(r"\alpha \in (0; \pi); \beta \in (\pi; 2\pi)"),
                r"\beta \in (0; \pi); \alpha \in (\pi; 2\pi)",
            )
        )

    def test_h26_matches_key_form_equivalent_final_forms_and_rejects_unsimplified(self):
        accepted_pairs = [
            # (x + 1)/2 <-> 0.5x + 0.5 <-> (1/2)x + 1/2
            (r"\frac{x + 1}{2}", "0,5x + 0,5"),
            ("0,5x + 0,5", r"\frac{x + 1}{2}"),
            (r"\frac{x + 1}{2}", r"\frac{1}{2}x + \frac{1}{2}"),
            (r"-\frac{x + 1}{2}", "-0,5x - 0,5"),
            (r"\frac{2x + 1}{2}", "x + 0,5"),
            # -1/(x - 1) <-> 1/(1 - x)
            (r"-\frac{1}{x - 1}", r"\frac{1}{1 - x}"),
            (r"\frac{1}{1 - x}", r"-\frac{1}{x - 1}"),
            (r"-\frac{2}{x - 1}", r"\frac{2}{1 - x}"),
            # 2 * (x/3) <-> (2x)/3 <-> (2/3)x
            (r"\frac{2x}{3}", r"2 \cdot \frac{x}{3}"),
            (r"2 \cdot \frac{x}{3}", r"\frac{2x}{3}"),
            (r"\frac{2}{3}x", r"2 \cdot \frac{x}{3}"),
            # Evaluated powers inside equations and intervals
            (r"x = 2^{10}", "x = 1024"),
            (r"(0; 2^{10})", "(0; 1024)"),
            (r"x \ge 2^{10}", r"x \ge 1024"),
        ]
        for key, answer in accepted_pairs:
            self.assertTrue(is_task_answer_correct(self._input(key), answer), f"{answer!r} should pass for {key!r}")

        rejected_pairs = [
            # Unreduced fractions or unexpanded products must STAY rejected.
            ("x + 1", r"\frac{2x + 2}{2}"),
            (r"\frac{x + 1}{2}", r"\frac{2x + 2}{4}"),
            ("2x + 2", "2(x + 1)"),
            (r"\frac{2}{3}x", r"4 \cdot \frac{x}{6}"),
            (r"\frac{2}{3}", r"2 \cdot \frac{1}{3}"),
            (r"\frac{1}{x}", r"\frac{-1}{-x}"),
            ("1 - x", "-(x - 1)"),
            # Unevaluated powers in student answer for plain number key must STAY rejected.
            ("x = 1024", r"x = 2^{10}"),
            ("(0; 1024)", r"(0; 2^{10})"),
            ("1024", r"2^{10}"),
        ]
        for key, answer in rejected_pairs:
            self.assertFalse(is_task_answer_correct(self._input(key), answer), f"{answer!r} should fail for {key!r}")


class H27AiTwinsQuizUtilsAndPushTests(unittest.TestCase):
    def test_h27_ai_twins_coerces_numeric_bool_list_and_null_accepted_answers(self):
        # TwinDraft coercion
        d_num = TwinDraft.model_validate({"text": "2+3", "answer": 5, "accepted_answers": None})
        self.assertEqual((d_num.answer, d_num.accepted_answers), ("5", []))

        d_float = TwinDraft.model_validate({"text": "1/2", "answer": 0.5, "accepted_answers": [0.5, 5.0]})
        self.assertEqual((d_float.answer, d_float.accepted_answers), ("0.5", ["0.5", "5"]))

        d_bool = TwinDraft.model_validate({"text": "2+2=4?", "answer": True})
        self.assertEqual(d_bool.answer, "true")

        d_list = TwinDraft.model_validate({
            "text": "Pick",
            "answer": ["A", "C"],
            "options": [{"label": "A", "text": 10}, {"label": "B", "text": 20}],
        })
        self.assertEqual(d_list.answer, '["A", "C"]')
        self.assertEqual(d_list.options[0].text, "10")

        # _Solved coercion
        self.assertEqual(_Solved.model_validate({"answer": 35}).answer, "35")
        self.assertEqual(_Solved.model_validate({"answer": False}).answer, "false")
        self.assertEqual(_Solved.model_validate({"answer": ["A", "C"]}).answer, '["A", "C"]')

        # Invalid outputs still fail cleanly with AiTwinError("invalid_output")
        for bad_json in ('{"answer": ""}', '{"answer": null}', '{"answer": []}', '{"answer": {}}'):
            with patch("services.ai_twins._chat", AsyncMock(return_value=bad_json)), \
                 self.assertRaises(AiTwinError) as raised:
                asyncio.run(solve_task({"text": "2+2", "question_type": "input"}))
            self.assertEqual(raised.exception.kind, "invalid_output")

    def test_h27_quiz_public_question_handles_none_options_and_check_maps_id_to_label(self):
        pub = public_question({"id": 1, "question_text": "2+2", "question_type": "input", "options": None})
        self.assertEqual(pub["options"], [])

        written_mcq = {
            "question_type": "mcq",
            "answer_mode": "written",
            "correct_answer": "B",
            "options": [{"id": "A", "text": "10"}, {"id": "B", "text": "42"}],
        }
        self.assertTrue(check_question_answer(written_mcq, "42"))
        self.assertFalse(check_question_answer(written_mcq, "10"))

        # None options on input question must not crash check_question_answer
        self.assertTrue(check_question_answer({"question_type": "input", "correct_answer": "4", "options": None}, "4"))

    def test_h27_push_claim_due_reminders_guards_outer_where_and_uses_skip_locked(self):
        executed = []
        used_lock_keys = []

        class FakeConn:
            def execute(self, sql, params=()):
                executed.append((" ".join(sql.split()), params))
                return _FakeCursor([])

        class DummyPushRepo(PushRepository):
            def __init__(self):
                pass

            @asynccontextmanager
            async def _write_transaction(self, *, lock_key=None):
                used_lock_keys.append(lock_key)
                yield FakeConn()

        rows = asyncio.run(DummyPushRepo().claim_due_reminders("2026-11-22", 200))
        self.assertEqual(rows, [])
        self.assertEqual(used_lock_keys, ["push_reminders"])
        self.assertEqual(len(executed), 1)
        sql, params = executed[0]
        self.assertIn("FOR UPDATE OF s SKIP LOCKED", sql)
        self.assertIn("AND (ps.last_reminded_on IS NULL OR ps.last_reminded_on <> ?)", sql)
        self.assertEqual(params, ("2026-11-22", "2026-11-22", "2026-11-22", "2026-11-22", 200))


if __name__ == "__main__":
    unittest.main()
