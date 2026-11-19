"""
Near-duplicate detection for bank tasks.
"""
import asyncio
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional

import storage as db_driver

from .twins import NOT_TWIN_SQL


class BankTaskSimilarityMixin:
    @staticmethod
    def _normalize_similarity_text(value: Optional[str]) -> str:
        return " ".join((value or "").lower().split())

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
    def _score_similarity_rows(
        cls,
        base_blob: str,
        rows: List[Dict[str, Any]],
        threshold: float,
        limit: int,
    ) -> List[Dict[str, Any]]:
        candidates: List[Dict[str, Any]] = []
        for row in rows:
            candidate_blob = cls._build_similarity_blob(row["text"], row["options"])
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
            db.row_factory = db_driver.Row
            # Twins are intentional number-variants and must not flag as duplicates.
            where_parts = ["bt.deleted_at IS NULL", NOT_TWIN_SQL]
            params: List[Any] = []
            if exclude_task_id is not None:
                where_parts.append("bt.id != ?")
                params.append(exclude_task_id)
                # When editing a twin itself, also exclude its own source task.
                where_parts.append(
                    "NOT EXISTS (SELECT 1 FROM bank_task_twins tw_parent "
                    "WHERE tw_parent.twin_bank_task_id = ? AND tw_parent.source_bank_task_id = bt.id)"
                )
                params.append(exclude_task_id)
            if question_type:
                where_parts.append("bt.question_type = ?")
                params.append(question_type)
            where_clause = " AND ".join(where_parts)
            async with db.execute(
                f"""
                SELECT bt.id, bt.text, bt.question_type, bt.options, bt.difficulty, bt.updated_at
                FROM bank_tasks bt
                WHERE {where_clause}
                ORDER BY bt.updated_at DESC, bt.id DESC
                LIMIT ?
                """,
                [*params, scan_limit],
            ) as cursor:
                rows = [dict(row) for row in await cursor.fetchall()]

        return await asyncio.to_thread(
            self._score_similarity_rows,
            base_blob,
            rows,
            threshold,
            limit,
        )
