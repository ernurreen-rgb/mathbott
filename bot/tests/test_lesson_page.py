"""The lesson page (GET /api/lessons/{id}) loads its mini-lessons' tasks and progress in shared queries.

The page is reloaded after every answer, so it must stay cheap; and it must return exactly what it
returned when it asked for each mini-lesson's tasks, progress and completion one by one. That old
way is kept below as the reference.

Run from bot/: python -m pytest tests/test_lesson_page.py
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
from utils.public_payload import public_options, public_subquestions
from utils.validation import get_mcq_answer_count, normalize_answer_mode

ADMIN = "lesson-admin@example.com"
STUDENT = "lesson-student@example.com"
OTHER = "lesson-other@example.com"

# lesson id -> {mini index: [(question type, the student's progress)]}; progress is "done",
# "started", None (never opened) or "deleted" (a deleted task, which must not count).
LESSONS = {
    1: {1: [("input", "done"), ("tf", "started"), ("mcq", None)], 2: [("input", "done"), ("input", "deleted")],
        3: [], 4: [("select", "done")]},
    2: {1: [("input", None)], 2: [("input", None)], 3: [("input", None)], 4: [("input", None)]},
}
OPTIONS = {
    "mcq": [{"label": "A", "text": "1"}, {"label": "B", "text": "2"}],
    "select": [{"label": "A", "text": "4"}, {"label": "B", "text": "9"}],
}
ANSWERS = {"input": "5", "tf": "true", "mcq": "A", "select": '["A","B"]'}


async def _old_lesson_minis(db, lesson_id, user_id, show_tasks):
    """The lesson page before batching: every mini-lesson's tasks, progress and completion one by one."""
    mini_lessons = await db.curriculum.get_mini_lessons_by_lesson(lesson_id)
    lesson_progress = await db.calculate_lesson_completion(user_id, lesson_id) if user_id else None
    review_summaries = (
        await db.module_review.get_lesson_summaries(user_id, [ml["id"] for ml in mini_lessons]) if user_id else {}
    )
    result_mini = []
    for ml in mini_lessons:
        tasks = await db.tasks.get_tasks_by_mini_lesson(ml["id"]) if show_tasks else []
        task_progress = await db.progress.get_user_progress_for_mini_lesson(user_id, ml["id"]) if user_id else {}
        tasks_data = []
        for t in tasks:
            options = json.loads(t["options"]) if t.get("options") else None
            subquestions = json.loads(t["subquestions"]) if t.get("subquestions") else None
            tasks_data.append({
                "id": t["id"], "text": t.get("text", ""), "image_filename": t.get("image_filename"),
                "question_type": t.get("question_type", "input"),
                "answer_mode": normalize_answer_mode(t.get("answer_mode"), t.get("question_type")),
                "correct_count": (get_mcq_answer_count(t.get("answer"))
                                  if (t.get("question_type") or "input") in {"mcq", "mcq6"} else 1),
                "text_scale": t.get("text_scale", "md"),
                "options": public_options(options), "subquestions": public_subquestions(subquestions),
                "sort_order": t.get("sort_order", 0),
                "status": task_progress.get(t["id"], "not_started"),
                "answer": t.get("answer") if task_progress.get(t["id"]) == "completed" else None,
            })
        ml_progress = await db.progress.calculate_mini_lesson_completion(user_id, ml["id"]) if user_id else None
        result_mini.append({"id": ml["id"], "mini_index": ml["mini_index"], "title": ml.get("title"),
                            "progress": ml_progress, "review": review_summaries.get(ml["id"]), "tasks": tasks_data})
    return json.loads(json.dumps({"progress": lesson_progress, "mini_lessons": result_mini}))


