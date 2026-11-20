"""The module page (GET /api/modules/{id}) computes progress for the whole module in a few queries.

It must return exactly what the old page returned, when it asked for every section, lesson and
mini-lesson one by one; that old way is kept below as the reference.

Run from bot/: python -m pytest tests/test_module_page.py
Needs TEST_DATABASE_URL (see tests/postgres_test_db.py).
"""
import json
from unittest.mock import patch

import httpx
from fastapi import FastAPI
from slowapi import Limiter
from slowapi.util import get_remote_address

import storage
from postgres_test_db import PostgresTestCase
from routes.modules import setup_modules_routes

ADMIN = "page-admin@example.com"
STUDENT = "page-student@example.com"
OTHER = "page-other@example.com"

# section id -> (sort order, {lesson id: (sort order, lesson number, {mini index: [task status, ...]})})
# A status is the student's progress on that task: "done", "started", None (never opened) or
# "deleted" (a deleted task that must not count).
COURSE = {
    10: (1, {
        101: (0, 1, {1: ["done", "done"], 2: ["done"], 3: ["done"], 4: ["done"]}),      # complete
        102: (1, 2, {1: ["done", "started"], 2: ["done", "deleted"]}),                  # only 2 minis
    }),
    20: (0, {
        201: (0, 2, {1: ["done"], 2: ["done"], 3: ["done"], 4: ["done"]}),             # complete
        202: (0, 1, {1: [], 2: ["done"], 3: [None], 4: ["deleted"]}),                   # empty minis
    }),
    30: (2, {}),                                                                         # legacy section
}


async def _old_module_sections(db, module_id, user_id, locks):
    """The module page before batching: one query or more per section, lesson and mini-lesson."""
    sections_data = []
    for section in await db.curriculum.get_sections_by_module(module_id):
        section_progress = await db.progress.calculate_section_completion(user_id, section["id"]) if user_id else None
        lessons_data = []
        for lesson in await db.curriculum.get_lessons_by_section(section["id"]):
            lesson_progress = await db.calculate_lesson_completion(user_id, lesson["id"]) if user_id else None
            mini_data = []
            for ml in await db.curriculum.get_mini_lessons_by_lesson(lesson["id"]):
                ml_progress = await db.progress.calculate_mini_lesson_completion(user_id, ml["id"]) if user_id else None
                mini_data.append({"id": ml["id"], "mini_index": ml["mini_index"], "title": ml.get("title"),
                                  "progress": ml_progress})
            lessons_data.append({
                "id": lesson["id"], "lesson_number": lesson.get("lesson_number"), "title": lesson.get("title"),
                "sort_order": lesson.get("sort_order", 0), "progress": lesson_progress,
                "lock": locks.get(lesson["id"]), "mini_lessons": mini_data,
            })
        sections_data.append({
            "id": section["id"], "name": section["name"], "sort_order": section["sort_order"],
            "description": section.get("description"), "guide": section.get("guide"),
            "progress": section_progress, "lessons": lessons_data,
        })
    return json.loads(json.dumps(sections_data))


