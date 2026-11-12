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

LESSON_LOCKED_MESSAGE = "Бұл сабақ әлі жабық: алдымен алдыңғы сабақтағы қателерді талдаңыз."


class ModuleReviewError(Exception):
    def __init__(self, kind: str, message: str):
        super().__init__(message)
        self.kind = kind


def _placeholders(values: List[Any]) -> str:
    return ",".join(["?"] * len(values))


def _chunks(values: List[Any], size: int = 500) -> List[List[Any]]:
    # Keeps IN lists well below the PostgreSQL parameter limit.
    return [values[index:index + size] for index in range(0, len(values), size)]


def _text_preview(value: Optional[str], limit: int = 140) -> str:
    text = " ".join((value or "").split())
    return text if len(text) <= limit else f"{text[:limit]}..."


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

    async def _module_lessons(self, db: db_driver.Connection, module_id: int) -> List[Dict[str, Any]]:
        # Same order as the module journey on the web: sections, then lessons by sort order and number.
        async with db.execute(
            """
            SELECT l.id, l.title, l.lesson_number
            FROM lessons l
            JOIN sections s ON s.id = l.section_id
            WHERE s.module_id = ?
            ORDER BY s.sort_order ASC, s.id ASC, l.sort_order ASC, COALESCE(l.lesson_number, 0) ASC, l.id ASC
            """,
            (module_id,),
        ) as cursor:
            return [
                {"id": int(row[0]), "title": row[1], "lesson_number": row[2]}
                for row in await cursor.fetchall()
            ]

    async def get_module_lesson_order(self, module_id: int) -> List[Dict[str, Any]]:
        async with self._connection() as db:
            return await self._module_lessons(db, module_id)

    async def get_lesson_gate(self, user_id: int, module_id: int) -> Dict[str, Any]:
        """Lessons of a module that wait for the mistake review of the lesson before them.

        Only the lesson right after one with pending review items waits; lessons further on stay
        reachable. A lesson the student has already answered in never closes, and only completed
        mini-lessons count, because that is when their review is offered.
        Returns the module's lessons in journey order and ``locks`` keyed by the waiting lesson.
        """
        async with self._connection() as db:
            lessons = await self._module_lessons(db, module_id)
            # The last lesson never gates anything, so only the others need their reviews checked.
            gating_ids = [lesson["id"] for lesson in lessons[:-1]]
            if not gating_ids:
                return {"lessons": lessons, "locks": {}}

            minis: Dict[int, Dict[str, int]] = {}
            for chunk in _chunks(gating_ids):
                async with db.execute(
                    f"SELECT id, lesson_id, mini_index FROM mini_lessons WHERE lesson_id IN ({_placeholders(chunk)})",
                    chunk,
                ) as cursor:
                    for row in await cursor.fetchall():
                        minis[int(row[0])] = {"lesson_id": int(row[1]), "mini_index": int(row[2] or 0)}
            mini_ids = sorted(minis)

            completed_minis = set()
            for chunk in _chunks(mini_ids):
                async with db.execute(
                    f"""
                    SELECT t.mini_lesson_id, COUNT(t.id),
                           SUM(CASE WHEN up.status = 'completed' THEN 1 ELSE 0 END)
                    FROM tasks t
                    LEFT JOIN user_progress up ON up.task_id = t.id AND up.user_id = ?
                    WHERE t.mini_lesson_id IN ({_placeholders(chunk)}) AND t.deleted_at IS NULL
                    GROUP BY t.mini_lesson_id
                    """,
                    [user_id, *chunk],
                ) as cursor:
                    for row in await cursor.fetchall():
                        total, done = int(row[1] or 0), int(row[2] or 0)
                        if total > 0 and done == total:
                            completed_minis.add(int(row[0]))

            pending: Dict[int, Dict[int, int]] = {}
            for chunk in _chunks(sorted(completed_minis)):
                for item in await self._items(db, user_id, chunk):
                    if item["state"] == STATE_PENDING:
                        by_mini = pending.setdefault(minis[item["mini_lesson_id"]]["lesson_id"], {})
                        by_mini[item["mini_lesson_id"]] = by_mini.get(item["mini_lesson_id"], 0) + 1
            if not pending:
                return {"lessons": lessons, "locks": {}}

            candidates = [
                lessons[index + 1]["id"] for index, lesson in enumerate(lessons[:-1]) if lesson["id"] in pending
            ]
            started = set()
            for chunk in _chunks(candidates):
                async with db.execute(
                    f"""
                    SELECT DISTINCT ml.lesson_id
                    FROM solutions s
                    JOIN tasks t ON t.id = s.task_id
                    JOIN mini_lessons ml ON ml.id = t.mini_lesson_id
                    WHERE s.user_id = ? AND ml.lesson_id IN ({_placeholders(chunk)})
                    """,
                    [user_id, *chunk],
                ) as cursor:
                    started.update(int(row[0]) for row in await cursor.fetchall())

        locks: Dict[int, Dict[str, Any]] = {}
        for index, lesson in enumerate(lessons[:-1]):
            by_mini = pending.get(lesson["id"])
            waiting = lessons[index + 1]["id"]
            if not by_mini or waiting in started:
                continue
            first_mini = min(by_mini, key=lambda mini_id: (minis[mini_id]["mini_index"], mini_id))
            locks[waiting] = {
                "lesson_id": lesson["id"],
                "lesson_title": lesson["title"],
                "lesson_number": lesson["lesson_number"],
                "mini_lesson_id": first_mini,
                "pending": sum(by_mini.values()),
            }
        return {"lessons": lessons, "locks": locks}

    async def get_lesson_lock(self, user_id: int, lesson_id: int) -> Optional[Dict[str, Any]]:
        """Why a lesson is closed for this student, or None; cheap once the student has answered in it."""
        async with self._connection() as db:
            async with db.execute(
                """
                SELECT 1 FROM solutions s
                JOIN tasks t ON t.id = s.task_id
                JOIN mini_lessons ml ON ml.id = t.mini_lesson_id
                WHERE s.user_id = ? AND ml.lesson_id = ?
                LIMIT 1
                """,
                (user_id, lesson_id),
            ) as cursor:
                if await cursor.fetchone():
                    return None
            async with db.execute(
                "SELECT s.module_id FROM lessons l JOIN sections s ON s.id = l.section_id WHERE l.id = ?",
                (lesson_id,),
            ) as cursor:
                row = await cursor.fetchone()
        if not row:
            return None
        gate = await self.get_lesson_gate(user_id, int(row[0]))
        return gate["locks"].get(lesson_id)

    async def get_mini_lesson_lock(self, user_id: int, mini_lesson_id: int) -> Optional[Dict[str, Any]]:
        async with self._connection() as db:
            async with db.execute("SELECT lesson_id FROM mini_lessons WHERE id = ?", (mini_lesson_id,)) as cursor:
                row = await cursor.fetchone()
        return await self.get_lesson_lock(user_id, int(row[0])) if row else None

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

    async def get_mistake_analytics(self, *, module_id: Optional[int], since: Optional[str]) -> Dict[str, Any]:
        """First-attempt mistakes in module lessons and how their review ended, for teachers.

        `since` filters by the time of the first attempt ("YYYY-MM-DD HH:MM:SS", UTC).
        Review states use the same rules students see, so the numbers match the review page.
        """
        conditions = ["t.deleted_at IS NULL", "bt.deleted_at IS NULL"]
        params: List[Any] = []
        if module_id:
            conditions.append("sec.module_id = ?")
            params.append(module_id)
        if since:
            conditions.append("s.created_at >= ?")
            params.append(since)
        async with self._connection() as db:
            db.row_factory = db_driver.Row
            async with db.execute(
                f"""
                SELECT s.user_id, s.task_id, s.is_correct, t.bank_task_id, up.status AS progress_status,
                       m.id AS module_id, m.name AS module_name, sec.name AS section_name,
                       l.id AS lesson_id, l.title AS lesson_title, l.lesson_number, ml.mini_index,
                       bt.text AS task_text, bt.question_type, u.nickname, u.email
                FROM solutions s
                JOIN (SELECT user_id, task_id, MIN(id) AS first_id FROM solutions GROUP BY user_id, task_id) f ON f.first_id = s.id
                JOIN tasks t ON t.id = s.task_id
                JOIN mini_lessons ml ON ml.id = t.mini_lesson_id
                JOIN lessons l ON l.id = ml.lesson_id
                JOIN sections sec ON sec.id = l.section_id
                JOIN modules m ON m.id = sec.module_id
                JOIN bank_tasks bt ON bt.id = t.bank_task_id
                JOIN users u ON u.id = s.user_id
                LEFT JOIN user_progress up ON up.user_id = s.user_id AND up.task_id = s.task_id
                WHERE {" AND ".join(conditions)}
                """,
                params,
            ) as cursor:
                rows = [dict(row) for row in await cursor.fetchall()]
            async with db.execute("SELECT id, name FROM modules ORDER BY sort_order ASC, id ASC") as cursor:
                modules = [{"id": int(row["id"]), "name": row["name"]} for row in await cursor.fetchall()]

            mistakes = [row for row in rows if not row["is_correct"]]
            reviewable = [row for row in mistakes if row["progress_status"] == "completed"]
            twins: Dict[int, List[int]] = {}
            for chunk in _chunks(sorted({row["bank_task_id"] for row in reviewable})):
                twins.update(await self._approved_twins(db, chunk))
            attempts: Dict[tuple, List[Dict[str, Any]]] = {}
            for chunk in _chunks(sorted({row["task_id"] for row in reviewable})):
                async with db.execute(
                    f"SELECT user_id, task_id, bank_task_id, is_correct FROM module_review_attempts "
                    f"WHERE task_id IN ({_placeholders(chunk)}) ORDER BY id ASC",
                    chunk,
                ) as cursor:
                    for row in await cursor.fetchall():
                        attempts.setdefault((int(row[0]), int(row[1])), []).append(
                            {"bank_task_id": int(row[2]), "is_correct": bool(row[3])}
                        )
            topics: Dict[int, List[str]] = {}
            for chunk in _chunks(sorted({row["bank_task_id"] for row in mistakes})):
                async with db.execute(
                    f"""
                    SELECT m.bank_task_id, t.name FROM bank_task_topic_map m JOIN bank_topics t ON t.id = m.topic_id
                    WHERE m.bank_task_id IN ({_placeholders(chunk)}) ORDER BY t.name_norm ASC
                    """,
                    chunk,
                ) as cursor:
                    for row in await cursor.fetchall():
                        topics.setdefault(int(row[0]), []).append(row[1])

        tasks: Dict[int, Dict[str, Any]] = {}
        for row in rows:
            task = tasks.setdefault(row["task_id"], {
                "task_id": row["task_id"],
                "bank_task_id": row["bank_task_id"],
                "text_preview": _text_preview(row["task_text"]),
                "question_type": row["question_type"] or "input",
                "topics": topics.get(row["bank_task_id"], []),
                "location": {
                    "module_id": row["module_id"], "module_name": row["module_name"], "section_name": row["section_name"],
                    "lesson_id": row["lesson_id"], "lesson_title": row["lesson_title"],
                    "lesson_number": row["lesson_number"], "mini_index": row["mini_index"],
                },
                "attempted": 0, "mistakes": 0, "resolved": 0, "weak": 0, "pending": 0,
            })
            task["attempted"] += 1

        by_topic: Dict[str, Dict[str, Any]] = {}
        students: Dict[int, Dict[str, Any]] = {}
        for row in mistakes:
            if row["progress_status"] == "completed":
                state = resolve_review_item(
                    row["bank_task_id"], twins.get(row["bank_task_id"], []), attempts.get((row["user_id"], row["task_id"]), []),
                )["state"]
            else:
                state = STATE_PENDING  # Review opens once the student finishes the task.
            task = tasks[row["task_id"]]
            task["mistakes"] += 1
            task[state] += 1
            student = students.setdefault(row["user_id"], {
                "user_id": row["user_id"], "nickname": row["nickname"], "email": row["email"],
                "mistakes": 0, "resolved": 0, "weak": 0, "pending": 0, "weak_topics": set(),
            })
            student["mistakes"] += 1
            student[state] += 1
            for name in task["topics"] or ["Тақырыпсыз"]:
                topic = by_topic.setdefault(name, {"topic": name, "mistakes": 0, "resolved": 0, "weak": 0, "pending": 0, "_students": set()})
                topic["mistakes"] += 1
                topic[state] += 1
                topic["_students"].add(row["user_id"])
                if state == STATE_WEAK:
                    student["weak_topics"].add(name)

        task_list = sorted(
            (task for task in tasks.values() if task["mistakes"]),
            key=lambda task: (-task["mistakes"], -task["mistakes"] / task["attempted"], task["task_id"]),
        )
        for task in task_list:
            task["mistake_rate"] = round(task["mistakes"] / task["attempted"], 4)
        topic_list = sorted(by_topic.values(), key=lambda topic: (-topic["mistakes"], topic["topic"]))
        for topic in topic_list:
            topic["students"] = len(topic.pop("_students"))
        student_list = sorted(students.values(), key=lambda student: (-student["weak"], -student["mistakes"], student["user_id"]))
        for student in student_list:
            student["weak_topics"] = sorted(student["weak_topics"])

        return {
            "modules": modules,
            "summary": {
                "first_attempts": len(rows),
                "mistakes": len(mistakes),
                "mistake_rate": round(len(mistakes) / len(rows), 4) if rows else 0.0,
                "resolved": sum(task["resolved"] for task in task_list),
                "weak": sum(task["weak"] for task in task_list),
                "pending": sum(task["pending"] for task in task_list),
                "tasks_with_mistakes": len(task_list),
                "students_with_mistakes": len(student_list),
            },
            "tasks": task_list,
            "topics": topic_list,
            "students": student_list,
        }
