"""
Repository for bank task operations.
"""
import json
from difflib import SequenceMatcher
from typing import Optional, List, Dict, Any

import aiosqlite

from .base import BaseRepository
from utils.file_storage import delete_image_file


class BankTaskVersionConflictError(Exception):
    """Raised when optimistic version lock fails for a bank task update."""


class BankTaskVersionDeleteError(Exception):
    """Raised when deleting a bank task version is not allowed."""


class BankTaskRepository(BaseRepository):
    """Repository for bank task CRUD, history, usage and similarity checks."""

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
    def _normalize_similarity_text(value: Optional[str]) -> str:
        return " ".join((value or "").lower().split())

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
    def _normalize_options_for_similarity(cls, options: Any) -> str:
        parsed = cls._parse_json_field(options)
        if not isinstance(parsed, list):
            return ""
        normalized_rows: List[str] = []
        for item in parsed:
            if not isinstance(item, dict):
                continue
            label = cls._normalize_similarity_text(str(item.get("label") or ""))
            text = cls._normalize_similarity_text(str(item.get("text") or ""))
            if not label and not text:
                continue
            normalized_rows.append(f"{label}:{text}")
        normalized_rows.sort()
        return " | ".join(normalized_rows)

    @classmethod
    def _build_similarity_blob(cls, text: Optional[str], options: Any) -> str:
        normalized_text = cls._normalize_similarity_text(text)
        normalized_options = cls._normalize_options_for_similarity(options)
        if normalized_options:
            return f"{normalized_text} || {normalized_options}"
        return normalized_text

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
                where.append("LOWER(actor_email) LIKE ?")
                params.append(f"%{cleaned_actor_email}%")

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
                where.append("LOWER(bt.text) LIKE ?")
                params.append(f"%{cleaned_search}%")

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

            query_params = [*params, limit, offset]
            async with db.execute(
                f"""
                SELECT bt.*
                FROM bank_tasks bt
                WHERE {where_clause}
                ORDER BY bt.updated_at DESC, bt.id DESC
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

    async def get_quality_summary(self) -> Dict[str, Any]:
        async with self._connection() as db:
            active_total = 0
            dead_total = 0
            no_topics_total = 0

            async with db.execute(
                "SELECT COUNT(*) FROM bank_tasks bt WHERE bt.deleted_at IS NULL"
            ) as cursor:
                row = await cursor.fetchone()
                active_total = int(row[0]) if row else 0

            async with db.execute(
                """
                SELECT COUNT(*)
                FROM bank_tasks bt
                WHERE bt.deleted_at IS NULL
                  AND NOT EXISTS (
                      SELECT 1
                      FROM tasks t
                      WHERE t.bank_task_id = bt.id AND t.deleted_at IS NULL
                  )
                  AND NOT EXISTS (
                      SELECT 1
                      FROM trial_test_tasks ttt
                      WHERE ttt.bank_task_id = bt.id AND ttt.deleted_at IS NULL
                  )
                """
            ) as cursor:
                row = await cursor.fetchone()
                dead_total = int(row[0]) if row else 0

            async with db.execute(
                """
                SELECT COUNT(*)
                FROM bank_tasks bt
                WHERE bt.deleted_at IS NULL
                  AND NOT EXISTS (
                      SELECT 1
                      FROM bank_task_topic_map m
                      WHERE m.bank_task_id = bt.id
                  )
                """
            ) as cursor:
                row = await cursor.fetchone()
                no_topics_total = int(row[0]) if row else 0

            return {
                "active_total": active_total,
                "dead_total": dead_total,
                "no_topics_total": no_topics_total,
            }

    async def _list_quality_tasks(
        self,
        *,
        base_where: List[str],
        search: Optional[str] = None,
        difficulty: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> Dict[str, Any]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            where = list(base_where)
            params: List[Any] = []

            cleaned_search = (search or "").strip().lower()
            if cleaned_search:
                where.append("LOWER(bt.text) LIKE ?")
                params.append(f"%{cleaned_search}%")

            if difficulty:
                where.append("bt.difficulty = ?")
                params.append(difficulty)

            where_clause = " AND ".join(where)
            async with db.execute(
                f"SELECT COUNT(*) FROM bank_tasks bt WHERE {where_clause}",
                params,
            ) as count_cursor:
                total_row = await count_cursor.fetchone()
                total = int(total_row[0]) if total_row else 0

            query_params = [*params, limit, offset]
            async with db.execute(
                f"""
                SELECT bt.*
                FROM bank_tasks bt
                WHERE {where_clause}
                ORDER BY bt.updated_at DESC, bt.id DESC
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
                task_id = int(row["id"])
                item = self._serialize_task_row(row, topics_map.get(task_id, []))
                item["active_usage_count"] = usage_counts.get(task_id, 0)
                item["current_version"] = int(item.get("current_version") or 1)
                items.append(item)

            return {
                "items": items,
                "total": total,
                "limit": limit,
                "offset": offset,
                "has_more": (offset + limit) < total,
            }

    async def list_quality_dead_tasks(
        self,
        *,
        search: Optional[str] = None,
        difficulty: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> Dict[str, Any]:
        return await self._list_quality_tasks(
            base_where=[
                "bt.deleted_at IS NULL",
                """
                NOT EXISTS (
                    SELECT 1
                    FROM tasks t
                    WHERE t.bank_task_id = bt.id AND t.deleted_at IS NULL
                )
                """,
                """
                NOT EXISTS (
                    SELECT 1
                    FROM trial_test_tasks ttt
                    WHERE ttt.bank_task_id = bt.id AND ttt.deleted_at IS NULL
                )
                """,
            ],
            search=search,
            difficulty=difficulty,
            limit=limit,
            offset=offset,
        )

    async def list_quality_no_topics_tasks(
        self,
        *,
        search: Optional[str] = None,
        difficulty: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> Dict[str, Any]:
        return await self._list_quality_tasks(
            base_where=[
                "bt.deleted_at IS NULL",
                """
                NOT EXISTS (
                    SELECT 1
                    FROM bank_task_topic_map m
                    WHERE m.bank_task_id = bt.id
                )
                """,
            ],
            search=search,
            difficulty=difficulty,
            limit=limit,
            offset=offset,
        )

    async def list_quality_duplicate_clusters(
        self,
        *,
        threshold: float = 0.92,
        search: Optional[str] = None,
        difficulty: Optional[str] = None,
        question_type: Optional[str] = None,
        limit: int = 10,
        offset: int = 0,
    ) -> Dict[str, Any]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            where = ["bt.deleted_at IS NULL"]
            params: List[Any] = []

            cleaned_search = (search or "").strip().lower()
            if cleaned_search:
                where.append("LOWER(bt.text) LIKE ?")
                params.append(f"%{cleaned_search}%")

            if difficulty:
                where.append("bt.difficulty = ?")
                params.append(difficulty)

            if question_type:
                where.append("bt.question_type = ?")
                params.append(question_type)

            where_clause = " AND ".join(where)
            async with db.execute(
                f"""
                SELECT bt.id, bt.text, bt.question_type, bt.options, bt.difficulty, bt.updated_at, bt.current_version
                FROM bank_tasks bt
                WHERE {where_clause}
                ORDER BY bt.updated_at DESC, bt.id DESC
                """,
                params,
            ) as cursor:
                rows = await cursor.fetchall()

            if not rows:
                return {
                    "threshold": float(threshold),
                    "items": [],
                    "total_clusters": 0,
                    "total_tasks_in_clusters": 0,
                    "limit": limit,
                    "offset": offset,
                    "has_more": False,
                }

            task_ids = [int(row["id"]) for row in rows]
            topics_map = await self._fetch_topics_map(db, task_ids)
            usage_counts = await self._fetch_active_usage_counts(db, task_ids)

        candidates_by_id: Dict[int, Dict[str, Any]] = {}
        grouped: Dict[str, List[Dict[str, Any]]] = {}
        for row in rows:
            task_id = int(row["id"])
            normalized_question_type = row["question_type"] or "input"
            candidate = {
                "id": task_id,
                "text": row["text"] or "",
                "question_type": normalized_question_type,
                "difficulty": row["difficulty"] or "B",
                "updated_at": row["updated_at"],
                "current_version": int(row["current_version"] or 1),
                "topics": topics_map.get(task_id, []),
                "active_usage_count": int(usage_counts.get(task_id, 0)),
                "similarity_blob": self._build_similarity_blob(row["text"], row["options"]),
            }
            candidates_by_id[task_id] = candidate
            grouped.setdefault(normalized_question_type, []).append(candidate)

        parent: Dict[int, int] = {task_id: task_id for task_id in candidates_by_id}
        rank: Dict[int, int] = {task_id: 0 for task_id in candidates_by_id}

        def find(task_id: int) -> int:
            root = parent[task_id]
            if root != task_id:
                parent[task_id] = find(root)
            return parent[task_id]

        def union(left_id: int, right_id: int) -> None:
            left_root = find(left_id)
            right_root = find(right_id)
            if left_root == right_root:
                return
            if rank[left_root] < rank[right_root]:
                parent[left_root] = right_root
            elif rank[left_root] > rank[right_root]:
                parent[right_root] = left_root
            else:
                parent[right_root] = left_root
                rank[left_root] += 1

        edges: List[tuple[int, int, float]] = []
        nodes_with_edges: set[int] = set()
        best_scores: Dict[int, float] = {task_id: 0.0 for task_id in candidates_by_id}

        for entries in grouped.values():
            entries_count = len(entries)
            if entries_count < 2:
                continue
            for i in range(entries_count):
                first = entries[i]
                first_blob = first.get("similarity_blob") or ""
                if not first_blob:
                    continue
                for j in range(i + 1, entries_count):
                    second = entries[j]
                    second_blob = second.get("similarity_blob") or ""
                    if not second_blob:
                        continue
                    score = SequenceMatcher(None, first_blob, second_blob).ratio()
                    if score < threshold:
                        continue
                    first_id = int(first["id"])
                    second_id = int(second["id"])
                    union(first_id, second_id)
                    nodes_with_edges.add(first_id)
                    nodes_with_edges.add(second_id)
                    edges.append((first_id, second_id, float(score)))
                    if score > best_scores[first_id]:
                        best_scores[first_id] = float(score)
                    if score > best_scores[second_id]:
                        best_scores[second_id] = float(score)

        if not nodes_with_edges:
            return {
                "threshold": float(threshold),
                "items": [],
                "total_clusters": 0,
                "total_tasks_in_clusters": 0,
                "limit": limit,
                "offset": offset,
                "has_more": False,
            }

        components: Dict[int, List[int]] = {}
        for task_id in nodes_with_edges:
            root = find(task_id)
            components.setdefault(root, []).append(task_id)

        cluster_max_scores: Dict[int, float] = {}
        for left_id, _, score in edges:
            root = find(left_id)
            cluster_max_scores[root] = max(cluster_max_scores.get(root, 0.0), float(score))

        clusters: List[Dict[str, Any]] = []
        for root, member_ids in components.items():
            if len(member_ids) < 2:
                continue
            members_source = [candidates_by_id[task_id] for task_id in member_ids]
            members_source.sort(
                key=lambda item: ((item.get("updated_at") or ""), int(item.get("id") or 0)),
                reverse=True,
            )
            members = [
                {
                    "id": int(item["id"]),
                    "text": item["text"],
                    "question_type": item["question_type"],
                    "difficulty": item["difficulty"],
                    "topics": item["topics"],
                    "active_usage_count": int(item["active_usage_count"]),
                    "updated_at": item["updated_at"],
                    "current_version": int(item["current_version"] or 1),
                    "best_match_score": round(float(best_scores.get(int(item["id"]), 0.0)), 4),
                }
                for item in members_source
            ]

            clusters.append(
                {
                    "cluster_id": "-".join(str(task_id) for task_id in sorted(member_ids)),
                    "size": len(member_ids),
                    "max_score": round(float(cluster_max_scores.get(root, 0.0)), 4),
                    "members": members,
                    "_latest_updated_at": members_source[0].get("updated_at") if members_source else "",
                }
            )

        clusters.sort(
            key=lambda item: (
                int(item["size"]),
                float(item["max_score"]),
                item.get("_latest_updated_at") or "",
            ),
            reverse=True,
        )

        total_clusters = len(clusters)
        total_tasks_in_clusters = sum(int(item["size"]) for item in clusters)
        page_items = clusters[offset : offset + limit]
        for item in page_items:
            item.pop("_latest_updated_at", None)

        return {
            "threshold": float(threshold),
            "items": page_items,
            "total_clusters": total_clusters,
            "total_tasks_in_clusters": total_tasks_in_clusters,
            "limit": limit,
            "offset": offset,
            "has_more": (offset + limit) < total_clusters,
        }

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
                like_value = f"%{normalized_query}%"
                sql = """
                    SELECT name
                    FROM bank_topics
                    WHERE name_norm LIKE ?
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

    async def find_similar_tasks(
        self,
        *,
        text: str,
        options: Optional[List[Dict[str, Any]]] = None,
        question_type: Optional[str] = None,
        exclude_task_id: Optional[int] = None,
        threshold: float = 0.8,
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        base_blob = self._build_similarity_blob(text, options)
        if not base_blob:
            return []

        scan_limit = max(limit * 25, 250)
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            where_parts = ["deleted_at IS NULL"]
            params: List[Any] = []
            if exclude_task_id is not None:
                where_parts.append("id != ?")
                params.append(exclude_task_id)
            if question_type:
                where_parts.append("question_type = ?")
                params.append(question_type)
            where_clause = " AND ".join(where_parts)
            async with db.execute(
                f"""
                SELECT id, text, question_type, options, difficulty, updated_at
                FROM bank_tasks
                WHERE {where_clause}
                ORDER BY updated_at DESC, id DESC
                LIMIT ?
                """,
                [*params, scan_limit],
            ) as cursor:
                rows = await cursor.fetchall()

        candidates: List[Dict[str, Any]] = []
        for row in rows:
            candidate_blob = self._build_similarity_blob(row["text"], row["options"])
            if not candidate_blob:
                continue
            score = SequenceMatcher(None, base_blob, candidate_blob).ratio()
            if score < threshold:
                continue
            candidates.append(
                {
                    "id": int(row["id"]),
                    "text": row["text"] or "",
                    "question_type": row["question_type"] or "input",
                    "difficulty": row["difficulty"] or "B",
                    "score": round(float(score), 4),
                    "updated_at": row["updated_at"],
                }
            )
        candidates.sort(key=lambda item: (-float(item["score"]), item.get("id", 0)))
        return candidates[:limit]

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
