"""
Shared constants, normalisation and row/snapshot helpers.
"""
from typing import Optional, List, Dict, Any
import json
import aiosqlite


class BankTaskHelpersMixin:
    SNAPSHOT_FIELDS = (
        "text",
        "answer",
        "question_type",
        "text_scale",
        "options",
        "subquestions",
        "difficulty",
        "topics",
        "image_filename",
        "solution_filename",
    )
    AUDIT_ACTION_IMPORT_CONFIRM = "import_confirm"
    AUDIT_ACTION_VERSION_DELETE = "version_delete"
    AUDIT_ACTION_ROLLBACK = "rollback"
    AUDIT_ACTION_HARD_DELETE = "hard_delete"
    AUDIT_DOMAIN_BANK = "bank"

    @staticmethod
    def _build_text_preview(value: Optional[str], limit: int = 120) -> str:
        text = " ".join((value or "").split())
        if len(text) <= limit:
            return text
        return f"{text[:limit]}..."

    @staticmethod
    def _normalize_topic(name: str) -> str:
        return " ".join((name or "").strip().split()).lower()

    @staticmethod
    def _normalize_topics(topics: Optional[List[str]]) -> List[str]:
        if not topics:
            return []
        seen: set[str] = set()
        normalized: List[str] = []
        for topic in topics:
            cleaned = " ".join((topic or "").strip().split())
            if not cleaned:
                continue
            norm = cleaned.lower()
            if norm in seen:
                continue
            seen.add(norm)
            normalized.append(cleaned)
        return normalized

    @staticmethod
    def _parse_json_field(value: Any) -> Any:
        if value is None:
            return None
        if isinstance(value, (list, dict)):
            return value
        if isinstance(value, str):
            try:
                return json.loads(value)
            except Exception:
                return None
        return None

    @staticmethod
    def _to_json_text(value: Any) -> Optional[str]:
        if value is None:
            return None
        if isinstance(value, str):
            return value
        try:
            return json.dumps(value, ensure_ascii=False)
        except Exception:
            return None

    @classmethod
    def _build_snapshot(cls, row: Dict[str, Any], topics: List[str]) -> Dict[str, Any]:
        return {
            "text": row.get("text") or "",
            "answer": row.get("answer") or "",
            "question_type": row.get("question_type") or "input",
            "text_scale": row.get("text_scale") or "md",
            "options": cls._parse_json_field(row.get("options")),
            "subquestions": cls._parse_json_field(row.get("subquestions")),
            "difficulty": row.get("difficulty") or "B",
            "topics": topics,
            "image_filename": row.get("image_filename"),
            "solution_filename": row.get("solution_filename"),
        }

    @classmethod
    def _changed_fields(cls, before: Dict[str, Any], after: Dict[str, Any]) -> List[str]:
        changed: List[str] = []
        for field in cls.SNAPSHOT_FIELDS:
            if before.get(field) != after.get(field):
                changed.append(field)
        return changed

    def _serialize_task_row(self, row: aiosqlite.Row, topics: Optional[List[str]] = None) -> Dict[str, Any]:
        item = dict(row)
        item["options"] = self._parse_json_field(item.get("options"))
        item["subquestions"] = self._parse_json_field(item.get("subquestions"))
        item["text_scale"] = item.get("text_scale") or "md"
        item["topics"] = topics or []
        return item

    async def _fetch_topics_map(self, db: aiosqlite.Connection, task_ids: List[int]) -> Dict[int, List[str]]:
        if not task_ids:
            return {}
        placeholders = ",".join(["?"] * len(task_ids))
        query = f"""
            SELECT m.bank_task_id, t.name
            FROM bank_task_topic_map m
            JOIN bank_topics t ON t.id = m.topic_id
            WHERE m.bank_task_id IN ({placeholders})
            ORDER BY t.name COLLATE NOCASE ASC
        """
        topics_map: Dict[int, List[str]] = {task_id: [] for task_id in task_ids}
        async with db.execute(query, task_ids) as cursor:
            rows = await cursor.fetchall()
            for row in rows:
                topics_map[row["bank_task_id"]].append(row["name"])
        return topics_map

    async def _fetch_topics_for_task(self, db: aiosqlite.Connection, task_id: int) -> List[str]:
        topics_map = await self._fetch_topics_map(db, [task_id])
        return topics_map.get(task_id, [])

    async def _fetch_task_row(self, db: aiosqlite.Connection, task_id: int) -> Optional[Dict[str, Any]]:
        async with db.execute("SELECT * FROM bank_tasks WHERE id = ?", (task_id,)) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None

    async def _set_task_topics(self, db: aiosqlite.Connection, task_id: int, topics: List[str]) -> None:
        await db.execute("DELETE FROM bank_task_topic_map WHERE bank_task_id = ?", (task_id,))
        normalized_topics = self._normalize_topics(topics)
        if not normalized_topics:
            return
        for topic in normalized_topics:
            name_norm = self._normalize_topic(topic)
            await db.execute(
                "INSERT OR IGNORE INTO bank_topics (name, name_norm) VALUES (?, ?)",
                (topic, name_norm),
            )
            async with db.execute(
                "SELECT id FROM bank_topics WHERE name_norm = ?",
                (name_norm,),
            ) as topic_cursor:
                topic_row = await topic_cursor.fetchone()
            if not topic_row:
                continue
            topic_id = topic_row[0]
            await db.execute(
                "INSERT OR IGNORE INTO bank_task_topic_map (bank_task_id, topic_id) VALUES (?, ?)",
                (task_id, topic_id),
            )
