"""Daily streak reminder over Web Push.

A Vercel Cron call (GET /api/push/reminders) runs `send_streak_reminders` once a day in the
evening. Every device whose student has solved nothing today gets one notification: the streak
at risk when there is one, otherwise an invitation to start a new one.
"""
import asyncio
import json
import logging
import time
from datetime import date, timedelta
from typing import Any, Awaitable, Callable, Dict, List, Optional
from urllib.parse import urlsplit

import aiohttp

from settings import get_settings
from utils.timezone import today_almaty

logger = logging.getLogger(__name__)

# Opened when the notification is tapped.
REMINDER_URL = "/modules"
REMINDER_TAG = "streak-reminder"

# A reminder that arrives the next morning is useless, so push services may drop it after this.
REMINDER_TTL_SECONDS = 6 * 60 * 60
CONFIRMATION_TTL_SECONDS = 10 * 60

BATCH_SIZE = 200
CONCURRENCY = 20
SEND_TIMEOUT_SECONDS = 10
# The API function may run for 60 s on Vercel; stop claiming new batches well before that.
TIME_BUDGET_SECONDS = 40

# The push service says the subscription no longer exists: forget the device.
GONE_STATUSES = {404, 410}

# Browsers only hand out endpoints on these push services. Anything else is refused, so the
# server never posts to an address a client made up.
ALLOWED_PUSH_HOST_SUFFIXES = (
    "fcm.googleapis.com",                 # Chrome, Android, Opera, Samsung Internet
    "android.googleapis.com",             # older Chrome
    "updates.push.services.mozilla.com",  # Firefox
    "push.apple.com",                     # Safari, iOS home-screen apps
    "notify.windows.com",                 # Edge
)

Sender = Callable[..., Awaitable[str]]


class _NoRedirectSession:
    """Thin wrapper around aiohttp.ClientSession that disables HTTP redirects."""

    def __init__(self) -> None:
        self._session: Optional[aiohttp.ClientSession] = None

    async def __aenter__(self) -> "_NoRedirectSession":
        self._session = aiohttp.ClientSession()
        await self._session.__aenter__()
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        if self._session is not None:
            await self._session.__aexit__(exc_type, exc, tb)
            self._session = None

    def post(self, url: Any, **kwargs: Any):
        assert self._session is not None
        kwargs["allow_redirects"] = False
        return self._session.post(url, **kwargs)

    def request(self, method: str, url: Any, **kwargs: Any):
        assert self._session is not None
        kwargs["allow_redirects"] = False
        return self._session.request(method, url, **kwargs)

    def __getattr__(self, name: str) -> Any:
        assert self._session is not None
        return getattr(self._session, name)


def push_service_host(endpoint: str) -> str:
    """The push service's host name (fcm.googleapis.com, web.push.apple.com, ...) for logs."""
    try:
        return (urlsplit(endpoint).hostname or "unknown").lower()
    except ValueError:
        return "unknown"


def push_refusal_reason(exc: Any) -> str:
    """The push service's own words from a pywebpush failure, short and on one line."""
    message = str(getattr(exc, "message", "") or "")
    body = message.split("Response body:", 1)[1] if "Response body:" in message else message
    return " ".join(body.split())[:200]


def is_allowed_push_endpoint(endpoint: str) -> bool:
    if not isinstance(endpoint, str) or not endpoint or endpoint != endpoint.strip():
        return False
    if any(ord(ch) < 32 or ord(ch) == 127 or ch.isspace() for ch in endpoint):
        return False
    try:
        parts = urlsplit(endpoint)
        port = parts.port
    except ValueError:
        return False
    host = (parts.hostname or "").lower()
    if parts.scheme != "https" or not host:
        return False
    if parts.username is not None or parts.password is not None:
        return False
    if port not in (None, 443):
        return False
    return any(host == suffix or host.endswith(f".{suffix}") for suffix in ALLOWED_PUSH_HOST_SUFFIXES)


def push_enabled() -> bool:
    settings = get_settings()
    return bool(settings.vapid_public_key and settings.vapid_private_key)


def _streak_at_risk(streak: Any, last_streak_date: Any, today: date) -> bool:
    """True when the streak is alive (last solved yesterday) and ends tonight unless the student solves."""
    if not last_streak_date or int(streak or 0) <= 0:
        return False
    return str(last_streak_date)[:10] == (today - timedelta(days=1)).isoformat()


def _ru_days(count: int) -> str:
    """Russian noun form after a number: 1 день, 3 дня, 5 дней, 11 дней, 21 день."""
    if count % 10 == 1 and count % 100 != 11:
        return "день"
    if 2 <= count % 10 <= 4 and not 12 <= count % 100 <= 14:
        return "дня"
    return "дней"


def _is_russian(language: Optional[str]) -> bool:
    """The student picked Russian in the profile; anything else (or nothing) is Kazakh, the default."""
    return language == "ru"


