"""
Version history: recording, listing, rollback and deletion.
"""
from typing import Optional, List, Dict, Any
import json
import aiosqlite


class BankTaskVersionConflictError(Exception):
    """Raised when an optimistic-locking version check fails."""


class BankTaskVersionDeleteError(Exception):
    """Raised when a version cannot be deleted (e.g. the only/current one)."""



class BankTaskVersionsMixin:
    async def _record_version_event(
        self,
        db: aiosqlite.Connection,
        *,
        task_id: int,
        event_type: str,
        snapshot: Dict[str, Any],
        changed_fields: List[str],
        source: Optional[str],
        actor_user_id: Optional[int],
        reason: Optional[str],
        rollback_from_version: Optional[int] = None,
        initial: bool = False,
    ) -> int:
        if initial:
            version_no = 1
        else:
            async with db.execute(
                "SELECT current_version FROM bank_tasks WHERE id = ?",
                (task_id,),
            ) as cursor:
                row = await cursor.fetchone()
                current_version = int(row[0]) if row and row[0] is not None else 0
            version_no = current_version + 1

        await db.execute(
            """
            INSERT INTO bank_task_versions
            (
                bank_task_id, version_no, event_type, source, actor_user_id,
                reason, rollback_from_version, changed_fields_json, snapshot_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                task_id,
                version_no,
                event_type,
                source,
                actor_user_id,
                reason,
                rollback_from_version,
                json.dumps(changed_fields, ensure_ascii=False),
                json.dumps(snapshot, ensure_ascii=False),
            ),
        )
        await db.execute(
            "UPDATE bank_tasks SET current_version = ? WHERE id = ?",
            (version_no, task_id),
        )
        return version_no

    async def list_task_versions(self, task_id: int, limit: int = 50, offset: int = 0) -> Dict[str, Any]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT COUNT(*) FROM bank_task_versions WHERE bank_task_id = ?",
                (task_id,),
            ) as count_cursor:
                total_row = await count_cursor.fetchone()
                total = int(total_row[0]) if total_row else 0

            async with db.execute(
                """
                SELECT id, bank_task_id, version_no, event_type, source, actor_user_id,
                       reason, rollback_from_version, changed_fields_json, created_at
                FROM bank_task_versions
                WHERE bank_task_id = ?
                ORDER BY version_no DESC
                LIMIT ? OFFSET ?
                """,
                (task_id, limit, offset),
            ) as cursor:
                rows = await cursor.fetchall()

            items: List[Dict[str, Any]] = []
            for row in rows:
                item = dict(row)
                item["changed_fields"] = self._parse_json_field(item.pop("changed_fields_json", None)) or []
                items.append(item)

            return {
                "items": items,
                "total": total,
                "limit": limit,
                "offset": offset,
                "has_more": (offset + limit) < total,
            }

    async def get_task_version(self, task_id: int, version_no: int) -> Optional[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """
                SELECT id, bank_task_id, version_no, event_type, source, actor_user_id,
                       reason, rollback_from_version, changed_fields_json, snapshot_json, created_at
                FROM bank_task_versions
                WHERE bank_task_id = ? AND version_no = ?
                LIMIT 1
                """,
                (task_id, version_no),
            ) as cursor:
                row = await cursor.fetchone()
                if not row:
                    return None

            item = dict(row)
            item["changed_fields"] = self._parse_json_field(item.pop("changed_fields_json", None)) or []
            item["snapshot"] = self._parse_json_field(item.pop("snapshot_json", None)) or {}
            return item

    async def delete_task_version(
        self,
        task_id: int,
        version_no: int,
        *,
        actor_user_id: Optional[int] = None,
        actor_email: Optional[str] = None,
    ) -> bool:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            task_row = await self._fetch_task_row(db, task_id)
            if not task_row:
                return False

            current_version_before = int(task_row.get("current_version") or 1)
            async with db.execute(
                """
                SELECT version_no, event_type, source, created_at, snapshot_json
                FROM bank_task_versions
                WHERE bank_task_id = ? AND version_no = ?
                LIMIT 1
                """,
                (task_id, version_no),
            ) as version_cursor:
                deleted_version_row = await version_cursor.fetchone()
            if not deleted_version_row:
                return False

            async with db.execute(
                """
                SELECT version_no
                FROM bank_task_versions
                WHERE bank_task_id = ?
                ORDER BY version_no ASC
                """,
                (task_id,),
            ) as versions_cursor:
                version_rows = await versions_cursor.fetchall()

            existing_versions = [int(row["version_no"]) for row in version_rows]
            if int(version_no) not in existing_versions:
                return False

            if len(existing_versions) <= 1:
                raise BankTaskVersionDeleteError("LAST_VERSION")

            delete_cursor = await db.execute(
                """
                DELETE FROM bank_task_versions
                WHERE bank_task_id = ? AND version_no = ?
                """,
                (task_id, version_no),
            )
            deleted = (delete_cursor.rowcount or 0) > 0

            current_version_after = current_version_before
            if deleted and int(version_no) == current_version_before:
                async with db.execute(
                    "SELECT MAX(version_no) AS max_version FROM bank_task_versions WHERE bank_task_id = ?",
                    (task_id,),
                ) as max_cursor:
                    max_row = await max_cursor.fetchone()
                next_current = int(max_row["max_version"]) if max_row and max_row["max_version"] is not None else None
                if next_current is None:
                    raise BankTaskVersionDeleteError("LAST_VERSION")
                await db.execute(
                    """
                    UPDATE bank_tasks
                    SET current_version = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (next_current, task_id),
                )
                current_version_after = next_current

            if deleted:
                deleted_snapshot = self._parse_json_field(deleted_version_row["snapshot_json"]) or {}
                deleted_text_preview = ""
                if isinstance(deleted_snapshot, dict):
                    deleted_text_preview = self._build_text_preview(deleted_snapshot.get("text"))
                await self._record_admin_audit_event(
                    db,
                    action=self.AUDIT_ACTION_VERSION_DELETE,
                    entity_type="bank_task",
                    entity_id=task_id,
                    actor_user_id=actor_user_id,
                    actor_email=actor_email,
                    summary=f"Permanently deleted version v{int(version_no)} for task #{task_id}",
                    changed_fields=["version_history"],
                    metadata={
                        "deleted_version_no": int(version_no),
                        "deleted_version_event_type": deleted_version_row["event_type"],
                        "deleted_version_source": deleted_version_row["source"],
                        "deleted_version_created_at": deleted_version_row["created_at"],
                        "current_version_before": current_version_before,
                        "current_version_after": current_version_after,
                        "was_current_version": int(version_no) == current_version_before,
                        "deleted_version_text_preview": deleted_text_preview,
                    },
                )

            await db.commit()
            return deleted

    async def rollback_task(
        self,
        task_id: int,
        target_version: int,
        actor_user_id: Optional[int] = None,
        actor_email: Optional[str] = None,
        source: Optional[str] = "admin_bank_rollback",
        reason: Optional[str] = None,
        expected_current_version: Optional[int] = None,
    ) -> Optional[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            current_row = await self._fetch_task_row(db, task_id)
            if not current_row or current_row.get("deleted_at") is not None:
                return None

            previous_current_version = int(current_row.get("current_version") or 1)
            if expected_current_version is not None and int(expected_current_version) != previous_current_version:
                raise BankTaskVersionConflictError(f"VERSION_CONFLICT:{previous_current_version}")

            async with db.execute(
                """
                SELECT snapshot_json
                FROM bank_task_versions
                WHERE bank_task_id = ? AND version_no = ?
                """,
                (task_id, target_version),
            ) as cursor:
                version_row = await cursor.fetchone()
            if not version_row:
                return None

            target_snapshot = self._parse_json_field(version_row["snapshot_json"])
            if not isinstance(target_snapshot, dict):
                return None

            current_topics = await self._fetch_topics_for_task(db, task_id)
            before_snapshot = self._build_snapshot(current_row, current_topics)

            await db.execute(
                """
                UPDATE bank_tasks
                SET text = ?,
                    answer = ?,
                    question_type = ?,
                    options = ?,
                    subquestions = ?,
                    difficulty = ?,
                    image_filename = ?,
                    solution_filename = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (
                    target_snapshot.get("text") or "",
                    target_snapshot.get("answer") or "",
                    target_snapshot.get("question_type") or "input",
                    self._to_json_text(target_snapshot.get("options")),
                    self._to_json_text(target_snapshot.get("subquestions")),
                    target_snapshot.get("difficulty") or "B",
                    target_snapshot.get("image_filename"),
                    target_snapshot.get("solution_filename"),
                    task_id,
                ),
            )
            await self._set_task_topics(db, task_id, self._normalize_topics(target_snapshot.get("topics") or []))

            updated_row = await self._fetch_task_row(db, task_id)
            if not updated_row:
                await db.commit()
                return None
            updated_topics = await self._fetch_topics_for_task(db, task_id)
            after_snapshot = self._build_snapshot(updated_row, updated_topics)
            changed_fields = self._changed_fields(before_snapshot, after_snapshot)
            new_current_version = previous_current_version
            if changed_fields:
                await self._record_version_event(
                    db,
                    task_id=task_id,
                    event_type="rollback",
                    snapshot=after_snapshot,
                    changed_fields=changed_fields,
                    source=source,
                    actor_user_id=actor_user_id,
                    reason=reason,
                    rollback_from_version=int(target_version),
                    initial=False,
                )
                new_current_version = previous_current_version + 1
            await self._record_admin_audit_event(
                db,
                action=self.AUDIT_ACTION_ROLLBACK,
                entity_type="bank_task",
                entity_id=task_id,
                actor_user_id=actor_user_id,
                actor_email=actor_email,
                summary=f"Rolled back task #{task_id} to version v{int(target_version)}",
                changed_fields=changed_fields,
                metadata={
                    "target_version": int(target_version),
                    "previous_current_version": previous_current_version,
                    "new_current_version": new_current_version,
                    "reason": reason if isinstance(reason, str) else None,
                },
            )
            await db.commit()

        return await self.get_task_by_id(task_id, include_deleted=True)
