"""Admin statistics against a real PostgreSQL database.

The queries are PostgreSQL only, so the database tests need a disposable server: set
TEST_DATABASE_URL to any database on it (for example postgresql://postgres@127.0.0.1:5432/postgres).
Each run creates its own database there and drops it afterwards. Without the variable only
the pure period and bucket tests run.

Run from bot/: python -m pytest tests/test_admin_statistics.py
"""
import asyncio
import json
import os
import unittest
from contextlib import asynccontextmanager
from datetime import date, datetime
from unittest.mock import patch
from urllib.parse import urlsplit, urlunsplit
from uuid import uuid4

import httpx
from fastapi import FastAPI
from slowapi import Limiter
from slowapi.util import get_remote_address

import storage
from database import Database
from repositories.statistics_repository import bucket_plan, build_window, effective_streak
from routes.admin.statistics import register_statistics_routes

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "").strip()
# Noon in Kazakhstan (UTC+5) on Wednesday 2026-11-11.
NOW = datetime(2026, 11, 11, 7, 0, 0)
ADMIN = "stats-admin@example.test"
REVIEWER = "stats-reviewer@example.test"
STUDENTS = {name: f"stats-{name}@example.test" for name in ("aru", "bek", "dana", "erlan", "fariza")}


class PeriodTests(unittest.TestCase):
    def test_window_follows_the_viewers_local_day(self):
        window = build_window("7d", 300, now=datetime(2026, 11, 10, 19, 30, 0))
        self.assertEqual((window.today, window.start, window.previous_start, window.previous_end),
                         (date(2026, 11, 11), date(2026, 11, 5), date(2026, 10, 29), date(2026, 11, 4)))
        self.assertEqual((window.start_utc, window.end_utc), ("2026-11-04 19:00:00", "2026-11-11 19:00:00"))
        self.assertEqual(build_window("7d", 0, now=datetime(2026, 11, 10, 19, 30, 0)).today, date(2026, 11, 10))

    def test_all_time_has_no_comparison_period(self):
        window = build_window("all", 300, now=NOW)
        self.assertEqual((window.start, window.previous_start, window.previous_end), (None, None, None))
        self.assertEqual(window.describe()["start"], None)
        self.assertEqual(build_window("30d", 99999, now=NOW).tz_offset_minutes, 840)
        with self.assertRaises(ValueError):
            build_window("1y")

    def test_long_spans_switch_to_weeks_and_months(self):
        self.assertEqual(bucket_plan(date(2026, 11, 5), date(2026, 11, 11))[0], "day")
        granularity, weeks = bucket_plan(date(2026, 1, 1), date(2026, 11, 11))
        self.assertEqual(granularity, "week")
        # 2026-01-01 is a Thursday: the first bucket ends on Sunday, the rest are whole weeks.
        self.assertEqual(weeks[0], (date(2026, 1, 1), date(2026, 1, 4)))
        self.assertEqual(weeks[1], (date(2026, 1, 5), date(2026, 1, 11)))
        self.assertEqual(weeks[-1][1], date(2026, 11, 11))
        granularity, months = bucket_plan(date(2023, 12, 15), date(2026, 11, 11))
        self.assertEqual(granularity, "month")
        self.assertEqual(months[:2], [(date(2023, 12, 15), date(2023, 12, 31)), (date(2024, 1, 1), date(2024, 1, 31))])
        self.assertEqual(months[-1], (date(2026, 11, 1), date(2026, 11, 11)))

    def test_streak_expires_after_a_missed_day(self):
        today = date(2026, 11, 11)
        self.assertEqual(effective_streak(5, "2026-11-11", today), 5)
        self.assertEqual(effective_streak(5, "2026-11-10", today), 5)
        self.assertEqual(effective_streak(5, "2026-11-09", today), 0)
        self.assertEqual(effective_streak(5, None, today), 0)


