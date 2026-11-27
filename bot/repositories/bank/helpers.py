"""
Shared constants, normalisation and row/snapshot helpers.
"""
from typing import Optional, List, Dict, Any
import json
import storage as db_driver
from utils.validation import normalize_accepted_answers, normalize_answer_mode


_TAXONOMY_TABLES = {
    "topic": ("bank_topics", "bank_task_topic_map", "topic_id"),
    "source": ("bank_sources", "bank_task_source_map", "source_id"),
}


def _is_missing_parent_column_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return "parent_id" in message and (
        "does not exist" in message or "undefinedcolumn" in message or "no such column" in message
    )


def _row_value(row: Any, index: int, key: str) -> Any:
    if isinstance(row, dict):
        return row.get(key)
    return row[index]


async def fetch_sources_map_safe(repo: Any, db: db_driver.Connection, task_ids: List[int]) -> Dict[int, List[str]]:
    """Fetch sources when BankTaskHelpersMixin is mixed in; tolerate slim mixin test doubles."""
    fetcher = getattr(repo, "_fetch_sources_map", None)
    if callable(fetcher):
        return await fetcher(db, task_ids)
    return {}


async def fetch_sources_for_task_safe(repo: Any, db: db_driver.Connection, task_id: int) -> List[str]:
    fetcher = getattr(repo, "_fetch_sources_for_task", None)
    if callable(fetcher):
        return await fetcher(db, task_id)
    return []


def with_snapshot_sources(snapshot: Dict[str, Any], sources: Optional[List[str]]) -> Dict[str, Any]:
    if sources is not None and isinstance(snapshot, dict):
        snapshot["sources"] = list(sources)
    return snapshot


