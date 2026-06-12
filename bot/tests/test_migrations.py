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

from migrations.runner import BASELINE_REVISION, run_migrations
from migrations.seeds import run_seeds

_BASELINE_FILE = Path(__file__).resolve().parents[1] / "migrations" / "versions" / "0001_baseline.py"


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


@pytest.mark.asyncio
async def test_legacy_complete_database_is_stamped(tmp_path):
    path = str(tmp_path / "legacy_full.db")
    _make_legacy_db(path)
    assert "alembic_version" not in _tables(path)

    run_migrations(path)

    assert _stamped_revision(path) == BASELINE_REVISION
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
    assert _stamped_revision(path) == BASELINE_REVISION

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
    assert _stamped_revision(path) == BASELINE_REVISION
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
    assert _stamped_revision(path) == BASELINE_REVISION
