"""Regression tests for the fixes made after reviewing P1 Blocks 1–2."""
from __future__ import annotations

import asyncio
import hashlib
import pathlib
import re
import unittest
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock

from fastapi import FastAPI
from slowapi import Limiter
from starlette.requests import Request as StarletteRequest

from repositories.curriculum_repository import CurriculumRepository
from repositories.task_repository import TaskRepository
from routes.admin.common import _replacement_bank_task_fields
from routes.quiz_game import setup_quiz_game_routes
from utils.rate_limit import (
    QUIZ_GAMEPLAY_NETWORK_LIMIT,
    QUIZ_PARTICIPANT_TOKEN_HEADER,
    get_rate_limit_key,
    quiz_participant_rate_limit_key,
)

BOT_ROOT = pathlib.Path(__file__).resolve().parents[1]


def _request(headers: dict[str, str], client_ip: str = "10.0.0.5") -> StarletteRequest:
    return StarletteRequest({
        "type": "http",
        "method": "POST",
        "path": "/api/quiz-sessions/1/answers",
        "headers": [(k.lower().encode("latin-1"), v.encode("latin-1")) for k, v in headers.items()],
        "query_string": b"",
        "client": (client_ip, 50000),
        "server": ("testserver", 80),
        "scheme": "http",
    })


class _RecordingConn:
    def __init__(self, count: int = 0):
        self.count = count
        self.statements: list[str] = []
        self.row_factory = None

    def execute(self, sql, params=()):
        self.statements.append(" ".join(sql.split()))
        conn = self

        class _Cursor:
            async def fetchone(self):
                return (conn.count,)

            async def fetchall(self):
                return [(11,), (12,)]

        class _Query:
            def __await__(self):
                async def _done():
                    return _Cursor()
                return _done().__await__()

            async def __aenter__(self):
                return _Cursor()

            async def __aexit__(self, *_):
                return None

        return _Query()

    async def commit(self):
        raise AssertionError("must not commit inside _write_transaction")


def _recording_repo(cls, conn: _RecordingConn):
    repo = cls("postgresql://unused")
    repo.lock_keys = []

    @asynccontextmanager
    async def _write_transaction(*, lock_key=None):
        repo.lock_keys.append(lock_key)
        yield conn

    repo._write_transaction = _write_transaction
    return repo


class QuizParticipantRateLimitKeyTests(unittest.TestCase):
    def test_each_participant_token_gets_its_own_budget(self):
        first = quiz_participant_rate_limit_key(_request({QUIZ_PARTICIPANT_TOKEN_HEADER: "token-a"}))
        second = quiz_participant_rate_limit_key(_request({QUIZ_PARTICIPANT_TOKEN_HEADER: "token-b"}))
        self.assertEqual(first, "quiz-participant:" + hashlib.sha256(b"token-a").hexdigest()[:32])
        self.assertNotEqual(first, second)
        self.assertNotIn("token-a", first)

    def test_requests_without_a_token_use_the_normal_key(self):
        request = _request({}, client_ip="10.0.0.42")
        self.assertEqual(quiz_participant_rate_limit_key(request), get_rate_limit_key(request))

    def test_gameplay_routes_have_participant_and_network_limits(self):
        limiter = Limiter(key_func=get_rate_limit_key)
        setup_quiz_game_routes(FastAPI(), MagicMock(), limiter)
        for name in ("submit_answer", "current_question", "next_question", "complete",
                     "practice_answer", "update_participant_avatar", "ws_ticket"):
            limits = limiter._route_limits[f"routes.quiz_game.{name}"]
            key_funcs = {limit.key_func for limit in limits}
            self.assertIn(quiz_participant_rate_limit_key, key_funcs, name)
            self.assertIn(get_rate_limit_key, key_funcs, name)
            self.assertIn(QUIZ_GAMEPLAY_NETWORK_LIMIT.split("/")[0], {str(limit.limit.amount) for limit in limits})


