"""Lightweight library navigation, independent of the review-only quality reports."""
from typing import Optional, Dict, Any

import storage as db_driver

from .crud import _is_missing_parent_column_error
from .helpers import _TAXONOMY_TABLES
from .twins import IS_TWIN_SQL, NOT_TWIN_SQL


class BankTaskCatalogMixin:
    async def _get_taxonomy_catalog(
        self,
        db: db_driver.Connection,
        kind: str,
        *,
        query: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> tuple[list[Dict[str, Any]], int]:
        item_table, map_table, fk_col = _TAXONOMY_TABLES[kind]
        normalized_query = self._normalize_topic(query or "")
        condition = "AND t.name_norm LIKE ? ESCAPE '\\'" if normalized_query else ""
        params = [self._contains_like_pattern(normalized_query)] if normalized_query else []
        async with db.execute(f"""
            SELECT COUNT(DISTINCT t.id) AS total
            FROM {item_table} t
            JOIN {map_table} m ON m.{fk_col} = t.id
            JOIN bank_tasks bt ON bt.id = m.bank_task_id AND bt.deleted_at IS NULL AND {NOT_TWIN_SQL}
            WHERE 1 = 1 {condition}
        """, params) as cursor:
            total = int((await cursor.fetchone())["total"])
        limit_clause = " LIMIT ?" if limit is not None else ""
        exec_params = [*params, limit] if limit is not None else list(params)
        if kind == "topic":
            try:
                async with db.execute(f"""
                    SELECT t.id, t.name, t.parent_id, p.name AS parent_name, COUNT(DISTINCT bt.id) AS task_count
                    FROM {item_table} t
                    LEFT JOIN {item_table} p ON p.id = t.parent_id
                    JOIN {map_table} m ON m.{fk_col} = t.id
                    JOIN bank_tasks bt ON bt.id = m.bank_task_id AND bt.deleted_at IS NULL AND {NOT_TWIN_SQL}
                    WHERE 1 = 1 {condition}
                    GROUP BY t.id, t.name, t.name_norm, t.parent_id, p.name
                    ORDER BY t.name_norm ASC, t.id ASC{limit_clause}
                """, exec_params) as cursor:
                    items = [
                        {
                            "id": int(row["id"]),
                            "name": row["name"],
                            "task_count": int(row["task_count"]),
                            "parent_id": int(row["parent_id"]) if row["parent_id"] is not None else None,
                            "parent_name": row["parent_name"],
                        }
                        for row in await cursor.fetchall()
                    ]
                return items, total
            except Exception as exc:
                if not _is_missing_parent_column_error(exc):
                    raise
        async with db.execute(f"""
            SELECT t.id, t.name, COUNT(DISTINCT bt.id) AS task_count
            FROM {item_table} t
            JOIN {map_table} m ON m.{fk_col} = t.id
            JOIN bank_tasks bt ON bt.id = m.bank_task_id AND bt.deleted_at IS NULL AND {NOT_TWIN_SQL}
            WHERE 1 = 1 {condition}
            GROUP BY t.id, t.name, t.name_norm
            ORDER BY t.name_norm ASC, t.id ASC{limit_clause}
        """, exec_params) as cursor:
            if kind == "topic":
                items = [
                    {
                        "id": int(row["id"]),
                        "name": row["name"],
                        "task_count": int(row["task_count"]),
                        "parent_id": None,
                        "parent_name": None,
                    }
                    for row in await cursor.fetchall()
                ]
            else:
                items = [{"id": int(row["id"]), "name": row["name"], "task_count": int(row["task_count"])}
                         for row in await cursor.fetchall()]
        return items, total

    async def get_catalog(self, query: Optional[str] = None, limit: Optional[int] = None) -> Dict[str, Any]:
        async with self._connection() as db:
            db.row_factory = db_driver.Row
            # Library counts match the default list, which leaves twins to their source task.
            async with db.execute(f"""
                SELECT
                    COUNT(*) AS total,
                    COALESCE(SUM(CASE WHEN bt.deleted_at IS NULL AND {NOT_TWIN_SQL} THEN 1 ELSE 0 END), 0) AS active_total,
                    COALESCE(SUM(CASE WHEN bt.deleted_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS trash_total,
                    COALESCE(SUM(CASE WHEN bt.deleted_at IS NULL AND {NOT_TWIN_SQL}
                        AND NOT EXISTS (SELECT 1 FROM bank_task_topic_map m WHERE m.bank_task_id = bt.id)
                        THEN 1 ELSE 0 END), 0) AS no_topics_total,
                    COALESCE(SUM(CASE WHEN bt.deleted_at IS NULL AND {NOT_TWIN_SQL}
                        AND NOT EXISTS (SELECT 1 FROM bank_task_source_map sm WHERE sm.bank_task_id = bt.id)
                        THEN 1 ELSE 0 END), 0) AS no_sources_total,
                    COALESCE(SUM(CASE WHEN bt.deleted_at IS NULL AND {NOT_TWIN_SQL}
                        AND NOT EXISTS (SELECT 1 FROM tasks p WHERE p.bank_task_id = bt.id AND p.deleted_at IS NULL)
                        AND NOT EXISTS (SELECT 1 FROM trial_test_tasks p WHERE p.bank_task_id = bt.id AND p.deleted_at IS NULL)
                        THEN 1 ELSE 0 END), 0) AS unused_total,
                    COALESCE(SUM(CASE WHEN bt.deleted_at IS NULL AND {IS_TWIN_SQL} THEN 1 ELSE 0 END), 0) AS twins_total
                FROM bank_tasks bt
            """) as cursor:
                row = await cursor.fetchone()
                summary = {
                    key: int(row[key])
                    for key in ("active_total", "trash_total", "no_topics_total", "no_sources_total", "unused_total", "twins_total")
                }

            topics, topic_total = await self._get_taxonomy_catalog(db, "topic", query=query, limit=limit)
            sources, _ = await self._get_taxonomy_catalog(db, "source", query=None, limit=None)
            return {
                **summary,
                "topics": topics,
                "topics_total": topic_total,
                "has_more_topics": topic_total > len(topics),
                "sources": sources,
            }
