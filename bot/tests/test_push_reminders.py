"""Daily streak reminder over Web Push.

Run from bot/: python -m pytest tests/test_push_reminders.py

The database tests need TEST_DATABASE_URL (see tests/postgres_test_db.py).
"""
import base64
import os
import unittest
from datetime import date
from unittest.mock import AsyncMock, patch

import httpx
from cryptography.hazmat.primitives import serialization
from fastapi import FastAPI
from py_vapid import Vapid
from slowapi import Limiter
from slowapi.util import get_remote_address

from postgres_test_db import PostgresTestCase
from routes.push import setup_push_routes
from services.streak_reminders import build_confirmation, build_reminder, is_allowed_push_endpoint, send_streak_reminders

TODAY = date(2026, 11, 15)
STUDENT = "push-student@example.com"
OTHER = "push-other@example.com"
CRON_SECRET = "push-cron-secret"


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _vapid_environment() -> dict:
    vapid = Vapid()
    vapid.generate_keys()
    private_key = vapid.private_key.private_numbers().private_value.to_bytes(32, "big")
    public_key = vapid.public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return {"VAPID_PUBLIC_KEY": _b64url(public_key), "VAPID_PRIVATE_KEY": _b64url(private_key), "CRON_SECRET": CRON_SECRET}


def _subscription(name: str) -> dict:
    return {
        "endpoint": f"https://fcm.googleapis.com/fcm/send/{name}",
        "keys": {"p256dh": _b64url(b"\x04" + bytes(64)), "auth": _b64url(bytes(16))},
    }


class ReminderTextTests(unittest.TestCase):
    def test_a_streak_that_ends_tonight_is_named(self):
        reminder = build_reminder(5, "2026-11-14", TODAY)
        self.assertEqual(reminder["title"], "🔥 5 күндік серия")
        self.assertEqual(reminder["url"], "/modules")

    def test_without_a_live_streak_the_student_is_invited_to_start_one(self):
        for streak, last in [(0, None), (5, "2026-11-12"), (0, "2026-11-14")]:
            self.assertEqual(build_reminder(streak, last, TODAY)["title"], "📚 Бүгінгі сабақ", (streak, last))

    def test_a_student_who_chose_russian_gets_russian_texts(self):
        self.assertEqual(build_reminder(5, "2026-11-14", TODAY, "ru")["title"], "🔥 Серия 5 дней")
        self.assertEqual(build_reminder(1, "2026-11-14", TODAY, "ru")["title"], "🔥 Серия 1 день")
        self.assertEqual(build_reminder(3, "2026-11-14", TODAY, "ru")["title"], "🔥 Серия 3 дня")
        self.assertEqual(build_reminder(12, "2026-11-14", TODAY, "ru")["title"], "🔥 Серия 12 дней")
        self.assertEqual(build_reminder(21, "2026-11-14", TODAY, "ru")["title"], "🔥 Серия 21 день")
        self.assertEqual(build_reminder(0, None, TODAY, "ru")["title"], "📚 Урок на сегодня")
        self.assertEqual(build_confirmation("ru")["title"], "🔔 Напоминание включено")

    def test_kazakh_stays_the_default(self):
        for language in (None, "kk", "en"):
            self.assertEqual(build_reminder(5, "2026-11-14", TODAY, language)["title"], "🔥 5 күндік серия")
            self.assertEqual(build_confirmation(language)["title"], "🔔 Еске салу қосылды")

    def test_only_real_push_services_are_accepted(self):
        for endpoint in [
            "https://fcm.googleapis.com/fcm/send/abc",
            "https://updates.push.services.mozilla.com/wpush/v2/abc",
            "https://web.push.apple.com/abc",
            "https://wns2-par02p.notify.windows.com/w/?token=abc",
        ]:
            self.assertTrue(is_allowed_push_endpoint(endpoint), endpoint)
        for endpoint in [
            "http://fcm.googleapis.com/fcm/send/abc",
            "https://evil.example.com/fcm.googleapis.com",
            "https://fcm.googleapis.com.evil.example.com/abc",
            "https://localhost/abc",
            "not a url",
        ]:
            self.assertFalse(is_allowed_push_endpoint(endpoint), endpoint)