class ModulePageTests(PostgresTestCase):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        await self.db.users.create_user_by_email(ADMIN, check_admin_email=ADMIN)
        await self.db.users.set_admin_with_role(email=ADMIN, is_admin=True, role="super_admin")
        for email in (STUDENT, OTHER):
            await self.db.users.create_user_by_email(email)
        self.student = await self.db.users.get_user_by_email(STUDENT)
        self.other = await self.db.users.get_user_by_email(OTHER)

        task_id = 1000
        async with self.seed() as c:
            await c.execute("INSERT INTO modules (id, name) VALUES (1, 'Алгебра')")
            for section_id, (order, lessons) in COURSE.items():
                await c.execute("INSERT INTO sections (id, module_id, name, sort_order) VALUES (?, 1, ?, ?)",
                                (section_id, f"Бөлім {section_id}", order))
                for lesson_id, (lesson_order, number, minis) in lessons.items():
                    await c.execute(
                        "INSERT INTO lessons (id, section_id, title, lesson_number, sort_order) VALUES (?, ?, ?, ?, ?)",
                        (lesson_id, section_id, f"Сабақ {lesson_id}", number, lesson_order),
                    )
                    for index, statuses in minis.items():
                        mini_id = lesson_id * 10 + index
                        await c.execute("INSERT INTO mini_lessons (id, lesson_id, mini_index, title, sort_order) "
                                        "VALUES (?, ?, ?, ?, ?)", (mini_id, lesson_id, index, f"Мини {index}", index - 1))
                        for status in statuses:
                            task_id += 1
                            await self._task(c, task_id, mini_id=mini_id, status=status)
            # A section without lessons is scored on tasks placed straight in it.
            for status in ("done", None):
                task_id += 1
                await self._task(c, task_id, section_id=30, status=status)

    async def _task(self, c, task_id, *, mini_id=None, section_id=None, status=None):
        deleted = "2026-11-01 00:00:00" if status == "deleted" else None
        await c.execute("INSERT INTO tasks (id, mini_lesson_id, section_id, deleted_at) VALUES (?, ?, ?, ?)",
                        (task_id, mini_id, section_id, deleted))
        if status in ("done", "deleted"):
            await c.execute("INSERT INTO user_progress (user_id, task_id, status) VALUES (?, ?, 'completed')",
                            (self.student["id"], task_id))
        elif status == "started":
            await c.execute("INSERT INTO user_progress (user_id, task_id, status) VALUES (?, ?, 'in_progress')",
                            (self.student["id"], task_id))
        # Someone else's progress never shows on this student's page.
        await c.execute("INSERT INTO user_progress (user_id, task_id, status) VALUES (?, ?, 'completed')",
                        (self.other["id"], task_id))

    def _client(self):
        app = FastAPI()
        app.state.db = self.db
        limiter = Limiter(key_func=get_remote_address)
        app.state.limiter = limiter
        setup_modules_routes(app, self.db, limiter)
        return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://module-page.test")

    async def test_the_page_matches_the_one_query_per_item_page(self):
        async with self._client() as client:
            for email, user, is_admin in [(STUDENT, self.student, False), (ADMIN, None, True), (None, None, False)]:
                response = await client.get("/api/modules/1", params={"email": email} if email else {})
                self.assertEqual(response.status_code, 200, response.text)
                user_id = (await self.db.users.get_user_by_email(email))["id"] if email else None
                locks = (await self.db.module_review.get_lesson_gate(user_id, 1))["locks"] if user_id and not is_admin else {}
                expected = await _old_module_sections(self.db, 1, user_id, locks)
                self.assertEqual(response.json()["sections"], expected, email)

    async def test_progress_is_what_the_student_did(self):
        async with self._client() as client:
            page = (await client.get("/api/modules/1", params={"email": STUDENT})).json()
        sections = {section["id"]: section for section in page["sections"]}
        self.assertEqual(list(sections), [20, 10, 30])
        lessons = {lesson["id"]: lesson for section in page["sections"] for lesson in section["lessons"]}
        self.assertEqual([lesson["id"] for lesson in sections[20]["lessons"]], [202, 201])
        self.assertTrue(lessons[101]["progress"]["completed"])
        self.assertEqual(lessons[102]["progress"]["completed_mini_lessons"], 1)
        self.assertEqual(lessons[102]["progress"]["total_mini_lessons"], 2)
        # GET requests must remain read-only and never auto-insert missing mini-lessons.
        self.assertEqual([mini["mini_index"] for mini in lessons[102]["mini_lessons"]], [1, 2])
        self.assertFalse(lessons[202]["progress"]["completed"])
        self.assertEqual(lessons[202]["progress"]["total_mini_lessons"], 2)
        self.assertEqual(lessons[202]["progress"]["completed_mini_lessons"], 1)
        self.assertEqual((sections[10]["progress"]["completed_lessons"], sections[20]["progress"]["completed_lessons"]),
                         (1, 1))
        self.assertEqual(sections[30]["progress"]["completed_count"], 1)

    async def test_the_page_needs_a_handful_of_queries(self):
        async with self._client() as client:
            await client.get("/api/modules/1", params={"email": STUDENT})  # adds the missing mini-lessons
            calls = []
            original = storage.PostgresConnection.execute

            def counting(connection, sql, parameters=()):
                calls.append(sql)
                return original(connection, sql, parameters)

            with patch.object(storage.PostgresConnection, "execute", counting):
                response = await client.get("/api/modules/1", params={"email": STUDENT})
        self.assertEqual(response.status_code, 200)
        # module, user, lesson gate, outline (3), progress (1), the legacy section (2): it does not grow with lessons.
        self.assertLessEqual(len(calls), 15, calls)
