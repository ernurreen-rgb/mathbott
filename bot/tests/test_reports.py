"""Student reports about a broken task.

Run from bot/: python -m pytest tests/test_reports.py

Needs TEST_DATABASE_URL (see tests/postgres_test_db.py).
"""
import httpx
from fastapi import FastAPI
from slowapi import Limiter
from slowapi.util import get_remote_address

from postgres_test_db import PostgresTestCase
from routes.reports import setup_reports_routes

STUDENT = "reports-student@example.com"
MESSAGE = "Дұрыс жауап нұсқаларда жоқ"


class ReportTests(PostgresTestCase):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        await self.db.users.create_user_by_email(STUDENT)
        self.student = await self.db.users.get_user_by_email(STUDENT)
        async with self.seed() as connection:
            await connection.execute("INSERT INTO modules (id, name) VALUES (1, 'Арифметика')")
            await connection.execute("INSERT INTO sections (id, module_id, name, sort_order) VALUES (1, 1, 'Қосу', 0)")
            await connection.execute(
                "INSERT INTO lessons (id, section_id, title, lesson_number, sort_order) VALUES (1, 1, 'Сабақ 1', 1, 0)"
            )
            await connection.execute("INSERT INTO mini_lessons (id, lesson_id, mini_index) VALUES (1, 1, 1)")
            await connection.commit()
        bank = await self.db.bank_tasks.create_task(text="2 + 2", answer="4", question_type="input", difficulty="A")
        async with self.seed() as connection:
            await connection.execute(
                "INSERT INTO tasks (id, mini_lesson_id, bank_task_id, sort_order) VALUES (101, 1, ?, 0)", (bank["id"],)
            )
            await connection.commit()

    def _client(self):
        app = FastAPI()
        app.state.db = self.db
        limiter = Limiter(key_func=get_remote_address)
        app.state.limiter = limiter
        setup_reports_routes(app, self.db, limiter)
        return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://reports.test")

    async def test_a_task_can_be_reported_before_any_attempt_once(self):
        async with self._client() as client:
            first = await client.post("/api/reports", params={"email": STUDENT}, json={"task_id": 101, "message": MESSAGE})
            self.assertEqual(first.status_code, 200, first.text)
            self.assertEqual(first.json()["status"], "pending")

            again = await client.post("/api/reports", params={"email": STUDENT}, json={"task_id": 101, "message": MESSAGE})
            self.assertEqual(again.status_code, 400)
            self.assertEqual(again.json()["detail"], "Сіз бұл есепті бұрын жібергенсіз")

            missing = await client.post("/api/reports", params={"email": STUDENT}, json={"task_id": 999, "message": MESSAGE})
            self.assertEqual(missing.status_code, 404)
            self.assertEqual(missing.json()["detail"], "Есеп табылмады")

        reports = await self.db.reports.get_user_reports(self.student["id"])
        self.assertEqual([(report["task_id"], report["message"]) for report in reports], [(101, MESSAGE)])
