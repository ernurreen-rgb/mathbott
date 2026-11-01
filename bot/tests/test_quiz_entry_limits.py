"""Shared, durable public quiz entry quotas; no network services are required."""
import asyncio
import json

import pytest
from pydantic import ValidationError

import storage
from repositories.quiz_repository import QuizRepository
from settings import Settings


CLIENT_A = "a" * 64
CLIENT_B = "b" * 64
NOW = 1200


async def bucket(repo, client_key=CLIENT_A):
    async with repo._connection() as db:
        db.row_factory = storage.Row
        async with db.execute("SELECT * FROM quiz_entry_limits WHERE client_key = ?", (client_key,)) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


@pytest.mark.asyncio
async def test_denied_requests_are_committed_and_survive_repository_restart(test_db, monkeypatch):
    monkeypatch.setenv("QUIZ_ENTRY_REQUESTS_PER_MINUTE", "2")
    repo = test_db.quizzes
    assert await repo.consume_entry_request(CLIENT_A, "123456", now=NOW) == 0
    assert await repo.consume_entry_request(CLIENT_A, "123456", now=NOW + 1) == 0
    assert await repo.consume_entry_request(CLIENT_A, "123456", now=NOW + 2) == 58
    restarted = QuizRepository(test_db.db_path)
    assert await restarted.consume_entry_request(CLIENT_A, "123456", now=NOW + 3) == 57
    assert (await bucket(restarted))["request_count"] == 3
    assert await restarted.consume_entry_request(CLIENT_B, "123456", now=NOW + 3) == 0


@pytest.mark.asyncio
async def test_lower_limit_worker_cannot_reduce_consumption_during_rolling_deployment(test_db, monkeypatch):
    repo = test_db.quizzes
    monkeypatch.setenv("QUIZ_ENTRY_REQUESTS_PER_MINUTE", "8")
    for _ in range(5):
        assert await repo.consume_entry_request(CLIENT_A, "123456", now=NOW) == 0
    assert (await bucket(repo))["request_count"] == 5

    monkeypatch.setenv("QUIZ_ENTRY_REQUESTS_PER_MINUTE", "2")
    lower_limit_worker = QuizRepository(test_db.db_path)
    assert await lower_limit_worker.consume_entry_request(CLIENT_A, "123456", now=NOW) == 60
    assert (await bucket(repo))["request_count"] == 5

    monkeypatch.setenv("QUIZ_ENTRY_REQUESTS_PER_MINUTE", "8")
    for _ in range(3):
        assert await repo.consume_entry_request(CLIENT_A, "123456", now=NOW) == 0
    assert await repo.consume_entry_request(CLIENT_A, "123456", now=NOW) == 60
    assert (await bucket(repo))["request_count"] == 9


@pytest.mark.asyncio
async def test_distinct_pin_budget_counts_missing_pins_and_bounds_stored_values(test_db, monkeypatch):
    monkeypatch.setenv("QUIZ_ENTRY_DISTINCT_PINS_PER_MINUTE", "2")
    repo = test_db.quizzes
    # These PINs do not need a session row: probes are charged before lookup.
    assert await repo.consume_entry_request(CLIENT_A, "111111", now=NOW) == 0
    assert await repo.consume_entry_request(CLIENT_A, "222222", now=NOW) == 0
    assert await repo.consume_entry_request(CLIENT_A, "333333", now=NOW + 1) == 59
    assert await repo.consume_entry_request(CLIENT_A, "444444", now=NOW + 2) == 58
    assert await repo.consume_entry_request(CLIENT_A, "111111", now=NOW + 3) == 0
    row = await bucket(repo)
    assert row["request_count"] == 5
    assert json.loads(row["pin_codes"]) == ["111111", "222222"]


@pytest.mark.asyncio
async def test_same_pin_classroom_nat_allows_four_hundred_requests(test_db):
    repo = test_db.quizzes
    for _ in range(400):
        assert await repo.consume_entry_request(CLIENT_A, "123456", now=NOW) == 0
    row = await bucket(repo)
    assert row["request_count"] == 400
    assert json.loads(row["pin_codes"]) == ["123456"]


@pytest.mark.asyncio
async def test_independent_repository_instances_share_atomic_request_budget(test_db, monkeypatch):
    monkeypatch.setenv("QUIZ_ENTRY_REQUESTS_PER_MINUTE", "7")
    repos = [QuizRepository(test_db.db_path) for _ in range(3)]
    delays = await asyncio.gather(*[
        repos[index % len(repos)].consume_entry_request(CLIENT_A, "123456", now=NOW)
        for index in range(20)
    ])
    assert delays.count(0) == 7
    assert delays.count(60) == 13
    assert (await bucket(repos[0]))["request_count"] == 8


@pytest.mark.asyncio
async def test_fixed_windows_reset_forward_and_do_not_reopen_on_clock_rollback(test_db, monkeypatch):
    monkeypatch.setenv("QUIZ_ENTRY_REQUESTS_PER_MINUTE", "1")
    repo = test_db.quizzes
    assert await repo.consume_entry_request(CLIENT_A, "123456", now=NOW + 50.75) == 0
    assert await repo.consume_entry_request(CLIENT_A, "123456", now=NOW + 59.99) == 1
    row_before = await bucket(repo)
    assert await repo.consume_entry_request(CLIENT_A, "654321", now=NOW - 30) == 90
    row_after = await bucket(repo)
    assert row_after["window_start"] == NOW
    assert row_after["expires_at"] == row_before["expires_at"]
    assert await repo.consume_entry_request(CLIENT_A, "654321", now=NOW + 60) == 0
    row_reset = await bucket(repo)
    assert row_reset["window_start"] == NOW + 60
    assert row_reset["request_count"] == 1
    assert json.loads(row_reset["pin_codes"]) == ["654321"]


