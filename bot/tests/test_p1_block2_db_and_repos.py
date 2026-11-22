"""Regression tests for Block 2 (P1 DB, Pool, Migrations & Repositories: H-08..H-20).

Runs purely in-memory without requiring a PostgreSQL database:
    cd bot && ./venv/Scripts/python.exe -m pytest tests/test_p1_block2_db_and_repos.py -v
"""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime
import os
from pathlib import Path
import time
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from slowapi import Limiter
from slowapi.util import get_remote_address

import storage
from database import Database
from migrations.seeds import bootstrap_bank_task_versions
from repositories.achievement_repository import AchievementRepository
from repositories.bank.unrecognized_answers import _aggregate_unrecognized_answer_rows
from repositories.bank_task_repository import BankTaskRepository
from repositories.base import _get_process_write_lock
from repositories.statistics_repository import StatisticsRepository, build_window
from repositories.task_repository import TaskRepository
from repositories.trial_test_report_repository import TrialTestReportRepository
from repositories.trial_test_repository import TrialTestRepository
from repositories.user_repository import LastSuperAdminError, UserRepository
from routes.admin.content_tasks import register_task_content_routes
from routes.admin.reports import _update_task_from_report_common
from routes.admin.trial_tests import register_trial_tests_routes
from utils.connection_pool import ConnectionPool

BOT_ROOT = Path(__file__).resolve().parents[1]
MIGRATION_0018 = BOT_ROOT / "migrations" / "postgres" / "0018_block2_indexes_fks_and_safe_json.sql"


class _FakeCursor:
    def __init__(self, rows=None, rowcount=1, lastrowid=1):
        self._rows = list(rows or [])
        self.rowcount = rowcount
        self.lastrowid = lastrowid

    def __await__(self):
        async def _return_self():
            return self
        return _return_self().__await__()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return False

    async def fetchone(self):
        return self._rows[0] if self._rows else None

    async def fetchall(self):
        return list(self._rows)


class H08ScopedLocksAndPoolSizingTests(unittest.TestCase):
    def test_advisory_lock_ids_and_scoped_process_locks_do_not_block_unrelated_keys(self):
        self.assertEqual(storage.advisory_lock_id_for_key(None), storage.WRITE_LOCK_ID)
        k1 = storage.advisory_lock_id_for_key("user:1")
        k2 = storage.advisory_lock_id_for_key("user:2")
        k3 = storage.advisory_lock_id_for_key("quiz_session:42")
        self.assertEqual(len({storage.WRITE_LOCK_ID, k1, k2, k3}), 4)
        self.assertGreater(k1, 0)
        self.assertLessEqual(k1, 0x7FFFFFFFFFFFFFFF)

        async def _check_concurrency():
            # Holding lock for user:1 must NOT block user:2 or quiz_session:42
            async with _get_process_write_lock("user:1"):
                lock2 = _get_process_write_lock("user:2")
                await asyncio.wait_for(lock2.acquire(), timeout=0.5)
                lock2.release()
                lock3 = _get_process_write_lock("quiz_session:42")
                await asyncio.wait_for(lock3.acquire(), timeout=0.5)
                lock3.release()

            # Holding lock for user:1 MUST block a second acquirer on user:1
            async with _get_process_write_lock("user:1"):
                same_lock = _get_process_write_lock("user:1")
                waiter = asyncio.create_task(same_lock.acquire())
                await asyncio.sleep(0.05)
                self.assertFalse(waiter.done())
            await asyncio.wait_for(waiter, timeout=0.5)
            same_lock.release()

        asyncio.run(_check_concurrency())

    def test_database_pool_max_size_is_larger_than_2_and_configurable(self):
        with patch.dict(os.environ, {"VERCEL": "", "DATABASE_POOL_MAX_SIZE": ""}, clear=False):
            db = Database("postgresql://u:p@localhost/db", use_pool=True)
            self.assertEqual(db.connection_pool.max_size, 8)

        with patch.dict(os.environ, {"VERCEL": "1", "DATABASE_POOL_MAX_SIZE": ""}, clear=False):
            db_vercel = Database("postgresql://u:p@localhost/db", use_pool=True)
            self.assertEqual(db_vercel.connection_pool.max_size, 4)

        with patch.dict(os.environ, {"DATABASE_POOL_MAX_SIZE": "12"}, clear=False):
            db_custom = Database("postgresql://u:p@localhost/db", use_pool=True)
            self.assertEqual(db_custom.connection_pool.max_size, 12)


