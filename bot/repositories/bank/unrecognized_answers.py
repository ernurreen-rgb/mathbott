"""Admin queue for repeated written answers that are still not accepted."""
from collections import Counter
from typing import Any, Dict, List

import aiosqlite

from utils.validation import (
    is_task_answer_correct,
    normalize_answer_mode,
    normalize_task_answer_for_compare,
)


class BankTaskUnrecognizedAnswersMixin:
    _UNRECOGNIZED_EVENT_LIMIT = 5000

    def _answer_event_task(self, row: aiosqlite.Row) -> Dict[str, Any]:
        return {
            "id": int(row["bank_task_id"]),
            "text": row["task_text"] or "",
            "answer": row["correct_answer"] or "",
            "accepted_answers": row["accepted_answers"],
            "question_type": row["question_type"] or "input",
            "answer_mode": row["answer_mode"],
            "options": self._parse_json_field(row["options"]),
            "subquestions": self._parse_json_field(row["subquestions"]),
            "current_version": int(row["current_version"] or 1),
        }

    async def list_unrecognized_answers(
        self,
        *,
        min_count: int = 2,
        limit: int = 100,
    ) -> Dict[str, Any]:
        """Aggregate recent incorrect written answers from lessons and trial tests.

        Stored outcomes are re-evaluated against the current task, so a response
        disappears as soon as an administrator adds it to ``accepted_answers``.
        """
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """
                SELECT
                    s.user_id AS attempt_user_id,
                    s.answer AS student_answer,
                    s.created_at AS attempted_at,
                    'lesson' AS source,
                    bt.id AS bank_task_id,
                    bt.text AS task_text,
                    bt.answer AS correct_answer,
                    bt.accepted_answers,
                    bt.question_type,
                    bt.answer_mode,
                    bt.options,
                    bt.subquestions,
                    bt.current_version
                FROM solutions s
                JOIN tasks t ON t.id = s.task_id
                JOIN bank_tasks bt ON bt.id = t.bank_task_id
                WHERE s.is_correct = 0
                  AND bt.deleted_at IS NULL
                  AND TRIM(s.answer) <> ''
                ORDER BY s.id DESC
                LIMIT ?
                """,
                (self._UNRECOGNIZED_EVENT_LIMIT,),
            ) as cursor:
                lesson_rows = await cursor.fetchall()

            async with db.execute(
                """
                SELECT
                    r.user_id AS attempt_user_id,
                    json_extract(answer_entry.value, '$.answer') AS student_answer,
                    r.completed_at AS attempted_at,
                    CASE
                        WHEN r.submit_mode = 'coop' THEN 'trial_test_coop'
                        ELSE 'trial_test'
                    END AS source,
                    bt.id AS bank_task_id,
                    bt.text AS task_text,
                    bt.answer AS correct_answer,
                    bt.accepted_answers,
                    bt.question_type,
                    bt.answer_mode,
                    bt.options,
                    bt.subquestions,
                    bt.current_version
                FROM trial_test_results r
                JOIN json_each(r.answers) AS answer_entry
                JOIN trial_test_tasks ttt ON ttt.id = CAST(answer_entry.key AS INTEGER)
                JOIN bank_tasks bt ON bt.id = ttt.bank_task_id
                WHERE json_extract(answer_entry.value, '$.correct') = 0
                  AND bt.deleted_at IS NULL
                  AND TRIM(COALESCE(json_extract(answer_entry.value, '$.answer'), '')) <> ''
                ORDER BY r.id DESC
                LIMIT ?
                """,
                (self._UNRECOGNIZED_EVENT_LIMIT,),
            ) as cursor:
                trial_rows = await cursor.fetchall()

        grouped: Dict[tuple[int, str], Dict[str, Any]] = {}
        for row in [*lesson_rows, *trial_rows]:
            raw_answer = str(row["student_answer"] or "").strip()
            if not raw_answer:
                continue

            task = self._answer_event_task(row)
            if normalize_answer_mode(task.get("answer_mode"), task.get("question_type")) != "written":
                continue
            if is_task_answer_correct(task, raw_answer):
                continue

            canonical_answer = normalize_task_answer_for_compare(task, raw_answer)
            if not canonical_answer or canonical_answer.startswith("__invalid_"):
                canonical_answer = " ".join(raw_answer.casefold().split())
            key = (int(task["id"]), canonical_answer)
            item = grouped.get(key)
            attempted_at = str(row["attempted_at"] or "")
            source = str(row["source"] or "lesson")
            user_id = int(row["attempt_user_id"])

            if item is None:
                item = {
                    "bank_task_id": int(task["id"]),
                    "task_text": task["text"],
                    "student_answer": raw_answer,
                    "primary_answer": task["answer"],
                    "accepted_answers": self._parse_json_field(task.get("accepted_answers")) or [],
                    "question_type": task["question_type"],
                    "current_version": task["current_version"],
                    "occurrences": 0,
                    "last_seen_at": attempted_at,
                    "_users": set(),
                    "_sources": set(),
                    "_spellings": Counter(),
                }
                grouped[key] = item

            item["occurrences"] += 1
            item["_users"].add(user_id)
            item["_sources"].add(source)
            item["_spellings"][raw_answer] += 1
            if attempted_at >= item["last_seen_at"]:
                item["last_seen_at"] = attempted_at

        items: List[Dict[str, Any]] = []
        for item in grouped.values():
            if int(item["occurrences"]) < min_count:
                continue
            spellings: Counter = item.pop("_spellings")
            item["student_answer"] = spellings.most_common(1)[0][0]
            item["students_count"] = len(item.pop("_users"))
            item["sources"] = sorted(item.pop("_sources"))
            items.append(item)

        items.sort(
            key=lambda item: (int(item["occurrences"]), str(item["last_seen_at"])),
            reverse=True,
        )
        total = len(items)
        return {
            "items": items[:limit],
            "total": total,
            "limit": limit,
            "min_count": min_count,
            "sample_limit_per_source": self._UNRECOGNIZED_EVENT_LIMIT,
        }
