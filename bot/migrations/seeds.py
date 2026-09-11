"""
Idempotent data fix-ups that run at every startup, after schema migrations.

These used to live inside migrations.schema.create_schema. They are data-level
(not DDL) and intentionally stay outside Alembic: they must converge existing
rows every time the application starts, regardless of schema revision.
"""
from __future__ import annotations

import json
import logging

logger = logging.getLogger(__name__)


async def bootstrap_bank_task_versions(db) -> None:
    """
    Ensure all existing bank tasks have a version history baseline.
    Idempotent: only inserts version rows for tasks without any versions.
    """
    await db.execute("UPDATE bank_tasks SET current_version = COALESCE(current_version, 1)")

    old_row_factory = getattr(db, "row_factory", None)
    db.row_factory = None
    async with db.execute(
        """
        SELECT bt.id, bt.text, bt.answer, bt.question_type, bt.options, bt.subquestions,
               bt.image_filename, bt.solution_filename, bt.difficulty, bt.created_by
        FROM bank_tasks bt
        WHERE NOT EXISTS (
            SELECT 1 FROM bank_task_versions v WHERE v.bank_task_id = bt.id
        )
        """
    ) as cursor:
        rows = await cursor.fetchall()

    for row in rows:
        task_id = int(row[0])
        async with db.execute(
            """
            SELECT t.name
            FROM bank_task_topic_map m
            JOIN bank_topics t ON t.id = m.topic_id
            WHERE m.bank_task_id = ?
            ORDER BY t.name COLLATE NOCASE ASC
            """,
            (task_id,),
        ) as topics_cursor:
            topic_rows = await topics_cursor.fetchall()

        topics = [topic_row[0] for topic_row in topic_rows]
        options = None
        subquestions = None
        try:
            options = json.loads(row[4]) if row[4] else None
        except Exception:
            options = None
        try:
            subquestions = json.loads(row[5]) if row[5] else None
        except Exception:
            subquestions = None

        snapshot = {
            "text": row[1] or "",
            "answer": row[2] or "",
            "question_type": row[3] or "input",
            "options": options,
            "subquestions": subquestions,
            "difficulty": row[8] or "B",
            "topics": topics,
            "image_filename": row[6],
            "solution_filename": row[7],
        }

        await db.execute(
            """
            INSERT OR IGNORE INTO bank_task_versions
            (
                bank_task_id, version_no, event_type, source, actor_user_id,
                reason, rollback_from_version, changed_fields_json, snapshot_json
            )
            VALUES (?, 1, 'bootstrap', 'migration', ?, NULL, NULL, ?, ?)
            """,
            (
                task_id,
                row[9],
                json.dumps(["bootstrap"], ensure_ascii=False),
                json.dumps(snapshot, ensure_ascii=False),
            ),
        )

    await db.execute(
        """
        UPDATE bank_tasks
        SET current_version = COALESCE(
            (SELECT MAX(v.version_no) FROM bank_task_versions v WHERE v.bank_task_id = bank_tasks.id),
            1
        )
        """
    )
    db.row_factory = old_row_factory


async def run_seeds(db) -> None:
    """Run all idempotent data fix-ups on an open aiosqlite connection."""
    await bootstrap_bank_task_versions(db)
    await db.commit()
