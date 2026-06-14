"""
Admin audit log writing and listing.
"""
from typing import Optional, List, Dict, Any
import json
import aiosqlite


class BankTaskAuditMixin:
    async def _record_admin_audit_event(
        self,
        db: aiosqlite.Connection,
        *,
        action: str,
        entity_type: str,
        entity_id: Optional[int],
        actor_user_id: Optional[int],
        actor_email: Optional[str],
        summary: str,
        changed_fields: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> int:
        changed_fields_value = changed_fields or []
        metadata_value = metadata or {}
        email_value = " ".join((actor_email or "").strip().split()).lower() or "unknown"
        cursor = await db.execute(
            """
            INSERT INTO admin_audit_logs
            (
                domain, action, entity_type, entity_id,
                actor_user_id, actor_email, summary,
                changed_fields_json, metadata_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                self.AUDIT_DOMAIN_BANK,
                action,
                entity_type,
                entity_id,
                actor_user_id,
                email_value,
                summary,
                json.dumps(changed_fields_value, ensure_ascii=False),
                json.dumps(metadata_value, ensure_ascii=False),
            ),
        )
        return int(cursor.lastrowid)

    async def list_admin_audit_logs(
        self,
        *,
        action: Optional[str] = None,
        task_id: Optional[int] = None,
        actor_email: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> Dict[str, Any]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            where = ["domain = ?"]
            params: List[Any] = [self.AUDIT_DOMAIN_BANK]

            if action:
                where.append("action = ?")
                params.append(action)
            if task_id is not None:
                where.append("entity_type = ?")
                params.append("bank_task")
                where.append("entity_id = ?")
                params.append(int(task_id))
            cleaned_actor_email = " ".join((actor_email or "").strip().split()).lower()
            if cleaned_actor_email:
                where.append("LOWER(actor_email) LIKE ? ESCAPE '\\'")
                params.append(self._contains_like_pattern(cleaned_actor_email))

            where_clause = " AND ".join(where)
            async with db.execute(
                f"SELECT COUNT(*) FROM admin_audit_logs WHERE {where_clause}",
                params,
            ) as count_cursor:
                row = await count_cursor.fetchone()
                total = int(row[0]) if row else 0

            async with db.execute(
                f"""
                SELECT id, domain, action, entity_type, entity_id, actor_user_id, actor_email,
                       summary, changed_fields_json, metadata_json, created_at
                FROM admin_audit_logs
                WHERE {where_clause}
                ORDER BY created_at DESC, id DESC
                LIMIT ? OFFSET ?
                """,
                [*params, limit, offset],
            ) as cursor:
                rows = await cursor.fetchall()

            items: List[Dict[str, Any]] = []
            for row in rows:
                item = dict(row)
                item["changed_fields"] = self._parse_json_field(item.pop("changed_fields_json", None)) or []
                item["metadata"] = self._parse_json_field(item.pop("metadata_json", None)) or {}
                items.append(item)

            return {
                "items": items,
                "total": total,
                "limit": limit,
                "offset": offset,
                "has_more": (offset + limit) < total,
            }
