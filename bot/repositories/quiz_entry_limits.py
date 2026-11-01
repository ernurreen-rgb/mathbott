"""Durable network quotas for public quiz PIN lookups and guest joins."""
import json
import math
import re
import time

import storage as db_driver
from settings import get_settings


_CLIENT_KEY = re.compile(r"[0-9a-f]{64}")
_PIN_CODE = re.compile(r"[0-9]{6}")
_WINDOW_SECONDS = 60
_RETENTION_SECONDS = 3600


def _entry_timestamp(now: float | None) -> int:
    value = time.time() if now is None else now
    if not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        raise ValueError("Quiz entry time must be a finite non-negative timestamp")
    return math.floor(value)


def _validate_client_key(client_key: str) -> None:
    if not isinstance(client_key, str) or _CLIENT_KEY.fullmatch(client_key) is None:
        raise ValueError("Quiz entry client key must be 64 lowercase hexadecimal characters")


class QuizEntryLimitsMixin:
    @staticmethod
    def _entry_retry_after(row: dict, now: int) -> int:
        return max(1, int(row["window_start"]) + _WINDOW_SECONDS - now)

    async def _load_quiz_entry_limit(self, db, client_key: str, now: int) -> dict:
        """Load/reset one bucket while the caller holds the shared write lock."""
        await db.execute("DELETE FROM quiz_entry_limits WHERE expires_at <= ?", (now,))
        db.row_factory = db_driver.Row
        async with db.execute("SELECT * FROM quiz_entry_limits WHERE client_key = ?", (client_key,)) as cursor:
            record = await cursor.fetchone()
        row = dict(record) if record else None
        if row is None:
            row = {"client_key": client_key, "window_start": now // _WINDOW_SECONDS * _WINDOW_SECONDS,
                   "request_count": 0, "pin_codes": "[]", "new_participants": 0,
                   "expires_at": now + _RETENTION_SECONDS}
            await db.execute(
                """INSERT INTO quiz_entry_limits
                   (client_key, window_start, request_count, pin_codes, new_participants, expires_at)
                   VALUES (?, ?, 0, '[]', 0, ?)""",
                (client_key, row["window_start"], row["expires_at"]),
            )
            return row
        # A backward wall-clock adjustment must never reopen an exhausted bucket.
        if now >= row["window_start"] + _WINDOW_SECONDS:
            row.update(window_start=now // _WINDOW_SECONDS * _WINDOW_SECONDS,
                       request_count=0, pin_codes="[]", new_participants=0)
        row["expires_at"] = max(row["expires_at"], now + _RETENTION_SECONDS)
        await db.execute(
            """UPDATE quiz_entry_limits SET window_start = ?, request_count = ?, pin_codes = ?,
                   new_participants = ?, expires_at = ? WHERE client_key = ?""",
            (row["window_start"], row["request_count"], row["pin_codes"],
             row["new_participants"], row["expires_at"], client_key),
        )
        return row

    async def consume_entry_request(self, client_key: str, pin_code: str, *, now: float | None = None) -> int:
        """Commit request accounting even on denial; return zero or Retry-After seconds."""
        _validate_client_key(client_key)
        if not isinstance(pin_code, str) or _PIN_CODE.fullmatch(pin_code) is None:
            raise ValueError("Quiz PIN must contain exactly six digits")
        timestamp = _entry_timestamp(now)
        settings = get_settings()
        async with self._write_transaction() as db:
            row = await self._load_quiz_entry_limit(db, client_key, timestamp)
            pins = json.loads(row["pin_codes"])
            new_pin = pin_code not in pins
            denied = (row["request_count"] >= settings.quiz_entry_requests_per_minute
                      or (new_pin and len(pins) >= settings.quiz_entry_distinct_pins_per_minute))
            # A rolling deployment may temporarily lower the configured limit.
            # Saturating must never erase consumption recorded by another worker.
            request_count = max(row["request_count"], min(
                row["request_count"] + 1, settings.quiz_entry_requests_per_minute + 1,
            ))
            if new_pin and len(pins) < settings.quiz_entry_distinct_pins_per_minute:
                pins.append(pin_code)
            await db.execute(
                "UPDATE quiz_entry_limits SET request_count = ?, pin_codes = ? WHERE client_key = ?",
                (request_count, json.dumps(pins, separators=(",", ":")), client_key),
            )
            return self._entry_retry_after(row, timestamp) if denied else 0

    async def _reserve_quiz_entry_slot(self, db, client_key: str, *, now: float | None = None) -> int:
        """Reserve a new guest in the join transaction; resume operations bypass this."""
        _validate_client_key(client_key)
        timestamp = _entry_timestamp(now)
        row = await self._load_quiz_entry_limit(db, client_key, timestamp)
        if row["new_participants"] >= get_settings().quiz_entry_new_participants_per_minute:
            return self._entry_retry_after(row, timestamp)
        await db.execute(
            "UPDATE quiz_entry_limits SET new_participants = new_participants + 1 WHERE client_key = ?",
            (client_key,),
        )
        return 0

    async def cleanup_entry_limits(self, now: float | None = None) -> int:
        """Expire idle network buckets, using the indexed retention timestamp."""
        timestamp = _entry_timestamp(now)
        async with self._write_transaction() as db:
            cursor = await db.execute("DELETE FROM quiz_entry_limits WHERE expires_at <= ?", (timestamp,))
            return max(0, cursor.rowcount)
