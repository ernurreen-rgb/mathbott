"""Module mistake review on twin tasks against a real, isolated PostgreSQL database.

Run from bot/: python -m unittest discover -s tests -p test_module_review.py -v

Needs TEST_DATABASE_URL (see tests/postgres_test_db.py).
"""
import unittest

import httpx
from fastapi import FastAPI
from slowapi import Limiter
from slowapi.util import get_remote_address

from postgres_test_db import PostgresTestCase
from repositories.bank_task_repository import BankTwinError
from repositories.module_review_repository import ModuleReviewError
from routes.admin.bank_twins import register_bank_twin_routes
from routes.module_review import setup_module_review_routes

ADMIN = "review-admin@example.test"
STUDENT = "review-student@example.test"


def _contains_key(value, key):
    if isinstance(value, dict):
        return key in value or any(_contains_key(item, key) for item in value.values())
    if isinstance(value, list):
        return any(_contains_key(item, key) for item in value)
    return False


class ModuleReviewTests(PostgresTestCase):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        await self.db.users.create_user_by_email(ADMIN, check_admin_email=ADMIN)
        await self.db.users.set_admin_with_role(email=ADMIN, is_admin=True, role="super_admin")
        await self.db.users.create_user_by_email(STUDENT)
        self.admin = await self.db.users.get_user_by_email(ADMIN)
        self.student = await self.db.users.get_user_by_email(STUDENT)

        bank = self.db.bank_tasks
        self.source = await bank.create_task(text="Есепте: 2 + 3", answer="5", question_type="input", difficulty="A", topics=["Қосу"])
        self.easy = await bank.create_task(text="Есепте: 1 + 1", answer="2", question_type="input", difficulty="A")
        self.lonely = await bank.create_task(text="Есепте: 9 - 4", answer="5", question_type="input", difficulty="A")
        self.unfinished = await bank.create_task(text="Есепте: 6 * 7", answer="42", question_type="input", difficulty="B")
        async with self.seed() as connection:
            await connection.execute("INSERT INTO modules (id, name) VALUES (1, 'Арифметика')")
            await connection.execute("INSERT INTO sections (id, module_id, name) VALUES (1, 1, 'Амалдар')")
            await connection.execute("INSERT INTO lessons (id, section_id, title) VALUES (1, 1, 'Қосу')")
            await connection.execute("INSERT INTO mini_lessons (id, lesson_id, mini_index) VALUES (1, 1, 1)")
            for task_id, bank_task, order in [(11, self.source, 0), (12, self.easy, 1), (13, self.lonely, 2), (14, self.unfinished, 3)]:
                await connection.execute(
                    "INSERT INTO tasks (id, mini_lesson_id, bank_task_id, sort_order) VALUES (?, ?, ?, ?)",
                    (task_id, 1, bank_task["id"], order),
                )
            await connection.commit()

        # 11 and 13: wrong first, then solved. 12: right first. 14: wrong and still unsolved.
        for task_id, answers in [(11, ["6", "5"]), (12, ["2"]), (13, ["4", "5"]), (14, ["40"])]:
            task = await self.db.tasks.get_task_by_id(task_id)
            for answer in answers:
                await self.db.record_solution(self.student["id"], task_id, answer, answer == task["answer"], task_snapshot=task)


    async def _twin(self, text, answer, source=None, **overrides):
        source = source or self.source
        payload = dict(
            text=text, answer=answer, question_type=source["question_type"], answer_mode=source["answer_mode"],
            accepted_answers=[], text_scale="md", difficulty=source["difficulty"], topics=source["topics"],
            options=None, subquestions=None, image_filename=None, keep_source_image=True,
            created_by=self.admin["id"], actor_email=ADMIN,
        )
        payload.update(overrides)
        return await self.db.bank_tasks.create_twin(source["id"], **payload)

    async def test_only_completed_first_attempt_mistakes_are_reviewed(self):
        review = await self.db.module_review.get_review(self.student["id"], 1)
        self.assertEqual([item["task_id"] for item in review["items"]], [11, 13])
        self.assertEqual(review["summary"], {"mistakes": 2, "resolved": 0, "weak": 0, "pending": 2})
        summaries = await self.db.module_review.get_lesson_summaries(self.student["id"], [1])
        self.assertEqual(summaries[1]["mistakes"], 2)

    async def test_unseen_twins_are_served_in_order_then_the_task_becomes_weak(self):
        first = await self._twin("Есепте: 4 + 3", "7")
        second = await self._twin("Есепте: 5 + 1", "6")
        review = await self.db.module_review.get_review(self.student["id"], 1)
        current = review["current"]
        self.assertEqual((current["task_id"], current["kind"], current["task"]["bank_task_id"]), (11, "twin", first["id"]))
        self.assertFalse(_contains_key(review, "answer"))

        result = await self.db.module_review.submit_answer(self.student["id"], 1, 11, first["id"], "8")
        self.assertFalse(result["correct"])
        self.assertEqual(result["correct_answer"], "7")
        self.assertTrue(result["has_next_twin"])
        current = (await self.db.module_review.get_review(self.student["id"], 1))["current"]
        self.assertEqual((current["task"]["bank_task_id"], current["attempt"]), (second["id"], 2))

        result = await self.db.module_review.submit_answer(self.student["id"], 1, 11, second["id"], "5")
        self.assertEqual(result["state"], "weak")
        self.assertFalse(result["has_next_twin"])

        # Without twins the original task is served once.
        current = (await self.db.module_review.get_review(self.student["id"], 1))["current"]
        self.assertEqual((current["task_id"], current["kind"], current["task"]["bank_task_id"]), (13, "original", self.lonely["id"]))
        result = await self.db.module_review.submit_answer(self.student["id"], 1, 13, self.lonely["id"], "5")
        self.assertTrue(result["correct"])
        self.assertIsNone(result["correct_answer"])
        self.assertEqual(result["summary"], {"mistakes": 2, "resolved": 1, "weak": 1, "pending": 0})
        self.assertIsNone((await self.db.module_review.get_review(self.student["id"], 1))["current"])

    async def test_answers_are_bound_to_the_served_task(self):
        first = await self._twin("Есепте: 4 + 3", "7")
        second = await self._twin("Есепте: 5 + 1", "6")
        with self.assertRaises(ModuleReviewError) as raised:
            await self.db.module_review.submit_answer(self.student["id"], 1, 11, second["id"], "6")
        self.assertEqual(raised.exception.kind, "conflict")
        with self.assertRaises(ModuleReviewError) as raised:
            await self.db.module_review.submit_answer(self.student["id"], 1, 12, self.easy["id"], "2")
        self.assertEqual(raised.exception.kind, "not_found")
        await self.db.module_review.submit_answer(self.student["id"], 1, 11, first["id"], "7")
        with self.assertRaises(ModuleReviewError) as raised:
            await self.db.module_review.submit_answer(self.student["id"], 1, 11, second["id"], "6")
        self.assertEqual(raised.exception.kind, "conflict")

    async def test_review_never_changes_progress_or_counters(self):
        twin = await self._twin("Есепте: 4 + 3", "7")
        before = await self.db.users.get_user_by_email(STUDENT)
        async with self.connect() as connection:
            async with connection.execute("SELECT COUNT(*) FROM solutions") as cursor:
                solutions_before = (await cursor.fetchone())[0]
        await self.db.module_review.submit_answer(self.student["id"], 1, 11, twin["id"], "7")
        after = await self.db.users.get_user_by_email(STUDENT)
        self.assertEqual((before["total_solved"], before["streak"]), (after["total_solved"], after["streak"]))
        async with self.connect() as connection:
            async with connection.execute("SELECT COUNT(*) FROM solutions") as cursor:
                self.assertEqual((await cursor.fetchone())[0], solutions_before)
        progress = await self.db.progress.calculate_mini_lesson_completion(self.student["id"], 1)
        self.assertEqual(progress["completed_count"], 3)

    async def test_twins_stay_out_of_library_pickers_and_quality(self):
        twin = await self._twin("Есепте: 4 + 3", "7")
        library = await self.db.bank_tasks.list_tasks(limit=50)
        self.assertNotIn(twin["id"], {item["id"] for item in library["items"]})
        self.assertEqual(next(item for item in library["items"] if item["id"] == self.source["id"])["twin_count"], 1)
        only = await self.db.bank_tasks.list_tasks(twins="only")
        self.assertEqual([item["id"] for item in only["items"]], [twin["id"]])
        self.assertEqual(twin["twin_source_id"], self.source["id"])
        self.assertEqual(twin["topics"], ["Қосу"])
        catalog = await self.db.bank_tasks.get_catalog()
        self.assertEqual((catalog["active_total"], catalog["twins_total"]), (4, 1))
        self.assertEqual({topic["name"]: topic["task_count"] for topic in catalog["topics"]}, {"Қосу": 1})
        dead = await self.db.bank_tasks.list_quality_dead_tasks()
        self.assertNotIn(twin["id"], {item["id"] for item in dead["items"]})
        self.assertEqual((await self.db.bank_tasks.get_quality_summary())["active_total"], 4)
        self.assertEqual(await self.db.bank_tasks.count_twins_for_bank_tasks([self.source["id"], self.easy["id"]]), {self.source["id"]: 1})

    async def test_twin_rules_reject_chains_type_changes_and_unchanged_copies(self):
        twin = await self._twin("Есепте: 4 + 3", "7")
        cases = [
            ("twin_of_twin", dict(source=twin)),
            ("question_type", dict(question_type="tf")),
            ("unchanged", dict(text="Есепте:  2 + 3", answer="5")),
        ]
        for code, overrides in cases:
            with self.assertRaises(BankTwinError) as raised:
                text = overrides.pop("text", "Есепте: 8 + 1")
                answer = overrides.pop("answer", "9")
                await self._twin(text, answer, **overrides)
            self.assertEqual(raised.exception.code, code)

    async def test_permanently_deleting_a_source_moves_its_twins_to_trash(self):
        twin = await self._twin("Есепте: 4 + 3", "7")
        await self.db.bank_tasks.soft_delete_task(self.source["id"], actor_user_id=self.admin["id"], source="test")
        self.assertIsNone((await self.db.bank_tasks.get_task_by_id(twin["id"]))["deleted_at"])
        self.assertTrue(await self.db.bank_tasks.hard_delete_task(self.source["id"], actor_user_id=self.admin["id"], actor_email=ADMIN))
        trashed = await self.db.bank_tasks.get_task_by_id(twin["id"], include_deleted=True)
        self.assertIsNotNone(trashed["deleted_at"])
        self.assertIsNone(trashed["twin_source_id"])

    async def test_routes_require_identity_and_never_leak_answers(self):
        app = FastAPI()
        app.state.db = self.db
        limiter = Limiter(key_func=get_remote_address)
        app.state.limiter = limiter
        setup_module_review_routes(app, self.db, limiter)
        register_bank_twin_routes(app, self.db, limiter)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://review.test") as client:
            self.assertEqual((await client.get("/api/mini-lessons/1/review")).status_code, 401)
            twin_form = {"email": ADMIN, "text": "Есепте: 4 + 3", "answer": "7", "question_type": "input",
                         "answer_mode": "written", "difficulty": "A", "topics": '["Қосу"]', "keep_source_image": "true"}
            self.assertEqual((await client.post(f"/api/admin/bank/tasks/{self.source['id']}/twins", data={**twin_form, "email": STUDENT})).status_code, 403)
            created = await client.post(f"/api/admin/bank/tasks/{self.source['id']}/twins", data=twin_form)
            self.assertEqual(created.status_code, 200, created.text)
            listed = await client.get(f"/api/admin/bank/tasks/{self.source['id']}/twins", params={"email": ADMIN})
            self.assertEqual([item["id"] for item in listed.json()["items"]], [created.json()["id"]])
            unchanged = await client.post(f"/api/admin/bank/tasks/{self.source['id']}/twins", data={**twin_form, "text": "Есепте: 2 + 3", "answer": "5"})
            self.assertEqual(unchanged.status_code, 400)

            review = await client.get("/api/mini-lessons/1/review", params={"email": STUDENT})
            self.assertEqual(review.status_code, 200, review.text)
            self.assertFalse(_contains_key(review.json(), "answer"))
            current = review.json()["current"]
            answer = await client.post("/api/mini-lessons/1/review/answers", params={"email": STUDENT}, json={
                "task_id": current["task_id"], "bank_task_id": current["task"]["bank_task_id"], "answer": "7",
            })
            self.assertEqual(answer.status_code, 200, answer.text)
            self.assertTrue(answer.json()["correct"])
            stale = await client.post("/api/mini-lessons/1/review/answers", params={"email": STUDENT}, json={
                "task_id": current["task_id"], "bank_task_id": current["task"]["bank_task_id"], "answer": "7",
            })
            self.assertEqual(stale.status_code, 409)
            self.assertEqual((await client.get("/api/mini-lessons/999/review", params={"email": STUDENT})).status_code, 404)


if __name__ == "__main__":
    unittest.main()
