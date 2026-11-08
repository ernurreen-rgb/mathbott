"""Library queries against a real, isolated 10,000-task SQLite database.

Run from bot/: python -m unittest discover -s tests -p test_bank_catalog.py -v
"""
import os
import gc
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
from routes.admin.bank import register_bank_routes


class BankCatalogTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.environment = patch.dict(os.environ, {"ENVIRONMENT": "development", "DATABASE_URL": "", "SENTRY_DSN": ""})
        self.environment.start()
        self.directory = tempfile.TemporaryDirectory(prefix="qazmath-bank-tests-")
        self.db = Database(str(Path(self.directory.name) / "bank.sqlite"), use_pool=False)
        await self.db.init()
        async with storage.connect(self.db.db_path) as connection:
            await connection.executemany(
                "INSERT INTO bank_tasks (id, text, answer, question_type, difficulty, deleted_at) VALUES (?, ?, ?, ?, ?, ?)",
                [(i, f"Sample equation {i}", "4", "mcq" if i % 2 else "input", "ABC"[i % 3],
                  "2026-11-01 00:00:00" if i > 9990 else None) for i in range(1, 10001)],
            )
            await connection.executemany("INSERT INTO bank_topics (id, name, name_norm) VALUES (?, ?, ?)", [
                (1, "Алгебра", "алгебра"), (2, "Қысқаша көбейту формулалары", "қысқаша көбейту формулалары"),
                (3, "Only deleted", "only deleted"), (4, "100% exact", "100% exact"),
            ])
            await connection.executemany("INSERT INTO bank_task_topic_map (bank_task_id, topic_id) VALUES (?, ?)", [
                (1, 1), (1, 2), (2, 1), (3, 2), (4, 4), (10000, 3),
            ])
            await connection.execute("INSERT INTO tasks (bank_task_id) VALUES (1)")
            await connection.execute("INSERT INTO tasks (bank_task_id, deleted_at) VALUES (2, '2026-11-01')")
            await connection.execute("INSERT INTO trial_tests (id, title) VALUES (1, 'Fixture')")
            await connection.execute("INSERT INTO trial_test_tasks (trial_test_id, bank_task_id) VALUES (1, 1)")
            await connection.execute("INSERT INTO trial_test_tasks (trial_test_id, bank_task_id, sort_order) VALUES (1, 3, 1)")
            await connection.commit()
        await self.db.users.create_user_by_email("bank-admin@example.test", check_admin_email="bank-admin@example.test")
        await self.db.users.create_user_by_email("student@example.test")

    async def asyncTearDown(self):
        gc.collect()
        self.directory.cleanup()
        self.environment.stop()

    async def test_catalog_counts_distinct_tasks_and_excludes_trashed_topics(self):
        catalog = await self.db.bank_tasks.get_catalog()
        self.assertEqual((catalog["active_total"], catalog["trash_total"]), (9990, 10))
        self.assertEqual(catalog["unused_total"], 9988)
        self.assertEqual(catalog["no_topics_total"], 9986)
        topics = {topic["name"]: topic["task_count"] for topic in catalog["topics"]}
        self.assertEqual(topics, {"Алгебра": 2, "Қысқаша көбейту формулалары": 2, "100% exact": 1})
        self.assertEqual((await self.db.bank_tasks.get_catalog("%"))["topics_total"], 1)
        limited = await self.db.bank_tasks.get_catalog(limit=1)
        self.assertTrue(limited["has_more_topics"])
        self.assertEqual(len(limited["topics"]), 1)

    async def test_any_all_topics_and_usage_are_composed_before_pagination(self):
        any_topics = await self.db.bank_tasks.list_tasks(topics=["алгебра", "Қысқаша көбейту формулалары"])
        all_topics = await self.db.bank_tasks.list_tasks(topics=["алгебра", "Қысқаша көбейту формулалары"], topic_match="all")
        self.assertEqual({t["id"] for t in any_topics["items"]}, {1, 2, 3})
        self.assertEqual([t["id"] for t in all_topics["items"]], [1])
        used = await self.db.bank_tasks.list_tasks(usage="used")
        self.assertEqual({t["id"] for t in used["items"]}, {1, 3})
        self.assertEqual(next(t for t in used["items"] if t["id"] == 1)["active_usage_count"], 2)
        unused = await self.db.bank_tasks.list_tasks(topics=["Алгебра"], usage="unused")
        self.assertEqual([t["id"] for t in unused["items"]], [2])

    async def test_ten_thousand_tasks_have_stable_nonoverlapping_pages_and_id_lookup(self):
        first = await self.db.bank_tasks.list_tasks(limit=50)
        second = await self.db.bank_tasks.list_tasks(limit=50, offset=50)
        last = await self.db.bank_tasks.list_tasks(limit=50, offset=9950)
        self.assertEqual(first["total"], 9990)
        self.assertEqual(len(first["items"]), 50)
        self.assertFalse({t["id"] for t in first["items"]} & {t["id"] for t in second["items"]})
        self.assertEqual(len(last["items"]), 40)
        self.assertFalse(last["has_more"])
        by_id = await self.db.bank_tasks.list_tasks(search="#7123")
        self.assertEqual([t["id"] for t in by_id["items"]], [7123])
        empty = await self.db.bank_tasks.list_tasks(search="%_'")
        self.assertEqual(empty["total"], 0)

    async def test_question_type_difficulty_no_topics_and_sort(self):
        result = await self.db.bank_tasks.list_tasks(question_type="input", difficulty="C", has_topics=False, sort="oldest", limit=50)
        self.assertEqual(result["items"][0]["id"], 8)
        self.assertTrue(all(t["question_type"] == "input" and t["difficulty"] == "C" and not t["topics"] for t in result["items"]))
        async with storage.connect(self.db.db_path) as connection:
            await connection.execute("UPDATE bank_tasks SET updated_at = '2099-01-01' WHERE id = 3")
            await connection.commit()
        self.assertEqual((await self.db.bank_tasks.list_tasks(sort="updated"))["items"][0]["id"], 3)
        trash = await self.db.bank_tasks.list_tasks(include_deleted=True, limit=50)
        self.assertEqual({t["id"] for t in trash["items"]}, set(range(9991, 10001)))

    async def test_routes_enforce_auth_and_validate_new_filters(self):
        app = FastAPI()
        app.state.db = self.db
        register_bank_routes(app, self.db, Limiter(key_func=get_remote_address))
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://bank.test") as client:
            self.assertEqual((await client.get("/api/admin/bank/catalog")).status_code, 401)
            self.assertEqual((await client.get("/api/admin/bank/catalog", params={"email": "student@example.test"})).status_code, 403)
            params = {"email": "bank-admin@example.test"}
            response = await client.get("/api/admin/bank/catalog", params={**params, "q": "Қысқаша көбейту"})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["topics"][0]["task_count"], 2)
            response = await client.get("/api/admin/bank/tasks", params={**params, "usage": "used", "question_type": "mcq", "limit": 50})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["total"], 2)
            for endpoint, invalid in [("tasks", {"sort": "DROP TABLE bank_tasks"}), ("tasks/trash", {"topic_match": "invalid"}), ("tasks", {"question_type": "invalid"}), ("catalog", {"limit": 201})]:
                self.assertEqual((await client.get(f"/api/admin/bank/{endpoint}", params={**params, **invalid})).status_code, 422)

    async def test_editing_a_matching_task_can_clear_obsolete_options_and_subquestions(self):
        task = await self.db.bank_tasks.create_task(
            text="Matching fixture unique content", answer='["A", "C"]', question_type="select", difficulty="B",
            options=[{"label": label, "text": str(index)} for index, label in enumerate("ABCD")],
            subquestions=[{"text": "First", "correct": "A"}, {"text": "Second", "correct": "C"}],
        )
        app = FastAPI()
        app.state.db = self.db
        register_bank_routes(app, self.db, Limiter(key_func=get_remote_address))
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://bank.test") as client:
            response = await client.put(f"/api/admin/bank/tasks/{task['id']}", data={
                "email": "bank-admin@example.test", "question_type": "input", "answer": "42",
                "options": "[]", "subquestions": "[]", "expected_current_version": str(task["current_version"]),
                "dedup_confirmed": "true",
            })
            self.assertEqual(response.status_code, 200, response.text)
            updated = response.json()
            self.assertEqual(updated["question_type"], "input")
            self.assertFalse(updated["options"])
            self.assertFalse(updated["subquestions"])
            self.assertEqual(updated["current_version"], task["current_version"] + 1)


if __name__ == "__main__":
    unittest.main()
