"""
Repository for production ops health samples and incidents.
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

import aiosqlite

from .base import BaseRepository


class OpsRepository(BaseRepository):
    @staticmethod
    def _parse_json(value: Any) -> Dict[str, Any]:
        if isinstance(value, dict):
            return value
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
                if isinstance(parsed, dict):
                    return parsed
            except Exception:
                return {}
        return {}

    async def add_health_sample(
        self,
        *,
        service_status: str,
        database_status: str,
        requests_5m: int,
        errors_5m: int,
        error_rate_5m: float,
        p95_ms_5m: float,
        avg_ms_5m: float,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> int:
        async with self._connection() as db:
            cursor = await db.execute(
                """
                INSERT INTO ops_health_samples
                (
                    service_status, database_status, requests_5m, errors_5m,
                    error_rate_5m, p95_ms_5m, avg_ms_5m, metadata_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    service_status,
                    database_status,
                    int(requests_5m),
                    int(errors_5m),
                    float(error_rate_5m),
                    float(p95_ms_5m),
                    float(avg_ms_5m),
                    json.dumps(metadata or {}, ensure_ascii=False),
                ),
            )
            await db.commit()
            return int(cursor.lastrowid)

    async def get_latest_health_sample(self) -> Optional[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """
                SELECT
                    service_status, database_status, requests_5m, errors_5m,
                    error_rate_5m, p95_ms_5m, avg_ms_5m, metadata_json, collected_at
                FROM ops_health_samples
                ORDER BY collected_at DESC, id DESC
                LIMIT 1
                """
            ) as cursor:
                row = await cursor.fetchone()
                if not row:
                    return None
                item = dict(row)
                item["metadata"] = self._parse_json(item.pop("metadata_json", None))
                return item

    async def list_health_timeseries(self, *, range_sql: str, step_seconds: int) -> List[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                f"""
                SELECT
                    datetime((CAST(strftime('%s', collected_at) AS INTEGER) / ?) * ?, 'unixepoch') AS ts,
                    SUM(requests_5m) AS requests,
                    SUM(errors_5m) AS errors,
                    CASE
                        WHEN SUM(requests_5m) > 0 THEN (SUM(errors_5m) * 100.0 / SUM(requests_5m))
                        ELSE 0
                    END AS error_rate,
                    AVG(p95_ms_5m) AS p95_ms,
                    AVG(avg_ms_5m) AS avg_ms,
                    CASE
                        WHEN SUM(CASE WHEN database_status = 'ok' THEN 1 ELSE 0 END) = COUNT(*) THEN 1
                        ELSE 0
                    END AS db_ok
                FROM ops_health_samples
                WHERE collected_at >= datetime('now', ?)
                GROUP BY (CAST(strftime('%s', collected_at) AS INTEGER) / ?)
                ORDER BY ts ASC
                """,
                (step_seconds, step_seconds, range_sql, step_seconds),
            ) as cursor:
                rows = await cursor.fetchall()

            items: List[Dict[str, Any]] = []
            for row in rows:
                items.append(
                    {
                        "ts": row["ts"],
                        "requests": int(row["requests"] or 0),
                        "errors": int(row["errors"] or 0),
                        "error_rate": round(float(row["error_rate"] or 0.0), 4),
                        "p95_ms": round(float(row["p95_ms"] or 0.0), 2),
                        "avg_ms": round(float(row["avg_ms"] or 0.0), 2),
                        "db_ok": int(row["db_ok"] or 0),
                    }
                )
            return items

    async def count_open_incidents(self) -> int:
        async with self._connection() as db:
            async with db.execute(
                "SELECT COUNT(*) FROM ops_incidents WHERE status = 'open'"
            ) as cursor:
                row = await cursor.fetchone()
                return int(row[0]) if row else 0

    async def get_open_incident_by_fingerprint(self, fingerprint: str) -> Optional[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """
                SELECT *
                FROM ops_incidents
                WHERE fingerprint = ? AND status = 'open'
                LIMIT 1
                """,
                (fingerprint,),
            ) as cursor:
                row = await cursor.fetchone()
                if not row:
                    return None
                item = dict(row)
                item["metadata"] = self._parse_json(item.pop("metadata_json", None))
                return item

    async def open_or_update_incident(
        self,
        *,
        kind: str,
        severity: str,
        fingerprint: str,
        title: str,
        message: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """
                SELECT id, occurrences
                FROM ops_incidents
                WHERE fingerprint = ? AND status = 'open'
                LIMIT 1
                """,
                (fingerprint,),
            ) as cursor:
                existing = await cursor.fetchone()

            if existing:
                incident_id = int(existing["id"])
                await db.execute(
                    """
                    UPDATE ops_incidents
                    SET kind = ?,
                        severity = ?,
                        title = ?,
                        message = ?,
                        metadata_json = ?,
                        occurrences = COALESCE(occurrences, 0) + 1,
                        last_seen_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (
                        kind,
                        severity,
                        title,
                        message,
                        json.dumps(metadata or {}, ensure_ascii=False),
                        incident_id,
                    ),
                )
                is_new = False
            else:
                async with db.execute(
                    """
                    SELECT id, occurrences
                    FROM ops_incidents
                    WHERE fingerprint = ? AND status = 'resolved'
                    ORDER BY last_seen_at DESC, id DESC
                    LIMIT 1
                    """,
                    (fingerprint,),
                ) as resolved_cursor:
                    resolved_row = await resolved_cursor.fetchone()

                if resolved_row:
                    incident_id = int(resolved_row["id"])
                    await db.execute(
                        """
                        UPDATE ops_incidents
                        SET kind = ?,
                            severity = ?,
                            title = ?,
                            message = ?,
                            status = 'open',
                            metadata_json = ?,
                            occurrences = COALESCE(occurrences, 0) + 1,
                            first_seen_at = CURRENT_TIMESTAMP,
                            last_seen_at = CURRENT_TIMESTAMP,
                            telegram_last_sent_at = NULL,
                            resolved_at = NULL
                        WHERE id = ?
                        """,
                        (
                            kind,
                            severity,
                            title,
                            message,
                            json.dumps(metadata or {}, ensure_ascii=False),
                            incident_id,
                        ),
                    )
                    is_new = True
                else:
                    cursor = await db.execute(
                        """
                        INSERT INTO ops_incidents
                        (
                            kind, severity, fingerprint, title, message,
                            status, metadata_json
                        )
                        VALUES (?, ?, ?, ?, ?, 'open', ?)
                        """,
                        (
                            kind,
                            severity,
                            fingerprint,
                            title,
                            message,
                            json.dumps(metadata or {}, ensure_ascii=False),
                        ),
                    )
                    incident_id = int(cursor.lastrowid)
                    is_new = True

            await db.commit()

            async with db.execute(
                "SELECT * FROM ops_incidents WHERE id = ? LIMIT 1",
                (incident_id,),
            ) as cursor:
                row = await cursor.fetchone()
            item = dict(row) if row else {"id": incident_id}
            item["metadata"] = self._parse_json(item.pop("metadata_json", None))
            item["is_new"] = is_new
            return item

    async def resolve_incident(
        self,
        *,
        fingerprint: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """
                SELECT *
                FROM ops_incidents
                WHERE fingerprint = ? AND status = 'open'
                LIMIT 1
                """,
                (fingerprint,),
            ) as cursor:
                existing = await cursor.fetchone()
            if not existing:
                return None

            incident_id = int(existing["id"])
            merged_metadata = self._parse_json(existing["metadata_json"])
            if metadata:
                merged_metadata.update(metadata)

            await db.execute(
                """
                UPDATE ops_incidents
                SET status = 'resolved',
                    last_seen_at = CURRENT_TIMESTAMP,
                    resolved_at = CURRENT_TIMESTAMP,
                    metadata_json = ?
                WHERE id = ?
                """,
                (json.dumps(merged_metadata, ensure_ascii=False), incident_id),
            )
            await db.commit()

            async with db.execute(
                "SELECT * FROM ops_incidents WHERE id = ? LIMIT 1",
                (incident_id,),
            ) as cursor:
                row = await cursor.fetchone()
            item = dict(row) if row else {"id": incident_id}
            item["metadata"] = self._parse_json(item.pop("metadata_json", None))
            return item

    async def touch_incident_telegram_sent(self, incident_id: int) -> None:
        async with self._connection() as db:
            await db.execute(
                """
                UPDATE ops_incidents
                SET telegram_last_sent_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (incident_id,),
            )
            await db.commit()

    async def list_incidents(
        self,
        *,
        status: str = "open",
        severity: str = "all",
        limit: int = 20,
        offset: int = 0,
    ) -> Dict[str, Any]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            where: List[str] = []
            params: List[Any] = []

            if status in {"open", "resolved"}:
                where.append("status = ?")
                params.append(status)
            if severity in {"critical", "high", "medium"}:
                where.append("severity = ?")
                params.append(severity)

            where_clause = f"WHERE {' AND '.join(where)}" if where else ""
            async with db.execute(
                f"SELECT COUNT(*) FROM ops_incidents {where_clause}",
                params,
            ) as count_cursor:
                count_row = await count_cursor.fetchone()
                total = int(count_row[0]) if count_row else 0

            async with db.execute(
                f"""
                SELECT
                    id, kind, severity, title, message, status,
                    first_seen_at, last_seen_at, occurrences, metadata_json,
                    telegram_last_sent_at, resolved_at
                FROM ops_incidents
                {where_clause}
                ORDER BY last_seen_at DESC, id DESC
                LIMIT ? OFFSET ?
                """,
                [*params, limit, offset],
            ) as cursor:
                rows = await cursor.fetchall()

            items: List[Dict[str, Any]] = []
            for row in rows:
                item = dict(row)
                item["metadata"] = self._parse_json(item.pop("metadata_json", None))
                items.append(item)

            return {
                "items": items,
                "total": total,
                "limit": limit,
                "offset": offset,
                "has_more": (offset + limit) < total,
            }

    async def cleanup_old_health_samples(self, retention_days: int) -> int:
        async with self._connection() as db:
            cursor = await db.execute(
                """
                DELETE FROM ops_health_samples
                WHERE collected_at < datetime('now', '-' || ? || ' days')
                """,
                (int(retention_days),),
            )
            await db.commit()
            return int(cursor.rowcount or 0)

    async def cleanup_old_incidents(self, retention_days: int) -> int:
        async with self._connection() as db:
            cursor = await db.execute(
                """
                DELETE FROM ops_incidents
                WHERE COALESCE(resolved_at, last_seen_at) < datetime('now', '-' || ? || ' days')
                """,
                (int(retention_days),),
            )
            await db.commit()
            return int(cursor.rowcount or 0)