@pytest.mark.asyncio
async def test_cleanup_and_opportunistic_expiry_remove_only_idle_rows(test_db):
    repo = test_db.quizzes
    await repo.consume_entry_request(CLIENT_A, "123456", now=NOW)
    await repo.consume_entry_request(CLIENT_B, "123456", now=NOW + 100)
    assert await repo.cleanup_entry_limits(now=NOW + 3599) == 0
    assert await repo.cleanup_entry_limits(now=NOW + 3600) == 1
    assert await bucket(repo) is None
    assert await bucket(repo, CLIENT_B) is not None
    # Any entry request removes expired rows, including other network keys.
    await repo.consume_entry_request(CLIENT_A, "123456", now=NOW + 3700)
    assert await bucket(repo, CLIENT_B) is None
    assert (await bucket(repo))["request_count"] == 1


@pytest.mark.asyncio
async def test_new_participant_slots_share_budget_without_charging_requests(test_db, monkeypatch):
    monkeypatch.setenv("QUIZ_ENTRY_NEW_PARTICIPANTS_PER_MINUTE", "2")
    repo = test_db.quizzes
    await repo.consume_entry_request(CLIENT_A, "123456", now=NOW)
    async with repo._write_transaction() as db:
        assert await repo._reserve_quiz_entry_slot(db, CLIENT_A, now=NOW) == 0
    other = QuizRepository(test_db.db_path)
    async with other._write_transaction() as db:
        assert await other._reserve_quiz_entry_slot(db, CLIENT_A, now=NOW + 1) == 0
    async with repo._write_transaction() as db:
        assert await repo._reserve_quiz_entry_slot(db, CLIENT_A, now=NOW + 2) == 58
    row = await bucket(repo)
    assert row["request_count"] == 1
    assert row["new_participants"] == 2
    async with repo._write_transaction() as db:
        assert await repo._reserve_quiz_entry_slot(db, CLIENT_A, now=NOW + 60) == 0
    row = await bucket(repo)
    assert row["new_participants"] == 1
    assert row["request_count"] == 0
    assert json.loads(row["pin_codes"]) == []


@pytest.mark.asyncio
async def test_new_participant_reservation_rolls_back_with_failed_join(test_db, monkeypatch):
    monkeypatch.setenv("QUIZ_ENTRY_NEW_PARTICIPANTS_PER_MINUTE", "1")
    repo = test_db.quizzes
    await repo.consume_entry_request(CLIENT_A, "123456", now=NOW)
    with pytest.raises(RuntimeError, match="join failed"):
        async with repo._write_transaction() as db:
            assert await repo._reserve_quiz_entry_slot(db, CLIENT_A, now=NOW) == 0
            raise RuntimeError("join failed")
    row = await bucket(repo)
    assert row["new_participants"] == 0
    assert row["request_count"] == 1
    async with repo._write_transaction() as db:
        assert await repo._reserve_quiz_entry_slot(db, CLIENT_A, now=NOW) == 0


@pytest.mark.asyncio
async def test_concurrent_new_participant_reservations_are_atomic(test_db, monkeypatch):
    monkeypatch.setenv("QUIZ_ENTRY_NEW_PARTICIPANTS_PER_MINUTE", "3")
    repos = [QuizRepository(test_db.db_path) for _ in range(2)]
    async def reserve(repo):
        async with repo._write_transaction() as db:
            return await repo._reserve_quiz_entry_slot(db, CLIENT_A, now=NOW)
    delays = await asyncio.gather(*[reserve(repos[index % 2]) for index in range(10)])
    assert delays.count(0) == 3
    assert delays.count(60) == 7
    assert (await bucket(repos[0]))["new_participants"] == 3


@pytest.mark.asyncio
@pytest.mark.parametrize("key,pin", [
    ("a" * 63, "123456"), ("g" * 64, "123456"), ("A" * 64, "123456"),
    (CLIENT_A, "12345"), (CLIENT_A, "1234567"), (CLIENT_A, "abcdef"),
])
async def test_invalid_client_keys_and_pins_never_create_rows(test_db, key, pin):
    with pytest.raises(ValueError):
        await test_db.quizzes.consume_entry_request(key, pin, now=NOW)
    async with test_db.quizzes._connection() as db:
        async with db.execute("SELECT COUNT(*) FROM quiz_entry_limits") as cursor:
            assert (await cursor.fetchone())[0] == 0


@pytest.mark.parametrize("name,upper", [
    ("quiz_entry_requests_per_minute", 100000),
    ("quiz_entry_distinct_pins_per_minute", 1000),
    ("quiz_entry_new_participants_per_minute", 10000),
    ("quiz_max_participants", 10000),
])
def test_quota_settings_require_positive_bounded_integers(name, upper):
    assert getattr(Settings(**{name: upper}), name) == upper
    for value in (0, -1, upper + 1, "not-a-number"):
        with pytest.raises(ValidationError):
            Settings(**{name: value})