class H09StorageAutocommitCacheExecutemanyAndPoolPingTests(unittest.TestCase):
    def test_postgres_connection_uses_autocommit_caches_id_tables_and_pipelines_executemany(self):
        connect_calls = []
        executed_sql = []
        executemany_calls = []

        class FakeRawCursor:
            def __init__(self):
                self.description = None
                self.rowcount = 0
                self._rows = []

            def __enter__(self):
                return self

            def __exit__(self, *_):
                return False

            def execute(self, sql, params=None):
                executed_sql.append((sql, params))
                if "information_schema.columns" in sql:
                    self._rows = [("users",), ("tasks",)]
                    self.description = [MagicMock(name="table_name")]
                    self.description[0].name = "table_name"
                elif "RETURNING id" in sql:
                    self._rows = [(42,)]
                    self.description = [MagicMock(name="id")]
                    self.description[0].name = "id"
                    self.rowcount = 1
                else:
                    self._rows = []
                    self.description = None
                    self.rowcount = 1

            def executemany(self, sql, rows):
                executemany_calls.append((sql, list(rows)))
                self.rowcount = len(rows)

            def fetchall(self):
                return list(self._rows)

            def fetchone(self):
                return self._rows[0] if self._rows else None

        class FakeRawConn:
            def __init__(self, autocommit=False):
                self.autocommit = autocommit
                self.closed = False
                self.broken = False
                self.commits = 0
                self.rollbacks = 0

            def cursor(self):
                return FakeRawCursor()

            def commit(self):
                self.commits += 1

            def rollback(self):
                self.rollbacks += 1

            def close(self):
                self.closed = True

        def fake_psycopg_connect(dsn, **kwargs):
            connect_calls.append((dsn, kwargs))
            return FakeRawConn(autocommit=kwargs.get("autocommit", False))

        dsn = f"postgresql://u:p@localhost/test_h09_{time.time_ns()}"
        storage.clear_id_tables_cache(dsn)

        async def _scenario():
            with patch("psycopg.connect", side_effect=fake_psycopg_connect):
                c1 = await storage.connect(dsn)
                self.assertTrue(connect_calls[0][1].get("autocommit"))
                self.assertEqual(c1._id_tables, {"users", "tasks"})

                # Second connection reuses cached _id_tables without hitting information_schema again!
                c2 = await storage.connect(dsn)
                self.assertEqual(c2._id_tables, {"users", "tasks"})
                info_schema_queries = [s for s, _ in executed_sql if "information_schema.columns" in s]
                self.assertEqual(len(info_schema_queries), 1)

                # Autocommit INSERT must NOT emit SAVEPOINT
                executed_sql.clear()
                await c1.execute("INSERT INTO users (email) VALUES (?)", ("a@b.com",))
                self.assertFalse(any("SAVEPOINT" in s for s, _ in executed_sql))

                # Inside begin_write, autocommit switches to False, SAVEPOINT is used, and commit restores autocommit=True
                executed_sql.clear()
                await c1.begin_write(lock_id=999)
                self.assertFalse(c1._conn.autocommit)
                await c1.execute("INSERT INTO users (email) VALUES (?)", ("b@b.com",))
                self.assertTrue(any("SAVEPOINT mathbot_statement" in s for s, _ in executed_sql))
                await c1.executemany("INSERT INTO tasks (bank_task_id) VALUES (?)", [(1,), (2,), (3,)])
                self.assertEqual(len(executemany_calls), 1)
                self.assertEqual(len(executemany_calls[0][1]), 3)
                await c1.commit()
                self.assertTrue(c1._conn.autocommit)

                await c1.close()
                await c2.close()

        asyncio.run(_scenario())
        storage.clear_id_tables_cache(dsn)

    def test_pool_skips_rollback_when_not_in_transaction_and_replaces_dead_idle_connections(self):
        created = []

        class FakePooledConn:
            def __init__(self, idx: int, *, ping_ok: bool = True):
                self.idx = idx
                self.closed = False
                self.in_transaction = False
                self.row_factory = None
                self._lastrowid = None
                self.rollbacks = 0
                self.pings = 0
                self._ping_ok = ping_ok

            async def rollback(self):
                self.rollbacks += 1

            async def ping(self):
                self.pings += 1
                return self._ping_ok

            async def close(self):
                self.closed = True

        async def fake_connect(_url: str, timeout: int = 30):
            idx = len(created) + 1
            conn = FakePooledConn(idx, ping_ok=(idx != 1))
            created.append(conn)
            return conn

        async def _scenario():
            pool = ConnectionPool(
                "postgresql://u:p@localhost/db",
                max_size=2,
                timeout=5,
                idle_check_after_seconds=0.01,
                max_idle_seconds=60.0,
            )
            with patch("utils.connection_pool.db_driver.connect", side_effect=fake_connect):
                c1 = await pool.acquire()
                self.assertEqual(c1.idx, 1)
                await pool.release(c1)
                # Autocommit idle connection must NOT trigger a network rollback
                self.assertEqual(c1.rollbacks, 0)

                # Wait past idle_check_after_seconds -> ping fails -> pool discards c1 and opens c2!
                await asyncio.sleep(0.02)
                c2 = await pool.acquire()
                self.assertEqual(c1.pings, 1)
                self.assertTrue(c1.closed)
                self.assertEqual(c2.idx, 2)
                await pool.release(c2)
                await pool.close()

        asyncio.run(_scenario())


