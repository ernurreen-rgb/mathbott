"""Repository orchestration must work with production-sized pools and atomic writes."""
import asyncio

import pytest

from repositories.curriculum_repository import CurriculumRepository
from repositories.statistics_repository import StatisticsRepository
from repositories.task_repository import TaskRepository
from utils.connection_pool import ConnectionPool


@pytest.fixture(params=[1, 2])
async def small_pool(test_db, request):
    pool = ConnectionPool(test_db.db_path, min_size=0, max_size=request.param, timeout=1)
    try:
        yield pool
    finally:
        await pool.close()


async def make_section(test_db):
    module = await test_db.curriculum.create_module("Pool regression")
    return await test_db.curriculum.create_section(module["id"], "Concurrent lessons")


async def fail_mini_insert(pool, monkeypatch, mini_index):
    connection = await pool.acquire()
    connection_type = type(connection)
    await pool.release(connection)
    original_execute = connection_type.execute

    def execute(conn, sql, parameters=()):
        if "insert into mini_lessons" in sql.lower() and parameters[1] == mini_index:
            raise RuntimeError("Injected mini-lesson insert failure")
        return original_execute(conn, sql, parameters)

    monkeypatch.setattr(connection_type, "execute", execute)


@pytest.mark.asyncio
async def test_concurrent_lesson_creation_finishes_with_all_four_mini_lessons(test_db, small_pool):
    section = await make_section(test_db)
    repo = CurriculumRepository(test_db.db_path, connection_pool=small_pool)
    lessons = await asyncio.wait_for(asyncio.gather(*[
        repo.create_lesson(section["id"], index, title=f"Lesson {index}", sort_order=index)
        for index in range(1, 7)
    ]), timeout=10)

    assert len({lesson["id"] for lesson in lessons}) == 6
    for index, lesson in enumerate(lessons, start=1):
        assert lesson["title"] == f"Lesson {index}"
        minis = await repo.get_mini_lessons_by_lesson(lesson["id"])
        assert [mini["mini_index"] for mini in minis] == [1, 2, 3, 4]
        assert [mini["sort_order"] for mini in minis] == [0, 1, 2, 3]
    assert small_pool.get_stats()["pool_size"] == small_pool.get_stats()["created"]


@pytest.mark.asyncio
async def test_mini_lesson_failure_rolls_back_the_lesson_and_partial_children(test_db, small_pool, monkeypatch):
    section = await make_section(test_db)
    repo = CurriculumRepository(test_db.db_path, connection_pool=small_pool)
    await fail_mini_insert(small_pool, monkeypatch, 3)

    with pytest.raises(RuntimeError, match="Injected mini-lesson"):
        await repo.create_lesson(section["id"], 1)

    assert await repo.get_lessons_by_section(section["id"]) == []
    async with repo._connection() as connection:
        async with connection.execute("SELECT COUNT(*) FROM mini_lessons") as cursor:
            assert (await cursor.fetchone())[0] == 0
    assert small_pool.get_stats()["pool_size"] == small_pool.get_stats()["created"]


@pytest.mark.asyncio
async def test_concurrent_mini_lesson_repair_preserves_existing_content(test_db, small_pool):
    section = await make_section(test_db)
    lesson = await test_db.curriculum.create_lesson(section["id"], 1)
    original = await test_db.curriculum.get_mini_lessons_by_lesson(lesson["id"])
    await test_db.curriculum.update_mini_lesson(original[0]["id"], title="Custom title", sort_order=8)
    repo = CurriculumRepository(test_db.db_path, connection_pool=small_pool)
    async with repo._connection() as connection:
        await connection.execute(
            "DELETE FROM mini_lessons WHERE lesson_id = ? AND mini_index IN (2, 4)", (lesson["id"],),
        )
        await connection.commit()

    await asyncio.wait_for(asyncio.gather(*[
        repo.ensure_default_mini_lessons(lesson["id"]) for _ in range(4)
    ]), timeout=10)

    repaired = await repo.get_mini_lessons_by_lesson(lesson["id"])
    assert [mini["mini_index"] for mini in repaired] == [1, 2, 3, 4]
    assert repaired[0]["id"] == original[0]["id"]
    assert repaired[0]["title"] == "Custom title"
    assert repaired[0]["sort_order"] == 8
    assert repaired[2]["id"] == original[2]["id"]


