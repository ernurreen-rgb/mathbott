"""Library queries against a real, isolated 10,000-task PostgreSQL database.

Needs TEST_DATABASE_URL (see tests/postgres_test_db.py).
Run from bot/: python -m pytest tests/test_bank_catalog.py
"""
import unittest

import httpx
from fastapi import FastAPI
from slowapi import Limiter
from slowapi.util import get_remote_address

from postgres_test_db import PostgresTestCase
from routes.admin.bank import register_bank_routes


class BankCatalogTests(PostgresTestCase):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        async with self.seed() as connection:
            await connection.execute("""
                INSERT INTO bank_tasks (id, text, answer, question_type, difficulty, deleted_at)
                SELECT i, 'Sample equation ' || i, '4', CASE WHEN i % 2 = 1 THEN 'mcq' ELSE 'input' END,
                       substr('ABC', i % 3 + 1, 1), CASE WHEN i > 9990 THEN '2026-11-01 00:00:00' END
                FROM generate_series(1, 10000) AS i
            """)
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
        await self.db.users.create_user_by_email("bank-admin@example.test", check_admin_email="bank-admin@example.test")
        await self.db.users.create_user_by_email("student@example.test")

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
        async with self.connect() as connection:
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
            for endpoint, invalid in [("tasks", {"sort": "DROP TABLE bank_tasks"}), ("tasks/trash", {"topic_match": "invalid"}), ("tasks", {"question_type": "invalid"}), ("catalog", {"limit": 0})]:
                self.assertEqual((await client.get(f"/api/admin/bank/{endpoint}", params={**params, **invalid})).status_code, 422)
            large_catalog = await client.get("/api/admin/bank/catalog", params={**params, "limit": 201})
            self.assertEqual(large_catalog.status_code, 200)
            ctx_task = await self.db.bank_tasks.create_task(
                text="Context test task", answer="B", question_type="context", answer_mode="choices", difficulty="B",
                options=[{"label": label, "text": str(idx)} for idx, label in enumerate("ABCD")],
                topics=["Алгебра"],
            )
            self.assertEqual(ctx_task["question_type"], "context")
            ctx_list = await client.get("/api/admin/bank/tasks", params={**params, "question_type": "context"})
            self.assertEqual(ctx_list.status_code, 200)
            self.assertEqual(ctx_list.json()["total"], 1)

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

    async def test_sources_filter_catalog_crud_and_constructor_routes(self):
        from routes.constructor import setup_constructor_routes

        t1 = await self.db.bank_tasks.create_task(
            text="Rustyumova geometry source test", answer="5", question_type="input", difficulty="B",
            topics=["Геометрия", "Планиметрия"], sources=["Рустюмова", "ҰБТ есебі"],
        )
        t2 = await self.db.bank_tasks.create_task(
            text="Custom new source test", answer="7", question_type="input", difficulty="A",
            topics=["Алгебра"], sources=["Шың"],
        )
        self.assertEqual(t1["sources"], ["Рустюмова", "ҰБТ есебі"])
        self.assertEqual(t2["sources"], ["Шың"])

        catalog = await self.db.bank_tasks.get_catalog()
        src_counts = {s["name"]: s["task_count"] for s in catalog["sources"]}
        self.assertEqual(src_counts, {"Рустюмова": 1, "ҰБТ есебі": 1, "Шың": 1})
        self.assertEqual(catalog["no_sources_total"], 9990)

        only_rust = await self.db.bank_tasks.list_tasks(sources=["Рустюмова"])
        self.assertEqual([item["id"] for item in only_rust["items"]], [t1["id"]])
        multi_src = await self.db.bank_tasks.list_tasks(sources=["Рустюмова", "Шың"])
        self.assertEqual({item["id"] for item in multi_src["items"]}, {t1["id"], t2["id"]})
        src_plus_none = await self.db.bank_tasks.list_tasks(sources=["Шың"], has_sources=False, limit=100)
        self.assertEqual(src_plus_none["total"], 9991)
        self.assertEqual(src_plus_none["items"][0]["id"], t2["id"])
        no_src = await self.db.bank_tasks.list_tasks(has_sources=False, limit=10)
        self.assertEqual(no_src["total"], 9990)

        app = FastAPI()
        app.state.db = self.db
        limiter = Limiter(key_func=get_remote_address)
        register_bank_routes(app, self.db, limiter)
        setup_constructor_routes(app, self.db, limiter)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://bank.test") as client:
            admin_params = {"email": "bank-admin@example.test"}
            src_res = await client.get("/api/admin/bank/sources", params=admin_params)
            self.assertEqual(src_res.status_code, 200)
            self.assertEqual(set(src_res.json()["items"]), {"Рустюмова", "ҰБТ есебі", "Шың"})

            c_src = await client.get("/api/constructor/sources", params={"email": "student@example.test"})
            self.assertEqual(c_src.status_code, 200)
            self.assertEqual(set(c_src.json()["items"]), {"Рустюмова", "ҰБТ есебі", "Шың"})

            c_filtered = await client.get("/api/constructor/tasks", params={"email": "student@example.test", "sources": "Шың"})
            self.assertEqual(c_filtered.status_code, 200)
            self.assertEqual([item["id"] for item in c_filtered.json()["items"]], [t2["id"]])
            self.assertEqual(c_filtered.json()["items"][0]["sources"], ["Шың"])

            c_multi = await client.get("/api/constructor/tasks", params={"email": "student@example.test", "sources": "Рустюмова,Шың"})
            self.assertEqual(c_multi.status_code, 200)
            self.assertEqual({item["id"] for item in c_multi.json()["items"]}, {t1["id"], t2["id"]})

            c_none = await client.get("/api/constructor/tasks", params={"email": "student@example.test", "has_sources": "false", "limit": 5})
            self.assertEqual(c_none.status_code, 200)
            self.assertEqual(c_none.json()["total"], 9990)

            c_mix = await client.get("/api/constructor/tasks", params={"email": "student@example.test", "sources": "Шың", "has_sources": "false", "limit": 5})
            self.assertEqual(c_mix.status_code, 200)
            self.assertEqual(c_mix.json()["total"], 9991)

            created = await client.post("/api/admin/bank/tasks", data={
                "email": "bank-admin@example.test",
                "text": "Admin form created with source",
                "answer": "12",
                "question_type": "input",
                "difficulty": "A",
                "topics": '["Алгебра"]',
                "sources": '["ҰБТ есебі"]',
            })
            self.assertEqual(created.status_code, 200, created.text)
            self.assertEqual(created.json()["sources"], ["ҰБТ есебі"])

            updated = await client.put(f"/api/admin/bank/tasks/{created.json()['id']}", data={
                "email": "bank-admin@example.test",
                "sources": '["Рустюмова", "ҰБТ есебі"]',
                "expected_current_version": str(created.json()["current_version"]),
                "dedup_confirmed": "true",
            })
            self.assertEqual(updated.status_code, 200, updated.text)
            self.assertEqual(updated.json()["sources"], ["Рустюмова", "ҰБТ есебі"])


if __name__ == "__main__":
    unittest.main()
