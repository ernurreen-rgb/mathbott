"""Task constructor API (routes/constructor.py) against a real, isolated PostgreSQL database.

Needs TEST_DATABASE_URL (see tests/postgres_test_db.py).
Run from bot/: python -m pytest tests/test_task_constructor.py
"""
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import FastAPI
from slowapi import Limiter
from slowapi.util import get_remote_address

from postgres_test_db import PostgresTestCase
from repositories.task_collection_repository import MAX_COLLECTIONS_PER_USER
from routes.constructor import setup_constructor_routes

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def _task(index: int, **changes):
    task = {
        "text": f"Есептеңіз: {index}+2", "answer": "C", "question_type": "mcq", "answer_mode": "choices",
        "accepted_answers": [], "text_scale": "md", "difficulty": "ABC"[index % 3],
        "topics": ["Логарифм"] if index % 2 else ["Түбір"],
        "options": [{"label": label, "text": str(index + n)} for n, label in enumerate("ABCD")],
        "subquestions": None, "image_filename": None, "solution_filename": None,
    }
    task.update(changes)
    return task


class TaskConstructorTests(PostgresTestCase):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        self.owner = await self.db.users.create_user_by_email("teacher@example.test")
        self.other = await self.db.users.create_user_by_email("student@example.test")
        created = await self.db.bank_tasks.create_tasks_bulk_atomic(
            tasks=[_task(i) for i in range(1, 7)] + [
                _task(7, question_type="input", answer_mode="written", answer="15", options=None,
                      accepted_answers=["15,0"]),
                _task(8, question_type="select", answer='["A", "C"]',
                      subquestions=[{"text": "x+1=3", "correct": "A"}, {"text": "x+2=6", "correct": "C"}]),
            ],
            created_by=self.owner["id"], actor_email="teacher@example.test",
        )
        self.ids = [int(task["id"]) for task in created]
        await self.db.bank_tasks.soft_delete_task(self.ids[5], actor_user_id=self.owner["id"])
        async with self.seed() as connection:
            await connection.execute(
                "INSERT INTO bank_task_twins (source_bank_task_id, twin_bank_task_id) VALUES (?, ?)",
                (self.ids[0], self.ids[4]),
            )
        self.app = FastAPI()
        self.app.state.db = self.db
        setup_constructor_routes(self.app, self.db, Limiter(key_func=get_remote_address))

    def client(self):
        return httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://constructor.test")

    async def test_task_list_has_no_answers_twins_or_deleted_tasks(self):
        teacher = {"email": "teacher@example.test"}
        async with self.client() as client:
            self.assertEqual((await client.get("/api/constructor/tasks")).status_code, 401)
            listed = (await client.get("/api/constructor/tasks", params=teacher)).json()
            listed_ids = {item["id"] for item in listed["items"]}
            self.assertEqual(listed_ids, set(self.ids) - {self.ids[4], self.ids[5]})
            self.assertEqual(listed["total"], 6)
            for item in listed["items"]:
                self.assertNotIn("answer", item)
                self.assertNotIn("accepted_answers", item)
                self.assertTrue(all("correct" not in sub for sub in item["subquestions"]))
            by_difficulty = (await client.get("/api/constructor/tasks", params={**teacher, "difficulty": "A"})).json()
            self.assertTrue(by_difficulty["items"])
            self.assertTrue(all(item["difficulty"] == "A" for item in by_difficulty["items"]))
            by_topic = (await client.get("/api/constructor/tasks", params={**teacher, "topics": "Логарифм"})).json()
            self.assertTrue(all("Логарифм" in item["topics"] for item in by_topic["items"]))
            typed = (await client.get("/api/constructor/tasks", params={**teacher, "question_type": "input"})).json()
            self.assertEqual([item["id"] for item in typed["items"]], [self.ids[6]])
            for invalid in ({"limit": 51}, {"difficulty": "D"}, {"question_type": "essay"}):
                self.assertEqual(
                    (await client.get("/api/constructor/tasks", params={**teacher, **invalid})).status_code, 422
                )
            topics = (await client.get("/api/constructor/topics", params=teacher)).json()["items"]
            self.assertEqual(set(topics), {"Логарифм", "Түбір"})

    async def test_collections_belong_to_their_owner_and_keep_task_order(self):
        teacher, student = {"email": "teacher@example.test"}, {"email": "student@example.test"}
        async with self.client() as client:
            created = (await client.post("/api/constructor/collections", params=teacher,
                                         json={"title": "  Логарифм   қасиеттері "})).json()
            self.assertEqual((created["title"], created["header_text"], created["tasks"]),
                             ("Логарифм қасиеттері", "", []))
            url = f"/api/constructor/collections/{created['id']}"
            order = [self.ids[7], self.ids[4], self.ids[0], self.ids[5], 999999, self.ids[2]]
            saved = (await client.put(url, params=teacher, json={
                "task_ids": order, "header_text": " Ернұр  ағайдан ", "title": "Логарифм"})).json()
            # Twin tasks, deleted tasks, and unknown ids are left out; the rest keep the given order.
            self.assertEqual([task["id"] for task in saved["tasks"]], [self.ids[7], self.ids[0], self.ids[2]])
            self.assertEqual((saved["title"], saved["header_text"]), ("Логарифм", "Ернұр ағайдан"))
            self.assertTrue(all("answer" not in task for task in saved["tasks"]))

            exported = (await client.get(f"{url}/export", params=teacher)).json()
            self.assertEqual([task["answer"] for task in exported["tasks"]], ['["A", "C"]', "C", "C"])
            self.assertEqual([sub["correct"] for sub in exported["tasks"][0]["subquestions"]], ["A", "C"])

            listed = (await client.get("/api/constructor/collections", params=teacher)).json()
            self.assertEqual([(item["id"], item["task_count"]) for item in listed["items"]], [(created["id"], 3)])
            self.assertEqual((await client.get("/api/constructor/collections", params=student)).json()["items"], [])
            for request in (client.get(url, params=student), client.get(f"{url}/export", params=student),
                            client.put(url, params=student, json={"title": "Менікі"}),
                            client.delete(url, params=student)):
                self.assertEqual((await request).status_code, 404)

            for invalid in ({"task_ids": [self.ids[0], self.ids[0]]}, {"task_ids": list(range(1, 102))},
                            {"task_ids": [0]}, {"title": "   "}, {"title": "x" * 121}):
                self.assertEqual((await client.put(url, params=teacher, json=invalid)).status_code, 422, invalid)

            self.assertEqual((await client.delete(url, params=teacher)).json(), {"deleted": True})
            self.assertEqual((await client.get(url, params=teacher)).status_code, 404)

    async def test_twins_and_later_deleted_tasks_never_leak_or_inflate_counts(self):
        student = {"email": "student@example.test"}
        async with self.client() as client:
            created = (await client.post("/api/constructor/collections", params=student,
                                         json={"title": "Дайындық"})).json()
            url = f"/api/constructor/collections/{created['id']}"
            saved = (await client.put(url, params=student,
                                      json={"task_ids": [self.ids[0], self.ids[1], self.ids[2]]})).json()
            self.assertEqual([t["id"] for t in saved["tasks"]], [self.ids[0], self.ids[1], self.ids[2]])

            # Later: one task is trashed and another becomes an unapproved AI twin draft.
            await self.db.bank_tasks.soft_delete_task(self.ids[1], actor_user_id=self.owner["id"])
            async with self.seed() as connection:
                await connection.execute(
                    "INSERT INTO bank_task_twins (source_bank_task_id, twin_bank_task_id, status, origin) VALUES (?, ?, 'draft', 'ai')",
                    (self.ids[0], self.ids[2]),
                )

            listed = (await client.get("/api/constructor/collections", params=student)).json()
            self.assertEqual([(item["id"], item["task_count"]) for item in listed["items"]], [(created["id"], 1)])
            fetched = (await client.get(url, params=student)).json()
            self.assertEqual([t["id"] for t in fetched["tasks"]], [self.ids[0]])
            exported = (await client.get(f"{url}/export", params=student)).json()
            self.assertEqual([t["id"] for t in exported["tasks"]], [self.ids[0]])

    async def test_the_deck_font_defaults_to_juz40_and_takes_only_offered_fonts(self):
        teacher = {"email": "teacher@example.test"}
        async with self.client() as client:
            created = (await client.post("/api/constructor/collections", params=teacher, json={"title": "Шрифт"})).json()
            self.assertEqual(created["pptx_font"], "JUZ40 FONTS")
            url = f"/api/constructor/collections/{created['id']}"
            changed = (await client.put(url, params=teacher, json={"pptx_font": "Calibri"})).json()
            self.assertEqual((changed["pptx_font"], changed["title"]), ("Calibri", "Шрифт"))
            self.assertEqual((await client.get(f"{url}/export", params=teacher)).json()["pptx_font"], "Calibri")
            for invalid in ("Comic Sans MS", "", "JUZ40 FONTS; DROP TABLE"):
                response = await client.put(url, params=teacher, json={"pptx_font": invalid})
                self.assertEqual(response.status_code, 422, invalid)
            # Other changes leave the font alone.
            kept = (await client.put(url, params=teacher, json={"header_text": "Мектеп"})).json()
            self.assertEqual(kept["pptx_font"], "Calibri")

    async def test_a_user_can_keep_a_limited_number_of_collections(self):
        for index in range(MAX_COLLECTIONS_PER_USER):
            await self.db.task_collections.create(self.owner["id"], f"Жинақ {index}")
        async with self.client() as client:
            response = await client.post("/api/constructor/collections", params={"email": "teacher@example.test"},
                                         json={"title": "Тағы біреу"})
            self.assertEqual(response.status_code, 409)
            other = await client.post("/api/constructor/collections", params={"email": "student@example.test"},
                                      json={"title": "Менің жинағым"})
            self.assertEqual(other.status_code, 200)

    async def test_background_images_replace_and_clean_up_their_files(self):
        teacher, student = {"email": "teacher@example.test"}, {"email": "student@example.test"}
        collection = await self.db.task_collections.create(self.owner["id"], "Слайдтар")
        url = f"/api/constructor/collections/{collection['id']}/images"
        saved_names = iter(["first.png", "second.png", "third.png"])
        save = AsyncMock(side_effect=lambda image: next(saved_names))
        delete = AsyncMock()
        with patch("routes.constructor.save_image_upload", save), \
                patch("routes.constructor.delete_image_file_async", delete):
            async with self.client() as client:
                upload = lambda kind, who=teacher, content_type="image/png": client.post(
                    f"{url}/{kind}", params=who, files={"image": ("bg.png", PNG, content_type)})
                first = (await upload("background")).json()
                self.assertEqual((first["background_image"], first["title_image"]), ("first.png", None))
                second = (await upload("background")).json()
                self.assertEqual(second["background_image"], "second.png")
                delete.assert_awaited_once_with("first.png")

                self.assertEqual((await upload("title", content_type="image/gif")).status_code, 400)
                self.assertEqual((await upload("logo")).status_code, 422)
                self.assertEqual((await upload("title", who=student)).status_code, 404)
                self.assertEqual(save.await_count, 2)  # rejected uploads never reach storage

                title = (await upload("title")).json()
                self.assertEqual(title["title_image"], "third.png")
                removed = (await client.delete(f"{url}/background", params=teacher)).json()
                self.assertIsNone(removed["background_image"])
                delete.assert_awaited_with("second.png")

                delete.reset_mock()
                await client.delete(f"/api/constructor/collections/{collection['id']}", params=teacher)
                delete.assert_awaited_once_with("third.png")
