import pytest

from services.ops_monitor import OpsMonitor
from utils.metrics import metrics


def _extract_detail(payload):
    if isinstance(payload, dict):
        if "detail" in payload and isinstance(payload["detail"], str):
            return payload["detail"]
        error = payload.get("error")
        if isinstance(error, dict):
            detail = error.get("detail")
            if isinstance(detail, str):
                return detail
    return ""


@pytest.mark.asyncio
async def test_ops_monitor_creates_db_down_incident(test_db):
    metrics.reset()

    async def fail_probe():
        return False

    test_db.probe_database = fail_probe  # type: ignore[method-assign]
    monitor = OpsMonitor(test_db)

    await monitor.run_cycle()
    await monitor.run_cycle()

    incidents = await test_db.list_ops_incidents(status="open", severity="all", limit=20, offset=0)
    assert incidents["total"] >= 1
    assert any(item["kind"] == "db_down" for item in incidents["items"])


@pytest.mark.asyncio
async def test_ops_monitor_opens_and_resolves_incident(test_db):
    metrics.reset()

    state = {"ok": False}

    async def probe():
        return state["ok"]

    test_db.probe_database = probe  # type: ignore[method-assign]
    monitor = OpsMonitor(test_db)

    await monitor.run_cycle()
    await monitor.run_cycle()

    open_incidents = await test_db.list_ops_incidents(status="open", severity="all", limit=20, offset=0)
    assert any(item["kind"] == "db_down" for item in open_incidents["items"])

    state["ok"] = True
    await monitor.run_cycle()
    await monitor.run_cycle()
    await monitor.run_cycle()

    open_after_recover = await test_db.list_ops_incidents(status="open", severity="all", limit=20, offset=0)
    resolved_after_recover = await test_db.list_ops_incidents(status="resolved", severity="all", limit=20, offset=0)
    assert all(item["kind"] != "db_down" for item in open_after_recover["items"])
    assert any(item["kind"] == "db_down" for item in resolved_after_recover["items"])


@pytest.mark.asyncio
async def test_ops_monitor_telegram_cooldown(test_db):
    metrics.reset()

    async def fail_probe():
        return False

    class FakeAlerter:
        def __init__(self):
            self.enabled = True
            self.open_calls = 0
            self.resolve_calls = 0

        async def send_incident_open(self, incident):
            self.open_calls += 1
            return True

        async def send_incident_resolved(self, incident):
            self.resolve_calls += 1
            return True

    test_db.probe_database = fail_probe  # type: ignore[method-assign]
    monitor = OpsMonitor(test_db)
    monitor.alerter = FakeAlerter()  # type: ignore[assignment]

    await monitor.run_cycle()
    await monitor.run_cycle()
    await monitor.run_cycle()
    await monitor.run_cycle()

    assert monitor.alerter.open_calls == 1
    assert monitor.alerter.resolve_calls == 0


@pytest.mark.asyncio
async def test_ops_health_summary_endpoint_admin_only(client, test_db):
    admin_user = await test_db.create_user_by_email("ops.admin@example.com")
    await test_db.set_admin(email=admin_user["email"], is_admin=True)
    regular_user = await test_db.create_user_by_email("ops.user@example.com")

    forbidden = client.get("/api/admin/ops/health/summary", params={"email": regular_user["email"]})
    assert forbidden.status_code == 403

    response = client.get("/api/admin/ops/health/summary", params={"email": admin_user["email"]})
    assert response.status_code == 200
    payload = response.json()
    assert "service_status" in payload
    assert "database_status" in payload
    assert "open_incidents" in payload


@pytest.mark.asyncio
async def test_ops_health_timeseries_validation(client, test_db):
    admin_user = await test_db.create_user_by_email("ops.validation@example.com")
    await test_db.set_admin(email=admin_user["email"], is_admin=True)

    invalid_range = client.get(
        "/api/admin/ops/health/timeseries",
        params={"email": admin_user["email"], "range": "30d"},
    )
    assert invalid_range.status_code == 400
    assert "range" in _extract_detail(invalid_range.json())

    invalid_step = client.get(
        "/api/admin/ops/health/timeseries",
        params={"email": admin_user["email"], "range": "24h", "step": "30m"},
    )
    assert invalid_step.status_code == 400
    assert "step" in _extract_detail(invalid_step.json())


@pytest.mark.asyncio
async def test_ops_incidents_pagination_filters(client, test_db):
    admin_user = await test_db.create_user_by_email("ops.filters@example.com")
    await test_db.set_admin(email=admin_user["email"], is_admin=True)

    await test_db.open_or_update_ops_incident(
        kind="high_5xx_rate",
        severity="high",
        fingerprint="high_5xx_rate",
        title="high 5xx",
        message="spike",
        metadata={"requests_5m": 100},
    )
    await test_db.open_or_update_ops_incident(
        kind="high_latency_p95",
        severity="medium",
        fingerprint="high_latency_p95",
        title="high latency",
        message="slow",
        metadata={"p95_ms_5m": 3000},
    )
    await test_db.resolve_ops_incident(fingerprint="high_latency_p95")

    open_high = client.get(
        "/api/admin/ops/incidents",
        params={"email": admin_user["email"], "status": "open", "severity": "high", "limit": 20, "offset": 0},
    )
    assert open_high.status_code == 200
    open_payload = open_high.json()
    assert open_payload["total"] >= 1
    assert all(item["status"] == "open" and item["severity"] == "high" for item in open_payload["items"])

    page_one = client.get(
        "/api/admin/ops/incidents",
        params={"email": admin_user["email"], "status": "all", "severity": "all", "limit": 1, "offset": 0},
    )
    page_two = client.get(
        "/api/admin/ops/incidents",
        params={"email": admin_user["email"], "status": "all", "severity": "all", "limit": 1, "offset": 1},
    )
    assert page_one.status_code == 200
    assert page_two.status_code == 200
    assert len(page_one.json()["items"]) == 1
    assert len(page_two.json()["items"]) == 1
    assert page_one.json()["items"][0]["id"] != page_two.json()["items"][0]["id"]


def test_health_endpoint_additive_fields_present(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    payload = response.json()
    assert "status" in payload
    assert "database" in payload
    assert "timestamp" in payload
    assert "uptime_sec" in payload
    assert "version" in payload
    assert "environment" in payload
