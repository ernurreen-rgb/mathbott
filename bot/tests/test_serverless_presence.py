import pytest

from database import Database
import storage


@pytest.mark.asyncio
async def test_presence_is_shared_between_database_instances_and_expires(test_db):
    first = await test_db.users.create_user_by_email("online@example.com")
    second = await test_db.users.create_user_by_email("offline@example.com")
    async with storage.connect(test_db.db_path) as connection:
        await connection.execute("UPDATE users SET last_active = '2000-01-01 00:00:00'")
        await connection.commit()
    roster = await test_db.friends.heartbeat_presence(first["id"])
    assert [user["id"] for user in roster] == [first["id"]]
    other_instance = Database(test_db.db_path, use_pool=False)
    roster = await other_instance.friends.heartbeat_presence(second["id"])
    assert {user["id"] for user in roster} == {first["id"], second["id"]}


@pytest.mark.asyncio
async def test_presence_heartbeat_requires_an_authenticated_user(client, test_user, monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    assert client.post("/api/presence/heartbeat", params={"email": test_user["email"]}).status_code == 401
