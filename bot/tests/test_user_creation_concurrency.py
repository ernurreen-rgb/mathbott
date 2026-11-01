"""Get-or-create is idempotent and preserves identity, profile and admin state."""
import asyncio
from unittest.mock import Mock
from uuid import uuid4

import pytest
from httpx2 import ASGITransport, AsyncClient

import repositories.user_repository as users
import storage
from repositories.user_repository import UserRepository
from tests.database_helpers import create_reject_trigger, drop_reject_trigger
from tests.route_helpers import _proxy_headers
from utils.connection_pool import ConnectionPool


@pytest.fixture(params=[None, 1, 2])
async def user_pool(test_db, request):
    pool = ConnectionPool(test_db.db_path, min_size=0, max_size=request.param, timeout=5) if request.param else None
    try:
        yield pool
    finally:
        if pool:
            await pool.close()


async def count_email(repo, email):
    async with repo._connection() as connection:
        async with connection.execute("SELECT COUNT(*) FROM users WHERE email = ?", (email,)) as cursor:
            return (await cursor.fetchone())[0]


@pytest.mark.asyncio
async def test_concurrent_repository_calls_return_one_user(test_db, user_pool):
    repos = [UserRepository(test_db.db_path, connection_pool=user_pool) for _ in range(2)]
    email = "same-first-login@example.com"
    outcomes = await asyncio.wait_for(asyncio.gather(*[
        repos[index % 2].create_user_by_email(email) for index in range(16)
    ], return_exceptions=True), timeout=15)
    assert not [outcome for outcome in outcomes if isinstance(outcome, Exception)]
    assert len({outcome["id"] for outcome in outcomes}) == 1
    assert len({outcome["telegram_id"] for outcome in outcomes}) == 1
    assert all(outcome["email"] == email and outcome["telegram_id"] < 0 for outcome in outcomes)
    assert await count_email(repos[0], email) == 1
    if user_pool:
        assert user_pool.get_stats()["pool_size"] == user_pool.get_stats()["created"]


@pytest.mark.asyncio
async def test_concurrent_different_emails_remain_distinct(test_db, user_pool):
    repo = UserRepository(test_db.db_path, connection_pool=user_pool)
    emails = [f"different-first-login-{index}@example.com" for index in range(16)]
    outcomes = await asyncio.wait_for(asyncio.gather(*[repo.create_user_by_email(email) for email in emails]), timeout=15)
    assert {outcome["email"] for outcome in outcomes} == set(emails)
    assert len({outcome["id"] for outcome in outcomes}) == len(emails)
    assert len({outcome["telegram_id"] for outcome in outcomes}) == len(emails)
    assert all(outcome["telegram_id"] < 0 for outcome in outcomes)


@pytest.mark.asyncio
async def test_concurrent_first_profile_requests_succeed_with_signed_identity(client, test_db, user_pool, monkeypatch):
    email = "concurrent-profile@example.com"
    secret = "user-creation-regression-shared-secret"
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("INTERNAL_PROXY_SHARED_SECRET", secret)
    monkeypatch.delenv("ADMIN_EMAIL", raising=False)
    repo = UserRepository(test_db.db_path, connection_pool=user_pool)
    monkeypatch.setattr(test_db, "users", repo)
    path = f"/api/user/web/{email}"
    async with AsyncClient(transport=ASGITransport(app=client.app, raise_app_exceptions=False), base_url="http://testserver") as http:
        responses = await asyncio.wait_for(asyncio.gather(*[
            http.get(path, headers=_proxy_headers("GET", path, "", email, secret, nonce=uuid4().hex)) for _ in range(16)
        ]), timeout=15)
    assert [response.status_code for response in responses] == [200] * 16
    assert len({response.json()["id"] for response in responses}) == 1
    assert all(response.json()["email"] == email and not response.json()["is_admin"] for response in responses)
    assert await count_email(repo, email) == 1


async def seed_telegram_ids(repo, values):
    async with repo._connection() as connection:
        await connection.executemany("INSERT INTO users (telegram_id, email) VALUES (?, ?)",
                                     [(value, f"telegram-{abs(value)}@example.com") for value in values])
        await connection.commit()


