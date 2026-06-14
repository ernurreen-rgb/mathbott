"""
Content-quality reports (dead, untopiced, duplicate clusters).
"""
from typing import Optional, List, Dict, Any
from difflib import SequenceMatcher
import aiosqlite


class BankTaskQualityMixin:
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
                where.append("LOWER(bt.text) LIKE ? ESCAPE '\\'")
                params.append(self._contains_like_pattern(cleaned_search))

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
                where.append("LOWER(bt.text) LIKE ? ESCAPE '\\'")
                params.append(self._contains_like_pattern(cleaned_search))

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
