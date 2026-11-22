"""
Request timings reported by students' devices (migration 0019_client_request_timings).
"""
import json
from typing import Any, Dict, List, Optional

from .base import BaseRepository

_COLUMNS = (
    "user_id", "tab_id", "kind", "method", "path", "page", "status", "error", "duration_ms", "ttfb_ms",
    "proxy_ms", "api_ms", "app_ms", "was_hidden", "effective_type", "started_at",
)


class ClientTimingRepository(BaseRepository):
    async def _has_table(self, db) -> bool:
        """True once migration 0019 is applied; the API runs safely before it."""
        if getattr(self, "_table_ready", False):
            return True
        async with db.execute(
            "SELECT (to_regclass(current_schema() || '.client_request_timings') IS NOT NULL)::int"
        ) as cursor:
            row = await cursor.fetchone()
        ready = bool(row and row[0])
        if ready:
            self._table_ready = True
        return ready

    async def record(self, user_id: Optional[int], tab_id: str, reports: List[Dict[str, Any]]) -> int:
        """Store one device's batch. Lone inserts that nothing reads first, so no application write lock."""
        if not reports:
            return 0
        row = "(" + ", ".join(["?"] * len(_COLUMNS)) + ", CAST(? AS JSONB))"
        sql = (
            f"INSERT INTO client_request_timings ({', '.join(_COLUMNS)}, details) "
            f"VALUES {', '.join([row] * len(reports))}"
        )
        parameters: List[Any] = []
        for report in reports:
            parameters += [user_id, tab_id] + [report.get(column) for column in _COLUMNS[2:]]
            parameters.append(json.dumps(report.get("details") or {}, ensure_ascii=False))
        async with self._connection() as db:
            if not await self._has_table(db):
                return 0
            await db.execute(sql, tuple(parameters))
            await db.commit()
        return len(reports)

    async def cleanup_old(self, retention_days: int) -> int:
        async with self._connection() as db:
            if not await self._has_table(db):
                return 0
            async with db.execute(
                "DELETE FROM client_request_timings WHERE received_at < mathbot_datetime('now', '-' || ? || ' days')",
                (max(1, int(retention_days)),),
            ) as cursor:
                deleted = max(cursor.rowcount, 0)
            await db.commit()
        return deleted