class H10SeedsAndH11PresenceAndH12AchievementsTests(unittest.TestCase):
    def test_h10_bootstrap_bank_task_versions_has_where_guards_and_batches_topics(self):
        executed = []

        class FakeSeedConn:
            row_factory = None

            def execute(self, sql, params=()):
                executed.append((sql, params))
                if "WHERE NOT EXISTS" in sql:
                    return _FakeCursor(
                        rows=[
                            (10, "T1", "1", "input", None, None, None, None, "B", 1),
                            (11, "T2", "2", "input", None, None, None, None, "B", 1),
                        ]
                    )
                if "FROM bank_task_topic_map" in sql:
                    return _FakeCursor(rows=[(10, "Алгебра"), (11, "Геометрия")])
                return _FakeCursor()

        asyncio.run(bootstrap_bank_task_versions(FakeSeedConn()))
        updates = [sql for sql, _ in executed if sql.strip().upper().startswith("UPDATE BANK_TASKS")]
        self.assertEqual(len(updates), 2)
        self.assertIn("WHERE current_version IS NULL", updates[0])
        self.assertIn("IS DISTINCT FROM", updates[1])
        # Only ONE batched topic query for both unversioned tasks (not N+1!)
        topic_queries = [sql for sql, _ in executed if "FROM bank_task_topic_map" in sql]
        self.assertEqual(len(topic_queries), 1)
        self.assertIn("IN (?,?)", topic_queries[0])

    def test_h11_heartbeat_presence_uses_sargable_last_active_comparison(self):
        executed = []

        class FakeConn:
            row_factory = None

            def execute(self, sql, params=()):
                executed.append(sql)
                return _FakeCursor(rows=[])

            async def commit(self):
                return None

        repo = UserRepository("postgresql://u:p@localhost/db")

        @asynccontextmanager
        async def fake_conn_ctx():
            yield FakeConn()

        repo._connection = fake_conn_ctx
        repo._page_visit_tracking_ready = True
        asyncio.run(repo.heartbeat_presence(1, path="/modules"))

        select_sql = next(s for s in executed if "SELECT id, nickname FROM users" in s)
        self.assertIn("WHERE last_active >= mathbot_datetime('now', '-70 seconds')", select_sql)
        self.assertNotIn("mathbot_datetime(last_active)", select_sql)

    def test_h12_achievements_skips_write_lock_when_already_unlocked(self):
        write_tx_entered = []
        inserted_badges = []

        class FakeReadConn:
            def execute(self, sql, params=()):
                return _FakeCursor(rows=[("first_solve",), ("ten_solves",)])

        class FakeWriteConn:
            def execute(self, sql, params=()):
                inserted_badges.append(params[1])
                return _FakeCursor(rowcount=1)

        repo = AchievementRepository("postgresql://u:p@localhost/db")

        @asynccontextmanager
        async def fake_conn():
            yield FakeReadConn()

        @asynccontextmanager
        async def fake_write_tx(*, lock_key=None):
            write_tx_entered.append(lock_key)
            yield FakeWriteConn()

        repo._connection = fake_conn
        repo._write_transaction = fake_write_tx

        user_repo = MagicMock()
        # User already has first_solve & ten_solves, total_solved=15 -> NO new badges!
        user_repo.get_user_by_id = AsyncMock(return_value={"id": 7, "total_solved": 15, "streak": 2})
        unlocked = asyncio.run(repo.check_and_unlock_achievements(7, user_repo))
        self.assertEqual(unlocked, [])
        self.assertEqual(write_tx_entered, [])
        self.assertEqual(inserted_badges, [])

        # Now user reaches 50 solves -> ONLY fifty_solves is inserted under user:7 lock!
        user_repo.get_user_by_id = AsyncMock(return_value={"id": 7, "total_solved": 50, "streak": 2})
        unlocked2 = asyncio.run(repo.check_and_unlock_achievements(7, user_repo))
        self.assertEqual([a["id"] for a in unlocked2], ["fifty_solves"])
        self.assertEqual(write_tx_entered, ["user:7"])
        self.assertEqual(inserted_badges, ["fifty_solves"])


