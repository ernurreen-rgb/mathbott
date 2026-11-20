"""
Web Push routes for the daily streak reminder.
"""
import base64
import binascii
import hmac
import logging
from typing import Literal, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from slowapi import Limiter

from database import Database
from dependencies import get_db, require_internal_identity
from services.streak_reminders import (
    is_allowed_push_endpoint,
    push_enabled,
    send_confirmation,
    send_streak_reminders,
)
from settings import get_settings

logger = logging.getLogger(__name__)

# A student rarely has more than a phone and a computer; this only stops a runaway client.
MAX_DEVICES_PER_USER = 10

# The profile shows these errors under the reminder switch, in the student's interface language.
_MESSAGES = {
    "unavailable": ("Еске салу әзірге қолжетімсіз", "Напоминания пока недоступны"),
    "too_many_devices": ("Құрылғылар саны тым көп", "Слишком много устройств"),
    "subscription_gone": ("Хабарландыру жазылымы жарамсыз", "Подписка на уведомления недействительна"),
}


def _message(key: str, language: Optional[str]) -> str:
    kk, ru = _MESSAGES[key]
    return ru if language == "ru" else kk


def _decoded_length(value: str) -> int:
    try:
        return len(base64.urlsafe_b64decode(value + "=" * (-len(value) % 4)))
    except (binascii.Error, ValueError):
        return -1


class PushKeys(BaseModel):
    p256dh: str = Field(min_length=1, max_length=200)
    auth: str = Field(min_length=1, max_length=100)

    @field_validator("p256dh")
    @classmethod
    def _check_p256dh(cls, value: str) -> str:
        # An uncompressed P-256 public key.
        if _decoded_length(value) != 65:
            raise ValueError("invalid p256dh key")
        return value

    @field_validator("auth")
    @classmethod
    def _check_auth(cls, value: str) -> str:
        if _decoded_length(value) != 16:
            raise ValueError("invalid auth secret")
        return value


class PushSubscriptionRequest(BaseModel):
    endpoint: str = Field(min_length=1, max_length=1000)
    keys: PushKeys
    # Turning reminders on shows a test notification; a silent re-sync from the profile does not.
    confirm: bool = True

    @field_validator("endpoint")
    @classmethod
    def _check_endpoint(cls, value: str) -> str:
        if not is_allowed_push_endpoint(value):
            raise ValueError("unsupported push service")
        return value


class PushUnsubscribeRequest(BaseModel):
    endpoint: str = Field(min_length=1, max_length=1000)


class ReminderPromptEvent(BaseModel):
    # The browser's ReminderState (web/lib/push-reminders.ts) when the summary was shown.
    device_state: Literal["unsupported", "install", "denied", "off", "on"]
    # seen: the student reached a mini-lesson summary; offered: the reminder card was on it;
    # enabled / snoozed: what they chose; failed: turning it on did not work.
    action: Literal["seen", "offered", "enabled", "snoozed", "failed"]


def setup_push_routes(app: FastAPI, db: Database, limiter: Limiter):
    @app.get("/api/push/config")
    async def get_push_config():
        settings = get_settings()
        enabled = push_enabled()
        return {"enabled": enabled, "public_key": settings.vapid_public_key if enabled else None}

    @app.post("/api/push/subscriptions")
    @limiter.limit("10/minute")
    async def subscribe(
        request: Request,
        payload: PushSubscriptionRequest,
        current_user: dict = Depends(require_internal_identity),
        db: Database = Depends(get_db),
    ):
        language = current_user.get("language")
        if not push_enabled():
            raise HTTPException(status_code=503, detail=_message("unavailable", language))
        user_id = int(current_user["id"])
        if await db.push.count_other_devices(user_id, payload.endpoint) >= MAX_DEVICES_PER_USER:
            raise HTTPException(status_code=409, detail=_message("too_many_devices", language))
        device = {"endpoint": payload.endpoint, "p256dh": payload.keys.p256dh, "auth": payload.keys.auth}
        await db.push.save_subscription(user_id, **device)
        if not payload.confirm:
            return {"subscribed": True, "confirmation": None}
        outcome = await send_confirmation(device, language=language)
        if outcome == "gone":
            await db.push.delete_endpoints([payload.endpoint])
            raise HTTPException(status_code=410, detail=_message("subscription_gone", language))
        return {"subscribed": True, "confirmation": outcome}

    @app.post("/api/push/unsubscribe")
    @limiter.limit("30/minute")
    async def unsubscribe(
        request: Request,
        payload: PushUnsubscribeRequest,
        current_user: dict = Depends(require_internal_identity),
        db: Database = Depends(get_db),
    ):
        removed = await db.push.delete_subscription(int(current_user["id"]), payload.endpoint)
        return {"unsubscribed": removed}

    @app.post("/api/push/prompt-events")
    @limiter.limit("30/minute")
    async def record_prompt_event(
        request: Request,
        payload: ReminderPromptEvent,
        current_user: dict = Depends(require_internal_identity),
        db: Database = Depends(get_db),
    ):
        """How many students can get reminders on their device, and what they do when offered one."""
        recorded = await db.push.record_prompt_event(int(current_user["id"]), payload.device_state, payload.action)
        return {"recorded": recorded}

    @app.get("/api/push/reminders")
    async def send_reminders(authorization: str = Header(default=""), db: Database = Depends(get_db)):
        """Vercel Cron, once a day in the evening; disabled without a configured secret."""
        secret = get_settings().cron_secret
        if not secret or not hmac.compare_digest(authorization.encode(), f"Bearer {secret}".encode()):
            raise HTTPException(status_code=401, detail="Unauthorized")
        return await send_streak_reminders(db)