@unittest.skipUnless(TEST_DATABASE_URL, "TEST_DATABASE_URL is not set; statistics queries need PostgreSQL")
class StatisticsTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        import psycopg

        cls.environment = patch.dict(os.environ, {"ENVIRONMENT": "development", "DATABASE_URL": "", "SENTRY_DSN": ""})
        cls.environment.start()
        cls.database_name = f"qazmath_statistics_{uuid4().hex[:12]}"
        with psycopg.connect(TEST_DATABASE_URL, autocommit=True) as server:
            server.execute(f'CREATE DATABASE "{cls.database_name}"')
        parts = urlsplit(TEST_DATABASE_URL)
        cls.db = Database(urlunsplit(parts._replace(path=f"/{cls.database_name}")), use_pool=False)
        asyncio.run(cls._seed())
        cls.app = FastAPI()
        cls.app.state.db = cls.db
        register_statistics_routes(cls.app, cls.db, Limiter(key_func=get_remote_address))

    @classmethod
    def tearDownClass(cls):
        import psycopg

        with psycopg.connect(TEST_DATABASE_URL, autocommit=True) as server:
            server.execute(f'DROP DATABASE IF EXISTS "{cls.database_name}" WITH (FORCE)')
        cls.environment.stop()

    @classmethod
    async def _seed(cls):
        db = cls.db
        await db.init()
        await db.users.create_user_by_email(ADMIN, check_admin_email=ADMIN)
        await db.users.set_admin_with_role(email=ADMIN, is_admin=True, role="super_admin")
        await db.users.create_user_by_email(REVIEWER)
        await db.users.set_admin_with_role(email=REVIEWER, is_admin=True, role="reviewer")
        for email in STUDENTS.values():
            await db.users.create_user_by_email(email)
        cls.ids = {
            name: (await db.users.get_user_by_email(email))["id"]
            for name, email in {"admin": ADMIN, "reviewer": REVIEWER, **STUDENTS}.items()
        }
        ids = cls.ids

        bank = {}
        for key, text, kind, difficulty, topics in (
            ("add", "$27+15$", "input", "A", ["Қосу"]),
            ("subtract", "$100-37$", "mcq", "B", ["Қосу", "Азайту"]),
            ("multiply", "$6\\cdot 7$", "input", "C", []),
            ("equation", "$x+2=5$", "input", "A", ["Теңдеулер"]),
            ("triangle", "Үшбұрыштың бұрыштарының қосындысы $180^\\circ$", "tf", "B", []),
        ):
            bank[key] = (await db.bank_tasks.create_task(
                text=text, answer="42", question_type="input", difficulty=difficulty, topics=topics,
            ))["id"]
            if kind != "input":
                await cls._run("UPDATE bank_tasks SET question_type = ? WHERE id = ?", kind, bank[key])

        # Registered: aru in the previous 30 days, bek/dana/erlan in the current ones, fariza long ago.
        for name, created, seen in (
            ("admin", "2026-01-01 00:00:00", "2026-11-10 08:00:00"),
            ("reviewer", "2026-01-01 00:00:00", "2026-11-08 08:00:00"),
            ("aru", "2026-09-20 06:00:00", "2026-10-02 08:00:00"),
            ("bek", "2026-11-01 06:00:00", "2026-11-09 10:00:00"),
            ("dana", "2026-11-08 06:00:00", "2026-11-11 06:59:30"),
            ("erlan", "2026-11-11 05:00:00", "2026-11-11 05:00:00"),
            ("fariza", "2026-08-03 06:00:00", "2026-08-03 06:00:00"),
        ):
            await cls._run("UPDATE users SET nickname = ?, created_at = ?, last_active = ? WHERE id = ?",
                           name, created, seen, ids[name])
        await cls._run("UPDATE users SET streak = 4, last_streak_date = '2026-11-10' WHERE id = ?", ids["dana"])
        await cls._run("UPDATE users SET streak = 9, last_streak_date = '2026-11-06' WHERE id = ?", ids["bek"])

        for module_id, name in ((1, "Алгебра"), (2, "Геометрия")):
            await cls._run("INSERT INTO modules (id, name, sort_order) VALUES (?, ?, ?)", module_id, name, module_id)
            await cls._run("INSERT INTO sections (id, module_id, name) VALUES (?, ?, 'Бөлім')", module_id, module_id)
        for lesson_id, section_id, number, title in ((1, 1, 1, "Теңдеулер"), (2, 1, 2, "Теңсіздіктер"), (3, 2, 1, "Үшбұрыштар")):
            await cls._run("INSERT INTO lessons (id, section_id, lesson_number, title, sort_order) VALUES (?, ?, ?, ?, ?)",
                           lesson_id, section_id, number, title, number)
        # The first lesson has two mini-lessons with tasks and two empty ones.
        for mini_id, lesson_id, index in ((1, 1, 1), (2, 1, 2), (3, 1, 3), (4, 1, 4), (5, 2, 1), (6, 3, 1)):
            await cls._run("INSERT INTO mini_lessons (id, lesson_id, mini_index) VALUES (?, ?, ?)", mini_id, lesson_id, index)
        for task_id, mini_id, key in ((11, 1, "add"), (12, 1, "subtract"), (13, 2, "multiply"), (21, 5, "equation"), (31, 6, "triangle")):
            await cls._run("INSERT INTO tasks (id, mini_lesson_id, bank_task_id) VALUES (?, ?, ?)", task_id, mini_id, bank[key])

        # dana's last answer is 00:30 on the 11th in Kazakhstan but still the 10th in UTC.
        for name, task_id, correct, moment in (
            ("aru", 11, 0, "2026-10-02 07:00:00"), ("aru", 11, 1, "2026-10-02 07:01:00"),
            ("bek", 11, 0, "2026-11-06 10:00:00"), ("bek", 11, 0, "2026-11-06 10:01:00"),
            ("bek", 11, 1, "2026-11-06 10:02:00"), ("bek", 12, 1, "2026-11-06 10:03:00"),
            ("bek", 13, 1, "2026-11-09 09:00:00"),
            ("dana", 11, 0, "2026-11-10 06:00:00"), ("dana", 11, 0, "2026-11-10 06:01:00"),
            ("admin", 11, 0, "2026-11-10 08:00:00"),
            ("dana", 21, 1, "2026-11-10 19:30:00"),
        ):
            await cls._run("INSERT INTO solutions (user_id, task_id, answer, is_correct, created_at) VALUES (?, ?, 'x', ?, ?)",
                           ids[name], task_id, correct, moment)
        for name, task_id in (("aru", 11), ("bek", 11), ("bek", 12), ("bek", 13), ("dana", 21)):
            await cls._run("INSERT INTO user_progress (user_id, task_id, status, completed_at) VALUES (?, ?, 'completed', ?)",
                           ids[name], task_id, "2026-11-10 00:00:00")
        await cls._run("INSERT INTO module_review_attempts (user_id, task_id, bank_task_id, answer, is_correct, created_at) "
                       "VALUES (?, 11, ?, '5', 1, '2026-11-09 09:40:00')", ids["bek"], bank["add"])
        await cls._run("INSERT INTO user_achievements (user_id, achievement_id) VALUES (?, 'first_solve')", ids["bek"])
        await cls._run("INSERT INTO reports (user_id, task_id, message, status) VALUES (?, 11, 'қате', 'pending')", ids["bek"])
        await cls._run("INSERT INTO reports (user_id, task_id, message, status, resolved_at) "
                       "VALUES (?, 12, 'түсініксіз', 'resolved', '2026-11-10 00:00:00')", ids["dana"])

        await cls._run("INSERT INTO trial_test_folders (id, name) VALUES (1, 'ҰБТ 2026')")
        await cls._run("INSERT INTO trial_tests (id, title, folder_id, sort_order) VALUES (1, 'Нұсқа 1', 1, 1)")
        await cls._run("INSERT INTO trial_tests (id, title, sort_order) VALUES (2, 'Нұсқа 2', 2)")
        await cls._run("INSERT INTO trial_test_tasks (id, trial_test_id, bank_task_id, sort_order) VALUES (101, 1, ?, 0)", bank["add"])
        await cls._run("INSERT INTO trial_test_tasks (id, trial_test_id, bank_task_id, sort_order) VALUES (102, 1, ?, 1)", bank["subtract"])
        for name, score, mode, moment, first, second in (
            ("aru", 0, "solo", "2026-10-02 08:00:00", ("1", False), ("", False)),
            ("bek", 1, "solo", "2026-11-09 09:30:00", ("42", True), ("", False)),
            ("dana", 2, "coop", "2026-11-10 06:30:00", ("42", True), ("B", True)),
        ):
            answers = {str(task_id): {"answer": answer, "correct": correct}
                       for task_id, (answer, correct) in ((101, first), (102, second))}
            await cls._run(
                "INSERT INTO trial_test_results (user_id, trial_test_id, score, total, percentage, answers, submit_mode, completed_at) "
                "VALUES (?, 1, ?, 2, ?, ?, ?, ?)", ids[name], score, score * 50.0, json.dumps(answers), mode, moment)
        await cls._run("INSERT INTO trial_test_reports (user_id, trial_test_id, trial_test_task_id, message) VALUES (?, 1, 101, 'қате')",
                       ids["bek"])

        await cls._run("INSERT INTO quizzes (id, title, created_by) VALUES (1, 'Жылдам есеп', ?)", ids["reviewer"])
        for question_id in (1, 2):
            await cls._run("INSERT INTO quiz_questions (id, quiz_id, question_text, correct_answer) VALUES (?, 1, 'q', 'A')", question_id)
        for session_id, pin, status, moment in ((1, "111111", "finished", "2026-11-08 08:00:00"), (2, "222222", "lobby", "2026-09-27 08:00:00")):
            await cls._run("INSERT INTO quiz_sessions (id, quiz_id, host_id, pin_code, status, created_at) VALUES (?, 1, ?, ?, ?, ?)",
                           session_id, ids["reviewer"], pin, status, moment)
        for question_id in (1, 2):
            await cls._run("INSERT INTO quiz_session_questions (session_id, question_id, position, snapshot_json) VALUES (1, ?, ?, '{}')",
                           question_id, question_id)
        for participant_id, session_id, user_id, nickname in ((1, 1, ids["bek"], "bek"), (2, 1, None, "қонақ"), (3, 2, ids["dana"], "dana")):
            await cls._run("INSERT INTO quiz_participants (id, session_id, user_id, nickname) VALUES (?, ?, ?, ?)",
                           participant_id, session_id, user_id, nickname)
        for participant_id, question_id, correct in ((1, 1, 1), (1, 2, 0), (2, 1, 1)):
            await cls._run("INSERT INTO quiz_answers (session_id, participant_id, question_id, user_answer, is_correct) VALUES (1, ?, ?, 'A', ?)",
                           participant_id, question_id, correct)

    @classmethod
    async def _run(cls, sql, *params):
        async with storage.connect(cls.db.db_path) as connection:
            await connection.execute(sql, params)
            await connection.commit()

    async def asyncSetUp(self):
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://statistics.test")
        self.stats = self.db.statistics

    async def asyncTearDown(self):
        await self.client.aclose()

    @staticmethod
    def window(period="30d", tz_offset=300):
        return build_window(period, tz_offset, now=NOW)

    async def test_overview_compares_the_period_with_the_one_before(self):
        data = await self.stats.get_overview(self.window())
        self.assertEqual(data["period"], {
            "key": "30d", "days": 30, "start": "2026-10-13", "end": "2026-11-11",
            "previous_start": "2026-09-13", "previous_end": "2026-10-12", "tz_offset_minutes": 300,
        })
        self.assertEqual(data["kpis"], {
            "active_users": {"value": 3, "previous": 1},
            "new_users": {"value": 3, "previous": 1},
            "attempts": {"value": 9, "previous": 2},
            "accuracy": {"value": 0.4444, "previous": 0.5},
            "trial_attempts": {"value": 2, "previous": 1},
            "trial_average": {"value": 0.75, "previous": 0.0},
        })
        self.assertEqual(data["attention"], {
            "pending_reports": 2, "hard_tasks": 1, "churned_students": 1, "silent_new_students": 1,
        })
        self.assertEqual(data["today"], {"online_now": 1, "active_users": 1, "attempts": 1, "new_users": 1})
        self.assertEqual(data["totals"], {
            "users": 7, "modules": 2, "lessons": 3, "module_tasks": 5, "bank_tasks": 5, "trial_tests": 2, "quizzes": 1,
        })
        self.assertEqual([step["count"] for step in data["journey"]], [3, 2, 2, 2, 2])
        self.assertEqual([step["key"] for step in data["journey"]],
                         ["registered", "answered", "completed_mini_lesson", "returned", "trial_test"])

    async def test_series_is_zero_filled_and_heatmap_uses_local_time(self):
        data = await self.stats.get_overview(self.window())
        points = {point["start"]: point for point in data["series"]["points"]}
        self.assertEqual((data["series"]["granularity"], len(points)), ("day", 30))
        self.assertEqual(points["2026-10-20"], {
            "start": "2026-10-20", "end": "2026-10-20", "attempts": 0, "correct": 0, "active_users": 0,
            "new_users": 0, "trial_attempts": 0, "trial_average": None,
        })
        self.assertEqual({key: points["2026-11-06"][key] for key in ("attempts", "correct", "active_users")},
                         {"attempts": 4, "correct": 2, "active_users": 1})
        self.assertEqual({key: points["2026-11-10"][key] for key in ("attempts", "active_users", "trial_attempts", "trial_average")},
                         {"attempts": 3, "active_users": 2, "trial_attempts": 1, "trial_average": 1.0})
        self.assertEqual({key: points["2026-11-11"][key] for key in ("attempts", "active_users", "new_users")},
                         {"attempts": 1, "active_users": 1, "new_users": 1})
        # Friday 15:00, Monday 14:00, Tuesday 11:00 and 13:00, Wednesday 00:00 in UTC+5.
        self.assertEqual({(cell["weekday"], cell["hour"]): cell["count"] for cell in data["heatmap"]},
                         {(4, 15): 4, (0, 14): 1, (1, 11): 2, (1, 13): 1, (2, 0): 1})

    async def test_utc_viewer_gets_different_day_boundaries(self):
        data = await self.stats.get_overview(self.window(tz_offset=0))
        self.assertEqual(data["today"]["attempts"], 0)
        self.assertEqual(data["journey"][3], {"key": "returned", "count": 1})
        self.assertIn({"weekday": 1, "hour": 19, "count": 1}, data["heatmap"])

    async def test_admin_activity_can_be_left_out(self):
        data = await self.stats.get_overview(self.window(), exclude_admins=True)
        self.assertEqual((data["kpis"]["active_users"]["value"], data["kpis"]["attempts"]["value"],
                          data["kpis"]["accuracy"]["value"], data["totals"]["users"]), (2, 8, 0.5, 5))
        self.assertEqual(data["attention"]["hard_tasks"], 1)
        students = await self.stats.get_students(self.window(), exclude_admins=True)
        self.assertNotIn(self.ids["admin"], {student["user_id"] for student in students["students"]})
        tasks = await self.stats.get_tasks(self.window(), exclude_admins=True)
        self.assertEqual((tasks["summary"]["attempts"], tasks["summary"]["students"]), (8, 2))
        modules = await self.stats.get_modules(self.window(), exclude_admins=True)
        self.assertEqual((modules["modules"][0]["started"], modules["modules"][0]["average_progress"]), (3, 0.4167))

    async def test_shorter_period_and_all_time(self):
        week = await self.stats.get_overview(self.window("7d"))
        self.assertEqual(week["kpis"]["new_users"], {"value": 2, "previous": 1})
        self.assertEqual((week["attention"]["churned_students"], week["journey"][0]["count"]), (0, 2))
        everything = await self.stats.get_overview(self.window("all"))
        self.assertEqual(everything["kpis"]["attempts"], {"value": 11, "previous": None})
        self.assertEqual(everything["kpis"]["active_users"], {"value": 4, "previous": None})
        self.assertEqual(everything["attention"]["churned_students"], 0)
        self.assertEqual(everything["series"]["granularity"], "week")
        self.assertEqual(everything["series"]["points"][0]["start"], "2026-01-01")
        self.assertEqual(sum(point["attempts"] for point in everything["series"]["points"]), 11)
        self.assertEqual(sum(point["new_users"] for point in everything["series"]["points"]), 7)

    async def test_students_are_flagged_and_sorted_by_activity(self):
        data = await self.stats.get_students(self.window(), include_email=True)
        self.assertEqual(data["summary"], {
            "total": 7, "active": 3, "new": 3, "returning": 0, "churned": 1, "never_active": 3,
            "average_active_days": 1.7, "median_attempts": 3,
        })
        self.assertEqual([student["nickname"] for student in data["students"]],
                         ["bek", "dana", "admin", "erlan", "reviewer", "aru", "fariza"])
        students = {student["nickname"]: student for student in data["students"]}
        self.assertEqual({key: students["bek"][key] for key in (
            "attempts", "correct", "accuracy", "active_days", "trial_attempts", "trial_average", "streak",
            "is_active", "is_new", "is_churned", "never_active", "is_admin", "email",
        )}, {
            "attempts": 5, "correct": 3, "accuracy": 0.6, "active_days": 2, "trial_attempts": 1, "trial_average": 0.5,
            "streak": 0, "is_active": True, "is_new": True, "is_churned": False, "never_active": False,
            "is_admin": False, "email": STUDENTS["bek"],
        })
        self.assertEqual((students["dana"]["streak"], students["dana"]["active_days"], students["dana"]["last_seen_at"]),
                         (4, 2, "2026-11-11T06:59:30Z"))
        self.assertEqual((students["aru"]["is_churned"], students["aru"]["is_active"], students["aru"]["registered_at"]),
                         (True, False, "2026-09-20T06:00:00Z"))
        self.assertEqual((students["erlan"]["never_active"], students["erlan"]["is_new"]), (True, True))
        self.assertEqual((students["admin"]["is_admin"], students["fariza"]["never_active"]), (True, True))
        self.assertEqual(data["activity_distribution"], [
            {"key": "1", "count": 1}, {"key": "2-3", "count": 2}, {"key": "4-7", "count": 0}, {"key": "8+", "count": 0},
        ])
        self.assertEqual(data["achievements"][0], {"id": "first_solve", "name": "Бірінші есеп", "count": 1})
        self.assertEqual((data["truncated"], data["emails_visible"], len(data["series"]["points"])), (False, True, 30))

    async def test_tasks_count_first_attempts_and_flag_hard_ones(self):
        data = await self.stats.get_tasks(self.window())
        self.assertEqual(data["summary"], {
            "attempts": 9, "accuracy": 0.4444, "first_attempts": 6, "first_accuracy": 0.5, "students": 3,
            "tasks_attempted": 4, "tasks_total": 5, "hard_tasks": 1, "pending_reports": 1,
        })
        self.assertEqual([task["task_id"] for task in data["tasks"]], [11, 12, 13, 21])
        hard = data["tasks"][0]
        self.assertEqual({key: hard[key] for key in (
            "attempts", "correct", "accuracy", "students", "solved_students", "first_attempts", "first_correct",
            "first_accuracy", "reports", "pending_reports", "is_hard", "topics", "question_type", "difficulty", "deleted",
        )}, {
            "attempts": 6, "correct": 1, "accuracy": 0.1667, "students": 3, "solved_students": 1,
            # aru's first attempt at this task was in the previous period.
            "first_attempts": 3, "first_correct": 0, "first_accuracy": 0.0, "reports": 1, "pending_reports": 1,
            "is_hard": True, "topics": ["Қосу"], "question_type": "input", "difficulty": "A", "deleted": False,
        })
        self.assertEqual(hard["location"], {
            "mini_index": 1, "lesson_id": 1, "lesson_title": "Теңдеулер", "lesson_number": 1,
            "section_name": "Бөлім", "module_id": 1, "module_name": "Алгебра",
        })
        self.assertEqual((data["tasks"][1]["reports"], data["tasks"][1]["pending_reports"], data["tasks"][1]["topics"]),
                         (1, 0, ["Азайту", "Қосу"]))
        self.assertEqual(data["by_type"], [
            {"key": "input", "attempts": 8, "correct": 3, "tasks": 3, "accuracy": 0.375},
            {"key": "mcq", "attempts": 1, "correct": 1, "tasks": 1, "accuracy": 1.0},
        ])
        self.assertEqual([(group["key"], group["attempts"], group["correct"]) for group in data["by_difficulty"]],
                         [("A", 7, 2), ("B", 1, 1), ("C", 1, 1)])
        self.assertEqual({group["key"]: (group["attempts"], group["tasks"]) for group in data["by_topic"]},
                         {"Қосу": (7, 2), "Азайту": (1, 1), "Теңдеулер": (1, 1), "": (1, 1)})

    async def test_modules_show_progress_now_and_answers_in_the_period(self):
        data = await self.stats.get_modules(self.window())
        self.assertEqual(data["summary"], {
            "modules": 2, "lessons": 3, "tasks": 5, "students_started": 4, "students_completed_lesson": 2,
            "attempts": 9, "accuracy": 0.4444,
        })
        algebra, geometry = data["modules"]
        self.assertEqual({key: algebra[key] for key in (
            "name", "lessons_count", "tasks", "started", "completed", "average_progress", "attempts", "accuracy", "active_students",
        )}, {
            "name": "Алгебра", "lessons_count": 2, "tasks": 4, "started": 4, "completed": 0,
            "average_progress": 0.3125, "attempts": 9, "accuracy": 0.4444, "active_students": 3,
        })
        first, second = algebra["lessons"]
        self.assertEqual({key: first[key] for key in ("title", "tasks", "started", "completed", "attempts", "correct", "active_students")},
                         {"title": "Теңдеулер", "tasks": 3, "started": 4, "completed": 1, "attempts": 8, "correct": 3, "active_students": 3})
        self.assertEqual([(mini["mini_index"], mini["tasks"], mini["started"], mini["completed"]) for mini in first["minis"]],
                         [(1, 2, 4, 1), (2, 1, 1, 1), (3, 0, 0, 0), (4, 0, 0, 0)])
        self.assertEqual((second["started"], second["completed"], second["attempts"]), (1, 1, 1))
        self.assertEqual((geometry["started"], geometry["average_progress"], geometry["attempts"], geometry["accuracy"]),
                         (0, None, 0, None))
        # Answers before the period still count as having started the lesson.
        week = await self.stats.get_modules(self.window("7d"))
        self.assertEqual((week["modules"][0]["started"], week["modules"][0]["attempts"]), (4, 9))

    async def test_trial_tests_report_scores_and_question_difficulty(self):
        data = await self.stats.get_trial_tests(self.window())
        self.assertEqual(data["summary"], {
            "attempts": {"value": 2, "previous": 1}, "students": {"value": 2, "previous": 1},
            "average": {"value": 0.75, "previous": 0.0}, "median": 0.75, "best": 1.0,
            "solo": 1, "coop": 1, "tests_total": 2, "tests_taken": 1,
        })
        self.assertEqual([bucket["count"] for bucket in data["distribution"]], [0, 0, 0, 0, 0, 1, 0, 0, 0, 1])
        taken, untouched = data["tests"]
        self.assertEqual({key: taken[key] for key in (
            "title", "folder", "questions_count", "attempts", "students", "average", "best", "solo", "coop", "last_completed_at",
        )}, {
            "title": "Нұсқа 1", "folder": "ҰБТ 2026", "questions_count": 2, "attempts": 2, "students": 2,
            "average": 0.75, "best": 1.0, "solo": 1, "coop": 1, "last_completed_at": "2026-11-10T06:30:00Z",
        })
        # aru's attempt belongs to the previous period, so it is not in the question counts.
        self.assertEqual([(q["number"], q["answers"], q["correct"], q["skipped"], q["accuracy"]) for q in taken["questions"]],
                         [(1, 2, 2, 0, 1.0), (2, 2, 1, 1, 0.5)])
        self.assertEqual((untouched["attempts"], untouched["average"], untouched["questions"]), (0, None, []))
        self.assertEqual([(item["nickname"], item["percentage"], item["submit_mode"]) for item in data["recent"]],
                         [("dana", 1.0, "coop"), ("bek", 0.5, "solo")])
        points = {point["start"]: point for point in data["series"]["points"]}
        self.assertEqual((points["2026-11-09"]["attempts"], points["2026-11-09"]["average"]), (1, 0.5))
        everything = await self.stats.get_trial_tests(self.window("all"))
        self.assertEqual([(q["answers"], q["correct"], q["skipped"]) for q in everything["tests"][0]["questions"]],
                         [(3, 2, 0), (3, 1, 2)])

    async def test_quizzes_count_sessions_participants_and_guests(self):
        data = await self.stats.get_quizzes(self.window())
        self.assertEqual(data["summary"], {
            "sessions": {"value": 1, "previous": 1}, "participants": {"value": 2, "previous": 1},
            "answers": {"value": 3, "previous": 0}, "accuracy": {"value": 0.6667, "previous": None},
            "finished_sessions": 1, "guests": 1, "hosts": 1, "quizzes_total": 1, "quizzes_played": 1,
        })
        self.assertEqual(data["quizzes"], [{
            "quiz_id": 1, "title": "Жылдам есеп", "sessions": 1, "participants": 2, "answers": 3,
            "last_session_at": "2026-11-08T08:00:00Z", "accuracy": 0.6667,
        }])
        self.assertEqual(data["recent"], [{
            "session_id": 1, "quiz_id": 1, "title": "Жылдам есеп", "host_nickname": "reviewer", "status": "finished",
            "created_at": "2026-11-08T08:00:00Z", "participants": 2, "guests": 1, "answers": 3, "accuracy": 0.6667,
        }])
        self.assertEqual(sum(point["sessions"] for point in data["series"]["points"]), 1)

    async def test_unreadable_registration_time_does_not_break_the_page(self):
        """Legacy rows may hold an empty string or an epoch number instead of a timestamp."""
        try:
            for broken in ("", "1724100000"):
                await self._run("UPDATE users SET created_at = ? WHERE id = ?", broken, self.ids["fariza"])
                data = await self.stats.get_students(self.window("all"))
                fariza = next(student for student in data["students"] if student["nickname"] == "fariza")
                self.assertEqual((fariza["is_new"], fariza["registered_at"]), (False, None))
                self.assertEqual(data["summary"]["total"], 7)
                overview = await self.stats.get_overview(self.window("all"))
                self.assertEqual(overview["kpis"]["attempts"]["value"], 11)
        finally:
            await self._run("UPDATE users SET created_at = '2026-08-03 06:00:00' WHERE id = ?", self.ids["fariza"])

    async def test_pooled_connection_with_a_row_factory_gives_the_same_numbers(self):
        """The pool hands out connections that other repositories switched to named rows."""
        expected = [await call(self.window()) for call in (
            self.stats.get_overview, self.stats.get_students, self.stats.get_tasks, self.stats.get_modules,
            self.stats.get_trial_tests, self.stats.get_quizzes,
        )]
        plain_connection = self.stats._connection

        @asynccontextmanager
        async def named_rows():
            async with plain_connection() as connection:
                connection.row_factory = storage.Row
                yield connection

        with patch.object(self.stats, "_connection", named_rows):
            actual = [await call(self.window()) for call in (
                self.stats.get_overview, self.stats.get_students, self.stats.get_tasks, self.stats.get_modules,
                self.stats.get_trial_tests, self.stats.get_quizzes,
            )]
        self.assertEqual(actual, expected)

    async def test_routes_require_a_reviewer_and_hide_emails_from_other_roles(self):
        async def get(tab, email=ADMIN, **params):
            return await self.client.get(f"/api/admin/statistics/{tab}", params={**({"email": email} if email else {}), **params})

        for tab in ("overview", "students", "tasks", "modules", "trial-tests", "quizzes"):
            response = await get(tab, period="all")
            self.assertEqual(response.status_code, 200, f"{tab}: {response.text}")
            self.assertEqual(response.json()["period"]["key"], "all")
        overview = (await get("overview", period="all", tz_offset=0)).json()
        self.assertEqual((overview["kpis"]["attempts"]["value"], overview["period"]["tz_offset_minutes"]), (11, 0))
        self.assertEqual((await get("overview", period="all", exclude_admins="true")).json()["kpis"]["attempts"]["value"], 10)

        admin_view = (await get("students", period="all")).json()
        self.assertTrue(admin_view["emails_visible"])
        self.assertEqual({student["nickname"]: student["email"] for student in admin_view["students"]}["bek"], STUDENTS["bek"])
        reviewer_view = (await get("students", email=REVIEWER, period="all")).json()
        self.assertFalse(reviewer_view["emails_visible"])
        self.assertTrue(all("email" not in student for student in reviewer_view["students"]))

        self.assertEqual((await get("overview", email=STUDENTS["bek"])).status_code, 403)
        self.assertEqual((await get("overview", email=None)).status_code, 401)
        self.assertEqual((await get("overview", period="1y")).status_code, 422)
        self.assertEqual((await get("overview", tz_offset=5000)).status_code, 422)
        self.assertEqual((await self.client.get("/api/admin/statistics", params={"email": ADMIN})).status_code, 404)


if __name__ == "__main__":
    unittest.main()
