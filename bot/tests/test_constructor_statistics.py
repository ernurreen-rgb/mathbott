"""Task constructor statistics (/admin/statistics, "Құрастырғыш" tab) against an isolated PostgreSQL database.

Needs TEST_DATABASE_URL (see tests/postgres_test_db.py).
Run from bot/: python -m pytest tests/test_constructor_statistics.py
"""
from datetime import datetime

from postgres_test_db import PostgresTestCase
from repositories.statistics_repository import build_window

NOW = datetime(2026, 11, 11, 7, 0, 0)
TEACHER = "builder-teacher@example.test"
STUDENT = "builder-student@example.test"
ADMIN = "builder-admin@example.test"


def _task(text, topics=None, sources=None):
    return {
        "text": text, "answer": "A", "question_type": "mcq", "answer_mode": "choices", "accepted_answers": [],
        "text_scale": "md", "difficulty": "B", "topics": topics or [], "sources": sources or [],
        "options": [{"label": label, "text": str(n)} for n, label in enumerate("ABCD")],
        "subquestions": None, "image_filename": None, "solution_filename": None,
    }


class ConstructorStatisticsTests(PostgresTestCase):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        self.teacher = await self.db.users.create_user_by_email(TEACHER)
        await self.db.users.create_user_by_email(STUDENT)
        self.admin = await self.db.users.create_user_by_email(ADMIN, check_admin_email=ADMIN)
        await self.db.users.set_admin_with_role(email=ADMIN, is_admin=True, role="super_admin")
        async with self.seed() as connection:
            for user_id, nickname in ((self.teacher["id"], "teacher"), (self.admin["id"], "admin")):
                await connection.execute("UPDATE users SET nickname = ? WHERE id = ?", (nickname, user_id))
        created = await self.db.bank_tasks.create_tasks_bulk_atomic(
            tasks=[_task("log", ["Логарифм"], ["Educon"]), _task("vec", ["Векторлар"]), _task("gone", ["Логарифм"])],
            created_by=self.admin["id"], actor_email=ADMIN,
        )
        self.t1, self.t2, self.t3 = (int(task["id"]) for task in created)

        collections = self.db.task_collections
        self.c1 = (await collections.create(self.teacher["id"], "Логарифм"))["id"]
        await collections.update(self.c1, self.teacher["id"], header_text="Мектеп", pptx_font="Calibri",
                                 task_ids=[self.t1, self.t2, self.t3])
        self.c2 = (await collections.create(self.teacher["id"], "Бос жинақ"))["id"]
        self.c3 = (await collections.create(self.admin["id"], "Әкімші"))["id"]
        await collections.update(self.c3, self.admin["id"], task_ids=[self.t1])
        # A task deleted after it was collected no longer counts.
        await self.db.bank_tasks.soft_delete_task(self.t3, actor_user_id=self.admin["id"])

        for collection_id, user_id, fmt, answers, count in (
            (self.c1, self.teacher["id"], "pdf", True, 2),
            (self.c1, self.teacher["id"], "pptx", False, 2),
            (self.c3, self.admin["id"], "pptx", True, 1),
            (self.c2, self.teacher["id"], "pdf", True, 0),
        ):
            await collections.record_download(collection_id, user_id, collection_title="t", fmt=fmt,
                                              include_answers=answers, task_count=count)
        async with self.seed() as connection:
            # c1 and c3 in the current 30 days, c2 and its download in the 30 days before.
            for collection_id, moment in ((self.c1, "2026-11-05 08:00:00"), (self.c3, "2026-11-08 08:00:00"),
                                          (self.c2, "2026-10-01 08:00:00")):
                await connection.execute("UPDATE task_collections SET created_at = ?, updated_at = ? WHERE id = ?",
                                         (moment, moment, collection_id))
            await connection.execute(
                "UPDATE task_collection_downloads SET created_at = CASE "
                "WHEN collection_id = ? THEN '2026-10-01 09:00:00' "
                "WHEN collection_id = ? THEN '2026-11-09 08:00:00' "
                "ELSE '2026-11-10 08:00:00' END",
                (self.c2, self.c3),
            )

    def window(self, period="30d"):
        return build_window(period, 300, now=NOW)

    async def test_summary_counts_collections_downloads_and_branding(self):
        data = await self.db.statistics.get_constructor(self.window())
        summary = data["summary"]
        self.assertTrue(data["download_tracking_enabled"])
        self.assertEqual(summary["collections_created"], {"value": 2, "previous": 1})
        self.assertEqual(summary["downloads"], {"value": 3, "previous": 1})
        self.assertEqual((summary["pdf_downloads"], summary["pptx_downloads"], summary["downloads_with_answers"]), (1, 2, 2))
        self.assertEqual(summary["active_authors"]["value"], 2)
        self.assertEqual((summary["collections_total"], summary["non_empty_collections"], summary["empty_collections"]), (3, 2, 1))
        self.assertEqual((summary["tasks_in_collections"], summary["unique_bank_tasks"], summary["bank_tasks_total"]), (3, 2, 2))
        self.assertEqual(summary["avg_tasks_per_collection"], 1.5)
        # The second collection inherited the teacher's header and font from the first one.
        self.assertEqual((summary["custom_header_count"], summary["branded_count"]), (2, 2))
        self.assertEqual([(row["font"], row["collections"]) for row in data["by_font"]], [("Calibri", 2), ("JUZ40 FONTS", 1)])
        self.assertEqual([(task["bank_task_id"], task["collections_count"], task["authors_count"])
                          for task in data["popular_tasks"]], [(self.t1, 2, 2), (self.t2, 1, 1)])
        self.assertEqual(data["by_topic"][0]["topic"], "Логарифм")
        self.assertEqual(sum(point["downloads"] for point in data["series"]["points"]), 3)

        teacher = next(row for row in data["authors"] if row["user_id"] == self.teacher["id"])
        self.assertEqual((teacher["collections"], teacher["downloads"], teacher["pdf_downloads"], teacher["pptx_downloads"]),
                         (2, 2, 1, 1))
        self.assertNotIn("email", teacher)
        recent = {row["collection_id"]: row for row in data["recent_collections"]}
        self.assertEqual((recent[self.c1]["downloads"], recent[self.c1]["task_count"], recent[self.c1]["pptx_font"]),
                         (2, 2, "Calibri"))
        self.assertNotIn(self.c2, recent)  # nothing happened to it in this period

    async def test_admins_can_be_left_out_and_emails_are_opt_in(self):
        data = await self.db.statistics.get_constructor(self.window(), exclude_admins=True)
        self.assertEqual((data["summary"]["collections_total"], data["summary"]["downloads"]["value"]), (2, 2))
        self.assertEqual([(task["bank_task_id"], task["collections_count"]) for task in data["popular_tasks"]],
                         [(self.t1, 1), (self.t2, 1)])
        with_email = await self.db.statistics.get_constructor(self.window(), include_email=True)
        self.assertTrue(with_email["emails_visible"])
        self.assertEqual({row["user_id"]: row["email"] for row in with_email["authors"]}[self.teacher["id"]], TEACHER)

    async def test_students_tab_shows_each_users_collections_and_downloads(self):
        students = (await self.db.statistics.get_students(self.window()))["students"]
        teacher = next(row for row in students if row["user_id"] == self.teacher["id"])
        self.assertEqual((teacher["collections"], teacher["collection_downloads"]), (2, 2))
        student = next(row for row in students if row["nickname"] != "teacher" and row["user_id"] != self.admin["id"])
        self.assertEqual((student["collections"], student["collection_tasks"], student["collection_downloads"]), (0, 0, 0))

    async def test_deleting_a_collection_keeps_its_downloads_in_the_counts(self):
        await self.db.task_collections.delete(self.c1, self.teacher["id"])
        data = await self.db.statistics.get_constructor(self.window())
        self.assertEqual((data["summary"]["collections_total"], data["summary"]["downloads"]["value"]), (2, 3))
