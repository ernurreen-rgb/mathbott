"""
API tests for trial test draft (GET/PUT draft, delete on submit)
"""
import pytest
from fastapi.testclient import TestClient

from main import app
from dependencies import get_db


@pytest.fixture
def client_with_db(test_db):
    """Client with get_db overridden to use test_db."""
    async def override_get_db():
        return test_db

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_get_draft_no_user(client_with_db):
    """GET draft with unknown email returns 404"""
    response = client_with_db.get(
        "/api/trial-tests/1/draft",
        params={"email": "unknown@example.com"},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_put_draft_no_email(client_with_db):
    """PUT draft without email returns 400"""
    response = client_with_db.put(
        "/api/trial-tests/1/draft",
        json={"answers": {}, "current_task_index": 0},
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_draft_get_put_get_flow(client_with_db, test_db, test_user):
    """GET empty -> PUT draft -> GET returns saved data"""
    trial = await test_db.create_trial_test("Draft Test", sort_order=0, created_by=test_user["id"])
    task = await test_db.create_trial_test_task(trial["id"], "Q1", "42", "input", sort_order=0)
    task_id = task["id"]

    # GET empty
    r1 = client_with_db.get(
        f"/api/trial-tests/{trial['id']}/draft",
        params={"email": test_user["email"]},
    )
    assert r1.status_code == 200
    assert r1.json() == {"answers": {}, "current_task_index": 0}

    # PUT draft
    r2 = client_with_db.put(
        f"/api/trial-tests/{trial['id']}/draft",
        json={
            "email": test_user["email"],
            "answers": {str(task_id): "42"},
            "current_task_index": 1,
        },
    )
    assert r2.status_code == 200
    assert r2.json() == {"ok": True}

    # GET returns saved
    r3 = client_with_db.get(
        f"/api/trial-tests/{trial['id']}/draft",
        params={"email": test_user["email"]},
    )
    assert r3.status_code == 200
    data = r3.json()
    assert data["current_task_index"] == 1
    assert str(task_id) in data["answers"] or task_id in data["answers"]
    ans = data["answers"]
    val = ans.get(str(task_id)) or ans.get(task_id)
    assert val == "42"


@pytest.mark.asyncio
async def test_submit_deletes_draft(client_with_db, test_db, test_user):
    """After submit, draft is deleted"""
    trial = await test_db.create_trial_test("Submit Test", sort_order=0, created_by=test_user["id"])
    task = await test_db.create_trial_test_task(trial["id"], "Q1", "42", "input", sort_order=0)
    task_id = task["id"]

    # Save draft
    client_with_db.put(
        f"/api/trial-tests/{trial['id']}/draft",
        json={
            "email": test_user["email"],
            "answers": {str(task_id): "42"},
            "current_task_index": 0,
        },
    )

    # Submit test
    r = client_with_db.post(
        f"/api/trial-tests/{trial['id']}/submit",
        json={"email": test_user["email"], "answers": {str(task_id): "42"}},
    )
    assert r.status_code == 200

    # Draft should be gone
    r_get = client_with_db.get(
        f"/api/trial-tests/{trial['id']}/draft",
        params={"email": test_user["email"]},
    )
    assert r_get.status_code == 200
    assert r_get.json() == {"answers": {}, "current_task_index": 0}