@pytest.mark.asyncio
async def test_failed_repair_keeps_existing_mini_lessons_without_partial_additions(test_db, small_pool, monkeypatch):
    section = await make_section(test_db)
    lesson = await test_db.curriculum.create_lesson(section["id"], 1)
    repo = CurriculumRepository(test_db.db_path, connection_pool=small_pool)
    async with repo._connection() as connection:
        await connection.execute(
            "DELETE FROM mini_lessons WHERE lesson_id = ? AND mini_index > 1", (lesson["id"],),
        )
        await connection.commit()
    before = await repo.get_mini_lessons_by_lesson(lesson["id"])
    await fail_mini_insert(small_pool, monkeypatch, 3)

    with pytest.raises(RuntimeError, match="Injected mini-lesson"):
        await repo.ensure_default_mini_lessons(lesson["id"])

    assert await repo.get_mini_lessons_by_lesson(lesson["id"]) == before


@pytest.mark.asyncio
async def test_concurrent_statistics_use_the_shared_pool_without_nested_acquisition(test_db, test_user, small_pool):
    task = await test_db.tasks.create_task("Task " + "x" * 110, "4", created_by=test_user["id"])
    async with test_db.tasks._connection() as connection:
        await connection.executemany(
            "INSERT INTO solutions (user_id, task_id, answer, is_correct) VALUES (?, ?, ?, ?)",
            [(test_user["id"], task["id"], "4" if index < 2 else "0", int(index < 2)) for index in range(5)],
        )
        await connection.commit()
    await test_db.reports.create_report(test_user["id"], task["id"], "First report")
    await test_db.reports.create_report(test_user["id"], task["id"], "Second report")
    tasks = TaskRepository(test_db.db_path, connection_pool=small_pool)
    stats = StatisticsRepository(test_db.db_path, connection_pool=small_pool)

    results = await asyncio.wait_for(asyncio.gather(*[
        stats.get_admin_statistics(tasks) for _ in range(2)
    ]), timeout=10)

    for result in results:
        for key in ("popular_tasks", "difficult_tasks", "easy_tasks"):
            assert result[key][0]["task_id"] == task["id"]
            assert result[key][0]["text"] == task["text"][:100]
            assert result[key][0]["attempts"] == 5
            assert result[key][0]["correct"] == 2
            assert result[key][0]["success_rate"] == 40.0
        assert result["popular_tasks"][0]["total"] == 5
        assert result["problematic_tasks"] == [{"task_id": task["id"], "text": task["text"][:100], "report_count": 2}]
    assert small_pool.get_stats()["pool_size"] == small_pool.get_stats()["created"]


@pytest.mark.asyncio
async def test_borrowed_task_connection_is_neither_committed_nor_closed(test_db, test_user, small_pool):
    task = await test_db.tasks.create_task("Original", "4", created_by=test_user["id"])
    repo = TaskRepository(test_db.db_path, connection_pool=small_pool)
    async with repo._connection() as connection:
        await connection.execute("UPDATE bank_tasks SET text = ? WHERE id = ?", ("Uncommitted", task["bank_task_id"]))
        fetched = await repo.get_task_by_id(task["id"], conn=connection)
        assert fetched["text"] == "Uncommitted"
        async with connection.execute("SELECT 1") as cursor:
            assert (await cursor.fetchone())[0] == 1
    assert (await repo.get_task_by_id(task["id"]))["text"] == "Original"
