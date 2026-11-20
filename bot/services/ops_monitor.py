"""
Background ops monitor loop: health sampling and incident evaluation.
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

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

    @staticmethod
    def _sample_breaches_rule(rule_kind: str, sample: Dict[str, Any]) -> bool:
        if rule_kind == "db_down":
            return str(sample.get("database_status") or "").strip().lower() != "ok"
        requests_5m = int(sample.get("requests_5m") or 0)
        if rule_kind == "high_5xx_rate":
            return requests_5m >= 50 and float(sample.get("error_rate_5m") or 0.0) >= 5.0
        if rule_kind == "high_latency_p95":
            return requests_5m >= 50 and float(sample.get("p95_ms_5m") or 0.0) >= 2000.0
        return False

    @classmethod
    def _streaks_from_samples(
        cls,
        rule_kind: str,
        samples_newest_first: List[Dict[str, Any]],
    ) -> Optional[Tuple[int, int]]:
        if not samples_newest_first:
            return None
        first_breach = cls._sample_breaches_rule(rule_kind, samples_newest_first[0])
        streak = 0
        for sample in samples_newest_first:
            if cls._sample_breaches_rule(rule_kind, sample) == first_breach:
                streak += 1
            else:
                break
        return (streak, 0) if first_breach else (0, streak)

    async def _evaluate_rule(
        self,
        *,
        rule: IncidentRule,
        condition_met: bool,
        message: str,
        metadata: Dict[str, Any],
        recent_samples: Optional[List[Dict[str, Any]]] = None,
        increment_in_memory: bool = True,
    ) -> None:
        state = self.rule_state.setdefault(rule.kind, {"breach_streak": 0, "recover_streak": 0})
        if increment_in_memory:
            if condition_met:
                state["breach_streak"] += 1
                state["recover_streak"] = 0
            else:
                state["recover_streak"] += 1
                state["breach_streak"] = 0

        persisted_streaks = (
            self._streaks_from_samples(rule.kind, recent_samples)
            if recent_samples
            else None
        )
        if persisted_streaks is not None:
            persisted_breach, persisted_recover = persisted_streaks
            if condition_met:
                state["breach_streak"] = max(state["breach_streak"], persisted_breach)
                state["recover_streak"] = 0
            else:
                state["recover_streak"] = max(state["recover_streak"], persisted_recover)
                state["breach_streak"] = 0

        open_incident = await self.db.ops.get_open_incident_by_fingerprint(rule.kind)

        if condition_met:
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

    async def _fetch_recent_samples(self) -> List[Dict[str, Any]]:
        list_recent = getattr(self.db.ops, "list_recent_health_samples", None)
        if not callable(list_recent):
            return []
        max_window = max(max(rule.open_after, rule.resolve_after) for rule in self.rules)
        samples = await list_recent(limit=max(10, max_window + 2))
        return samples if isinstance(samples, list) else []

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
        summary = {
            "service_status": service_status,
            "database_status": database_status,
            "requests_5m": requests_5m,
            "errors_5m": errors_5m,
            "error_rate_5m": error_rate_5m,
            "p95_ms_5m": p95_ms_5m,
            "avg_ms_5m": avg_ms_5m,
        }
        sample_metadata = {
            "monitor_interval_sec": self.MONITOR_INTERVAL_SECONDS,
            "window": "5m",
            "pool_stats": self.db.connection_pool.get_stats() if self.db.connection_pool else None,
        }

        if not db_ok:
            db_rule = self.rules[0]
            state = self.rule_state.setdefault(
                db_rule.kind, {"breach_streak": 0, "recover_streak": 0}
            )
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
            persisted_db_down = False
            try:
                await self.db.ops.add_health_sample(
                    service_status=service_status,
                    database_status=database_status,
                    requests_5m=requests_5m,
                    errors_5m=errors_5m,
                    error_rate_5m=error_rate_5m,
                    p95_ms_5m=p95_ms_5m,
                    avg_ms_5m=avg_ms_5m,
                    metadata=sample_metadata,
                )
                recent_samples = await self._fetch_recent_samples()
                await self._evaluate_rule(
                    rule=db_rule,
                    condition_met=True,
                    message="Database probe failed for two or more cycles",
                    metadata={
                        "database_status": database_status,
                        "requests_5m": requests_5m,
                        "errors_5m": errors_5m,
                        "error_rate_5m": error_rate_5m,
                    },
                    recent_samples=recent_samples,
                    increment_in_memory=False,
                )
                persisted_db_down = True
            except Exception:
                logger.warning("ops_monitor_db_down_persist_failed", exc_info=True)

            if not persisted_db_down and state["breach_streak"] >= int(db_rule.open_after):
                logger.warning(
                    "incident_opened",
                    extra={
                        "extra_fields": {
                            "event": "incident_opened",
                            "kind": db_rule.kind,
                            "severity": db_rule.severity,
                            "incident_id": None,
                            "db_unavailable": True,
                            "breach_streak": state["breach_streak"],
                        }
                    },
                )
            return summary

        await self.db.ops.add_health_sample(
            service_status=service_status,
            database_status=database_status,
            requests_5m=requests_5m,
            errors_5m=errors_5m,
            error_rate_5m=error_rate_5m,
            p95_ms_5m=p95_ms_5m,
            avg_ms_5m=avg_ms_5m,
            metadata=sample_metadata,
        )
        recent_samples = await self._fetch_recent_samples()

        await self._evaluate_rule(
            rule=self.rules[0],
            condition_met=False,
            message="Database probe failed for two or more cycles",
            metadata={
                "database_status": database_status,
                "requests_5m": requests_5m,
                "errors_5m": errors_5m,
                "error_rate_5m": error_rate_5m,
            },
            recent_samples=recent_samples,
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
            recent_samples=recent_samples,
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
            recent_samples=recent_samples,
        )

        return summary

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