class BankTaskHelpersMixin:
    SNAPSHOT_FIELDS = (
        "text",
        "answer",
        "question_type",
        "answer_mode",
        "accepted_answers",
        "text_scale",
        "options",
        "subquestions",
        "difficulty",
        "topics",
        "sources",
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
    def _build_snapshot(cls, row: Dict[str, Any], topics: List[str], sources: Optional[List[str]] = None) -> Dict[str, Any]:
        return {
            "text": row.get("text") or "",
            "answer": row.get("answer") or "",
            "question_type": row.get("question_type") or "input",
            "answer_mode": normalize_answer_mode(row.get("answer_mode"), row.get("question_type")),
            "accepted_answers": normalize_accepted_answers(row.get("accepted_answers")),
            "text_scale": row.get("text_scale") or "md",
            "options": cls._parse_json_field(row.get("options")),
            "subquestions": cls._parse_json_field(row.get("subquestions")),
            "difficulty": row.get("difficulty") or "B",
            "topics": topics,
            "sources": list(sources or []),
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

    def _serialize_task_row(
        self,
        row: db_driver.Row,
        topics: Optional[List[str]] = None,
        sources: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        item = dict(row)
        item["options"] = self._parse_json_field(item.get("options"))
        item["subquestions"] = self._parse_json_field(item.get("subquestions"))
        item["accepted_answers"] = normalize_accepted_answers(item.get("accepted_answers"))
        item["text_scale"] = item.get("text_scale") or "md"
        item["answer_mode"] = normalize_answer_mode(item.get("answer_mode"), item.get("question_type"))
        item["topics"] = topics or []
        item["sources"] = sources or []
        return item

    async def _fetch_labels_map(self, db: db_driver.Connection, task_ids: List[int], kind: str) -> Dict[int, List[str]]:
        if not task_ids:
            return {}
        item_table, map_table, fk_col = _TAXONOMY_TABLES[kind]
        unique_ids = list(dict.fromkeys(task_ids))
        labels_map: Dict[int, List[str]] = {task_id: [] for task_id in unique_ids}
        chunk_size = 500
        for start in range(0, len(unique_ids), chunk_size):
            chunk = unique_ids[start:start + chunk_size]
            placeholders = ",".join(["?"] * len(chunk))
            query = f"""
                SELECT m.bank_task_id, t.name
                FROM {map_table} m
                JOIN {item_table} t ON t.id = m.{fk_col}
                WHERE m.bank_task_id IN ({placeholders})
                ORDER BY LOWER(t.name COLLATE "pg_c_utf8") ASC
            """
            async with db.execute(query, chunk) as cursor:
                rows = await cursor.fetchall()
                for row in rows:
                    labels_map[row["bank_task_id"]].append(row["name"])
        return labels_map

    async def _fetch_topics_map(self, db: db_driver.Connection, task_ids: List[int]) -> Dict[int, List[str]]:
        return await self._fetch_labels_map(db, task_ids, "topic")

    async def _fetch_sources_map(self, db: db_driver.Connection, task_ids: List[int]) -> Dict[int, List[str]]:
        return await self._fetch_labels_map(db, task_ids, "source")

    async def _fetch_topics_for_task(self, db: db_driver.Connection, task_id: int) -> List[str]:
        topics_map = await self._fetch_topics_map(db, [task_id])
        return topics_map.get(task_id, [])

    async def _fetch_sources_for_task(self, db: db_driver.Connection, task_id: int) -> List[str]:
        sources_map = await self._fetch_sources_map(db, [task_id])
        return sources_map.get(task_id, [])

    async def _fetch_task_row(self, db: db_driver.Connection, task_id: int) -> Optional[Dict[str, Any]]:
        async with db.execute("SELECT * FROM bank_tasks WHERE id = ?", (task_id,)) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None

    async def _ensure_task_label(self, db: db_driver.Connection, task_id: int, label: str, kind: str) -> None:
        item_table, map_table, fk_col = _TAXONOMY_TABLES[kind]
        cleaned = self._normalize_topics([label])
        if not cleaned:
            return
        canonical = cleaned[0]
        name_norm = self._normalize_topic(canonical)
        await db.execute(
            f"INSERT INTO {item_table} (name, name_norm) VALUES (?, ?) ON CONFLICT DO NOTHING",
            (canonical, name_norm),
        )
        async with db.execute(
            f"SELECT id FROM {item_table} WHERE name_norm = ?",
            (name_norm,),
        ) as label_cursor:
            label_row = await label_cursor.fetchone()
        if not label_row:
            return
        await db.execute(
            f"INSERT INTO {map_table} (bank_task_id, {fk_col}) VALUES (?, ?) ON CONFLICT DO NOTHING",
            (task_id, label_row[0]),
        )

    async def _set_task_labels(self, db: db_driver.Connection, task_id: int, labels: List[str], kind: str) -> None:
        _, map_table, _ = _TAXONOMY_TABLES[kind]
        await db.execute(f"DELETE FROM {map_table} WHERE bank_task_id = ?", (task_id,))
        for label in self._normalize_topics(labels):
            await self._ensure_task_label(db, task_id, label, kind)

    async def _expand_topic_ancestors(
        self,
        db: db_driver.Connection,
        topics: Optional[List[str]],
    ) -> List[str]:
        """Append missing parent/root topics via bank_topics.parent_id.

        Uses canonical DB names for existing topics, walks parent_id up to 64
        hops with cycle protection, and falls back to normalized inputs if the
        parent_id column is not yet present.
        """
        normalized = self._normalize_topics(topics)
        if not normalized:
            return []

        name_norms = [self._normalize_topic(label) for label in normalized]
        placeholders = ",".join(["?"] * len(name_norms))
        try:
            async with db.execute(
                f"""
                SELECT id, name, name_norm, parent_id
                FROM bank_topics
                WHERE name_norm IN ({placeholders})
                """,
                name_norms,
            ) as cursor:
                initial_rows = await cursor.fetchall()
        except Exception as exc:
            if _is_missing_parent_column_error(exc):
                return normalized
            raise

        if not initial_rows:
            return normalized

        canonical_by_norm: Dict[str, str] = {}
        visited_ids: set[int] = set()
        pending_parent_ids: set[int] = set()
        for row in initial_rows:
            row_id = int(_row_value(row, 0, "id"))
            row_name = _row_value(row, 1, "name")
            row_norm = _row_value(row, 2, "name_norm")
            row_parent_id = _row_value(row, 3, "parent_id")
            visited_ids.add(row_id)
            if row_norm and row_name:
                canonical_by_norm[row_norm] = row_name
            if row_parent_id is not None:
                pending_parent_ids.add(int(row_parent_id))

        pending_parent_ids.difference_update(visited_ids)
        ancestor_names: List[str] = []
        hops = 0
        while pending_parent_ids and hops < 64:
            hops += 1
            batch_ids = sorted(pending_parent_ids)
            pending_parent_ids = set()
            id_placeholders = ",".join(["?"] * len(batch_ids))
            async with db.execute(
                f"""
                SELECT id, name, parent_id
                FROM bank_topics
                WHERE id IN ({id_placeholders})
                """,
                batch_ids,
            ) as cursor:
                parent_rows = await cursor.fetchall()
            for row in parent_rows:
                pid = int(_row_value(row, 0, "id"))
                if pid in visited_ids:
                    continue
                visited_ids.add(pid)
                parent_name = _row_value(row, 1, "name")
                if parent_name:
                    ancestor_names.append(parent_name)
                next_parent_id = _row_value(row, 2, "parent_id")
                if next_parent_id is not None:
                    next_pid = int(next_parent_id)
                    if next_pid not in visited_ids:
                        pending_parent_ids.add(next_pid)

        resolved_inputs = [
            canonical_by_norm.get(self._normalize_topic(label), label)
            for label in normalized
        ]
        return self._normalize_topics([*resolved_inputs, *ancestor_names])

    async def _set_task_topics(self, db: db_driver.Connection, task_id: int, topics: List[str]) -> None:
        expanded = await self._expand_topic_ancestors(db, topics)
        await self._set_task_labels(db, task_id, expanded, "topic")

    async def _set_task_sources(self, db: db_driver.Connection, task_id: int, sources: List[str]) -> None:
        await self._set_task_labels(db, task_id, sources, "source")

    async def _ensure_task_source(self, db: db_driver.Connection, task_id: int, source: str) -> None:
        await self._ensure_task_label(db, task_id, source, "source")