class H13H15H16MigrationAndAdminGuardsTests(unittest.TestCase):
    def test_migration_0018_contains_required_indexes_fks_and_safe_jsonb_function(self):
        sql = MIGRATION_0018.read_text(encoding="utf-8")
        self.assertIn("idx_users_lower_email", sql)
        self.assertIn("ON users (LOWER(email))", sql)
        self.assertIn("idx_module_review_attempts_task_id", sql)
        self.assertIn("idx_user_task_completions_bank_task_id", sql)
        for constraint in (
            "fk_user_achievements_user_id",
            "fk_quiz_participants_user_id",
            "fk_quiz_sessions_host_id",
            "fk_quizzes_created_by",
            "fk_reports_resolved_by",
            "fk_trial_test_reports_resolved_by",
        ):
            self.assertIn(constraint, sql)
        self.assertIn("CREATE OR REPLACE FUNCTION mathbot_try_jsonb_object", sql)

    def test_h13_set_admin_and_set_admin_role_protect_last_super_admin_and_audit_uses_lower_email(self):
        executed_sql = []

        class FakeConn:
            row_factory = None

            def execute(self, sql, params=()):
                executed_sql.append((sql, params))
                if "SELECT id, is_admin, admin_role FROM users" in sql:
                    return _FakeCursor(rows=[(1, 1, "super_admin")])
                if "SELECT COUNT(*) FROM users WHERE is_admin = 1 AND admin_role = ?" in sql:
                    return _FakeCursor(rows=[(1,)])
                if "SELECT id, email, is_admin, admin_role FROM users WHERE LOWER(email) = ?" in sql:
                    return _FakeCursor(rows=[{"id": 1, "email": "Boss@Example.com", "is_admin": 1, "admin_role": "super_admin"}])
                return _FakeCursor(rows=[(1,)])

        repo = UserRepository("postgresql://u:p@localhost/db")

        @asynccontextmanager
        async def fake_write_tx(*, lock_key=None):
            yield FakeConn()

        repo._write_transaction = fake_write_tx

        with self.assertRaises(LastSuperAdminError):
            asyncio.run(repo.set_admin(user_id=1, is_admin=False))

        with self.assertRaises(LastSuperAdminError):
            asyncio.run(repo.set_admin_role(email="Boss@Example.com", role="reviewer"))

        executed_sql.clear()
        with self.assertRaises(LastSuperAdminError):
            asyncio.run(
                repo.change_admin_role_with_audit(
                    target_email="BOSS@example.com",
                    role="reviewer",
                    set_admin=True,
                    actor_user_id=1,
                    actor_email="boss@example.com",
                    source="test",
                    actor_verified=True,
                )
            )
        self.assertTrue(any("WHERE LOWER(email) = ?" in s for s, _ in executed_sql))


