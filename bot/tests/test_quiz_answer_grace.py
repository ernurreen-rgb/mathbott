"""A right answer tapped on the last second shown must count although it reaches the server just
after the limit; an answer past the grace still does not.

Run from bot/: python -m pytest tests/test_quiz_answer_grace.py
"""
import asyncio
import json
import unittest
from contextlib import asynccontextmanager
from unittest.mock import patch

from repositories.quiz_sessions import QuizSessionsMixin
from utils.quiz import ANSWER_GRACE_SECONDS, answer_in_time, calculate_speed_points, token_hash

TOKEN = "t" * 40
QUESTION = {
    "id": 6, "quiz_id": 3, "question_text": "2/3 + 1/6 = ?", "question_type": "mcq",
    "correct_answer": "C", "accepted_answers": [], "time_limit_seconds": 30, "points": 1000, "sort_order": 0,
    "options": [{"id": "A", "text": "2/3"}, {"id": "B", "text": "3/6"}, {"id": "C", "text": "5/6"}, {"id": "D", "text": "1"}],
}


class _Cursor:
    def __init__(self, rows=None):
        self._rows = list(rows or [])

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


def _repo(state):
    """A one-question game: the participant activated the question at t=1000."""

    class Conn:
        def execute(self, sql, params=()):
            s = " ".join(sql.split())
            if "SELECT snapshot_json, position FROM quiz_session_questions" in s:
                return _Cursor([{"snapshot_json": json.dumps(QUESTION), "position": 0}])
            if "SELECT snapshot_json FROM quiz_session_questions" in s:
                return _Cursor([{"snapshot_json": json.dumps(QUESTION)}])
            if "SELECT COUNT(*) AS n FROM quiz_session_questions" in s:
                return _Cursor([{"n": 1}])
            if "SELECT * FROM quiz_participants" in s:
                return _Cursor([dict(state["participant"])])
            if "SELECT * FROM quiz_answers" in s:
                return _Cursor(state["answers"])
            if "SELECT status, settings FROM quiz_sessions" in s:
                return _Cursor([{"status": "in_progress", "settings": "{}"}])
            if "FROM quiz_sessions s JOIN quizzes q" in s:
                return _Cursor([{"id": 59, "status": "in_progress", "pin_code": "123456", "quiz_title": "Бөлшектер",
                                 "host_nickname": "Teacher", "question_count": 1}])
            if "AS rank FROM quiz_participants" in s:
                return _Cursor([{"rank": 1}])
            if s.startswith("INSERT INTO quiz_answers"):
                state["answers"].append({"question_id": params[2], "user_answer": params[3], "is_correct": params[4],
                                         "time_taken_seconds": params[5], "points_awarded": params[6]})
            elif s.startswith("UPDATE quiz_participants SET score = score + ?"):
                points, streak, correct, finish = params[:4]
                p = state["participant"]
                p.update(score=p["score"] + points, streak=streak, correct_count=p["correct_count"] + correct,
                         total_answered=p["total_answered"] + 1, is_finished=1 if finish else p["is_finished"])
            return _Cursor()

    class Repo(QuizSessionsMixin):
        @asynccontextmanager
        async def _connection(self):
            yield Conn()

        @asynccontextmanager
        async def _write_transaction(self, *, lock_key=None):
            yield Conn()

    return Repo()


def _answer_at(elapsed, answer="C"):
    state = {"answers": [], "participant": {
        "id": 7, "session_id": 59, "user_id": None, "nickname": "Shatnik", "avatar_color": "#fff",
        "token_hash": token_hash(TOKEN), "score": 0, "streak": 0, "correct_count": 0, "total_answered": 0,
        "current_question_index": 0, "question_started_at": 1000.0, "question_order": None, "is_finished": 0,
        "joined_at": "2026-11-28 07:09:56", "last_active_at": "2026-11-28 07:09:56",
    }}
    with patch("repositories.quiz_sessions.time.time", return_value=1000.0 + elapsed):
        result = asyncio.run(_repo(state).record_answer(59, 7, 6, answer, TOKEN))
    return result, state


class AnswerGraceTests(unittest.TestCase):
    def test_answer_in_time_allows_the_grace_after_the_limit(self):
        self.assertTrue(answer_in_time(30, 29.9))
        self.assertTrue(answer_in_time(30, 30.4))
        self.assertTrue(answer_in_time(30, 30 + ANSWER_GRACE_SECONDS - 0.01))
        self.assertFalse(answer_in_time(30, 30 + ANSWER_GRACE_SECONDS))
        self.assertFalse(answer_in_time(30, 45))

    def test_points_inside_the_grace_equal_an_answer_at_the_end_of_the_limit(self):
        self.assertEqual(calculate_speed_points(1000, 30, 0, 1), 1000)
        self.assertEqual(calculate_speed_points(1000, 30, 30.4, 1), 500)
        self.assertEqual(calculate_speed_points(1000, 30, 31.9, 3), 700)  # streak bonus still applies
        self.assertGreaterEqual(calculate_speed_points(1000, 30, 29.9, 1), calculate_speed_points(1000, 30, 30.4, 1))
        self.assertEqual(calculate_speed_points(1000, 30, 30 + ANSWER_GRACE_SECONDS, 1), 0)

    def test_right_answer_arriving_just_after_the_limit_counts(self):
        # Game #59: the right option reached the server 30.4 s after activation (limit 30 s).
        result, state = _answer_at(30.4)
        self.assertTrue(result["is_correct"])
        self.assertEqual(result["points_awarded"], 500)
        self.assertIsNone(result["correct_answer"])
        self.assertEqual(state["participant"]["correct_count"], 1)
        self.assertEqual(state["participant"]["streak"], 1)
        self.assertAlmostEqual(state["answers"][0]["time_taken_seconds"], 30.4, places=5)

    def test_answers_past_the_grace_and_wrong_answers_score_nothing(self):
        late, late_state = _answer_at(30 + ANSWER_GRACE_SECONDS + 0.5)
        self.assertFalse(late["is_correct"])
        self.assertEqual(late["points_awarded"], 0)
        self.assertEqual(late["correct_answer"], "C")
        self.assertEqual(late_state["participant"]["streak"], 0)

        wrong, _ = _answer_at(30.4, answer="B")
        self.assertFalse(wrong["is_correct"])
        self.assertEqual(wrong["points_awarded"], 0)

        timeout, _ = _answer_at(30.5, answer="__timeout__")
        self.assertFalse(timeout["is_correct"])


if __name__ == "__main__":
    unittest.main()
