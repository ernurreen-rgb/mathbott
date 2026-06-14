"""
Core CRUD, listing, export, usage and trial-test copy.
"""
from typing import Optional, List, Dict, Any
import json
import aiosqlite
from utils.file_storage import delete_image_file

from .versions import BankTaskVersionConflictError


class BankTaskCrudMixin:
    async def list_tasks(
        self,
        include_deleted: bool = False,
        search: Optional[str] = None,
        difficulty: Optional[str] = None,
        topics: Optional[List[str]] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> Dict[str, Any]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            where = ["bt.deleted_at IS NOT NULL" if include_deleted else "bt.deleted_at IS NULL"]
            params: List[Any] = []

            cleaned_search = (search or "").strip().lower()
            if cleaned_search:
                where.append("LOWER(bt.text) LIKE ? ESCAPE '\\'")
                params.append(self._contains_like_pattern(cleaned_search))

            if difficulty:
                where.append("bt.difficulty = ?")
                params.append(difficulty)

            normalized_topics = [self._normalize_topic(t) for t in self._normalize_topics(topics)]
            if normalized_topics:
                placeholders = ",".join(["?"] * len(normalized_topics))
                where.append(
                    f"""
                    EXISTS (
                        SELECT 1
                        FROM bank_task_topic_map m
                        JOIN bank_topics t ON t.id = m.topic_id
                        WHERE m.bank_task_id = bt.id
                          AND t.name_norm IN ({placeholders})
                    )
                    """
                )
                params.extend(normalized_topics)

            where_clause = " AND ".join(where)
            async with db.execute(
                f"SELECT COUNT(*) FROM bank_tasks bt WHERE {where_clause}",
                params,
            ) as count_cursor:
                total_row = await count_cursor.fetchone()
                total = int(total_row[0]) if total_row else 0

            order_clause = "bt.deleted_at DESC, bt.id DESC" if include_deleted else "bt.created_at DESC, bt.id DESC"
            query_params = [*params, limit, offset]
            async with db.execute(
                f"""
                SELECT bt.*
                FROM bank_tasks bt
                WHERE {where_clause}
                ORDER BY {order_clause}
                LIMIT ? OFFSET ?
                """,
                query_params,
            ) as cursor:
                rows = await cursor.fetchall()

            task_ids = [int(row["id"]) for row in rows]
            topics_map = await self._fetch_topics_map(db, task_ids)
            usage_counts = await self._fetch_active_usage_counts(db, task_ids)

            items: List[Dict[str, Any]] = []
            for row in rows:
                item = self._serialize_task_row(row, topics_map.get(int(row["id"]), []))
                item["active_usage_count"] = usage_counts.get(int(row["id"]), 0)
                item["current_version"] = int(item.get("current_version") or 1)
                items.append(item)

            return {
                "items": items,
                "total": total,
                "limit": limit,
                "offset": offset,
                "has_more": (offset + limit) < total,
            }

    async def export_tasks(
        self,
        *,
        include_deleted: bool = False,
    ) -> List[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row

            where_clause = ""
            if not include_deleted:
                where_clause = "WHERE bt.deleted_at IS NULL"

            async with db.execute(
                f"""
                SELECT bt.*
                FROM bank_tasks bt
                {where_clause}
                ORDER BY bt.id ASC
                """
            ) as cursor:
                rows = await cursor.fetchall()

            task_ids = [int(row["id"]) for row in rows]
            topics_map = await self._fetch_topics_map(db, task_ids)

            items: List[Dict[str, Any]] = []
            for row in rows:
                item = self._serialize_task_row(row, topics_map.get(int(row["id"]), []))
                item["current_version"] = int(item.get("current_version") or 1)
                items.append(item)

            return items

    async def get_task_by_id(self, task_id: int, include_deleted: bool = False) -> Optional[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            where = "id = ?" if include_deleted else "id = ? AND deleted_at IS NULL"
            async with db.execute(
                f"SELECT * FROM bank_tasks WHERE {where}",
                (task_id,),
            ) as cursor:
                row = await cursor.fetchone()
                if not row:
                    return None

            topics_map = await self._fetch_topics_map(db, [task_id])
            usage_counts = await self._fetch_active_usage_counts(db, [task_id])
            item = self._serialize_task_row(row, topics_map.get(task_id, []))
            item["active_usage_count"] = usage_counts.get(task_id, 0)
            item["current_version"] = int(item.get("current_version") or 1)
            return item

    async def create_task(
        self,
        text: str,
        answer: str,
        question_type: str,
        difficulty: str,
        text_scale: str = "md",
        topics: Optional[List[str]] = None,
        options: Optional[List[Dict[str, Any]]] = None,
        subquestions: Optional[List[Dict[str, Any]]] = None,
        image_filename: Optional[str] = None,
        solution_filename: Optional[str] = None,
        created_by: Optional[int] = None,
        source: Optional[str] = "admin_bank_create",
        reason: Optional[str] = None,
    ) -> Dict[str, Any]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                """
                INSERT INTO bank_tasks
                (text, answer, question_type, text_scale, options, subquestions, image_filename, solution_filename, difficulty, current_version, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
                """,
                (
                    text,
                    answer,
                    question_type,
                    text_scale or "md",
                    json.dumps(options, ensure_ascii=False) if options is not None else None,
                    json.dumps(subquestions, ensure_ascii=False) if subquestions is not None else None,
                    image_filename,
                    solution_filename,
                    difficulty,
                    created_by,
                ),
            )
            task_id = int(cursor.lastrowid)
            await self._set_task_topics(db, task_id, topics or [])

            row = await self._fetch_task_row(db, task_id)
            if row:
                topic_list = await self._fetch_topics_for_task(db, task_id)
                snapshot = self._build_snapshot(row, topic_list)
                await self._record_version_event(
                    db,
                    task_id=task_id,
                    event_type="create",
                    snapshot=snapshot,
                    changed_fields=list(self.SNAPSHOT_FIELDS),
                    source=source,
                    actor_user_id=created_by,
                    reason=reason,
                    initial=True,
                )
            await db.commit()

        task = await self.get_task_by_id(task_id, include_deleted=True)
        return task or {}

    async def create_tasks_bulk_atomic(
        self,
        *,
        tasks: List[Dict[str, Any]],
        created_by: Optional[int] = None,
        actor_email: Optional[str] = None,
        source: Optional[str] = "admin_bank_import",
        reason: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Create many bank tasks atomically in a single transaction.

        Expected task payload keys:
        text, answer, question_type, text_scale, difficulty, topics, options, subquestions,
        image_filename, solution_filename.
        """
        if not tasks:
            return []

        created_ids: List[int] = []
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            try:
                for payload in tasks:
                    cursor = await db.execute(
                        """
                        INSERT INTO bank_tasks
                        (text, answer, question_type, text_scale, options, subquestions, image_filename, solution_filename, difficulty, current_version, created_by)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
                        """,
                        (
                            payload.get("text", ""),
                            payload.get("answer", ""),
                            payload.get("question_type", "input"),
                            payload.get("text_scale") or "md",
                            json.dumps(payload.get("options"), ensure_ascii=False)
                            if payload.get("options") is not None
                            else None,
                            json.dumps(payload.get("subquestions"), ensure_ascii=False)
                            if payload.get("subquestions") is not None
                            else None,
                            payload.get("image_filename"),
                            payload.get("solution_filename"),
                            payload.get("difficulty", "B"),
                            created_by,
                        ),
                    )
                    task_id = int(cursor.lastrowid)
                    created_ids.append(task_id)

                    await self._set_task_topics(db, task_id, payload.get("topics") or [])

                    row = await self._fetch_task_row(db, task_id)
                    if row:
                        topic_list = await self._fetch_topics_for_task(db, task_id)
                        snapshot = self._build_snapshot(row, topic_list)
                        await self._record_version_event(
                            db,
                            task_id=task_id,
                            event_type="create",
                            snapshot=snapshot,
                            changed_fields=list(self.SNAPSHOT_FIELDS),
                            source=source,
                            actor_user_id=created_by,
                            reason=reason,
                            initial=True,
                        )
                await self._record_admin_audit_event(
                    db,
                    action=self.AUDIT_ACTION_IMPORT_CONFIRM,
                    entity_type="bank_import_batch",
                    entity_id=None,
                    actor_user_id=created_by,
                    actor_email=actor_email,
                    summary=f"Imported {len(created_ids)} task(s) into bank",
                    changed_fields=[],
                    metadata={
                        "created_count": len(created_ids),
                        "created_ids": created_ids,
                        "source": source or "admin_bank_import",
                    },
                )
                await db.commit()
            except Exception:
                await db.rollback()
                raise

        items: List[Dict[str, Any]] = []
        for task_id in created_ids:
            item = await self.get_task_by_id(task_id, include_deleted=True)
            if item:
                items.append(item)
        return items

    async def update_task(
        self,
        task_id: int,
        text: Optional[str] = None,
        answer: Optional[str] = None,
        question_type: Optional[str] = None,
        text_scale: Optional[str] = None,
        difficulty: Optional[str] = None,
        topics: Optional[List[str]] = None,
        options: Optional[List[Dict[str, Any]]] = None,
        subquestions: Optional[List[Dict[str, Any]]] = None,
        image_filename: Optional[str] = None,
        solution_filename: Optional[str] = None,
        actor_user_id: Optional[int] = None,
        source: Optional[str] = "admin_bank_update",
        reason: Optional[str] = None,
        expected_current_version: Optional[int] = None,
    ) -> Optional[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            existing = await self._fetch_task_row(db, task_id)
            if not existing:
                return None

            current_version = int(existing.get("current_version") or 1)
            if expected_current_version is not None and int(expected_current_version) != current_version:
                raise BankTaskVersionConflictError(f"VERSION_CONFLICT:{current_version}")

            existing_topics = await self._fetch_topics_for_task(db, task_id)
            before_snapshot = self._build_snapshot(existing, existing_topics)

            next_text = existing.get("text") if text is None else text
            next_answer = existing.get("answer") if answer is None else answer
            next_question_type = existing.get("question_type") if question_type is None else question_type
            next_text_scale = existing.get("text_scale") if text_scale is None else (text_scale or "md")
            next_difficulty = existing.get("difficulty") if difficulty is None else difficulty
            next_options_raw = existing.get("options") if options is None else (
                json.dumps(options, ensure_ascii=False) if options else None
            )
            next_subquestions_raw = existing.get("subquestions") if subquestions is None else (
                json.dumps(subquestions, ensure_ascii=False) if subquestions else None
            )
            next_image_filename = existing.get("image_filename") if image_filename is None else image_filename
            next_solution_filename = (
                existing.get("solution_filename") if solution_filename is None else solution_filename
            )
            next_topics = existing_topics if topics is None else self._normalize_topics(topics)

            after_snapshot_candidate = {
                "text": next_text or "",
                "answer": next_answer or "",
                "question_type": next_question_type or "input",
                "text_scale": next_text_scale or "md",
                "options": self._parse_json_field(next_options_raw),
                "subquestions": self._parse_json_field(next_subquestions_raw),
                "difficulty": next_difficulty or "B",
                "topics": next_topics,
                "image_filename": next_image_filename,
                "solution_filename": next_solution_filename,
            }

            changed_fields = self._changed_fields(before_snapshot, after_snapshot_candidate)
            if not changed_fields:
                return await self.get_task_by_id(task_id, include_deleted=True)

            updates: List[str] = []
            params: List[Any] = []
            if next_text != existing.get("text"):
                updates.append("text = ?")
                params.append(next_text)
            if next_answer != existing.get("answer"):
                updates.append("answer = ?")
                params.append(next_answer)
            if next_question_type != existing.get("question_type"):
                updates.append("question_type = ?")
                params.append(next_question_type)
            if (next_text_scale or "md") != (existing.get("text_scale") or "md"):
                updates.append("text_scale = ?")
                params.append(next_text_scale or "md")
            if next_difficulty != existing.get("difficulty"):
                updates.append("difficulty = ?")
                params.append(next_difficulty)
            if next_options_raw != existing.get("options"):
                updates.append("options = ?")
                params.append(next_options_raw)
            if next_subquestions_raw != existing.get("subquestions"):
                updates.append("subquestions = ?")
                params.append(next_subquestions_raw)
            if next_image_filename != existing.get("image_filename"):
                updates.append("image_filename = ?")
                params.append(next_image_filename)
            if next_solution_filename != existing.get("solution_filename"):
                updates.append("solution_filename = ?")
                params.append(next_solution_filename)

            if updates:
                updates.append("updated_at = CURRENT_TIMESTAMP")
                params.append(task_id)
                await db.execute(
                    f"UPDATE bank_tasks SET {', '.join(updates)} WHERE id = ?",
                    params,
                )

            if topics is not None:
                await self._set_task_topics(db, task_id, next_topics)

            updated_row = await self._fetch_task_row(db, task_id)
            if not updated_row:
                await db.commit()
                return None

            updated_topics = await self._fetch_topics_for_task(db, task_id)
            after_snapshot = self._build_snapshot(updated_row, updated_topics)
            await self._record_version_event(
                db,
                task_id=task_id,
                event_type="update",
                snapshot=after_snapshot,
                changed_fields=changed_fields,
                source=source,
                actor_user_id=actor_user_id,
                reason=reason,
                initial=False,
            )
            await db.commit()

        return await self.get_task_by_id(task_id, include_deleted=True)

    async def soft_delete_task(
        self,
        task_id: int,
        actor_user_id: Optional[int] = None,
        source: Optional[str] = "admin_bank_soft_delete",
        reason: Optional[str] = None,
    ) -> bool:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            existing = await self._fetch_task_row(db, task_id)
            if not existing:
                return False
            if existing.get("deleted_at"):
                return True

            await db.execute(
                "UPDATE bank_tasks SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL",
                (task_id,),
            )
            updated = await self._fetch_task_row(db, task_id)
            if updated:
                updated_topics = await self._fetch_topics_for_task(db, task_id)
                updated_snapshot = self._build_snapshot(updated, updated_topics)
                await self._record_version_event(
                    db,
                    task_id=task_id,
                    event_type="soft_delete",
                    snapshot=updated_snapshot,
                    changed_fields=["deleted_at"],
                    source=source,
                    actor_user_id=actor_user_id,
                    reason=reason,
                    initial=False,
                )
            await db.commit()
        return True

    async def restore_task(
        self,
        task_id: int,
        actor_user_id: Optional[int] = None,
        source: Optional[str] = "admin_bank_restore",
        reason: Optional[str] = None,
    ) -> bool:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            existing = await self._fetch_task_row(db, task_id)
            if not existing:
                return False
            if not existing.get("deleted_at"):
                return True

            await db.execute(
                "UPDATE bank_tasks SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NOT NULL",
                (task_id,),
            )
            updated = await self._fetch_task_row(db, task_id)
            if updated:
                updated_topics = await self._fetch_topics_for_task(db, task_id)
                updated_snapshot = self._build_snapshot(updated, updated_topics)
                await self._record_version_event(
                    db,
                    task_id=task_id,
                    event_type="restore",
                    snapshot=updated_snapshot,
                    changed_fields=["deleted_at"],
                    source=source,
                    actor_user_id=actor_user_id,
                    reason=reason,
                    initial=False,
                )
            await db.commit()
        return True

    async def hard_delete_task(
        self,
        task_id: int,
        *,
        actor_user_id: Optional[int] = None,
        actor_email: Optional[str] = None,
    ) -> bool:
        """Permanently delete task from trash."""
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            existing = await self._fetch_task_row(db, task_id)
            if not existing:
                return False

            existing_topics = await self._fetch_topics_for_task(db, task_id)
            module_update_cursor = await db.execute(
                """
                UPDATE tasks
                SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                WHERE bank_task_id = ? AND deleted_at IS NULL
                """,
                (task_id,),
            )
            trial_update_cursor = await db.execute(
                """
                UPDATE trial_test_tasks
                SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                WHERE bank_task_id = ? AND deleted_at IS NULL
                """,
                (task_id,),
            )
            delete_cursor = await db.execute(
                "DELETE FROM bank_tasks WHERE id = ? AND deleted_at IS NOT NULL",
                (task_id,),
            )
            deleted = (delete_cursor.rowcount or 0) > 0
            if deleted:
                await self._record_admin_audit_event(
                    db,
                    action=self.AUDIT_ACTION_HARD_DELETE,
                    entity_type="bank_task",
                    entity_id=task_id,
                    actor_user_id=actor_user_id,
                    actor_email=actor_email,
                    summary=f"Permanently deleted bank task #{task_id}",
                    changed_fields=["deleted_permanently"],
                    metadata={
                        "text_preview": self._build_text_preview(existing.get("text")),
                        "question_type": existing.get("question_type") or "input",
                        "difficulty": existing.get("difficulty") or "B",
                        "topics_count": len(existing_topics),
                        "current_version_before_delete": int(existing.get("current_version") or 1),
                        "soft_deleted_at": existing.get("deleted_at"),
                        "image_filename_present": bool(existing.get("image_filename")),
                        "module_placements_soft_deleted": int(module_update_cursor.rowcount or 0),
                        "trial_test_placements_soft_deleted": int(trial_update_cursor.rowcount or 0),
                    },
                )
                await db.execute(
                    """
                    DELETE FROM bank_topics
                    WHERE id NOT IN (
                        SELECT DISTINCT topic_id
                        FROM bank_task_topic_map
                    )
                    """
                )
            await db.commit()
        return deleted

    async def cleanup_old_deleted_tasks(self, days: int = 30) -> int:
        """Permanently delete bank tasks that stayed in trash longer than N days."""
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """
                SELECT id, image_filename
                FROM bank_tasks
                WHERE deleted_at IS NOT NULL
                  AND deleted_at < datetime('now', '-' || ? || ' days')
                """,
                (days,),
            ) as cursor:
                rows = await cursor.fetchall()
            if not rows:
                return 0

            task_ids = [int(row["id"]) for row in rows]
            image_filenames = [row["image_filename"] for row in rows if row["image_filename"]]
            placeholders = ",".join(["?"] * len(task_ids))

            await db.execute(
                f"DELETE FROM bank_tasks WHERE id IN ({placeholders})",
                task_ids,
            )
            await db.execute(
                """
                DELETE FROM bank_topics
                WHERE id NOT IN (
                    SELECT DISTINCT topic_id
                    FROM bank_task_topic_map
                )
                """
            )
            await db.commit()

        for filename in image_filenames:
            delete_image_file(filename)
        return len(task_ids)

    async def list_topics(self, query: Optional[str] = None, limit: int = 20) -> List[str]:
        async with self._connection() as db:
            normalized_query = self._normalize_topic(query or "")
            if normalized_query:
                like_value = self._contains_like_pattern(normalized_query)
                sql = """
                    SELECT name
                    FROM bank_topics
                    WHERE name_norm LIKE ? ESCAPE '\\'
                    ORDER BY name COLLATE NOCASE ASC
                    LIMIT ?
                """
                params: List[Any] = [like_value, limit]
            else:
                sql = """
                    SELECT name
                    FROM bank_topics
                    ORDER BY name COLLATE NOCASE ASC
                    LIMIT ?
                """
                params = [limit]
            async with db.execute(sql, params) as cursor:
                rows = await cursor.fetchall()
                return [row[0] for row in rows]

    async def get_task_usage(self, task_id: int, include_deleted: bool = False) -> Dict[str, Any]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            task_filter = "t.deleted_at IS NULL" if not include_deleted else "1=1"
            trial_filter = "ttt.deleted_at IS NULL" if not include_deleted else "1=1"

            module_items: List[Dict[str, Any]] = []
            async with db.execute(
                f"""
                SELECT
                    t.id AS placement_id,
                    t.sort_order,
                    t.deleted_at,
                    m.id AS module_id,
                    m.name AS module_name,
                    s.id AS section_id_resolved,
                    s.name AS section_name,
                    l.id AS lesson_id,
                    l.title AS lesson_title,
                    l.lesson_number,
                    ml.id AS mini_lesson_id_resolved,
                    ml.title AS mini_lesson_title,
                    ml.mini_index
                FROM tasks t
                LEFT JOIN mini_lessons ml ON ml.id = t.mini_lesson_id
                LEFT JOIN lessons l ON l.id = ml.lesson_id
                LEFT JOIN sections s ON s.id = COALESCE(t.section_id, l.section_id)
                LEFT JOIN modules m ON m.id = s.module_id
                WHERE t.bank_task_id = ? AND {task_filter}
                ORDER BY t.sort_order ASC, t.id ASC
                """,
                (task_id,),
            ) as module_cursor:
                rows = await module_cursor.fetchall()
                for row in rows:
                    module_items.append(
                        {
                            "kind": "module",
                            "placement_id": int(row["placement_id"]),
                            "sort_order": int(row["sort_order"] or 0),
                            "deleted_at": row["deleted_at"],
                            "module_id": row["module_id"],
                            "module_name": row["module_name"],
                            "section_id": row["section_id_resolved"],
                            "section_name": row["section_name"],
                            "lesson_id": row["lesson_id"],
                            "lesson_title": row["lesson_title"],
                            "lesson_number": row["lesson_number"],
                            "mini_lesson_id": row["mini_lesson_id_resolved"],
                            "mini_lesson_title": row["mini_lesson_title"],
                            "mini_index": row["mini_index"],
                        }
                    )

            trial_items: List[Dict[str, Any]] = []
            async with db.execute(
                f"""
                SELECT
                    ttt.id AS placement_id,
                    ttt.sort_order,
                    ttt.deleted_at,
                    ttt.trial_test_id,
                    tt.title AS trial_test_title
                FROM trial_test_tasks ttt
                JOIN trial_tests tt ON tt.id = ttt.trial_test_id
                WHERE ttt.bank_task_id = ? AND {trial_filter}
                ORDER BY ttt.trial_test_id ASC, ttt.sort_order ASC, ttt.id ASC
                """,
                (task_id,),
            ) as trial_cursor:
                rows = await trial_cursor.fetchall()
                for row in rows:
                    trial_items.append(
                        {
                            "kind": "trial_test",
                            "placement_id": int(row["placement_id"]),
                            "sort_order": int(row["sort_order"] or 0),
                            "deleted_at": row["deleted_at"],
                            "trial_test_id": int(row["trial_test_id"]),
                            "trial_test_title": row["trial_test_title"],
                        }
                    )

            items = [*module_items, *trial_items]
            return {
                "task_id": task_id,
                "active_only": not include_deleted,
                "total": len(items),
                "items": items,
            }

    async def _fetch_active_usage_counts(self, db: aiosqlite.Connection, task_ids: List[int]) -> Dict[int, int]:
        if not task_ids:
            return {}
        placeholders = ",".join(["?"] * len(task_ids))
        counts: Dict[int, int] = {task_id: 0 for task_id in task_ids}
        async with db.execute(
            f"""
            SELECT bank_task_id, COUNT(*) as cnt
            FROM tasks
            WHERE bank_task_id IN ({placeholders}) AND deleted_at IS NULL
            GROUP BY bank_task_id
            """,
            task_ids,
        ) as cursor:
            rows = await cursor.fetchall()
            for row in rows:
                counts[int(row["bank_task_id"])] += int(row["cnt"])
        async with db.execute(
            f"""
            SELECT bank_task_id, COUNT(*) as cnt
            FROM trial_test_tasks
            WHERE bank_task_id IN ({placeholders}) AND deleted_at IS NULL
            GROUP BY bank_task_id
            """,
            task_ids,
        ) as cursor:
            rows = await cursor.fetchall()
            for row in rows:
                counts[int(row["bank_task_id"])] += int(row["cnt"])
        return counts

    async def copy_tasks_to_trial_test(
        self,
        trial_test_id: int,
        bank_task_ids: List[int],
        created_by: Optional[int] = None,
    ) -> Dict[str, Any]:
        ordered_unique_ids: List[int] = []
        seen: set[int] = set()
        for raw_id in bank_task_ids:
            try:
                task_id = int(raw_id)
            except Exception:
                continue
            if task_id <= 0 or task_id in seen:
                continue
            seen.add(task_id)
            ordered_unique_ids.append(task_id)

        if not ordered_unique_ids:
            return {
                "added_count": 0,
                "skipped_existing_ids": [],
                "created_task_ids": [],
                "skipped_missing_ids": [],
            }

        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            placeholders = ",".join(["?"] * len(ordered_unique_ids))
            async with db.execute(
                f"SELECT * FROM bank_tasks WHERE id IN ({placeholders}) AND deleted_at IS NULL",
                ordered_unique_ids,
            ) as cursor:
                bank_rows = await cursor.fetchall()
            bank_tasks = {int(row["id"]): dict(row) for row in bank_rows}

            async with db.execute(
                f"""
                SELECT bank_task_id
                FROM trial_test_tasks
                WHERE trial_test_id = ?
                  AND deleted_at IS NULL
                  AND bank_task_id IS NOT NULL
                  AND bank_task_id IN ({placeholders})
                """,
                [trial_test_id, *ordered_unique_ids],
            ) as cursor:
                existing_rows = await cursor.fetchall()
            existing_ids = {int(row[0]) for row in existing_rows if row[0] is not None}

            skipped_existing_ids: List[int] = []
            skipped_missing_ids: List[int] = []
            to_add_ids: List[int] = []
            for task_id in ordered_unique_ids:
                if task_id in existing_ids:
                    skipped_existing_ids.append(task_id)
                elif task_id not in bank_tasks:
                    skipped_missing_ids.append(task_id)
                else:
                    to_add_ids.append(task_id)

            async with db.execute(
                "SELECT COALESCE(MAX(sort_order), -1) FROM trial_test_tasks WHERE trial_test_id = ? AND deleted_at IS NULL",
                (trial_test_id,),
            ) as cursor:
                max_row = await cursor.fetchone()
                next_sort_order = int(max_row[0]) + 1 if max_row and max_row[0] is not None else 0

            created_task_ids: List[int] = []
            for bank_task_id in to_add_ids:
                try:
                    insert_cursor = await db.execute(
                        """
                        INSERT INTO trial_test_tasks
                        (trial_test_id, bank_task_id, sort_order, created_by)
                        VALUES (?, ?, ?, ?)
                        """,
                        (trial_test_id, bank_task_id, next_sort_order, created_by),
                    )
                    created_task_ids.append(int(insert_cursor.lastrowid))
                    next_sort_order += 1
                except aiosqlite.IntegrityError:
                    skipped_existing_ids.append(bank_task_id)

            await db.commit()

        skipped_seen: set[int] = set()
        skipped_existing_ordered: List[int] = []
        for task_id in skipped_existing_ids:
            if task_id in skipped_seen:
                continue
            skipped_seen.add(task_id)
            skipped_existing_ordered.append(task_id)

        return {
            "added_count": len(created_task_ids),
            "skipped_existing_ids": skipped_existing_ordered,
            "created_task_ids": created_task_ids,
            "skipped_missing_ids": skipped_missing_ids,
        }
