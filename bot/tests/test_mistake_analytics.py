"""Mistake analytics for teachers against a real, isolated SQLite database.

Run from bot/: python -m pytest tests/test_mistake_analytics.py
"""
import gc
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx
from fastapi import FastAPI
from slowapi import Limiter
from slowapi.util import get_remote_address

import storage
from database import Database
from routes.admin.mistake_analytics import register_mistake_analytics_routes

ADMIN = "analytics-admin@example.test"
REVIEWER = "analytics-reviewer@example.test"
FIRST = "analytics-first@example.test"
SECOND = "analytics-second@example.test"


class MistakeAnalyticsTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.environment = patch.dict(os.environ, {"ENVIRONMENT": "development", "DATABASE_URL": "", "SENTRY_DSN": ""})
        self.environment.start()
        self.directory = tempfile.TemporaryDirectory(prefix="qazmath-analytics-tests-")
        self.db = Database(str(Path(self.directory.name) / "analytics.sqlite"), use_pool=False)
        await self.db.init()
        users = self.db.users
        await users.create_user_by_email(ADMIN, check_admin_email=ADMIN)
        await users.set_admin_with_role(email=ADMIN, is_admin=True, role="super_admin")
        await users.create_user_by_email(REVIEWER)
        await users.set_admin_with_role(email=REVIEWER, is_admin=True, role="reviewer")
        for email in (FIRST, SECOND):
            await users.create_user_by_email(email)
        self.first = await users.get_user_by_email(FIRST)
        self.second = await users.get_user_by_email(SECOND)
        admin = await users.get_user_by_email(ADMIN)

        bank = self.db.bank_tasks
        add = await bank.create_task(text="$27+15$", answer="42", question_type="input", difficulty="A", topics=["Қосу"])
        subtract = await bank.create_task(text="$100-37$", answer="63", question_type="input", difficulty="A", topics=["Азайту"])
        untopiced = await bank.create_task(text="$6\\cdot 7$", answer="42", question_type="input", difficulty="B")
        self.twin = await bank.create_twin(
            add["id"], text="$36+17$", answer="53", question_type="input", answer_mode="written", accepted_answers=[],
            text_scale="md", difficulty="A", topics=["Қосу"], options=None, subquestions=None, image_filename=None,
            keep_source_image=False, created_by=admin["id"], actor_email=ADMIN,
        )
        async with storage.connect(self.db.db_path) as connection:
            for module_id, name in ((1, "Арифметика"), (2, "Көбейту")):
                await connection.execute("INSERT INTO modules (id, name, sort_order) VALUES (?, ?, ?)", (module_id, name, module_id))
                await connection.execute("INSERT INTO sections (id, module_id, name) VALUES (?, ?, 'Бөлім')", (module_id, module_id))
                await connection.execute("INSERT INTO lessons (id, section_id, title) VALUES (?, ?, 'Сабақ')", (module_id, module_id))
                await connection.execute("INSERT INTO mini_lessons (id, lesson_id, mini_index) VALUES (?, ?, 1)", (module_id, module_id))
            for task_id, mini, bank_task in ((11, 1, add), (12, 1, subtract), (21, 2, untopiced)):
                await connection.execute("INSERT INTO tasks (id, mini_lesson_id, bank_task_id) VALUES (?, ?, ?)", (task_id, mini, bank_task["id"]))
            await connection.commit()

        # first: 11 wrong then right, 12 wrong then right. second: 11 right, 12 wrong only, 21 wrong then right (long ago).
        for user, task_id, answers in ((self.first, 11, ["40", "42"]), (self.first, 12, ["73", "63"]), (self.second, 11, ["42"]),
                                       (self.second, 12, ["60"]), (self.second, 21, ["48", "42"])):
            task = await self.db.tasks.get_task_by_id(task_id)
            for answer in answers:
                await self.db.record_solution(user["id"], task_id, answer, answer == task["answer"], task_snapshot=task)
        async with storage.connect(self.db.db_path) as connection:
            await connection.execute("UPDATE solutions SET created_at = '2000-01-01 00:00:00' WHERE task_id = 21")
            await connection.commit()
        # first resolves 11 on the twin and fails 12 on the original (no twins there): a weak spot.
        await self.db.module_review.submit_answer(self.first["id"], 1, 11, self.twin["id"], "53")
        await self.db.module_review.submit_answer(self.first["id"], 1, 12, subtract["id"], "73")

        app = FastAPI()
        app.state.db = self.db
        register_mistake_analytics_routes(app, self.db, Limiter(key_func=get_remote_address))
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://analytics.test")

    async def asyncTearDown(self):
        await self.client.aclose()
        gc.collect()
        self.directory.cleanup()
        self.environment.stop()

    async def _get(self, email=ADMIN, **params):
        response = await self.client.get("/api/admin/mistake-analytics", params={"email": email, **params})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    async def test_summary_tasks_topics_and_students_for_all_time(self):
        data = await self._get(period="all")
        self.assertEqual(data["summary"], {
            "first_attempts": 5, "mistakes": 4, "mistake_rate": 0.8, "resolved": 1, "weak": 1, "pending": 2,
            "tasks_with_mistakes": 3, "students_with_mistakes": 2, "tasks_without_twins": 2,
        })
        tasks = {task["task_id"]: task for task in data["tasks"]}
        self.assertEqual([task["task_id"] for task in data["tasks"]][0], 12)
        self.assertEqual({k: tasks[12][k] for k in ("attempted", "mistakes", "weak", "pending", "twin_count")},
                         {"attempted": 2, "mistakes": 2, "weak": 1, "pending": 1, "twin_count": 0})
        self.assertEqual({k: tasks[11][k] for k in ("attempted", "mistakes", "resolved", "twin_count", "mistake_rate")},
                         {"attempted": 2, "mistakes": 1, "resolved": 1, "twin_count": 1, "mistake_rate": 0.5})
        self.assertEqual(tasks[21]["location"]["module_name"], "Көбейту")
        topics = {topic["topic"]: topic for topic in data["topics"]}
        self.assertEqual({k: topics["Азайту"][k] for k in ("mistakes", "students", "weak", "pending")},
                         {"mistakes": 2, "students": 2, "weak": 1, "pending": 1})
        self.assertEqual(topics["Тақырыпсыз"]["mistakes"], 1)
        first, second = data["students"]
        self.assertEqual((first["user_id"], first["weak"], first["weak_topics"], first["email"]),
                         (self.first["id"], 1, ["Азайту"], FIRST))
        self.assertEqual((second["mistakes"], second["pending"]), (2, 2))
        self.assertEqual([module["name"] for module in data["modules"]], ["Арифметика", "Көбейту"])

    async def test_period_and_module_filters(self):
        recent = await self._get(period="30d")
        self.assertEqual((recent["summary"]["first_attempts"], recent["summary"]["mistakes"]), (4, 3))
        self.assertNotIn(21, {task["task_id"] for task in recent["tasks"]})
        module = await self._get(period="all", module_id=2)
        self.assertEqual([task["task_id"] for task in module["tasks"]], [21])
        self.assertEqual(module["filters"], {"period": "all", "module_id": 2})
        self.assertEqual((await self.client.get("/api/admin/mistake-analytics", params={"email": ADMIN, "period": "1y"})).status_code, 422)

    async def test_any_admin_reads_but_only_super_admin_sees_emails(self):
        reviewer = await self._get(email=REVIEWER, period="all")
        self.assertTrue(all("email" not in student for student in reviewer["students"]))
        self.assertEqual(reviewer["students"][0]["nickname"], self.first.get("nickname"))
        self.assertEqual((await self.client.get("/api/admin/mistake-analytics", params={"email": FIRST})).status_code, 403)
        self.assertEqual((await self.client.get("/api/admin/mistake-analytics")).status_code, 401)


if __name__ == "__main__":
    unittest.main()
