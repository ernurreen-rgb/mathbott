"""
Module mistake review: first-attempt errors are re-practised on approved twins.

Review attempts live in their own table, so lesson progress, solved counters,
streaks and achievements never change because of a review.
"""
import json
import logging
from typing import Any, Dict, List, Optional

import storage as db_driver

from .base import BaseRepository
from utils.public_payload import public_options, public_subquestions
from utils.validation import get_mcq_answer_count, is_task_answer_correct, normalize_answer_mode

logger = logging.getLogger(__name__)

STATE_PENDING = "pending"
STATE_RESOLVED = "resolved"
STATE_WEAK = "weak"


class ModuleReviewError(Exception):
    def __init__(self, kind: str, message: str):
        super().__init__(message)
        self.kind = kind


def _placeholders(values: List[Any]) -> str:
    return ",".join(["?"] * len(values))


def resolve_review_item(source_bank_task_id: int, twin_ids: List[int], attempts: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Pick the next unseen approved twin; the original task is served once when no twin exists."""
    if any(attempt["is_correct"] for attempt in attempts):
        return {"state": STATE_RESOLVED, "next_bank_task_id": None, "kind": None}
    tried = {attempt["bank_task_id"] for attempt in attempts}
    remaining = [twin_id for twin_id in twin_ids if twin_id not in tried]
    if remaining:
        return {"state": STATE_PENDING, "next_bank_task_id": remaining[0], "kind": "twin"}
    if not twin_ids and source_bank_task_id not in tried:
        return {"state": STATE_PENDING, "next_bank_task_id": source_bank_task_id, "kind": "original"}
    return {"state": STATE_WEAK, "next_bank_task_id": None, "kind": None}


def _summarize(items: List[Dict[str, Any]]) -> Dict[str, int]:
    return {
        "mistakes": len(items),
        "resolved": sum(1 for item in items if item["state"] == STATE_RESOLVED),
        "weak": sum(1 for item in items if item["state"] == STATE_WEAK),
        "pending": sum(1 for item in items if item["state"] == STATE_PENDING),
    }


def _public_review_task(row: Dict[str, Any]) -> Dict[str, Any]:
    question_type = row.get("question_type") or "input"

    def parse(value: Any) -> Any:
        if isinstance(value, str):
            try:
                return json.loads(value)
            except ValueError:
                return None
        return value

    return {
        "bank_task_id": int(row["id"]),
        "text": row.get("text") or "",
        "image_filename": row.get("image_filename"),
        "question_type": question_type,
        "answer_mode": normalize_answer_mode(row.get("answer_mode"), question_type),
        "correct_count": get_mcq_answer_count(row.get("answer")) if question_type in {"mcq", "mcq6"} else 1,
        "text_scale": row.get("text_scale") or "md",
        "options": public_options(parse(row.get("options"))),
        "subquestions": public_subquestions(parse(row.get("subquestions"))),
    }


class ModuleReviewRepository(BaseRepository):
    async def _mistakes(self, db: db_driver.Connection, user_id: int, mini_lesson_ids: List[int]) -> List[Dict[str, Any]]:
        """Completed placements whose first recorded attempt was wrong."""
        if not mini_lesson_ids:
            return []
        async with db.execute(
            f"""
            SELECT t.id AS task_id, t.mini_lesson_id, t.bank_task_id
            FROM tasks t
            JOIN bank_tasks bt ON bt.id = t.bank_task_id AND bt.deleted_at IS NULL
            JOIN user_progress up ON up.task_id = t.id AND up.user_id = ? AND up.status = 'completed'
            WHERE t.mini_lesson_id IN ({_placeholders(mini_lesson_ids)}) AND t.deleted_at IS NULL
              AND (
                  SELECT s.is_correct FROM solutions s
                  WHERE s.user_id = ? AND s.task_id = t.id
                  ORDER BY s.id ASC LIMIT 1
              ) = 0
            ORDER BY t.mini_lesson_id ASC, t.sort_order ASC, t.id ASC
            """,
            [user_id, *mini_lesson_ids, user_id],
        ) as cursor:
            return [
                {"task_id": int(row[0]), "mini_lesson_id": int(row[1]), "source_bank_task_id": int(row[2])}
                for row in await cursor.fetchall()
            ]

    async def _approved_twins(self, db: db_driver.Connection, source_ids: List[int]) -> Dict[int, List[int]]:
        if not source_ids:
            return {}
        twins: Dict[int, List[int]] = {}
        async with db.execute(
            f"""
            SELECT tw.source_bank_task_id, tw.twin_bank_task_id
            FROM bank_task_twins tw
            JOIN bank_tasks twin ON twin.id = tw.twin_bank_task_id AND twin.deleted_at IS NULL
            WHERE tw.status = 'approved' AND tw.source_bank_task_id IN ({_placeholders(source_ids)})
            ORDER BY tw.sort_order ASC, tw.id ASC
            """,
            source_ids,
        ) as cursor:
            for row in await cursor.fetchall():
                twins.setdefault(int(row[0]), []).append(int(row[1]))
        return twins

    async def _attempts(self, db: db_driver.Connection, user_id: int, task_ids: List[int]) -> Dict[int, List[Dict[str, Any]]]:
        if not task_ids:
            return {}
        attempts: Dict[int, List[Dict[str, Any]]] = {}
        async with db.execute(
            f"""
            SELECT task_id, bank_task_id, is_correct
            FROM module_review_attempts
            WHERE user_id = ? AND task_id IN ({_placeholders(task_ids)})
            ORDER BY id ASC
            """,
            [user_id, *task_ids],
        ) as cursor:
            for row in await cursor.fetchall():
                attempts.setdefault(int(row[0]), []).append(
                    {"bank_task_id": int(row[1]), "is_correct": bool(row[2])}
                )
        return attempts

    async def _items(self, db: db_driver.Connection, user_id: int, mini_lesson_ids: List[int]) -> List[Dict[str, Any]]:
        mistakes = await self._mistakes(db, user_id, mini_lesson_ids)
        twins = await self._approved_twins(db, sorted({item["source_bank_task_id"] for item in mistakes}))
        attempts = await self._attempts(db, user_id, [item["task_id"] for item in mistakes])
        items = []
        for item in mistakes:
            task_attempts = attempts.get(item["task_id"], [])
            resolution = resolve_review_item(
                item["source_bank_task_id"], twins.get(item["source_bank_task_id"], []), task_attempts,
            )
            items.append({**item, **resolution, "attempts": len(task_attempts)})
        return items

    async def get_lesson_summaries(self, user_id: int, mini_lesson_ids: List[int]) -> Dict[int, Dict[str, int]]:
        async with self._connection() as db:
            items = await self._items(db, user_id, mini_lesson_ids)
        return {
            mini_lesson_id: _summarize([item for item in items if item["mini_lesson_id"] == mini_lesson_id])
            for mini_lesson_id in mini_lesson_ids
        }

    async def _lesson_id(self, db: db_driver.Connection, mini_lesson_id: int) -> int:
        async with db.execute("SELECT lesson_id FROM mini_lessons WHERE id = ?", (mini_lesson_id,)) as cursor:
            row = await cursor.fetchone()
        if not row:
            raise ModuleReviewError("not_found", "Мини-сабақ табылмады.")
        return int(row[0])

    async def _bank_row(self, db: db_driver.Connection, bank_task_id: int) -> Optional[Dict[str, Any]]:
        db.row_factory = db_driver.Row
        async with db.execute(
            "SELECT * FROM bank_tasks WHERE id = ? AND deleted_at IS NULL", (bank_task_id,),
        ) as cursor:
            row = await cursor.fetchone()
        return dict(row) if row else None

    async def get_review(self, user_id: int, mini_lesson_id: int) -> Dict[str, Any]:
        async with self._connection() as db:
            lesson_id = await self._lesson_id(db, mini_lesson_id)
            items = await self._items(db, user_id, [mini_lesson_id])
            current = None
            for position, item in enumerate(items, start=1):
                if item["state"] != STATE_PENDING:
                    continue
                row = await self._bank_row(db, item["next_bank_task_id"])
                if row:
                    current = {
                        "task_id": item["task_id"],
                        "kind": item["kind"],
                        "position": position,
                        "attempt": item["attempts"] + 1,
                        "task": _public_review_task(row),
                    }
                    break
        return {
            "mini_lesson_id": mini_lesson_id,
            "lesson_id": lesson_id,
            "summary": _summarize(items),
            "items": [
                {"task_id": item["task_id"], "state": item["state"], "attempts": item["attempts"]}
                for item in items
            ],
            "current": current,
        }

    async def submit_answer(
        self, user_id: int, mini_lesson_id: int, task_id: int, bank_task_id: int, answer: str,
    ) -> Dict[str, Any]:
        async with self._write_transaction() as db:
            await self._lesson_id(db, mini_lesson_id)
            items = await self._items(db, user_id, [mini_lesson_id])
            item = next((entry for entry in items if entry["task_id"] == task_id), None)
            if item is None:
                raise ModuleReviewError("not_found", "Бұл есеп қателерді талдауда жоқ.")
            if item["state"] != STATE_PENDING:
                raise ModuleReviewError("conflict", "Бұл қате талданып қойылған.")
            if item["next_bank_task_id"] != bank_task_id:
                # The served task changed (a twin was added or removed): the client must reload.
                raise ModuleReviewError("conflict", "Тапсырма жаңартылды. Бетті қайта жүктеңіз.")
            task = await self._bank_row(db, bank_task_id)
            if not task:
                raise ModuleReviewError("conflict", "Тапсырма жаңартылды. Бетті қайта жүктеңіз.")
            correct = is_task_answer_correct(task, answer)
            await db.execute(
                "INSERT INTO module_review_attempts (user_id, task_id, bank_task_id, answer, is_correct) VALUES (?, ?, ?, ?, ?)",
                (user_id, task_id, bank_task_id, answer, correct),
            )
            updated = await self._items(db, user_id, [mini_lesson_id])
        updated_item = next((entry for entry in updated if entry["task_id"] == task_id), item)
        return {
            "correct": correct,
            "correct_answer": None if correct else task.get("answer"),
            "solution_filename": None if correct else task.get("solution_filename"),
            "state": updated_item["state"],
            "has_next_twin": updated_item["state"] == STATE_PENDING,
            "summary": _summarize(updated),
        }
