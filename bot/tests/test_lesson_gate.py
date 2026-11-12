"""Mandatory mistake review: the next lesson waits until the lesson before it has been reviewed.

Run from bot/: python -m pytest tests/test_lesson_gate.py

Needs TEST_DATABASE_URL (see tests/postgres_test_db.py).
"""
import unittest

import httpx
from fastapi import FastAPI
from slowapi import Limiter
from slowapi.util import get_remote_address

from postgres_test_db import PostgresTestCase
from repositories.module_review_repository import LESSON_LOCKED_MESSAGE
from routes.modules import setup_modules_routes
from routes.tasks import setup_tasks_routes

ADMIN = "gate-admin@example.com"
STUDENT = "gate-student@example.com"

# lesson -> section, sort order, mini-lessons (id, index) and their placements (task id, answer)
LAYOUT = {
    1: (2, 0, [(1, 1, [(101, "1")]), (2, 2, [(102, "2"), (103, "3")])]),
    2: (2, 1, [(3, 1, [(201, "4")])]),
    3: (1, 0, [(4, 1, [(301, "5")])]),
    4: (1, 1, [(5, 1, [(401, "6")])]),
}


class LessonGateTests(PostgresTestCase):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        await self.db.users.create_user_by_email(ADMIN, check_admin_email=ADMIN)
        await self.db.users.set_admin_with_role(email=ADMIN, is_admin=True, role="super_admin")
        await self.db.users.create_user_by_email(STUDENT)
        self.admin = await self.db.users.get_user_by_email(ADMIN)
        self.student = await self.db.users.get_user_by_email(STUDENT)

        self.bank_ids = {}
        async with self.seed() as connection:
            await connection.execute("INSERT INTO modules (id, name) VALUES (1, 'Арифметика')")
            # Journey order follows sort order, not ids: section 2 comes first.
            await connection.execute("INSERT INTO sections (id, module_id, name, sort_order) VALUES (1, 1, 'Көбейту', 1)")
            await connection.execute("INSERT INTO sections (id, module_id, name, sort_order) VALUES (2, 1, 'Қосу', 0)")
            for lesson_id, (section_id, order, minis) in LAYOUT.items():
                await connection.execute(
                    "INSERT INTO lessons (id, section_id, title, lesson_number, sort_order) VALUES (?, ?, ?, ?, ?)",
                    (lesson_id, section_id, f"Сабақ {lesson_id}", lesson_id, order),
                )
                for mini_id, mini_index, _tasks in minis:
                    await connection.execute(
                        "INSERT INTO mini_lessons (id, lesson_id, mini_index) VALUES (?, ?, ?)", (mini_id, lesson_id, mini_index),
                    )
            await connection.commit()
        for lesson_id, (_section, _order, minis) in LAYOUT.items():
            for mini_id, _index, tasks in minis:
                for position, (task_id, answer) in enumerate(tasks):
                    bank = await self.db.bank_tasks.create_task(
                        text=f"Есеп {task_id}", answer=answer, question_type="input", difficulty="A",
                    )
                    self.bank_ids[task_id] = bank["id"]
                    async with self.seed() as connection:
                        await connection.execute(
                            "INSERT INTO tasks (id, mini_lesson_id, bank_task_id, sort_order) VALUES (?, ?, ?, ?)",
                            (task_id, mini_id, bank["id"], position),
                        )
                        await connection.commit()


    async def _answer(self, user, task_id, *answers):
        task = await self.db.tasks.get_task_by_id(task_id)
        for answer in answers:
            await self.db.record_solution(user["id"], task_id, answer, answer == task["answer"], task_snapshot=task)

    async def _locks(self, user=None):
        return (await self.db.module_review.get_lesson_gate((user or self.student)["id"], 1))["locks"]

    async def test_next_lesson_waits_for_review_of_completed_mini_lessons(self):
        self.assertEqual(await self._locks(), {})
        await self._answer(self.student, 101, "0", "1")
        locks = await self._locks()
        self.assertEqual(list(locks), [2])
        self.assertEqual(locks[2], {
            "lesson_id": 1, "lesson_title": "Сабақ 1", "lesson_number": 1, "mini_lesson_id": 1, "pending": 1,
        })

        # A mini-lesson counts only once it is completed, as that is when its review is offered.
        await self._answer(self.student, 102, "0", "2")
        self.assertEqual((await self._locks())[2]["pending"], 1)
        await self._answer(self.student, 103, "3")
        self.assertEqual((await self._locks())[2]["pending"], 2)

        # No twins: each original is served once; right or wrong, the item is then done.
        review = self.db.module_review
        await review.submit_answer(self.student["id"], 1, 101, self.bank_ids[101], "1")
        self.assertEqual((await self._locks())[2]["mini_lesson_id"], 2)
        await review.submit_answer(self.student["id"], 2, 102, self.bank_ids[102], "9")
        self.assertEqual(await self._locks(), {})

    async def test_only_the_next_lesson_waits_even_across_sections(self):
        await self._answer(self.student, 201, "0", "4")
        locks = await self._locks()
        self.assertEqual(list(locks), [3])
        self.assertEqual(locks[3]["lesson_id"], 2)
        self.assertIsNone(await self.db.module_review.get_lesson_lock(self.student["id"], 4))
        self.assertEqual((await self.db.module_review.get_mini_lesson_lock(self.student["id"], 4))["lesson_id"], 2)

    async def test_a_started_lesson_never_closes(self):
        await self._answer(self.student, 201, "0")
        await self._answer(self.student, 101, "0", "1")
        self.assertEqual(await self._locks(), {})
        self.assertIsNone(await self.db.module_review.get_lesson_lock(self.student["id"], 2))

    async def test_routes_close_the_lesson_for_students_only(self):
        await self._answer(self.student, 101, "0", "1")
        await self._answer(self.admin, 101, "0", "1")
        app = FastAPI()
        app.state.db = self.db
        limiter = Limiter(key_func=get_remote_address)
        app.state.limiter = limiter
        setup_modules_routes(app, self.db, limiter)
        setup_tasks_routes(app, self.db, limiter)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://gate.test") as client:
            module = await client.get("/api/modules/1", params={"email": STUDENT})
            self.assertEqual(module.status_code, 200, module.text)
            lessons = [lesson for section in module.json()["sections"] for lesson in section["lessons"]]
            self.assertEqual([lesson["id"] for lesson in lessons], [1, 2, 3, 4])
            self.assertEqual([lesson["id"] for lesson in lessons if lesson["lock"]], [2])

            closed = (await client.get("/api/lessons/2", params={"email": STUDENT})).json()
            self.assertEqual(closed["lock"]["mini_lesson_id"], 1)
            self.assertTrue(closed["mini_lessons"])
            self.assertFalse(any(mini["tasks"] for mini in closed["mini_lessons"]))
            before = (await client.get("/api/lessons/1", params={"email": STUDENT})).json()
            self.assertIsNone(before["lock"])
            self.assertEqual(before["next_lesson"], {"id": 2, "title": "Сабақ 2", "lesson_number": 2, "locked": True})

            refused = await client.post("/api/task/check", json={"task_id": 201, "answer": "4", "email": STUDENT})
            self.assertEqual(refused.status_code, 423)
            self.assertEqual(refused.json()["detail"], LESSON_LOCKED_MESSAGE)
            self.assertIsNotNone(await self.db.module_review.get_lesson_lock(self.student["id"], 2))

            # Admins check content freely, with or without their own mistakes.
            admin_module = (await client.get("/api/modules/1", params={"email": ADMIN})).json()
            self.assertFalse(any(lesson["lock"] for section in admin_module["sections"] for lesson in section["lessons"]))
            admin_lesson = (await client.get("/api/lessons/1", params={"email": ADMIN})).json()
            self.assertFalse(admin_lesson["next_lesson"]["locked"])
            admin_answer = await client.post("/api/task/check", json={"task_id": 201, "answer": "4", "email": ADMIN})
            self.assertEqual(admin_answer.status_code, 200, admin_answer.text)

            await self.db.module_review.submit_answer(self.student["id"], 1, 101, self.bank_ids[101], "1")
            opened = (await client.get("/api/lessons/2", params={"email": STUDENT})).json()
            self.assertIsNone(opened["lock"])
            self.assertEqual([task["id"] for task in opened["mini_lessons"][0]["tasks"]], [201])
            accepted = await client.post("/api/task/check", json={"task_id": 201, "answer": "4", "email": STUDENT})
            self.assertEqual(accepted.status_code, 200, accepted.text)
            self.assertTrue(accepted.json()["correct"])
            self.assertFalse((await client.get("/api/lessons/1", params={"email": STUDENT})).json()["next_lesson"]["locked"])


if __name__ == "__main__":
    unittest.main()
