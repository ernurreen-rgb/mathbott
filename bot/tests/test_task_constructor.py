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
from repositories.task_collection_repository import MAX_COLLECTIONS_PER_USER, _lock_key
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
            tasks=[_task(i) for i in range(1, 5)] + [
                _task(5, topics=["Егіз тақырып"]),
                _task(6, topics=["Жойылған тақырып"]),
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

    async def test_exports_for_a_download_are_recorded_for_the_statistics(self):
        teacher = {"email": "teacher@example.test"}
        async with self.client() as client:
            created = (await client.post("/api/constructor/collections", params=teacher, json={"title": "Скачать"})).json()
            url = f"/api/constructor/collections/{created['id']}"
            await client.put(url, params=teacher, json={"task_ids": [self.ids[0], self.ids[1]]})
            self.assertEqual((await client.get(f"{url}/export", params=teacher)).status_code, 200)  # not a download
            pptx = await client.get(f"{url}/export", params={**teacher, "format": "pptx", "include_answers": "false"})
            self.assertEqual(len(pptx.json()["tasks"]), 2)
            await client.get(f"{url}/export", params={**teacher, "format": "pdf"})
            self.assertEqual((await client.get(f"{url}/export", params={**teacher, "format": "docx"})).status_code, 422)
        async with self.connect() as connection:
            async with connection.execute(
                "SELECT format, include_answers, task_count, collection_title FROM task_collection_downloads ORDER BY id"
            ) as cursor:
                rows = [tuple(row) for row in await cursor.fetchall()]
        self.assertEqual(rows, [("pptx", 0, 2, "Скачать"), ("pdf", 1, 2, "Скачать")])

    async def test_several_sources_match_all_of_them_or_any_of_them(self):
        created = await self.db.bank_tasks.create_tasks_bulk_atomic(
            tasks=[_task(20, sources=["Educon"]), _task(21, sources=["Рустюмова"]),
                   _task(22, sources=["Educon", "Рустюмова"]), _task(23, sources=["Educon", "AI"])],
            created_by=self.owner["id"], actor_email="teacher@example.test",
        )
        educon, rustyumova, both, educon_ai = (int(task["id"]) for task in created)
        query = {"email": "teacher@example.test", "sources": "Educon,Рустюмова"}
        async with self.client() as client:
            listed = lambda params: client.get("/api/constructor/tasks", params={**query, **params})
            union = (await listed({})).json()
            self.assertEqual({item["id"] for item in union["items"]}, {educon, rustyumova, both, educon_ai})
            self.assertEqual(
                {item["id"] for item in (await listed({"source_match": "any"})).json()["items"]},
                {educon, rustyumova, both, educon_ai},
            )
            intersection = (await listed({"source_match": "all"})).json()
            self.assertEqual(([item["id"] for item in intersection["items"]], intersection["total"]), ([both], 1))
            single = (await listed({"sources": "Educon", "source_match": "all"})).json()
            self.assertEqual({item["id"] for item in single["items"]}, {educon, both, educon_ai})
            self.assertEqual((await listed({"source_match": "every"})).status_code, 422)

    async def test_task_list_has_no_answers_twins_or_deleted_tasks(self):
        teacher = {"email": "teacher@example.test"}
        async with self.client() as client:
            self.assertEqual((await client.get("/api/constructor/tasks")).status_code, 401)
            listed = (await client.get("/api/constructor/tasks", params=teacher)).json()
            listed_ids = {item["id"] for item in listed["items"]}
            self.assertEqual(listed_ids, set(self.ids) - {self.ids[4], self.ids[5]})
            self.assertEqual(listed["total"], 6)
            by_id = {item["id"]: item for item in listed["items"]}
            self.assertEqual(by_id[self.ids[0]]["twin_count"], 1)
            self.assertEqual(by_id[self.ids[1]]["twin_count"], 0)
            for item in listed["items"]:
                self.assertNotIn("answer", item)
                self.assertNotIn("accepted_answers", item)
                self.assertTrue(all("correct" not in sub for sub in item["subquestions"]))
            # Nested twins endpoint returns active approved twins without answers, and rejects twin/deleted ids.
            twins_resp = (await client.get(f"/api/constructor/tasks/{self.ids[0]}/twins", params=teacher)).json()
            self.assertEqual([item["id"] for item in twins_resp["items"]], [self.ids[4]])
            self.assertNotIn("answer", twins_resp["items"][0])
            self.assertEqual(
                (await client.get(f"/api/constructor/tasks/{self.ids[4]}/twins", params=teacher)).status_code, 404
            )
            self.assertEqual(
                (await client.get(f"/api/constructor/tasks/{self.ids[5]}/twins", params=teacher)).status_code, 404
            )
            by_difficulty = (await client.get("/api/constructor/tasks", params={**teacher, "difficulty": "A"})).json()
            self.assertTrue(by_difficulty["items"])
            self.assertTrue(all(item["difficulty"] == "A" for item in by_difficulty["items"]))
            by_topic = (await client.get("/api/constructor/tasks", params={**teacher, "topics": "Логарифм"})).json()
            self.assertTrue(all("Логарифм" in item["topics"] for item in by_topic["items"]))
            excluded = (await client.get("/api/constructor/tasks", params={**teacher, "exclude_topics": "Логарифм"})).json()
            self.assertTrue(excluded["items"])
            self.assertTrue(all("Логарифм" not in item["topics"] for item in excluded["items"]))
            typed = (await client.get("/api/constructor/tasks", params={**teacher, "question_type": "input"})).json()
            self.assertEqual([item["id"] for item in typed["items"]], [self.ids[6]])
            self.assertEqual(
                (await client.get("/api/constructor/tasks", params={**teacher, "limit": 100})).status_code, 200
            )
            for invalid in ({"limit": 101}, {"difficulty": "D"}, {"question_type": "essay"}):
                self.assertEqual(
                    (await client.get("/api/constructor/tasks", params={**teacher, **invalid})).status_code, 422
                )
            topics = (await client.get("/api/constructor/topics", params=teacher)).json()["items"]
            self.assertEqual(set(topics), {"Логарифм", "Түбір"})
            filtered_topics = (await client.get("/api/constructor/topics", params={**teacher, "q": "лог"})).json()["items"]
            self.assertEqual(filtered_topics, ["Логарифм"])
            self.assertNotEqual(_lock_key(self.owner["id"]), _lock_key(self.other["id"]))

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
            # Approved twins are allowed; deleted tasks and unknown ids are left out; the rest keep the given order.
            self.assertEqual([task["id"] for task in saved["tasks"]], [self.ids[7], self.ids[4], self.ids[0], self.ids[2]])
            self.assertEqual((saved["title"], saved["header_text"]), ("Логарифм", "Ернұр ағайдан"))
            self.assertTrue(all("answer" not in task for task in saved["tasks"]))

            exported = (await client.get(f"{url}/export", params=teacher)).json()
            self.assertEqual([task["answer"] for task in exported["tasks"]], ['["A", "C"]', "C", "C", "C"])
            self.assertEqual([sub["correct"] for sub in exported["tasks"][0]["subquestions"]], ["A", "C"])

            listed = (await client.get("/api/constructor/collections", params=teacher)).json()
            self.assertEqual([(item["id"], item["task_count"]) for item in listed["items"]], [(created["id"], 4)])
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
            # Draft twins also never appear under GET /api/constructor/tasks/{id}/twins.
            twins_resp = (await client.get(f"/api/constructor/tasks/{self.ids[0]}/twins", params=student)).json()
            self.assertEqual([t["id"] for t in twins_resp["items"]], [self.ids[4]])

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

    async def test_new_collection_inherits_previous_design_template_without_breaking_shared_images(self):
        teacher = {"email": "teacher@example.test"}
        saved_names = iter(["shared-title.png", "shared-bg.png", "override-title.png"])
        save = AsyncMock(side_effect=lambda image: next(saved_names))
        delete = AsyncMock()
        with patch("routes.constructor.save_image_upload", save), \
                patch("routes.constructor.delete_image_file_async", delete):
            async with self.client() as client:
                first = (await client.post("/api/constructor/collections", params=teacher, json={"title": "Бірінші"})).json()
                first_url = f"/api/constructor/collections/{first['id']}"
                await client.put(first_url, params=teacher, json={"header_text": "Ернұр ағай", "pptx_font": "Calibri"})
                await client.post(f"{first_url}/images/title", params=teacher, files={"image": ("t.png", PNG, "image/png")})
                await client.post(f"{first_url}/images/background", params=teacher, files={"image": ("b.png", PNG, "image/png")})

                second = (await client.post("/api/constructor/collections", params=teacher, json={"title": "Екінші"})).json()
                self.assertEqual(second["header_text"], "Ернұр ағай")
                self.assertEqual(second["pptx_font"], "Calibri")
                self.assertEqual(second["title_image"], "shared-title.png")
                self.assertEqual(second["background_image"], "shared-bg.png")

                # Replacing title on second keeps shared-title.png intact for first.
                await client.post(
                    f"/api/constructor/collections/{second['id']}/images/title",
                    params=teacher,
                    files={"image": ("t2.png", PNG, "image/png")},
                )
                delete.assert_not_awaited()

                # Deleting first deletes only shared-title.png, NOT shared-bg.png (still used by second).
                await client.delete(first_url, params=teacher)
                delete.assert_awaited_once_with("shared-title.png")

    async def test_quantitative_comparison_tasks_are_hidden_only_in_constructor(self):
        teacher = {"email": "teacher@example.test"}
        extra = await self.db.bank_tasks.create_tasks_bulk_atomic(
            tasks=[
                _task(9, text="Шамаларды салыстырыңыз:\n[[A]] 2^5\n[[B]] 5^2", topics=["Салыстыру"]),
                _task(10, text="x > 0 болса, салыстырыңыз", topics=["Сандық сипаттамаларын салыстыру"]),
                _task(11, text="Сравните количественные характеристики", topics=["Количественные характеристики"]),
            ],
            created_by=self.owner["id"],
            actor_email="teacher@example.test",
        )
        hidden_ids = {int(t["id"]) for t in extra}

        async with self.client() as client:
            listed = (await client.get("/api/constructor/tasks", params=teacher)).json()
            returned_ids = {item["id"] for item in listed["items"]}
            self.assertEqual(listed["total"], 6)
            self.assertTrue(returned_ids.isdisjoint(hidden_ids))

            topics = (await client.get("/api/constructor/topics", params=teacher)).json()["items"]
            self.assertNotIn("Салыстыру", topics)
            self.assertNotIn("Сандық сипаттамаларын салыстыру", topics)
            self.assertNotIn("Количественные характеристики", topics)

            for hid in hidden_ids:
                self.assertEqual(
                    (await client.get(f"/api/constructor/tasks/{hid}/twins", params=teacher)).status_code,
                    404,
                )

        # Tasks remain untouched in the general bank (not deleted).
        bank_all = await self.db.bank_tasks.list_tasks(include_deleted=False, limit=100)
        bank_ids = {int(item["id"]) for item in bank_all["items"]}
        self.assertTrue(hidden_ids.issubset(bank_ids))

    async def test_topic_hierarchy_tree_and_exact_parent_filter(self):
        teacher = {"email": "teacher@example.test"}
        extra = await self.db.bank_tasks.create_tasks_bulk_atomic(
            tasks=[
                _task(30, topics=["Тригонометрия"]),
                _task(31, topics=["Тригонометриялық теңдеулер"]),
                _task(32, topics=["Тригонометрия", "Тригонометриялық теңдеулер"]),
            ],
            created_by=self.owner["id"],
            actor_email="teacher@example.test",
        )
        parent_only_id, child_only_id, both_id = (int(task["id"]) for task in extra)

        catalog = await self.db.bank_tasks.get_catalog()
        topic_ids = {item["name"]: item["id"] for item in catalog["topics"]}
        updated = await self.db.bank_tasks.set_topic_parent(
            topic_ids["Тригонометриялық теңдеулер"],
            topic_ids["Тригонометрия"],
        )
        self.assertEqual(updated["parent_name"], "Тригонометрия")

        async with self.client() as client:
            topics_payload = (await client.get("/api/constructor/topics", params=teacher)).json()
            tree_map = {node["name"]: node["parent"] for node in topics_payload["tree"]}
            self.assertIsNone(tree_map["Тригонометрия"])
            self.assertEqual(tree_map["Тригонометриялық теңдеулер"], "Тригонометрия")

            # Filtering by parent topic returns ONLY tasks that explicitly have the parent tag.
            by_parent = (
                await client.get("/api/constructor/tasks", params={**teacher, "topics": "Тригонометрия"})
            ).json()
            self.assertEqual({item["id"] for item in by_parent["items"]}, {parent_only_id, both_id})
            self.assertNotIn(child_only_id, {item["id"] for item in by_parent["items"]})

    async def test_creating_or_updating_task_with_subtopic_auto_adds_ancestors(self):
        teacher = {"email": "teacher@example.test"}
        seed_tasks = await self.db.bank_tasks.create_tasks_bulk_atomic(
            tasks=[
                _task(40, topics=["Алгебра"]),
                _task(41, topics=["Тригонометрия"]),
                _task(42, topics=["Тригонометриялық теңдеулер"]),
            ],
            created_by=self.owner["id"],
            actor_email="teacher@example.test",
        )
        catalog = await self.db.bank_tasks.get_catalog()
        topic_ids = {item["name"]: item["id"] for item in catalog["topics"]}
        await self.db.bank_tasks.set_topic_parent(
            topic_ids["Тригонометрия"],
            topic_ids["Алгебра"],
        )
        await self.db.bank_tasks.set_topic_parent(
            topic_ids["Тригонометриялық теңдеулер"],
            topic_ids["Тригонометрия"],
        )

        created = await self.db.bank_tasks.create_task(
            text="Solve sin(x) = 1/2",
            answer="pi/6",
            question_type="input",
            difficulty="B",
            topics=["Тригонометриялық теңдеулер"],
            created_by=self.owner["id"],
        )
        self.assertEqual(
            set(created["topics"]),
            {"Алгебра", "Тригонометрия", "Тригонометриялық теңдеулер"},
        )

        # Submitting only L2 again on an already-expanded task is a no-op (no version bump).
        unchanged = await self.db.bank_tasks.update_task(
            created["id"],
            topics=["Тригонометриялық теңдеулер"],
            actor_user_id=self.owner["id"],
        )
        self.assertEqual(unchanged["current_version"], created["current_version"])

        # Updating an older orphan task repairs its missing L1 and L0 ancestors.
        repaired = await self.db.bank_tasks.update_task(
            int(seed_tasks[2]["id"]),
            topics=["Тригонометриялық теңдеулер"],
            actor_user_id=self.owner["id"],
        )
        self.assertEqual(
            set(repaired["topics"]),
            {"Алгебра", "Тригонометрия", "Тригонометриялық теңдеулер"},
        )

        async with self.client() as client:
            by_root = (
                await client.get("/api/constructor/tasks", params={**teacher, "topics": "Алгебра"})
            ).json()
            by_section = (
                await client.get("/api/constructor/tasks", params={**teacher, "topics": "Тригонометрия"})
            ).json()
            self.assertIn(created["id"], {item["id"] for item in by_root["items"]})
            self.assertIn(created["id"], {item["id"] for item in by_section["items"]})