class H14StatisticsTests(unittest.TestCase):
    def test_statistics_uses_safe_jsonb_and_counts_quiz_only_students_as_active(self):
        executed_sql = []
        repo = StatisticsRepository("postgresql://u:p@localhost/db")

        async def fake_rows(db, sql, params=()):
            executed_sql.append(sql)
            if "FROM users" in sql and "last_streak_date" in sql:
                # One quiz-only student (id=9)
                return [(9, "quiz_kid", "q@e.com", "2026-11-01 00:00:00", "2026-11-10 00:00:00", 0, 0, None, 0, None, None)]
            if "WITH period_sessions AS" in sql and "quiz_participants qp" in sql:
                return [(9, 2, 10, 8)]
            if "SELECT DISTINCT user_id FROM quiz_participants" in sql:
                return [(9,)]
            if "SELECT COUNT(*) FROM" in sql or "SELECT\n                    (SELECT COUNT(*)" in sql:
                return [(0,) * 10]
            return []

        @asynccontextmanager
        async def fake_conn():
            yield object()

        repo._connection = fake_conn
        repo._rows = fake_rows
        repo._has_page_visit_tracking = AsyncMock(return_value=False)

        window = build_window("30d", 300, now=datetime(2026, 11, 11, 7, 0, 0))
        students_resp = asyncio.run(repo.get_students(window))
        kid = students_resp["students"][0]
        self.assertEqual(kid["user_id"], 9)
        self.assertTrue(kid["is_active"])
        self.assertFalse(kid["never_active"])
        self.assertFalse(kid["is_churned"])

        # Verify safe JSONB function is used in get_trial_tests
        executed_sql.clear()
        asyncio.run(repo.get_trial_tests(window))
        self.assertTrue(any("mathbot_try_jsonb_object" in sql for sql in executed_sql))

        # Verify get_overview skips querying user_progress when cohort is empty
        executed_sql.clear()
        asyncio.run(repo.get_overview(window))
        self.assertFalse(any("FROM user_progress" in sql for sql in executed_sql))

        # Verify get_quizzes filters quiz_answers and quiz_participants by period_sessions CTE
        executed_sql.clear()
        asyncio.run(repo.get_quizzes(window))
        self.assertTrue(any("WHERE session_id IN (SELECT id FROM period_sessions)" in sql for sql in executed_sql))


