"""Admin queue for repeated written answers that are still not accepted."""
from collections import Counter
import json
from typing import Any, Dict, List, Optional, Tuple

import storage as db_driver

from utils.validation import (
    is_task_answer_correct,
    normalize_accepted_answers,
    normalize_answer_mode,
    normalize_task_answer_for_compare,
)
from .versions import BankTaskVersionConflictError


class BankTaskUnrecognizedAnswersMixin:
    _UNRECOGNIZED_EVENT_LIMIT = 5000

    def _answer_event_task(self, row: db_driver.Row) -> Dict[str, Any]:
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
            db.row_factory = db_driver.Row
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
                    (answer_entry.value ->> 'answer') AS student_answer,
                    r.completed_at AS attempted_at,
                    'trial_test' AS source,
                    bt.id AS bank_task_id,
                    bt.text AS task_text,
                    bt.answer AS correct_answer,
                    bt.accepted_answers,
                    bt.question_type,
                    bt.answer_mode,
                    bt.options,
                    bt.subquestions,
                    bt.current_version
                FROM (
                    SELECT id, user_id, completed_at, answers
                    FROM trial_test_results
                    WHERE answers IS NOT NULL AND left(btrim(answers), 1) = '{'
                    ORDER BY id DESC
                    LIMIT ?
                ) r
                JOIN LATERAL jsonb_each(
                    CASE WHEN left(btrim(r.answers), 1) = '{' THEN r.answers::jsonb ELSE '{}'::jsonb END
                ) AS answer_entry ON TRUE
                JOIN trial_test_tasks ttt
                    ON answer_entry.key ~ '^[0-9]+$'
                   AND ttt.id = CAST(answer_entry.key AS BIGINT)
                JOIN bank_tasks bt ON bt.id = ttt.bank_task_id
                WHERE (CASE WHEN answer_entry.value ->> 'correct' IN ('true', '1') THEN 1
                            WHEN answer_entry.value ->> 'correct' IN ('false', '0') THEN 0 END) = 0
                  AND bt.deleted_at IS NULL
                  AND TRIM(COALESCE(answer_entry.value ->> 'answer', '')) <> ''
                ORDER BY r.id DESC
                LIMIT ?
                """,
                (self._UNRECOGNIZED_EVENT_LIMIT, self._UNRECOGNIZED_EVENT_LIMIT),
            ) as cursor:
                trial_rows = await cursor.fetchall()

            # Twins are graded on their own content, so a missing alias shows up here too.
            async with db.execute(
                """
                SELECT
                    a.user_id AS attempt_user_id,
                    a.answer AS student_answer,
                    a.created_at AS attempted_at,
                    'module_review' AS source,
                    bt.id AS bank_task_id,
                    bt.text AS task_text,
                    bt.answer AS correct_answer,
                    bt.accepted_answers,
                    bt.question_type,
                    bt.answer_mode,
                    bt.options,
                    bt.subquestions,
                    bt.current_version
                FROM module_review_attempts a
                JOIN bank_tasks bt ON bt.id = a.bank_task_id
                WHERE a.is_correct = 0
                  AND bt.deleted_at IS NULL
                  AND TRIM(a.answer) <> ''
                ORDER BY a.id DESC
                LIMIT ?
                """,
                (self._UNRECOGNIZED_EVENT_LIMIT,),
            ) as cursor:
                review_rows = await cursor.fetchall()

        grouped: Dict[tuple[int, str], Dict[str, Any]] = {}
        for row in [*lesson_rows, *trial_rows, *review_rows]:
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

    async def add_accepted_answer(
        self,
        *,
        task_id: int,
        answer: str,
        max_accepted_answers: int,
        actor_user_id: Optional[int] = None,
        source: str = "admin_unrecognized_answer_accept",
        reason: str = "Accepted from repeated student answers",
        expected_current_version: Optional[int] = None,
    ) -> Tuple[Optional[Dict[str, Any]], bool]:
        """Atomically append an accepted answer alias under the write lock."""
        async with self._write_transaction() as db:
            db.row_factory = db_driver.Row
            existing = await self._fetch_task_row(db, task_id)
            if not existing or existing.get("deleted_at") is not None:
                return None, False

            existing_topics = await self._fetch_topics_for_task(db, task_id)
            serialized = self._serialize_task_row(existing, existing_topics)
            current_version = int(existing.get("current_version") or 1)
            if expected_current_version is not None and current_version != int(expected_current_version):
                raise BankTaskVersionConflictError(
                    task_id=task_id,
                    expected_version=int(expected_current_version),
                    current_version=current_version,
                    current_task=serialized,
                )

            if normalize_answer_mode(existing.get("answer_mode"), existing.get("question_type")) != "written":
                raise ValueError("Only written-answer tasks can accept response aliases")

            if is_task_answer_correct(serialized, answer):
                return serialized, False

            accepted_answers = normalize_accepted_answers(existing.get("accepted_answers"))
            if len(accepted_answers) >= max_accepted_answers:
                raise ValueError(f"accepted_answers must contain at most {max_accepted_answers} items")
            accepted_answers.append(answer)
            next_accepted_raw = json.dumps(normalize_accepted_answers(accepted_answers), ensure_ascii=False)

            await db.execute(
                "UPDATE bank_tasks SET accepted_answers = ?, updated_at = mathbot_datetime('now') WHERE id = ?",
                (next_accepted_raw, task_id),
            )
            updated_row = await self._fetch_task_row(db, task_id)
            if not updated_row:
                return None, False
            updated_topics = await self._fetch_topics_for_task(db, task_id)
            after_snapshot = self._build_snapshot(updated_row, updated_topics)
            await self._record_version_event(
                db,
                task_id=task_id,
                event_type="update",
                snapshot=after_snapshot,
                changed_fields=["accepted_answers"],
                source=source,
                actor_user_id=actor_user_id,
                reason=reason,
                initial=False,
            )

        return await self.get_task_by_id(task_id, include_deleted=False), True