class ReplacementBankTaskFieldsTests(unittest.TestCase):
    def _db(self, previous):
        db = MagicMock()
        db.bank_tasks.get_task_by_id = AsyncMock(return_value=previous)
        return db

    def test_partial_edit_keeps_the_trashed_task_content(self):
        previous = {
            "text": "Old text", "answer": "B", "question_type": "mcq", "answer_mode": "choices",
            "accepted_answers": [], "text_scale": "lg", "difficulty": "C", "topics": ["Algebra"],
            "options": [{"label": "A", "text": "1"}, {"label": "B", "text": "2"}],
            "subquestions": None, "image_filename": "old.png", "solution_filename": "sol.png",
            "deleted_at": "2026-11-01 10:00:00",
        }
        db = self._db(previous)
        fields = asyncio.run(_replacement_bank_task_fields(
            db, 7, text=None, answer=None, question_type="mcq", answer_mode=None,
            accepted_answers=None, text_scale=None, difficulty=None, topics=None,
            options=None, subquestions=None, image_filename=None,
        ))
        db.bank_tasks.get_task_by_id.assert_awaited_once_with(7, include_deleted=True)
        self.assertEqual(fields["text"], "Old text")
        self.assertEqual(fields["answer"], "B")
        self.assertEqual(fields["options"], previous["options"])
        self.assertEqual(fields["text_scale"], "lg")
        self.assertEqual(fields["difficulty"], "C")
        self.assertEqual(fields["topics"], ["Algebra"])
        self.assertEqual(fields["image_filename"], "old.png")
        self.assertEqual(fields["solution_filename"], "sol.png")
        self.assertNotIn("deleted_at", fields)

    def test_submitted_values_win_and_empty_image_removes_it(self):
        db = self._db({"text": "Old", "answer": "1", "image_filename": "old.png", "options": [{"label": "A"}]})
        fields = asyncio.run(_replacement_bank_task_fields(
            db, 7, text="New", answer="2", question_type="input", answer_mode="written",
            accepted_answers=["два"], text_scale="md", difficulty="A", topics=[],
            options=[], subquestions=[], image_filename="",
        ))
        self.assertEqual(fields["text"], "New")
        self.assertEqual(fields["answer"], "2")
        self.assertEqual(fields["options"], [])
        self.assertIsNone(fields["image_filename"])
        self.assertEqual(fields["accepted_answers"], ["два"])

    def test_without_a_previous_bank_task_defaults_apply(self):
        db = self._db(None)
        fields = asyncio.run(_replacement_bank_task_fields(
            db, None, text="T", answer=None, question_type=None, answer_mode=None,
            accepted_answers=None, text_scale=None, difficulty=None, topics=None,
            options=None, subquestions=None, image_filename=None,
        ))
        db.bank_tasks.get_task_by_id.assert_not_awaited()
        self.assertEqual(
            (fields["answer"], fields["question_type"], fields["text_scale"], fields["difficulty"], fields["topics"]),
            ("", "input", "md", "B", []),
        )


class WriteLockKeyTests(unittest.TestCase):
    def test_bank_modules_never_take_the_unscoped_write_lock(self):
        # Bank writers must exclude each other; an unscoped lock does not exclude "bank_tasks".
        for path in (BOT_ROOT / "repositories" / "bank").glob("*.py"):
            source = path.read_text(encoding="utf-8")
            self.assertIsNone(re.search(r"_write_transaction\(\s*\)", source), path.name)

    def test_task_id_reset_uses_the_same_lock_as_task_creation(self):
        conn = _RecordingConn(count=0)
        repo = _recording_repo(TaskRepository, conn)
        self.assertTrue(asyncio.run(repo.reset_task_id_counter()))
        self.assertEqual(repo.lock_keys, ["bank_tasks"])

    def test_delete_lesson_runs_in_one_write_transaction(self):
        conn = _RecordingConn()
        repo = _recording_repo(CurriculumRepository, conn)
        asyncio.run(repo.delete_lesson(5))
        self.assertEqual(repo.lock_keys, [None])
        self.assertTrue(any(sql.startswith("DELETE FROM tasks") for sql in conn.statements))
        self.assertTrue(any(sql.startswith("DELETE FROM lessons") for sql in conn.statements))


if __name__ == "__main__":
    unittest.main()
