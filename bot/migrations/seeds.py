"""
Idempotent data fix-ups that run at every startup, after schema migrations.

They are data-level (not DDL) and intentionally stay outside the numbered
PostgreSQL migrations: they must converge existing rows every time the
application starts, regardless of schema revision.
"""
from __future__ import annotations

import json
import logging
from typing import Dict, List

logger = logging.getLogger(__name__)


async def bootstrap_bank_task_versions(db) -> None:
    """
    Ensure all existing bank tasks have a version history baseline.
    Idempotent: only touches rows that actually need fixing (zero full-table rewrites).
    """
    await db.execute("UPDATE bank_tasks SET current_version = 1 WHERE current_version IS NULL")

    old_row_factory = getattr(db, "row_factory", None)
    db.row_factory = None
    try:
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

        if rows:
            # Batch-fetch all topics for unversioned bank tasks (no N+1 queries).
            task_ids = [int(row[0]) for row in rows]
            topics_by_task: Dict[int, List[str]] = {}
            chunk_size = 500
            for start in range(0, len(task_ids), chunk_size):
                chunk = task_ids[start : start + chunk_size]
                placeholders = ",".join("?" for _ in chunk)
                async with db.execute(
                    f"""
                    SELECT m.bank_task_id, t.name
                    FROM bank_task_topic_map m
                    JOIN bank_topics t ON t.id = m.topic_id
                    WHERE m.bank_task_id IN ({placeholders})
                    ORDER BY m.bank_task_id ASC, LOWER(t.name COLLATE "pg_c_utf8") ASC
                    """,
                    tuple(chunk),
                ) as topics_cursor:
                    for topic_row in await topics_cursor.fetchall():
                        topics_by_task.setdefault(int(topic_row[0]), []).append(topic_row[1])

            for row in rows:
                task_id = int(row[0])
                topics = topics_by_task.get(task_id, [])
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
                    INSERT INTO bank_task_versions
                    (
                        bank_task_id, version_no, event_type, source, actor_user_id,
                        reason, rollback_from_version, changed_fields_json, snapshot_json
                    )
                    VALUES (?, 1, 'bootstrap', 'migration', ?, NULL, NULL, ?, ?)
                    ON CONFLICT DO NOTHING
                    """,
                    (
                        task_id,
                        row[9],
                        json.dumps(["bootstrap"], ensure_ascii=False),
                        json.dumps(snapshot, ensure_ascii=False),
                    ),
                )

        # Only repair rows whose current_version actually disagrees with MAX(version_no).
        await db.execute(
            """
            UPDATE bank_tasks bt
            SET current_version = sub.max_ver
            FROM (
                SELECT bank_task_id, MAX(version_no) AS max_ver
                FROM bank_task_versions
                GROUP BY bank_task_id
            ) sub
            WHERE bt.id = sub.bank_task_id
              AND bt.current_version IS DISTINCT FROM sub.max_ver
            """
        )
    finally:
        db.row_factory = old_row_factory


async def run_seeds(db) -> None:
    """Run all idempotent data fix-ups on an open database connection."""
    await bootstrap_bank_task_versions(db)
    await db.commit()
