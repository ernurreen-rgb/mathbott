"""Quiz catalog queries against a real, isolated 1,000-quiz PostgreSQL database.

Needs TEST_DATABASE_URL (see tests/postgres_test_db.py).
Run from bot/: python -m pytest tests/test_quiz_catalog.py
"""
import unittest

import httpx
from fastapi import FastAPI
from slowapi import Limiter
from slowapi.util import get_remote_address

from postgres_test_db import PostgresTestCase
from routes.quizzes import setup_quizzes_routes

TOPICS = ["Бөлшектер", "Дәреже", "Түбір", "Теңдеулер"]


class QuizCatalogTests(PostgresTestCase):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        self.author = await self.db.users.create_user_by_email("author@example.test")
        self.reader = await self.db.users.create_user_by_email("reader@example.test")
        async with self.seed() as connection:
            # 1..1000: every 10th is private, grades cycle 5..9, topics cycle with every 5th untagged.
            await connection.execute("""
                INSERT INTO quizzes (id, title, description, created_by, is_public, grade, topic, created_at)
                SELECT i, 'Квиз ' || i, CASE WHEN i = 7 THEN 'Жай БӨЛШЕКТЕРДІ қосу' ELSE '' END, ?,
                       CASE WHEN i % 10 = 0 THEN 0 ELSE 1 END, 5 + i % 5,
                       CASE WHEN i % 5 = 0 THEN '' ELSE (ARRAY['Бөлшектер', 'Дәреже', 'Түбір', 'Теңдеулер'])[i % 4 + 1] END,
                       to_char(TIMESTAMP '2026-01-01' + i * INTERVAL '1 minute', 'YYYY-MM-DD HH24:MI:SS')
                FROM generate_series(1, 1000) AS i
            """, (self.author["id"],))
            await connection.execute("""
                INSERT INTO quiz_questions (quiz_id, question_text, correct_answer, time_limit_seconds)
                SELECT 3, 'q' || n, '1', 20 FROM generate_series(1, 4) AS n
            """)
            await connection.execute("""
                INSERT INTO quiz_sessions (quiz_id, host_id, pin_code, status)
                SELECT CASE WHEN n <= 3 THEN 42 ELSE 17 END, ?, 'pin' || n, 'finished' FROM generate_series(1, 5) AS n
            """, (self.author["id"],))

    async def test_pages_are_stable_and_only_public_quizzes_are_listed(self):
        first = await self.db.quizzes.get_catalog(is_public=True, limit=24)
        second = await self.db.quizzes.get_catalog(is_public=True, limit=24, offset=24)
        self.assertEqual(first["total"], 900)
        self.assertEqual(first["items"][0]["id"], 999)  # newest first; 1000 is private
        self.assertFalse({q["id"] for q in first["items"]} & {q["id"] for q in second["items"]})
        last = await self.db.quizzes.get_catalog(is_public=True, limit=24, offset=888)
        self.assertEqual(len(last["items"]), 12)
        mine = await self.db.quizzes.get_catalog(created_by=self.author["id"], is_public=False)
        self.assertEqual(mine["total"], 100)

    async def test_search_ignores_case_in_cyrillic_and_escapes_wildcards(self):
        found = await self.db.quizzes.get_catalog(is_public=True, search="  бөлшектерді ҚОСУ ")
        self.assertEqual([q["id"] for q in found["items"]], [7])
        by_topic = await self.db.quizzes.get_catalog(is_public=True, search="түбір")
        self.assertEqual(by_topic["total"], sum(1 for i in range(1, 1001) if i % 10 and i % 5 and i % 4 == 2))
        self.assertEqual((await self.db.quizzes.get_catalog(is_public=True, search="%_"))["total"], 0)
        words = await self.db.quizzes.get_catalog(is_public=True, search="99 КВИЗ")  # each word, any order
        self.assertEqual({q["id"] for q in words["items"]}, {i for i in range(1, 1001) if i % 10 and "99" in str(i)})

    async def test_filters_sort_and_row_statistics(self):
        grade7 = await self.db.quizzes.get_catalog(is_public=True, grade=7, topic="Дәреже", limit=60)
        self.assertTrue(grade7["items"])
        self.assertTrue(all(q["grade"] == 7 and q["topic"] == "Дәреже" for q in grade7["items"]))
        untagged = await self.db.quizzes.get_catalog(is_public=True, untagged=True)
        self.assertEqual(untagged["total"], 100)  # every 5th is untagged, half of those are private
        popular = await self.db.quizzes.get_catalog(is_public=True, sort="popular", limit=3)
        self.assertEqual([(q["id"], q["play_count"]) for q in popular["items"]], [(42, 3), (17, 2), (999, 0)])
        three = (await self.db.quizzes.get_catalog(is_public=True, grade=8, topic="Теңдеулер", limit=60))["items"][-1]
        self.assertEqual(three["id"], 3)
        self.assertEqual((three["question_count"], three["duration_seconds"]), (4, 80))

    async def test_facets_count_the_other_filters_but_not_their_own(self):
        catalog = await self.db.quizzes.get_catalog(is_public=True, grade=7, topic="Дәреже")
        grades = {row["grade"]: row["count"] for row in catalog["facets"]["grades"]}
        topics = {row["topic"]: row["count"] for row in catalog["facets"]["topics"]}
        public = [i for i in range(1, 1001) if i % 10]
        topic_of = lambda i: "" if i % 5 == 0 else TOPICS[i % 4]
        self.assertEqual(grades, {g: sum(1 for i in public if 5 + i % 5 == g and topic_of(i) == "Дәреже")
                                  for g in range(5, 10) if any(5 + i % 5 == g and topic_of(i) == "Дәреже" for i in public)})
        self.assertEqual(topics, {t: sum(1 for i in public if 5 + i % 5 == 7 and topic_of(i) == t) for t in TOPICS})
        self.assertEqual(catalog["facets"]["untagged"], 0)  # grade 7 never falls on an untagged quiz
        self.assertEqual((await self.db.quizzes.get_catalog(is_public=True))["facets"]["untagged"], 100)

    async def test_grade_and_topic_round_trip_through_the_routes(self):
        app = FastAPI()
        app.state.db = self.db
        setup_quizzes_routes(app, self.db, Limiter(key_func=get_remote_address))
        author, reader = {"email": "author@example.test"}, {"email": "reader@example.test"}
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://quiz.test") as client:
            created = (await client.post("/api/quizzes", params=author, json={
                "title": "Жаңа квиз", "grade": 6, "topic": "  Пайыз   есептері ", "is_public": True})).json()
            self.assertEqual((created["grade"], created["topic"]), (6, "Пайыз есептері"))
            url = f"/api/quizzes/{created['id']}"
            # A privacy toggle sends neither field and must not wipe them.
            kept = (await client.put(url, params=author, json={"is_public": False})).json()
            self.assertEqual((kept["grade"], kept["topic"], kept["is_public"]), (6, "Пайыз есептері", False))
            cleared = (await client.put(url, params=author, json={"grade": None, "topic": ""})).json()
            self.assertEqual((cleared["grade"], cleared["topic"]), (None, ""))
            self.assertEqual((await client.put(url, params=author, json={"grade": 12})).status_code, 422)

            public = (await client.get("/api/quizzes/catalog", params={**reader, "grade": 7, "limit": 5})).json()
            self.assertEqual((len(public["items"]), public["limit"]), (5, 5))
            self.assertTrue(all(q["is_public"] is True and q["can_manage"] is False for q in public["items"]))
            mine = (await client.get("/api/quizzes/catalog", params={**author, "scope": "mine", "visibility": "private"})).json()
            self.assertEqual(mine["total"], 101)
            self.assertTrue(all(q["can_manage"] for q in mine["items"]))
            self.assertEqual((await client.get("/api/quizzes/catalog", params={"scope": "mine"})).json()["total"], 0)
            self.assertEqual((await client.get("/api/quizzes/catalog", params={**reader, "scope": "mine"})).json()["total"], 0)
            for invalid in ({"sort": "DROP TABLE quizzes"}, {"grade": 12}, {"limit": 61}, {"scope": "everyone"}):
                self.assertEqual((await client.get("/api/quizzes/catalog", params=invalid)).status_code, 422)

            forked = (await client.post("/api/quizzes/42/fork", params=reader)).json()
            self.assertEqual((forked["grade"], forked["topic"]), (5 + 42 % 5, TOPICS[42 % 4]))

    async def test_bulk_catalog_update_is_all_or_nothing_and_owner_only(self):
        app = FastAPI()
        app.state.db = self.db
        setup_quizzes_routes(app, self.db, Limiter(key_func=get_remote_address))
        author, reader = {"email": "author@example.test"}, {"email": "reader@example.test"}
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://quiz.test") as client:
            post = lambda who, body: client.post("/api/quizzes/bulk-catalog", params=who, json=body)
            self.assertEqual((await post({}, {"quiz_ids": [1], "topic": "X"})).status_code, 401)
            self.assertEqual((await post(reader, {"quiz_ids": [1, 2], "topic": "X"})).status_code, 403)
            self.assertEqual((await post(author, {"quiz_ids": [1, 5000], "topic": "X"})).status_code, 404)
            for invalid in ({"quiz_ids": [1]}, {"quiz_ids": [], "topic": "X"}, {"quiz_ids": [1], "grade": 0},
                            {"quiz_ids": list(range(1, 202)), "topic": "X"}):
                self.assertEqual((await post(author, invalid)).status_code, 422, invalid)
            self.assertEqual((await self.db.quizzes.get_quiz_by_id(1))["topic"], TOPICS[1])  # nothing above changed it

            # Topic only: the grades stay. A repeated id counts once.
            response = await post(author, {"quiz_ids": [1, 2, 3, 3], "topic": "  Жаңа   тақырып "})
            self.assertEqual(response.json(), {"updated": 3})
            rows = [await self.db.quizzes.get_quiz_by_id(i) for i in (1, 2, 3, 4)]
            self.assertEqual([q["topic"] for q in rows], ["Жаңа тақырып"] * 3 + [TOPICS[0]])
            self.assertEqual([q["grade"] for q in rows], [6, 7, 8, 9])
            # Grade only, cleared with an explicit null: the topics stay.
            self.assertEqual((await post(author, {"quiz_ids": [1, 2], "grade": None})).json(), {"updated": 2})
            rows = [await self.db.quizzes.get_quiz_by_id(i) for i in (1, 2, 3)]
            self.assertEqual([(q["grade"], q["topic"]) for q in rows],
                             [(None, "Жаңа тақырып"), (None, "Жаңа тақырып"), (8, "Жаңа тақырып")])

            # A forked copy belongs to the reader, who may retag it but not the original next to it.
            fork = (await client.post("/api/quizzes/42/fork", params=reader)).json()
            self.assertEqual((await post(reader, {"quiz_ids": [fork["id"]], "grade": 11})).json(), {"updated": 1})
            self.assertEqual((await post(reader, {"quiz_ids": [fork["id"], 42], "grade": 10})).status_code, 403)
            self.assertEqual((await self.db.quizzes.get_quiz_by_id(fork["id"]))["grade"], 11)


if __name__ == "__main__":
    unittest.main()