class H17H18AtomicUpdatesAndWriteTransactionsTests(unittest.TestCase):
    def test_h17_routes_avoid_double_version_bump_and_relink_null_bank_task(self):
        fake_db = MagicMock()
        fake_db.users.is_admin = AsyncMock(return_value=True)
        fake_db.users.get_user_by_email = AsyncMock(
            return_value={"id": 1, "email": "super@example.com", "is_admin": 1, "admin_role": "super_admin"}
        )
        fake_db.tasks.update_task = AsyncMock(return_value=None)
        fake_db.trial_tests.update_trial_test_task = AsyncMock(return_value=None)
        fake_db.bank_tasks.get_task_by_id = AsyncMock(return_value={"id": 500})
        fake_db.bank_tasks.update_task = AsyncMock(return_value={"id": 500})
        fake_db.bank_tasks.create_task = AsyncMock(return_value={"id": 777})

        # 1) Linked task: placement update must NOT pass text_scale (no double version bump)
        fake_db.tasks.get_task_by_id = AsyncMock(
            return_value={"id": 10, "created_by": 1, "bank_task_id": 500, "question_type": "input", "answer": "4"}
        )
        fake_db.trial_tests.get_trial_test_task = AsyncMock(
            return_value={"id": 20, "trial_test_id": 3, "created_by": 1, "bank_task_id": 500}
        )

        app = FastAPI()
        app.state.db = fake_db
        limiter = Limiter(key_func=get_remote_address)
        register_task_content_routes(app, fake_db, limiter)
        register_trial_tests_routes(app, fake_db, limiter)

        with patch.dict(os.environ, {"ENVIRONMENT": "development"}, clear=False):
            client = TestClient(app)
            resp = client.put(
                "/api/admin/tasks/10",
                data={"email": "super@example.com", "text": "2+2", "answer": "4", "text_scale": "lg"},
            )
            self.assertEqual(resp.status_code, 200)
            # No sort_order/task_type passed -> db.tasks.update_task is not called at all; bank_tasks updated ONCE
            fake_db.tasks.update_task.assert_not_awaited()
            fake_db.bank_tasks.update_task.assert_awaited_once()

            fake_db.bank_tasks.update_task.reset_mock()
            resp2 = client.put(
                "/api/admin/trial-tests/3/tasks/20",
                data={"email": "super@example.com", "text": "3+3", "answer": "6", "question_type": "input", "text_scale": "lg"},
            )
            self.assertEqual(resp2.status_code, 200)
            fake_db.trial_tests.update_trial_test_task.assert_not_awaited()
            fake_db.bank_tasks.update_task.assert_awaited_once()

            # 2) Detached task (bank_task_id=None): must create & attach new bank task instead of silent no-op!
            fake_db.tasks.get_task_by_id = AsyncMock(
                return_value={"id": 11, "created_by": 1, "bank_task_id": None, "question_type": "input", "answer": "4"}
            )
            fake_db.tasks.update_task.reset_mock()
            fake_db.bank_tasks.create_task.reset_mock()
            resp3 = client.put(
                "/api/admin/tasks/11",
                data={"email": "super@example.com", "text": "Recovered", "answer": "9"},
            )
            self.assertEqual(resp3.status_code, 200)
            fake_db.bank_tasks.create_task.assert_awaited_once()
            fake_db.tasks.update_task.assert_awaited_once_with(task_id=11, bank_task_id=777)

            # 3) Report task update on detached task also creates & links bank task (and skips redundant text_scale call)
            fake_db.tasks.update_task.reset_mock()
            fake_db.bank_tasks.create_task.reset_mock()
            asyncio.run(
                _update_task_from_report_common(
                    task_id=11,
                    text="Fixed via report",
                    answer="9",
                    question_type="input",
                    text_scale="md",
                    options=None,
                    subquestions=None,
                    image=None,
                    email="super@example.com",
                    db=fake_db,
                )
            )
            fake_db.bank_tasks.create_task.assert_awaited_once()
            fake_db.tasks.update_task.assert_awaited_once_with(task_id=11, bank_task_id=777)

    def test_h18_write_methods_use_write_transaction(self):
        for repo_cls, method_name, kwargs in [
            (TrialTestRepository, "remove_task_from_trial_test", {"trial_test_id": 1, "task_id": 2}),
            (TrialTestRepository, "clear_trial_test_slot", {"trial_test_id": 1, "slot_index": 1}),
            (TrialTestRepository, "upsert_trial_test_draft", {"user_id": 5, "trial_test_id": 1, "answers": {}, "current_task_index": 0}),
            (TrialTestReportRepository, "update_trial_test_report_status", {"report_id": 1, "status": "resolved", "resolved_by": 2}),
            (TrialTestReportRepository, "delete_trial_test_report", {"report_id": 1}),
            (TaskRepository, "soft_delete_task", {"task_id": 1}),
            (TaskRepository, "restore_task", {"task_id": 1}),
        ]:
            repo = repo_cls("postgresql://u:p@localhost/db")
            tx_keys = []

            class _WriteConn:
                row_factory = None

                def execute(self, sql, params=()):
                    return _FakeCursor(rowcount=1, lastrowid=1)

            @asynccontextmanager
            async def fake_tx(*, lock_key=None):
                tx_keys.append(lock_key)
                yield _WriteConn()

            repo._write_transaction = fake_tx
            asyncio.run(getattr(repo, method_name)(**kwargs))
            self.assertEqual(len(tx_keys), 1, f"{repo_cls.__name__}.{method_name} must use _write_transaction")
            self.assertIsNotNone(tx_keys[0])


