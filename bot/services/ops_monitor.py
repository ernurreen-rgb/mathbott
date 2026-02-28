"""
Background ops monitor loop: health sampling, incident evaluation, and alerts.
"""
from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from database import Database
from utils.alerts import TelegramAlerter
from utils.metrics import metrics

logger = logging.getLogger(__name__)


def _env_int(name: str, default: int) -> int:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except Exception:
        return default


@dataclass(frozen=True)
class IncidentRule:
    kind: str
    severity: str
    title: str
    open_after: int
    resolve_after: int


class OpsMonitor:
    MONITOR_INTERVAL_SECONDS = 60
    TELEGRAM_COOLDOWN_MINUTES = 15

    def __init__(self, db: Database):
        self.db = db
        self.alerter = TelegramAlerter()
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
    def _parse_timestamp(value: Optional[str]) -> Optional[datetime]:
        if not value or not isinstance(value, str):
            return None
        text = value.strip()
        if not text:
            return None
        # SQLite typically returns "YYYY-MM-DD HH:MM:SS"
        text = text.replace(" ", "T")
        try:
            return datetime.fromisoformat(text).replace(tzinfo=timezone.utc)
        except Exception:
            return None

    def _can_send_open_alert(self, incident: Dict[str, Any]) -> bool:
        if bool(incident.get("is_new")):
            return True
        last_sent_at = self._parse_timestamp(incident.get("telegram_last_sent_at"))
        if not last_sent_at:
            return True
        cooldown = timedelta(minutes=self.TELEGRAM_COOLDOWN_MINUTES)
        return datetime.now(timezone.utc) - last_sent_at >= cooldown

    @staticmethod
    def _service_status(*, db_ok: bool, high_5xx: bool, high_latency: bool) -> str:
        if not db_ok:
            return "down"
        if high_5xx or high_latency:
            return "degraded"
        return "healthy"

    async def _emit_open_alert_if_needed(self, incident: Dict[str, Any]) -> None:
        if not self.alerter.enabled:
            return
        if not self._can_send_open_alert(incident):
            return
        sent = await self.alerter.send_incident_open(incident)
        if sent and isinstance(incident.get("id"), int):
            await self.db.mark_ops_incident_telegram_sent(int(incident["id"]))

    async def _emit_resolved_alert(self, incident: Dict[str, Any]) -> None:
        if not self.alerter.enabled:
            return
        await self.alerter.send_incident_resolved(incident)

    async def _evaluate_rule(
        self,
        *,
        rule: IncidentRule,
        condition_met: bool,
        message: str,
        metadata: Dict[str, Any],
    ) -> None:
        state = self.rule_state.setdefault(rule.kind, {"breach_streak": 0, "recover_streak": 0})
        open_incident = await self.db.get_open_ops_incident_by_fingerprint(rule.kind)

        if condition_met:
            state["breach_streak"] += 1
            state["recover_streak"] = 0
            should_open = bool(open_incident) or state["breach_streak"] >= int(rule.open_after)
            if not should_open:
                return

            incident = await self.db.open_or_update_ops_incident(
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
            await self._emit_open_alert_if_needed(incident)
            return

        state["recover_streak"] += 1
        state["breach_streak"] = 0
        if not open_incident:
            return
        if state["recover_streak"] < int(rule.resolve_after):
            return

        resolved = await self.db.resolve_ops_incident(
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
            await self._emit_resolved_alert(resolved)

    async def run_cycle(self) -> Dict[str, Any]:
        db_ok = await self.db.probe_database()
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
        await self.db.add_ops_health_sample(
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
        health_days = _env_int("OPS_HEALTH_SAMPLE_RETENTION_DAYS", 30)
        incident_days = _env_int("OPS_INCIDENT_RETENTION_DAYS", 365)
        deleted_health = await self.db.cleanup_old_ops_health_samples(retention_days=health_days)
        deleted_incidents = await self.db.cleanup_old_ops_incidents(retention_days=incident_days)
        return {"deleted_health_samples": deleted_health, "deleted_incidents": deleted_incidents}