class PushRefusalLogTests(unittest.IsolatedAsyncioTestCase):
    async def test_a_refused_push_logs_the_service_and_its_answer_but_not_the_device(self):
        from types import SimpleNamespace

        from pywebpush import WebPushException

        from services.streak_reminders import send_push

        endpoint = "https://web.push.apple.com/QGuQyavXutnMei3dJdoBxRkZaUanUqkI9DDC7Ss1eOy06BSxD"
        refusal = WebPushException(
            'Push failed: 410 Gone\nResponse body:{"reason": "Unregistered"}',
            response=SimpleNamespace(status_code=410),
        )
        device = _flat(_subscription("a")) | {"endpoint": endpoint}
        with patch("pywebpush.webpush_async", AsyncMock(side_effect=refusal)), \
                self.assertLogs("services.streak_reminders", level="WARNING") as logs:
            outcome = await send_push(device, {"title": "x"}, session=None, vapid=None, ttl=60)
        self.assertEqual(outcome, "gone")
        line = "\n".join(logs.output)
        self.assertIn("web.push.apple.com answered 410", line)
        self.assertIn('{"reason": "Unregistered"}', line)
        self.assertNotIn("QGuQyavXut", line)


class PushReminderTests(PostgresTestCase):
    environment = _vapid_environment()

    async def asyncSetUp(self):
        await super().asyncSetUp()
        self.student = await self.db.users.create_user_by_email(STUDENT)
        self.other = await self.db.users.create_user_by_email(OTHER)

    def _client(self):
        app = FastAPI()
        app.state.db = self.db
        limiter = Limiter(key_func=get_remote_address)
        app.state.limiter = limiter
        setup_push_routes(app, self.db, limiter)
        return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://push.test")

    async def _set_streak(self, user_id: int, streak: int, last_streak_date):
        async with self.seed() as connection:
            await connection.execute(
                "UPDATE users SET streak = ?, last_streak_date = ? WHERE id = ?", (streak, last_streak_date, user_id)
            )

    async def _endpoints(self) -> dict:
        async with self.connect() as connection:
            async with connection.execute(
                "SELECT endpoint, user_id, last_reminded_on FROM push_subscriptions ORDER BY id"
            ) as cursor:
                return {row[0]: (row[1], row[2]) for row in await cursor.fetchall()}

    async def test_config_returns_the_public_key(self):
        async with self._client() as client:
            response = await client.get("/api/push/config")
        self.assertEqual(response.json(), {"enabled": True, "public_key": self.environment["VAPID_PUBLIC_KEY"]})

    async def test_turning_reminders_on_saves_the_device_and_confirms_it(self):
        confirm = AsyncMock(return_value="sent")
        with patch("routes.push.send_confirmation", confirm):
            async with self._client() as client:
                response = await client.post("/api/push/subscriptions", params={"email": STUDENT}, json=_subscription("a"))
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.json(), {"subscribed": True, "confirmation": "sent"})

                # A silent re-sync from the settings page moves the device to the account signed in now.
                quiet = {**_subscription("a"), "confirm": False}
                response = await client.post("/api/push/subscriptions", params={"email": OTHER}, json=quiet)
                self.assertEqual(response.json(), {"subscribed": True, "confirmation": None})
        confirm.assert_awaited_once()
        self.assertEqual(await self._endpoints(), {_subscription("a")["endpoint"]: (self.other["id"], None)})

    async def test_the_confirmation_and_errors_follow_the_profile_language(self):
        async with self.seed() as connection:
            await connection.execute("UPDATE users SET language = 'ru' WHERE id = ?", (self.student["id"],))
        confirm = AsyncMock(return_value="gone")
        with patch("routes.push.send_confirmation", confirm):
            async with self._client() as client:
                response = await client.post("/api/push/subscriptions", params={"email": STUDENT}, json=_subscription("a"))
        self.assertEqual(confirm.await_args.kwargs["language"], "ru")
        self.assertEqual(response.status_code, 410)
        self.assertEqual(response.json()["detail"], "Подписка на уведомления недействительна")

    async def test_the_cron_sends_each_student_their_language(self):
        await self._set_streak(self.student["id"], 5, "2026-11-14")
        await self._set_streak(self.other["id"], 5, "2026-11-14")
        async with self.seed() as connection:
            await connection.execute("UPDATE users SET language = 'ru' WHERE id = ?", (self.student["id"],))
        await self.db.push.save_subscription(self.student["id"], **_flat(_subscription("ru-phone")))
        await self.db.push.save_subscription(self.other["id"], **_flat(_subscription("kk-phone")))
        sent = {}

        async def sender(device, payload, **_):
            sent[device["endpoint"].rsplit("/", 1)[1]] = payload["title"]
            return "sent"

        await send_streak_reminders(self.db, today=TODAY, sender=sender)
        self.assertEqual(sent, {"ru-phone": "🔥 Серия 5 дней", "kk-phone": "🔥 5 күндік серия"})

    async def test_a_device_the_push_service_rejects_is_not_kept(self):
        with patch("routes.push.send_confirmation", AsyncMock(return_value="gone")):
            async with self._client() as client:
                response = await client.post("/api/push/subscriptions", params={"email": STUDENT}, json=_subscription("a"))
        self.assertEqual(response.status_code, 410)
        self.assertEqual(await self._endpoints(), {})

    async def test_made_up_endpoints_and_keys_are_refused(self):
        bad = [
            {**_subscription("a"), "endpoint": "https://intranet.example.com/push"},
            {**_subscription("a"), "keys": {"p256dh": "short", "auth": _b64url(bytes(16))}},
            {**_subscription("a"), "keys": {"p256dh": _b64url(b"\x04" + bytes(64)), "auth": "x"}},
        ]
        with patch("routes.push.send_confirmation", AsyncMock(return_value="sent")) as confirm:
            async with self._client() as client:
                for body in bad:
                    response = await client.post("/api/push/subscriptions", params={"email": STUDENT}, json=body)
                    self.assertEqual(response.status_code, 422, body)
        confirm.assert_not_awaited()
        self.assertEqual(await self._endpoints(), {})

    async def test_turning_reminders_off_removes_only_your_own_device(self):
        await self.db.push.save_subscription(self.student["id"], **_flat(_subscription("a")))
        async with self._client() as client:
            response = await client.post("/api/push/unsubscribe", params={"email": OTHER},
                                         json={"endpoint": _subscription("a")["endpoint"]})
            self.assertEqual(response.json(), {"unsubscribed": False})
            response = await client.post("/api/push/unsubscribe", params={"email": STUDENT},
                                         json={"endpoint": _subscription("a")["endpoint"]})
            self.assertEqual(response.json(), {"unsubscribed": True})
        self.assertEqual(await self._endpoints(), {})

    async def test_reminders_go_once_a_day_to_students_who_have_not_solved_today(self):
        solved_today = await self.db.users.create_user_by_email("push-done@example.com")
        lapsed = await self.db.users.create_user_by_email("push-lapsed@example.com")
        await self._set_streak(self.student["id"], 5, "2026-11-14")
        await self._set_streak(solved_today["id"], 3, "2026-11-15")
        await self._set_streak(lapsed["id"], 2, "2026-11-10")
        await self._set_streak(self.other["id"], 1, "2026-11-14")
        await self.db.push.save_subscription(self.student["id"], **_flat(_subscription("student-phone")))
        await self.db.push.save_subscription(self.student["id"], **_flat(_subscription("student-laptop")))
        await self.db.push.save_subscription(solved_today["id"], **_flat(_subscription("done")))
        await self.db.push.save_subscription(lapsed["id"], **_flat(_subscription("lapsed")))
        await self.db.push.save_subscription(self.other["id"], **_flat(_subscription("expired")))

        sent = {}

        async def sender(device, payload, **_):
            sent[device["endpoint"].rsplit("/", 1)[1]] = payload["title"]
            return "gone" if device["endpoint"].endswith("expired") else "sent"

        result = await send_streak_reminders(self.db, today=TODAY, sender=sender, batch_size=2)
        self.assertEqual(result, {"enabled": True, "sent": 3, "gone": 1, "failed": 0})
        self.assertEqual(sent, {
            "student-phone": "🔥 5 күндік серия",
            "student-laptop": "🔥 5 күндік серия",
            "lapsed": "📚 Бүгінгі сабақ",
            "expired": "🔥 1 күндік серия",
        })
        endpoints = await self._endpoints()
        self.assertNotIn(_subscription("expired")["endpoint"], endpoints)
        self.assertEqual(endpoints[_subscription("done")["endpoint"]], (solved_today["id"], None))

        sent.clear()
        again = await send_streak_reminders(self.db, today=TODAY, sender=sender)
        self.assertEqual(again, {"enabled": True, "sent": 0, "gone": 0, "failed": 0})
        self.assertEqual(sent, {})

    async def test_the_cron_needs_its_secret(self):
        async with self._client() as client:
            self.assertEqual((await client.get("/api/push/reminders")).status_code, 401)
            wrong = await client.get("/api/push/reminders", headers={"Authorization": "Bearer nope"})
            self.assertEqual(wrong.status_code, 401)
            with patch("routes.push.send_streak_reminders", AsyncMock(return_value={"enabled": True})) as run:
                ok = await client.get("/api/push/reminders", headers={"Authorization": f"Bearer {CRON_SECRET}"})
        self.assertEqual(ok.status_code, 200)
        run.assert_awaited_once()

    async def test_nothing_is_sent_without_keys(self):
        await self.db.push.save_subscription(self.student["id"], **_flat(_subscription("a")))
        sender = AsyncMock(return_value="sent")
        with patch.dict(os.environ, {"VAPID_PUBLIC_KEY": "", "VAPID_PRIVATE_KEY": ""}):
            result = await send_streak_reminders(self.db, today=TODAY, sender=sender)
            async with self._client() as client:
                config = await client.get("/api/push/config")
                subscribe = await client.post("/api/push/subscriptions", params={"email": STUDENT}, json=_subscription("b"))
        self.assertEqual(result["enabled"], False)
        sender.assert_not_awaited()
        self.assertEqual(config.json(), {"enabled": False, "public_key": None})
        self.assertEqual(subscribe.status_code, 503)

    async def test_what_students_do_with_the_reminder_offer_is_recorded_and_pruned(self):
        async with self._client() as client:
            for body in [
                {"device_state": "install", "action": "seen"},
                {"device_state": "off", "action": "offered"},
                {"device_state": "off", "action": "snoozed"},
            ]:
                response = await client.post("/api/push/prompt-events", params={"email": STUDENT}, json=body)
                self.assertEqual(response.json(), {"recorded": True}, body)
            for bad in [{"device_state": "maybe", "action": "seen"}, {"device_state": "off", "action": "clicked"}]:
                response = await client.post("/api/push/prompt-events", params={"email": STUDENT}, json=bad)
                self.assertEqual(response.status_code, 422, bad)
        async with self.connect() as connection:
            async with connection.execute(
                "SELECT user_id, device_state, action FROM reminder_prompt_events ORDER BY id"
            ) as cursor:
                rows = [tuple(row) for row in await cursor.fetchall()]
        self.assertEqual(rows, [(self.student["id"], "install", "seen"), (self.student["id"], "off", "offered"),
                                (self.student["id"], "off", "snoozed")])

        async with self.seed() as connection:
            await connection.execute(
                "UPDATE reminder_prompt_events SET created_at = mathbot_datetime('now', '-91 days') WHERE action = 'seen'"
            )
        self.assertEqual(await self.db.push.cleanup_old_prompt_events(90), 1)
        self.assertEqual(await self.db.push.cleanup_old_prompt_events(90), 0)


def _flat(subscription: dict) -> dict:
    return {"endpoint": subscription["endpoint"], **subscription["keys"]}
