"""Regression coverage for SQL adaptation and real PostgreSQL behavior."""
import asyncio
import os
import sqlite3

import pytest

import storage
from database import Database
from migrations.sqlite_to_postgres import copy_sqlite_to_postgres


def test_parameter_translation_preserves_literals_and_comments():
    query = "SELECT '?' AS literal, ? AS value, '50%' AS pct -- ?\n"
    result = storage.postgres_sql(query)
    assert "'?' AS literal, %s AS value, '50%%' AS pct -- ?" in result
    assert storage.postgres_sql("SELECT 'CURRENT_TIMESTAMP datetime(?)'") == "SELECT 'CURRENT_TIMESTAMP datetime(?)'"


def test_upsert_translation_uses_declared_unique_keys():
    query = storage.postgres_sql("INSERT OR REPLACE INTO user_onboarding (user_id, nickname) VALUES (?, ?)")
    assert "ON CONFLICT (user_id) DO UPDATE SET nickname = EXCLUDED.nickname" in query
    assert storage.postgres_sql("INSERT OR IGNORE INTO friendships (user_id, friend_id) VALUES (?, ?)").endswith("ON CONFLICT DO NOTHING")
    with pytest.raises(ValueError, match="conflict target"):
        storage.postgres_sql("INSERT OR REPLACE INTO unknown (id) VALUES (?)")


def test_record_supports_named_positional_and_dict_access():
    row = storage.Record(("id", "email"), (4, "оқушы@example.com"))
    assert row[0] == row["id"] == 4
    assert dict(row) == {"id": 4, "email": "оқушы@example.com"}


postgres = pytest.mark.skipif(not os.environ.get("MATHBOT_TEST_DATABASE_URL"), reason="Set MATHBOT_TEST_DATABASE_URL for PostgreSQL integration tests")


@postgres
@pytest.mark.asyncio
async def test_postgres_dates_json_and_literal_percent(postgres_test_db):
    async with storage.connect(postgres_test_db.db_path) as db:
        async with db.execute("SELECT date('2026-10-15', '-1 days'), datetime('2026-10-15T12:30:00Z'), strftime('%H', '2026-10-15 12:30:00'), ?", ("50%?",)) as cursor:
            row = await cursor.fetchone()
            assert tuple(row) == ("2026-10-14", "2026-10-15 12:30:00", "12", "50%?")


@postgres
@pytest.mark.asyncio
async def test_postgres_preserves_subsecond_epoch_clock(postgres_test_db):
    import time
    user = await postgres_test_db.users.create_user_by_email("clock@example.com")
    quiz = await postgres_test_db.quizzes.create_quiz(title="Clock", created_by=user["id"])
    await postgres_test_db.quizzes.add_question(quiz_id=quiz["id"], question_text="2+2", correct_answer="4")
    session = await postgres_test_db.quizzes.create_session(quiz["id"], user["id"])
    player = await postgres_test_db.quizzes.join_session(session["id"], "Clock player")
    now = time.time()
    async with storage.connect(postgres_test_db.db_path) as db:
        await db.execute("UPDATE quiz_participants SET question_started_at = ? WHERE id = ?", (now, player["id"]))
        await db.commit()
        async with db.execute("SELECT question_started_at FROM quiz_participants WHERE id = ?", (player["id"],)) as cursor:
            assert abs((await cursor.fetchone())[0] - now) < 0.000001


@postgres
@pytest.mark.asyncio
async def test_postgres_constraint_error_keeps_prior_transaction_changes(postgres_test_db):
    async with storage.connect(postgres_test_db.db_path) as db:
        first = await db.execute("INSERT INTO users (email) VALUES (?)", ("same@example.com",))
        with pytest.raises(sqlite3.IntegrityError):
            await db.execute("INSERT INTO users (email) VALUES (?)", ("same@example.com",))
        async with db.execute("SELECT email FROM users WHERE id = ?", (first.lastrowid,)) as cursor:
            assert (await cursor.fetchone())[0] == "same@example.com"
        await db.commit()


@postgres
def test_sqlite_import_preserves_rows_ids_and_source_and_refuses_overwrite(postgres_test_db, tmp_path):
    source = tmp_path / "source.db"
    async def populate():
        db = Database(str(source), use_pool=False)
        await db.init()
        user = await db.users.create_user_by_email("оқушы@example.com")
        await db.users.update_user_nickname(user["email"], "Әлібек")
        return user
    user = asyncio.run(populate())
    before = source.read_bytes()
    plan = copy_sqlite_to_postgres(str(source), postgres_test_db.db_path)
    assert plan["applied"] is False
    result = copy_sqlite_to_postgres(str(source), postgres_test_db.db_path, apply=True)
    assert result["applied"] is True
    assert result["tables"]["users"] == 1
    imported = asyncio.run(postgres_test_db.users.get_user_by_email(user["email"]))
    assert imported["id"] == user["id"] and imported["nickname"] == "Әлібек"
    next_user = asyncio.run(postgres_test_db.users.create_user_by_email("next@example.com"))
    assert next_user["id"] > user["id"]
    assert source.read_bytes() == before
    with pytest.raises(ValueError, match="not empty"):
        copy_sqlite_to_postgres(str(source), postgres_test_db.db_path, apply=True)


@postgres
def test_sqlite_import_archives_legacy_data_without_dropping_it(postgres_test_db, tmp_path):
    from contextlib import closing
    source = tmp_path / "legacy.db"
    asyncio.run(Database(str(source), use_pool=False).init())
    with closing(sqlite3.connect(source)) as connection:
        connection.execute("CREATE TABLE old_exercises (id INTEGER, text TEXT)")
        connection.execute("INSERT INTO old_exercises VALUES (7, 'Ескі тапсырма')")
        connection.commit()
    plan = copy_sqlite_to_postgres(str(source), postgres_test_db.db_path)
    assert plan["legacy_rows"] == 1 and plan["legacy_tables"] == {"old_exercises": 1}
    with pytest.raises(ValueError, match="archive-legacy"):
        copy_sqlite_to_postgres(str(source), postgres_test_db.db_path, apply=True)
    report = copy_sqlite_to_postgres(str(source), postgres_test_db.db_path, apply=True, archive_legacy=True)
    assert report["legacy_archived"] is True
    async def read_archive():
        async with storage.connect(postgres_test_db.db_path) as connection:
            async with connection.execute("SELECT row_json FROM mathbot_legacy_archive WHERE row_number=1") as cursor:
                return (await cursor.fetchone())[0]
    import json
    assert json.loads(asyncio.run(read_archive())) == {"id": 7, "text": "Ескі тапсырма"}
