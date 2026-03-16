import asyncio

import pytest

from repositories.base import BaseRepository


@pytest.mark.asyncio
async def test_run_with_lock_retry_serializes_writes_across_repo_instances():
    class DummyRepository(BaseRepository):
        pass

    repo_one = DummyRepository(":memory:")
    repo_two = DummyRepository(":memory:")
    active_calls = 0
    max_active_calls = 0

    async def operation():
        nonlocal active_calls, max_active_calls
        active_calls += 1
        max_active_calls = max(max_active_calls, active_calls)
        try:
            await asyncio.sleep(0.05)
            return "ok"
        finally:
            active_calls -= 1

    result_one, result_two = await asyncio.gather(
        repo_one._run_with_lock_retry(operation, attempts=1),
        repo_two._run_with_lock_retry(operation, attempts=1),
    )

    assert result_one == "ok"
    assert result_two == "ok"
    assert max_active_calls == 1
