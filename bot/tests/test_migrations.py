"""
Tests for the Alembic migration runner, including legacy (pre-Alembic) paths.
"""
import importlib.util
import os
import sqlite3
import tempfile
from pathlib import Path

import aiosqlite
import pytest

from migrations.runner import run_migrations
from migrations.seeds import run_seeds

_BASELINE_FILE = Path(__file__).resolve().parents[1] / "migrations" / "versions" / "0001_baseline.py"
HEAD_REVISION = "0006_remove_factor_grid_tasks"


def _load_baseline_ddl():
    spec = importlib.util.spec_from_file_location("baseline_revision", _BASELINE_FILE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module._DDL


def _temp_db_path() -> str:
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    return path


def _make_legacy_db(path: str) -> None:
    """Create a full pre-Alembic database (baseline schema, no alembic_version)."""
    with sqlite3.connect(path) as conn:
        for statement in _load_baseline_ddl():
            conn.execute(statement)


def _tables(path: str) -> set:
    with sqlite3.connect(path) as conn:
        return {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}


def _columns(path: str, table: str) -> set:
    with sqlite3.connect(path) as conn:
        return {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}


def _indexes(path: str) -> set:
    with sqlite3.connect(path) as conn:
        return {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='index'")}


def _stamped_revision(path: str) -> str:
    with sqlite3.connect(path) as conn:
        return conn.execute("SELECT version_num FROM alembic_version").fetchone()[0]


async def _run_seeds_on(path: str) -> None:
    async with aiosqlite.connect(path) as db:
        await run_seeds(db)


def test_fresh_database_gets_full_schema(tmp_path):
    path = str(tmp_path / "fresh.db")
    run_migrations(path)

    tables = _tables(path)
    assert "users" in tables
    assert "bank_tasks" in tables
    assert "alembic_version" in tables
    assert "submit_mode" in _columns(path, "trial_test_results")
    assert "answer_mode" in _columns(path, "bank_tasks")
    assert "accepted_answers" in _columns(path, "bank_tasks")
    assert {"league", "league_group", "week_solved", "week_points"}.isdisjoint(
        _columns(path, "users")
    )
    assert "weekly_resets" not in tables
    assert {
        "idx_users_league_group",
        "idx_users_total_points",
        "idx_users_week_points",
    }.isdisjoint(_indexes(path))
    assert "uq_trial_test_results_solo_user_test" in _indexes(path)
    assert _stamped_revision(path) == HEAD_REVISION


def test_answer_mode_column_defaults_to_choices_for_new_rows(tmp_path):
    path = str(tmp_path / "answer_mode.db")
    run_migrations(path)

    with sqlite3.connect(path) as conn:
        conn.execute(
            "INSERT INTO bank_tasks (text, answer, question_type) VALUES ('input', '1', 'input')"
        )
        conn.execute(
            "INSERT INTO bank_tasks (text, answer, question_type) VALUES ('mcq', 'A', 'mcq')"
        )
        rows = conn.execute(
            "SELECT question_type, answer_mode, accepted_answers FROM bank_tasks ORDER BY id"
        ).fetchall()

    assert rows == [("input", "choices", "[]"), ("mcq", "choices", "[]")]


@pytest.mark.asyncio
async def test_legacy_complete_database_is_stamped(tmp_path):
    path = str(tmp_path / "legacy_full.db")
    _make_legacy_db(path)
    with sqlite3.connect(path) as conn:
        conn.execute("INSERT INTO bank_tasks (text, answer, question_type) VALUES ('input', '1', 'input')")
        conn.execute("INSERT INTO bank_tasks (text, answer, question_type) VALUES ('mcq', 'A', 'mcq')")
    assert "alembic_version" not in _tables(path)

    run_migrations(path)

    assert _stamped_revision(path) == HEAD_REVISION
    with sqlite3.connect(path) as conn:
        modes = conn.execute("SELECT question_type, answer_mode FROM bank_tasks ORDER BY id").fetchall()
    assert modes == [("input", "written"), ("mcq", "choices")]
    await _run_seeds_on(path)


@pytest.mark.asyncio
async def test_legacy_database_missing_table_is_repaired(tmp_path):
    """Regression: an old DB with users but without bank_tasks must not be
    stamped as migrated while seeds still crash on the missing table."""
    path = str(tmp_path / "legacy_partial.db")
    _make_legacy_db(path)
    with sqlite3.connect(path) as conn:
        conn.execute("INSERT INTO users (email, nickname) VALUES ('old@example.com', 'old')")
        conn.execute("DROP TABLE bank_task_topic_map")
        conn.execute("DROP TABLE bank_task_versions")
        conn.execute("DROP TABLE bank_tasks")

    run_migrations(path)

    tables = _tables(path)
    assert "bank_tasks" in tables
    assert "bank_task_versions" in tables
    assert "bank_task_topic_map" in tables
    assert _stamped_revision(path) == HEAD_REVISION

    # startup data fix-ups must work on the repaired schema
    await _run_seeds_on(path)

    # existing data is preserved
    with sqlite3.connect(path) as conn:
        row = conn.execute("SELECT email FROM users WHERE nickname = 'old'").fetchone()
    assert row == ("old@example.com",)


@pytest.mark.asyncio
async def test_legacy_database_missing_column_is_repaired(tmp_path):
    path = str(tmp_path / "legacy_old_users.db")
    _make_legacy_db(path)
    with sqlite3.connect(path) as conn:
        conn.execute("INSERT INTO users (email, nickname) VALUES ('keep@example.com', 'keep')")
        conn.execute("DROP INDEX idx_users_admin_role")
        conn.execute("ALTER TABLE users DROP COLUMN admin_role")
        conn.execute("ALTER TABLE users DROP COLUMN onboarding_completed")

    run_migrations(path)

    cols = _columns(path, "users")
    assert "admin_role" in cols
    assert "onboarding_completed" in cols
    assert _stamped_revision(path) == HEAD_REVISION
    with sqlite3.connect(path) as conn:
        idx = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_users_admin_role'"
        ).fetchone()
    assert idx is not None

    await _run_seeds_on(path)

    with sqlite3.connect(path) as conn:
        row = conn.execute(
            "SELECT admin_role, onboarding_completed FROM users WHERE nickname = 'keep'"
        ).fetchone()
    # repaired columns get their defaults; existing row survives
    assert row == (None, 0)


def test_migrated_database_upgrade_is_noop(tmp_path):
    path = str(tmp_path / "migrated.db")
    run_migrations(path)
    before = _tables(path)

    run_migrations(path)

    assert _tables(path) == before
    assert _stamped_revision(path) == HEAD_REVISION


def test_existing_competitive_columns_are_removed_on_upgrade(tmp_path):
    path = str(tmp_path / "old_competitive_schema.db")
    run_migrations(path)

    with sqlite3.connect(path) as conn:
        conn.execute("UPDATE alembic_version SET version_num = '0004_task_accepted_answers'")
        conn.execute("ALTER TABLE users ADD COLUMN league TEXT NOT NULL DEFAULT 'Қола'")
        conn.execute("ALTER TABLE users ADD COLUMN league_group INTEGER NOT NULL DEFAULT 0")
        conn.execute("ALTER TABLE users ADD COLUMN week_solved INTEGER NOT NULL DEFAULT 0")
        conn.execute("ALTER TABLE users ADD COLUMN week_points INTEGER NOT NULL DEFAULT 0")
        conn.execute("CREATE INDEX idx_users_league_group ON users(league, league_group)")
        conn.execute("CREATE INDEX idx_users_total_points ON users(total_points DESC, total_solved DESC)")
        conn.execute("CREATE INDEX idx_users_week_points ON users(week_points DESC, total_points DESC)")
        conn.execute(
            """
            CREATE TABLE weekly_resets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reset_date DATE NOT NULL UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute("INSERT INTO users (email, nickname) VALUES ('keep@example.com', 'keep')")
        user_id = conn.execute("SELECT id FROM users WHERE email = 'keep@example.com'").fetchone()[0]
        conn.execute(
            "INSERT INTO user_achievements (user_id, achievement_id) VALUES (?, 'top_league')",
            (user_id,),
        )

    run_migrations(path)

    assert _stamped_revision(path) == HEAD_REVISION
    assert {"league", "league_group", "week_solved", "week_points"}.isdisjoint(
        _columns(path, "users")
    )
    assert "weekly_resets" not in _tables(path)
    with sqlite3.connect(path) as conn:
        user = conn.execute("SELECT email, nickname FROM users WHERE id = ?", (user_id,)).fetchone()
        removed_achievement = conn.execute(
            "SELECT 1 FROM user_achievements WHERE user_id = ? AND achievement_id = 'top_league'",
            (user_id,),
        ).fetchone()
    assert user == ("keep@example.com", "keep")
    assert removed_achievement is None


def test_removed_factor_grid_tasks_and_dependent_records_are_cleaned_up(tmp_path):
    path = str(tmp_path / "obsolete_question_type.db")
    run_migrations(path)

    with sqlite3.connect(path) as conn:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("UPDATE alembic_version SET version_num = '0005_remove_competitive_features'")
        user_id = conn.execute(
            "INSERT INTO users (email, nickname) VALUES ('learner@example.com', 'learner')"
        ).lastrowid
        module_id = conn.execute("INSERT INTO modules (name) VALUES ('Module')").lastrowid
        section_id = conn.execute(
            "INSERT INTO sections (module_id, name) VALUES (?, 'Section')", (module_id,)
        ).lastrowid
        lesson_id = conn.execute(
            "INSERT INTO lessons (section_id, title) VALUES (?, 'Lesson')", (section_id,)
        ).lastrowid
        mini_lesson_id = conn.execute(
            "INSERT INTO mini_lessons (lesson_id, mini_index, title) VALUES (?, 1, 'Mini')",
            (lesson_id,),
        ).lastrowid
        removed_bank_task_id = conn.execute(
            "INSERT INTO bank_tasks (text, answer, question_type) VALUES ('obsolete', '[]', 'factor_grid')"
        ).lastrowid
        kept_bank_task_id = conn.execute(
            "INSERT INTO bank_tasks (text, answer, question_type) VALUES ('keep', '4', 'input')"
        ).lastrowid
        removed_task_id = conn.execute(
            "INSERT INTO tasks (section_id, mini_lesson_id, bank_task_id) VALUES (?, ?, ?)",
            (section_id, mini_lesson_id, removed_bank_task_id),
        ).lastrowid
        conn.execute(
            "INSERT INTO solutions (user_id, task_id, answer) VALUES (?, ?, '[]')",
            (user_id, removed_task_id),
        )
        conn.execute(
            "INSERT INTO user_progress (user_id, task_id) VALUES (?, ?)",
            (user_id, removed_task_id),
        )
        conn.execute(
            "INSERT INTO user_task_question_progress (user_id, task_id, question_index) VALUES (?, ?, 0)",
            (user_id, removed_task_id),
        )
        conn.execute(
            "INSERT INTO reports (user_id, task_id, message) VALUES (?, ?, 'obsolete')",
            (user_id, removed_task_id),
        )
        topic_id = conn.execute(
            "INSERT INTO bank_topics (name, name_norm) VALUES ('Topic', 'topic')"
        ).lastrowid
        conn.execute(
            "INSERT INTO bank_task_topic_map (bank_task_id, topic_id) VALUES (?, ?)",
            (removed_bank_task_id, topic_id),
        )
        conn.execute(
            """
            INSERT INTO bank_task_versions
            (bank_task_id, version_no, event_type, changed_fields_json, snapshot_json)
            VALUES (?, 1, 'create', '["question_type"]', '{"question_type":"factor_grid"}')
            """,
            (removed_bank_task_id,),
        )
        conn.execute(
            """
            INSERT INTO user_task_rewards
            (user_id, reward_key, bank_task_id, difficulty, points_awarded, source)
            VALUES (?, 'obsolete-reward', ?, 'B', 20, 'lesson')
            """,
            (user_id, removed_bank_task_id),
        )
        conn.execute(
            """
            INSERT INTO admin_audit_logs
            (domain, action, entity_type, entity_id, actor_email, summary, changed_fields_json, metadata_json)
            VALUES ('bank', 'create', 'bank_task', ?, 'admin@example.com', 'factor_grid', '[]', '{}')
            """,
            (removed_bank_task_id,),
        )

        trial_test_id = conn.execute(
            "INSERT INTO trial_tests (title) VALUES ('Trial')"
        ).lastrowid
        trial_task_id = conn.execute(
            "INSERT INTO trial_test_tasks (trial_test_id, bank_task_id) VALUES (?, ?)",
            (trial_test_id, removed_bank_task_id),
        ).lastrowid
        result_id = conn.execute(
            """
            INSERT INTO trial_test_results
            (user_id, trial_test_id, answers, submit_mode)
            VALUES (?, ?, '{}', 'solo')
            """,
            (user_id, trial_test_id),
        ).lastrowid
        conn.execute(
            "INSERT INTO trial_test_drafts (user_id, trial_test_id) VALUES (?, ?)",
            (user_id, trial_test_id),
        )
        session_id = conn.execute(
            "INSERT INTO trial_test_coop_sessions (trial_test_id, owner_id) VALUES (?, ?)",
            (trial_test_id, user_id),
        ).lastrowid
        conn.execute(
            "INSERT INTO trial_test_coop_participants (session_id, user_id, color) VALUES (?, ?, 'blue')",
            (session_id, user_id),
        )
        conn.execute(
            "INSERT INTO trial_test_coop_answers (session_id, user_id, task_id, answer) VALUES (?, ?, ?, '[]')",
            (session_id, user_id, trial_task_id),
        )
        conn.execute(
            "INSERT INTO trial_test_coop_results (session_id, user_id, trial_test_result_id) VALUES (?, ?, ?)",
            (session_id, user_id, result_id),
        )
        conn.execute(
            """
            INSERT INTO trial_test_reports
            (user_id, trial_test_id, trial_test_task_id, message)
            VALUES (?, ?, ?, 'obsolete')
            """,
            (user_id, trial_test_id, trial_task_id),
        )

    run_migrations(path)

    with sqlite3.connect(path) as conn:
        assert conn.execute(
            "SELECT COUNT(*) FROM bank_tasks WHERE LOWER(TRIM(question_type)) = 'factor_grid'"
        ).fetchone()[0] == 0
        assert conn.execute(
            "SELECT text FROM bank_tasks WHERE id = ?", (kept_bank_task_id,)
        ).fetchone() == ("keep",)
        for table in (
            "tasks",
            "solutions",
            "user_progress",
            "user_task_question_progress",
            "reports",
            "trial_test_tasks",
            "trial_test_results",
            "trial_test_drafts",
            "trial_test_coop_sessions",
            "trial_test_coop_participants",
            "trial_test_coop_answers",
            "trial_test_coop_results",
            "trial_test_reports",
            "bank_task_topic_map",
            "bank_task_versions",
            "admin_audit_logs",
        ):
            assert conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] == 0
        reward = conn.execute(
            "SELECT bank_task_id, points_awarded FROM user_task_rewards WHERE reward_key = 'obsolete-reward'"
        ).fetchone()
        assert reward == (None, 20)
        assert _stamped_revision(path) == HEAD_REVISION