class LessonPageTests(PostgresTestCase):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        await self.db.users.create_user_by_email(ADMIN, check_admin_email=ADMIN)
        await self.db.users.set_admin_with_role(email=ADMIN, is_admin=True, role="super_admin")
        for email in (STUDENT, OTHER):
            await self.db.users.create_user_by_email(email)
        self.student = await self.db.users.get_user_by_email(STUDENT)
        self.other = await self.db.users.get_user_by_email(OTHER)

        async with self.seed() as c:
            await c.execute("INSERT INTO modules (id, name) VALUES (1, 'Алгебра')")
            await c.execute("INSERT INTO sections (id, module_id, name, sort_order) VALUES (1, 1, 'Бөлім', 0)")
            for lesson_id, minis in LESSONS.items():
                await c.execute("INSERT INTO lessons (id, section_id, title, lesson_number, sort_order) VALUES (?, 1, ?, ?, ?)",
                                (lesson_id, f"Сабақ {lesson_id}", lesson_id, lesson_id))
                for index in minis:
                    await c.execute("INSERT INTO mini_lessons (id, lesson_id, mini_index, title, sort_order) VALUES (?, ?, ?, ?, ?)",
                                    (lesson_id * 10 + index, lesson_id, index, f"Мини {index}", index - 1))
        task_id = 100
        for lesson_id, minis in LESSONS.items():
            for index, tasks in minis.items():
                for order, (kind, status) in enumerate(tasks):
                    task_id += 1
                    bank = await self.db.bank_tasks.create_task(
                        text=f"Есеп {task_id}", answer=ANSWERS[kind], question_type=kind, difficulty="A",
                        options=OPTIONS.get(kind),
                        subquestions=[{"text": "2^2", "correct": "A"}, {"text": "3^2", "correct": "B"}] if kind == "select" else None,
                    )
                    async with self.seed() as c:
                        await c.execute(
                            "INSERT INTO tasks (id, mini_lesson_id, bank_task_id, sort_order, deleted_at) VALUES (?, ?, ?, ?, ?)",
                            # Placements out of id order: the page sorts by sort_order.
                            (task_id, lesson_id * 10 + index, bank["id"], len(tasks) - order,
                             "2026-11-01 00:00:00" if status == "deleted" else None),
                        )
                        if status in ("done", "deleted"):
                            await c.execute("INSERT INTO user_progress (user_id, task_id, status) VALUES (?, ?, 'completed')",
                                            (self.student["id"], task_id))
                        elif status == "started":
                            await c.execute("INSERT INTO user_progress (user_id, task_id, status) VALUES (?, ?, 'in_progress')",
                                            (self.student["id"], task_id))
                        await c.execute("INSERT INTO user_progress (user_id, task_id, status) VALUES (?, ?, 'completed')",
                                        (self.other["id"], task_id))

    def _client(self):
        app = FastAPI()
        app.state.db = self.db
        limiter = Limiter(key_func=get_remote_address)
        app.state.limiter = limiter
        setup_modules_routes(app, self.db, limiter)
        return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://lesson-page.test")

    async def test_the_page_matches_the_one_query_per_mini_lesson_page(self):
        async with self._client() as client:
            for email, user in [(STUDENT, self.student), (ADMIN, None), (None, None)]:
                for lesson_id in LESSONS:
                    response = await client.get(f"/api/lessons/{lesson_id}", params={"email": email} if email else {})
                    self.assertEqual(response.status_code, 200, response.text)
                    page = response.json()
                    user_id = (await self.db.users.get_user_by_email(email))["id"] if email else None
                    # Guests see the tasks of the module's first lesson only, and nothing here is locked.
                    show_tasks = not (page["lock"] or (user_id is None and lesson_id != 1))
                    expected = await _old_lesson_minis(self.db, lesson_id, user_id, show_tasks)
                    self.assertEqual({"progress": page["progress"], "mini_lessons": page["mini_lessons"]}, expected,
                                     (email, lesson_id))

    async def test_tasks_and_progress_are_the_students_own(self):
        async with self._client() as client:
            page = (await client.get("/api/lessons/1", params={"email": STUDENT})).json()
        minis = {mini["mini_index"]: mini for mini in page["mini_lessons"]}
        # The deleted task is gone, the empty mini-lesson does not count, the rest keep their order.
        self.assertEqual([len(minis[index]["tasks"]) for index in (1, 2, 3, 4)], [3, 1, 0, 1])
        self.assertEqual([task["question_type"] for task in minis[1]["tasks"]], ["mcq", "tf", "input"])
        self.assertEqual([task["status"] for task in minis[1]["tasks"]], ["not_started", "in_progress", "completed"])
        self.assertEqual(minis[1]["tasks"][2]["answer"], "5")
        self.assertIsNone(minis[1]["tasks"][0]["answer"])
        self.assertEqual(page["progress"], {"completed": False, "total_mini_lessons": 3, "completed_mini_lessons": 2,
                                            "progress": 2 / 3})

    async def test_the_page_needs_the_same_queries_however_many_mini_lessons(self):
        async with self._client() as client:
            calls = []
            original = storage.PostgresConnection.execute

            def counting(connection, sql, parameters=()):
                calls.append(sql)
                return original(connection, sql, parameters)

            with patch.object(storage.PostgresConnection, "execute", counting):
                response = await client.get("/api/lessons/1", params={"email": STUDENT})
        self.assertEqual(response.status_code, 200)
        self.assertLessEqual(len(calls), 16, calls)
