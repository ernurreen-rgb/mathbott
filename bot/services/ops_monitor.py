"""
Background ops monitor loop: health sampling and incident evaluation.
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Any, Dict

from database import Database
from settings import get_settings
from utils.metrics import metrics

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class IncidentRule:
    kind: str
    severity: str
    title: str
    open_after: int
    resolve_after: int


class OpsMonitor:
    MONITOR_INTERVAL_SECONDS = 60

    def __init__(self, db: Database):
        self.db = db
        self.rule_state: Dict[str, Dict[str, int]] = {}
        self.rules = [
            IncidentRule(
                kind="db_down",
                severity="critical",
                title="Database probe failed repeatedly",
                open_after=2,
                resolve_after=3,
            ),
            IncidentRule(
                kind="high_5xx_rate",
                severity="high",
                title="High 5xx rate in last 5 minutes",
                open_after=2,
                resolve_after=3,
            ),
            IncidentRule(
                kind="high_latency_p95",
                severity="medium",
                title="High p95 latency in last 5 minutes",
                open_after=3,
                resolve_after=3,
            ),
        ]

    @staticmethod
    def _service_status(*, db_ok: bool, high_5xx: bool, high_latency: bool) -> str:
        if not db_ok:
            return "down"
        if high_5xx or high_latency:
            return "degraded"
        return "healthy"

    async def _evaluate_rule(
        self,
        *,
        rule: IncidentRule,
        condition_met: bool,
        message: str,
        metadata: Dict[str, Any],
    ) -> None:
        state = self.rule_state.setdefault(rule.kind, {"breach_streak": 0, "recover_streak": 0})
        open_incident = await self.db.ops.get_open_incident_by_fingerprint(rule.kind)

        if condition_met:
            state["breach_streak"] += 1
            state["recover_streak"] = 0
            should_open = bool(open_incident) or state["breach_streak"] >= int(rule.open_after)
            if not should_open:
                return

            incident = await self.db.ops.open_or_update_incident(
                kind=rule.kind,
                severity=rule.severity,
                fingerprint=rule.kind,
                title=rule.title,
                message=message,
                metadata=metadata,
            )
            logger.warning(
                "incident_opened",
                extra={
                    "extra_fields": {
                        "event": "incident_opened",
                        "kind": rule.kind,
                        "severity": rule.severity,
                        "incident_id": incident.get("id"),
                    }
                },
            )
            return

        state["recover_streak"] += 1
        state["breach_streak"] = 0
        if not open_incident:
            return
        if state["recover_streak"] < int(rule.resolve_after):
            return

        resolved = await self.db.ops.resolve_incident(
            fingerprint=rule.kind,
            metadata=metadata,
        )
        if resolved:
            logger.info(
                "incident_resolved",
                extra={
                    "extra_fields": {
                        "event": "incident_resolved",
                        "kind": rule.kind,
                        "incident_id": resolved.get("id"),
                    }
                },
            )

    async def run_cycle(self) -> Dict[str, Any]:
        db_ok = await self.db.ops.probe_database()
        window = metrics.get_window_stats(window_seconds=300)
        requests_5m = int(window.get("requests", 0) or 0)
        errors_5m = int(window.get("errors", 0) or 0)
        error_rate_5m = float(window.get("error_rate", 0.0) or 0.0)
        p95_ms_5m = float(window.get("p95_ms", 0.0) or 0.0)
        avg_ms_5m = float(window.get("avg_ms", 0.0) or 0.0)

        high_5xx = requests_5m >= 50 and error_rate_5m >= 5.0
        high_latency = requests_5m >= 50 and p95_ms_5m >= 2000.0

        service_status = self._service_status(
            db_ok=db_ok,
            high_5xx=high_5xx,
            high_latency=high_latency,
        )
        database_status = "ok" if db_ok else "error"
        if not db_ok:
            db_rule = self.rules[0]
            state = self._rule_state[db_rule.kind]
            state["breach_streak"] += 1
            state["recover_streak"] = 0
            logger.error(
                "ops_monitor_db_down",
                extra={
                    "extra_fields": {
                        "event": "ops_monitor_db_down",
                        "kind": db_rule.kind,
                        "severity": db_rule.severity,
                        "breach_streak": state["breach_streak"],
                        "requests_5m": requests_5m,
                        "errors_5m": errors_5m,
                    }
                },
            )
            return {
                "service_status": service_status,
                "database_status": database_status,
                "requests_5m": requests_5m,
                "errors_5m": errors_5m,
                "error_rate_5m": error_rate_5m,
                "p95_ms_5m": p95_ms_5m,
                "avg_ms_5m": avg_ms_5m,
            }

        await self.db.ops.add_health_sample(
            service_status=service_status,
            database_status=database_status,
            requests_5m=requests_5m,
            errors_5m=errors_5m,
            error_rate_5m=error_rate_5m,
            p95_ms_5m=p95_ms_5m,
            avg_ms_5m=avg_ms_5m,
            metadata={
                "monitor_interval_sec": self.MONITOR_INTERVAL_SECONDS,
                "window": "5m",
                "pool_stats": self.db.connection_pool.get_stats() if self.db.connection_pool else None,
            },
        )

        await self._evaluate_rule(
            rule=self.rules[0],
            condition_met=not db_ok,
            message="Database probe failed for two or more cycles",
            metadata={
                "database_status": database_status,
                "requests_5m": requests_5m,
                "errors_5m": errors_5m,
                "error_rate_5m": error_rate_5m,
            },
        )
        await self._evaluate_rule(
            rule=self.rules[1],
            condition_met=high_5xx,
            message=f"5xx error rate is {error_rate_5m:.2f}% with {requests_5m} requests in 5m",
            metadata={
                "requests_5m": requests_5m,
                "errors_5m": errors_5m,
                "error_rate_5m": error_rate_5m,
            },
        )
        await self._evaluate_rule(
            rule=self.rules[2],
            condition_met=high_latency,
            message=f"p95 latency is {p95_ms_5m:.2f}ms with {requests_5m} requests in 5m",
            metadata={
                "requests_5m": requests_5m,
                "p95_ms_5m": p95_ms_5m,
                "avg_ms_5m": avg_ms_5m,
            },
        )

        return {
            "service_status": service_status,
            "database_status": database_status,
            "requests_5m": requests_5m,
            "errors_5m": errors_5m,
            "error_rate_5m": error_rate_5m,
            "p95_ms_5m": p95_ms_5m,
            "avg_ms_5m": avg_ms_5m,
        }

    async def run_loop(self) -> None:
        while True:
            try:
                await self.run_cycle()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.error("ops_monitor_cycle_failed", exc_info=True)
            await asyncio.sleep(self.MONITOR_INTERVAL_SECONDS)

    async def run_cleanup(self) -> Dict[str, int]:
        settings = get_settings()
        health_days = settings.ops_health_sample_retention_days
        incident_days = settings.ops_incident_retention_days
        deleted_health = await self.db.ops.cleanup_old_health_samples(retention_days=health_days)
        deleted_incidents = await self.db.ops.cleanup_old_incidents(retention_days=incident_days)
        return {"deleted_health_samples": deleted_health, "deleted_incidents": deleted_incidents}