class H19UnrecognizedAnswersAndH20CyrillicCollationTests(unittest.TestCase):
    def test_h19_memoizes_duplicate_answers_and_sql_prefilters_written_tasks(self):
        rows = [
            {
                "attempt_user_id": i,
                "student_answer": "0,5",
                "attempted_at": f"2026-11-10 10:{i:02d}:00",
                "source": "lesson",
                "bank_task_id": 100,
                "task_text": "1/4 = ?",
                "correct_answer": "0.25",
                "accepted_answers": "[]",
                "question_type": "input",
                "answer_mode": "written",
                "options": None,
                "subquestions": None,
                "current_version": 1,
            }
            for i in range(1, 31)
        ]

        with patch("repositories.bank.unrecognized_answers.is_task_answer_correct", return_value=False) as mock_check:
            items, total = _aggregate_unrecognized_answer_rows(rows, min_count=2, limit=50)
            self.assertEqual(total, 1)
            self.assertEqual(items[0]["occurrences"], 30)
            self.assertEqual(items[0]["students_count"], 30)
            # 30 identical (bank_task_id, raw_answer) rows must invoke math checker ONLY ONCE!
            self.assertEqual(mock_check.call_count, 1)

        # Verify SQL queries include written filter BEFORE LIMIT and mathbot_try_jsonb_object
        executed_sql = []

        class _Conn:
            row_factory = None

            def execute(self, sql, params=()):
                executed_sql.append(sql)
                return _FakeCursor(rows=[])

        repo = BankTaskRepository("postgresql://u:p@localhost/db")

        @asynccontextmanager
        async def fake_conn():
            yield _Conn()

        repo._connection = fake_conn
        asyncio.run(repo.list_unrecognized_answers())
        self.assertEqual(len(executed_sql), 3)
        for sql in executed_sql:
            self.assertIn("LOWER(TRIM(COALESCE(bt.answer_mode, ''))) = 'written'", sql)
            self.assertLess(sql.index("answer_mode"), sql.rfind("LIMIT ?"))
        self.assertIn("mathbot_try_jsonb_object", executed_sql[1])

    def test_h20_bank_search_uses_pg_c_utf8_collation(self):
        executed_sql = []

        class _Conn:
            row_factory = None

            def execute(self, sql, params=()):
                executed_sql.append(sql)
                if sql.strip().startswith("SELECT COUNT(*)"):
                    return _FakeCursor(rows=[(0,)])
                return _FakeCursor(rows=[])

        repo = BankTaskRepository("postgresql://u:p@localhost/db")

        @asynccontextmanager
        async def fake_conn():
            yield _Conn()

        repo._connection = fake_conn

        asyncio.run(repo.list_tasks(search="Теңдеу"))
        asyncio.run(repo.list_quality_dead_tasks(search="Қабырға"))
        asyncio.run(repo.list_quality_duplicate_clusters(search="Есеп"))

        search_queries = [s for s in executed_sql if "LIKE ? ESCAPE" in s]
        self.assertGreaterEqual(len(search_queries), 5)
        for sql in search_queries:
            self.assertIn('LOWER(bt.text COLLATE "pg_c_utf8")', sql)


if __name__ == "__main__":
    unittest.main()