@pytest.mark.asyncio
async def test_synthetic_telegram_id_collisions_are_retried_without_merging_users(test_db, user_pool, monkeypatch):
    repo = UserRepository(test_db.db_path, connection_pool=user_pool)
    await seed_telegram_ids(repo, [-7, -8])
    generate = Mock(side_effect=[-7, -8, -9])
    monkeypatch.setattr(users, "_new_web_telegram_id", generate)

    created = await repo.create_user_by_email("collision-target@example.com")

    assert created["email"] == "collision-target@example.com"
    assert created["telegram_id"] == -9
    assert generate.call_count == 3
    for value in (-7, -8):
        existing = await repo.get_user_by_email(f"telegram-{abs(value)}@example.com")
        assert existing["telegram_id"] == value
        assert existing["id"] != created["id"]


@pytest.mark.asyncio
async def test_exhausted_collision_retries_roll_back_and_release_the_connection(test_db, user_pool, monkeypatch):
    repo = UserRepository(test_db.db_path, connection_pool=user_pool)
    await seed_telegram_ids(repo, [-7])
    generate = Mock(return_value=-7)
    monkeypatch.setattr(users, "_new_web_telegram_id", generate)

    with pytest.raises(RuntimeError, match="unique web user"):
        await repo.create_user_by_email("exhausted@example.com")

    assert generate.call_count == 5
    assert await repo.get_user_by_email("exhausted@example.com") is None
    assert (await repo.get_user_by_email("telegram-7@example.com"))["telegram_id"] == -7
    generate.return_value = -9
    assert (await repo.create_user_by_email("next-user@example.com"))["telegram_id"] == -9
    if user_pool:
        assert user_pool.get_stats()["pool_size"] == user_pool.get_stats()["created"]


@pytest.mark.asyncio
async def test_unrelated_integrity_errors_are_not_treated_as_id_collisions(test_db, user_pool, monkeypatch):
    repo = UserRepository(test_db.db_path, connection_pool=user_pool)
    generate = Mock(return_value=-9)
    monkeypatch.setattr(users, "_new_web_telegram_id", generate)
    async with repo._connection() as connection:
        await create_reject_trigger(connection, "users", "reject_user_creation", "creation rejected")
        await connection.commit()
    try:
        with pytest.raises(storage.IntegrityError, match="creation rejected"):
            await repo.create_user_by_email("rejected@example.com")
        assert generate.call_count == 1
        assert await repo.get_user_by_email("rejected@example.com") is None
    finally:
        async with repo._connection() as connection:
            await drop_reject_trigger(connection, "users", "reject_user_creation")
            await connection.commit()


@pytest.mark.asyncio
@pytest.mark.parametrize("role", [None, "content_editor", "super_admin"])
async def test_existing_profile_and_role_are_not_overwritten_or_promoted(test_db, user_pool, monkeypatch, role):
    repo = UserRepository(test_db.db_path, connection_pool=user_pool)
    email = "existing-profile@example.com"
    await repo.create_user_by_email(email)
    async with repo._connection() as connection:
        await connection.execute("""UPDATE users SET telegram_id = 777, nickname = 'Saved profile',
            total_solved = 9, streak = 3, onboarding_completed = 1, is_admin = ?, admin_role = ? WHERE email = ?""",
                                 (int(role is not None), role, email))
        await connection.commit()
    before = await repo.get_user_by_email(email)
    monkeypatch.setattr(users, "_new_web_telegram_id", Mock(side_effect=AssertionError("Existing user must not allocate an ID")))

    returned = await repo.create_user_by_email(email, check_admin_email=email)

    assert returned == before
    assert await repo.get_user_by_email(email) == before


@pytest.mark.asyncio
async def test_admin_bootstrap_applies_only_to_the_matching_new_email(test_db, user_pool):
    repo = UserRepository(test_db.db_path, connection_pool=user_pool)
    email = "bootstrap@example.com"
    admin = await repo.create_user_by_email(email, check_admin_email=email.upper())
    ordinary = await repo.create_user_by_email("ordinary@example.com", check_admin_email=email)
    assert admin["is_admin"] == 1 and admin["admin_role"] == "super_admin"
    assert ordinary["is_admin"] == 0 and ordinary["admin_role"] is None


@pytest.mark.asyncio
@pytest.mark.parametrize("random_value", [0, 2**31 - 2])
async def test_new_synthetic_ids_remain_strictly_negative_32_bit_values(test_db, user_pool, monkeypatch, random_value):
    repo = UserRepository(test_db.db_path, connection_pool=user_pool)
    monkeypatch.setattr(users.secrets, "randbelow", lambda limit: random_value)
    created = await repo.create_user_by_email("range-check@example.com")
    assert created["telegram_id"] == -(random_value + 1)
    assert -(2**31 - 1) <= created["telegram_id"] < 0
