"""
Application timezone helpers (Kazakhstan UTC+5 / Asia/Almaty).
"""
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

try:
    APP_TZ = ZoneInfo("Asia/Almaty")
except ZoneInfoNotFoundError:
    # Kazakhstan operates on permanent UTC+5 (no DST); fallback when system tzdata is absent.
    APP_TZ = timezone(timedelta(hours=5), name="Asia/Almaty")


def now_almaty() -> datetime:
    """Return timezone-aware current datetime in Asia/Almaty (UTC+5)."""
    return datetime.now(APP_TZ)


def today_almaty() -> date:
    """Return current calendar date in Asia/Almaty (UTC+5)."""
    return now_almaty().date()
