"""
Alerting utilities (Telegram).
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional

import aiohttp

logger = logging.getLogger(__name__)


def _env_bool(name: str, default: bool = False) -> bool:
    value = (os.getenv(name) or "").strip().lower()
    if not value:
        return default
    return value in {"1", "true", "yes", "y", "on"}


class TelegramAlerter:
    def __init__(self):
        self.alerts_enabled = _env_bool("ALERTS_ENABLED", default=False)
        self.telegram_enabled = _env_bool("ALERT_TELEGRAM_ENABLED", default=False)
        self.bot_token = (os.getenv("ALERT_TELEGRAM_BOT_TOKEN") or "").strip()
        self.chat_id = (os.getenv("ALERT_TELEGRAM_CHAT_ID") or "").strip()

    @property
    def enabled(self) -> bool:
        return (
            self.alerts_enabled
            and self.telegram_enabled
            and bool(self.bot_token)
            and bool(self.chat_id)
        )

    async def _send(self, text: str) -> bool:
        if not self.enabled:
            return False
        url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
        payload = {
            "chat_id": self.chat_id,
            "text": text,
            "disable_web_page_preview": True,
        }
        try:
            timeout = aiohttp.ClientTimeout(total=10)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(url, json=payload) as response:
                    if response.status >= 400:
                        body = await response.text()
                        logger.error(
                            "alert_send_failed",
                            extra={
                                "extra_fields": {
                                    "event": "alert_send_failed",
                                    "channel": "telegram",
                                    "status_code": response.status,
                                    "response_body": body[:500],
                                }
                            },
                        )
                        return False

            logger.info(
                "alert_sent",
                extra={"extra_fields": {"event": "alert_sent", "channel": "telegram"}},
            )
            return True
        except Exception as exc:
            logger.error(
                "alert_send_failed",
                exc_info=True,
                extra={
                    "extra_fields": {
                        "event": "alert_send_failed",
                        "channel": "telegram",
                        "reason": str(exc),
                    }
                },
            )
            return False

    @staticmethod
    def _format_incident(incident: Dict[str, Any]) -> str:
        incident_id = incident.get("id")
        severity = str(incident.get("severity") or "").upper()
        title = str(incident.get("title") or "")
        message = str(incident.get("message") or "")
        kind = str(incident.get("kind") or "")
        return (
            f"[OPEN] Incident #{incident_id}\n"
            f"Severity: {severity}\n"
            f"Kind: {kind}\n"
            f"Title: {title}\n"
            f"Message: {message}"
        )

    @staticmethod
    def _format_resolved(incident: Dict[str, Any]) -> str:
        incident_id = incident.get("id")
        severity = str(incident.get("severity") or "").upper()
        title = str(incident.get("title") or "")
        kind = str(incident.get("kind") or "")
        return (
            f"[RESOLVED] Incident #{incident_id}\n"
            f"Severity: {severity}\n"
            f"Kind: {kind}\n"
            f"Title: {title}"
        )

    async def send_incident_open(self, incident: Dict[str, Any]) -> bool:
        return await self._send(self._format_incident(incident))

    async def send_incident_resolved(self, incident: Dict[str, Any]) -> bool:
        return await self._send(self._format_resolved(incident))