def build_reminder(streak: Any, last_streak_date: Any, today: date, language: Optional[str] = None) -> Dict[str, str]:
    russian = _is_russian(language)
    if _streak_at_risk(streak, last_streak_date, today):
        days = int(streak)
        return {
            "title": f"🔥 Серия {days} {_ru_days(days)}" if russian else f"🔥 {days} күндік серия",
            "body": (
                "Решите сегодня одну задачу, чтобы серия не прервалась."
                if russian
                else "Серия үзілмеуі үшін бүгін бір есеп шығарыңыз."
            ),
            "url": REMINDER_URL,
            "tag": REMINDER_TAG,
        }
    return {
        "title": "📚 Урок на сегодня" if russian else "📚 Бүгінгі сабақ",
        "body": (
            "Решите сегодня несколько задач и начните новую серию."
            if russian
            else "Бүгін бірнеше есеп шығарып, жаңа серия бастаңыз."
        ),
        "url": REMINDER_URL,
        "tag": REMINDER_TAG,
    }


def build_confirmation(language: Optional[str] = None) -> Dict[str, str]:
    russian = _is_russian(language)
    return {
        "title": "🔔 Напоминание включено" if russian else "🔔 Еске салу қосылды",
        "body": (
            "Если сегодня не решите ни одной задачи, напомним вечером."
            if russian
            else "Бүгін есеп шығармасаңыз, кешке еске саламыз."
        ),
        "url": REMINDER_URL,
        "tag": REMINDER_TAG,
    }


def _vapid_key():
    from py_vapid import Vapid

    return Vapid.from_string(private_key=get_settings().vapid_private_key)


async def send_push(
    subscription: Dict[str, Any],
    payload: Dict[str, str],
    *,
    session: aiohttp.ClientSession,
    vapid: Any,
    ttl: int,
) -> str:
    """Send one notification; returns "sent", "gone" (forget the device) or "failed"."""
    from pywebpush import WebPushException, webpush_async

    endpoint = subscription.get("endpoint") or ""
    if not is_allowed_push_endpoint(endpoint):
        logger.warning("Refused push delivery to disallowed endpoint host")
        return "failed"

    try:
        await webpush_async(
            subscription_info={
                "endpoint": endpoint,
                "keys": {"p256dh": subscription["p256dh"], "auth": subscription["auth"]},
            },
            data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=vapid,
            # A fresh dict every time: webpush_async writes the endpoint's audience into it.
            vapid_claims={"sub": get_settings().vapid_subject},
            ttl=ttl,
            timeout=SEND_TIMEOUT_SECONDS,
            aiohttp_session=session,
        )
        return "sent"
    except WebPushException as exc:
        outcome = "gone" if exc.status_code in GONE_STATUSES else "failed"
        # Which push service refused and why (e.g. Apple's {"reason":"BadJwtToken"}); never the
        # endpoint itself, which identifies the student's device.
        logger.warning(
            "Push %s: %s answered %s %s", outcome, push_service_host(endpoint), exc.status_code, push_refusal_reason(exc)
        )
        return outcome
    except (aiohttp.ClientError, asyncio.TimeoutError, OSError) as exc:
        logger.warning("Push failed: %s", type(exc).__name__)
        return "failed"
    except Exception:  # A broken key must not stop the other reminders.
        logger.exception("Push failed unexpectedly")
        return "failed"


async def send_confirmation(
    subscription: Dict[str, Any], sender: Optional[Sender] = None, language: Optional[str] = None
) -> str:
    """Show a notification right away, so the student sees that reminders work on this device."""
    sender = sender or send_push
    async with _NoRedirectSession() as session:
        return await sender(
            subscription, build_confirmation(language), session=session, vapid=_vapid_key(),
            ttl=CONFIRMATION_TTL_SECONDS,
        )


async def send_streak_reminders(
    db,
    *,
    today: Optional[date] = None,
    sender: Optional[Sender] = None,
    batch_size: int = BATCH_SIZE,
    time_budget_seconds: float = TIME_BUDGET_SECONDS,
) -> Dict[str, Any]:
    if not push_enabled():
        return {"enabled": False, "sent": 0, "gone": 0, "failed": 0}

    # Streaks and daily reminders both follow Kazakhstan time (Asia/Almaty, UTC+5).
    today = today or today_almaty()
    sender = sender or send_push
    vapid = _vapid_key()
    counts = {"sent": 0, "gone": 0, "failed": 0}
    gone: List[str] = []
    started = time.monotonic()
    limit = asyncio.Semaphore(CONCURRENCY)

    async with _NoRedirectSession() as session:
        async def deliver(device: Dict[str, Any]) -> None:
            payload = build_reminder(device["streak"], device["last_streak_date"], today, device.get("language"))
            async with limit:
                outcome = await sender(device, payload, session=session, vapid=vapid, ttl=REMINDER_TTL_SECONDS)
            counts[outcome] += 1
            if outcome == "gone":
                gone.append(device["endpoint"])

        while time.monotonic() - started < time_budget_seconds:
            devices = await db.push.claim_due_reminders(today.isoformat(), batch_size)
            if not devices:
                break
            await asyncio.gather(*(deliver(device) for device in devices))
            if len(devices) < batch_size:
                break

    if gone:
        await db.push.delete_endpoints(gone)
    logger.info("Streak reminders: %s", counts)
    return {"enabled": True, **counts}
