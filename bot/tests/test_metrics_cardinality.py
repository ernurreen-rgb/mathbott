"""Metrics retain bounded, privacy-safe labels without losing aggregate counts."""
import asyncio
import json

import pytest
from fastapi import FastAPI, HTTPException, Request
from fastapi.testclient import TestClient

import middleware.metrics_middleware as middleware
from utils.metrics import MetricsCollector


@pytest.fixture
def observed(monkeypatch):
    collector = MetricsCollector()
    monkeypatch.setattr(middleware, "metrics", collector)
    app = FastAPI()
    app.add_middleware(middleware.MetricsMiddleware)

    @app.get("/users/{email}")
    async def read_user(email: str):
        return {"ok": True}

    @app.get("/tasks/{task_id}")
    async def read_task(task_id: int):
        if task_id == 404:
            raise HTTPException(404, "Task not found")
        if task_id == 500:
            raise RuntimeError("Task failed")
        return {"ok": True}

    return TestClient(app, raise_server_exceptions=False), collector


def test_dynamic_route_values_and_query_secrets_are_not_metric_labels(observed):
    client, collector = observed
    for index in range(20):
        assert client.get(f"/users/student-{index}@example.com?token=private-query").status_code == 200
    assert collector.get_stats()["endpoint_counts"] == {"GET /users/{email}": 20}
    serialized = json.dumps([collector.get_stats(), list(collector.events)])
    assert "student-" not in serialized
    assert "@example.com" not in serialized
    assert "private-query" not in serialized


def test_unknown_paths_and_unrecognized_methods_use_shared_labels(observed):
    client, collector = observed
    for index in range(200):
        assert client.get(f"/missing-{index}").status_code == 404
    for index in range(40):
        assert client.request(f"CUSTOM{index}", "/users/private@example.com").status_code == 405
    stats = collector.get_stats()
    assert stats["endpoint_counts"]["GET <unmatched>"] == 200
    assert len(stats["endpoint_counts"]) == 2
    assert sum(stats["endpoint_counts"].values()) == stats["error_count"] == 240
    assert all(key.startswith(("GET ", "OTHER ")) for key in stats["endpoint_counts"])
    assert "private@example.com" not in json.dumps(list(collector.events))


def test_matched_404_and_422_keep_their_route_template_and_timing_header(observed):
    client, collector = observed
    assert client.get("/tasks/404").status_code == 404
    assert client.get("/tasks/not-an-integer").status_code == 422
    assert client.get("/missing").status_code == 404
    response = client.get("/tasks/1")
    assert response.status_code == 200
    assert float(response.headers["X-Response-Time"].removesuffix("ms")) >= 0
    stats = collector.get_stats()
    assert stats["endpoint_counts"] == {"GET /tasks/{task_id}": 3, "GET <unmatched>": 1}
    assert stats["error_breakdown"]["GET /tasks/{task_id}:404"] == 1
    assert stats["error_breakdown"]["GET /tasks/{task_id}:422"] == 1


def test_unhandled_failure_is_recorded_with_template_and_not_swallowed(observed):
    client, collector = observed
    with TestClient(client.app, raise_server_exceptions=True) as raising_client:
        with pytest.raises(RuntimeError, match="Task failed"):
            raising_client.get("/tasks/500")
    assert client.get("/tasks/1").status_code == 200
    assert collector.get_stats()["endpoint_counts"] == {"GET /tasks/{task_id}": 2}
    assert collector.get_stats()["error_breakdown"] == {"GET /tasks/{task_id}:500": 1}
    assert collector.get_window_stats()["error_rate"] == 50.0


def test_host_header_cannot_supply_metric_path_values(observed):
    client, collector = observed
    assert client.get("/users/private@example.com", headers={"Host": "example.org/leaked@example.com"}).status_code == 200
    assert collector.get_stats()["endpoint_counts"] == {"GET /users/{email}": 1}


@pytest.mark.asyncio
async def test_request_cancellation_is_not_replaced_by_metrics_errors(monkeypatch):
    collector = MetricsCollector()
    monkeypatch.setattr(middleware, "metrics", collector)
    request = Request({"type": "http", "method": "GET", "path": "/private", "query_string": b"",
                       "headers": [], "scheme": "http", "server": ("testserver", 80)})

    async def cancelled(_request):
        raise asyncio.CancelledError()

    with pytest.raises(asyncio.CancelledError):
        await middleware.MetricsMiddleware(FastAPI()).dispatch(request, cancelled)
    assert not collector.events


def test_direct_label_flood_is_bounded_and_keeps_request_and_error_totals():
    collector = MetricsCollector(max_endpoint_labels=4, max_error_labels=5, max_label_length=64)
    for index in range(20000):
        collector.record_request(f"GET /missing-{index}", 1.0, 404)
    stats = collector.get_stats()
    assert len(collector.events) == 10000
    assert len(collector.endpoint_counts) <= 4
    assert len(collector.error_counts) <= 5
    assert sum(stats["endpoint_counts"].values()) == stats["error_count"] == 20000
    assert {event["endpoint"] for event in collector.events} == {"<other>"}
    collector.record_request("GET /missing-0", 2.0, 200)
    assert collector.get_stats()["endpoint_counts"]["GET /missing-0"] == 2


def test_error_label_overflow_preserves_5xx_window_and_latency_statistics():
    collector = MetricsCollector(max_error_labels=4)
    for index in range(20000):
        collector.record_request("GET /tasks/{task_id}", 1.0, 400 + index % 200)
    assert len(collector.error_counts) <= 4
    assert collector.get_stats()["error_count"] == 20000
    assert collector.get_window_stats() == {
        "requests": 10000.0, "errors": 5000.0, "error_rate": 50.0, "avg_ms": 1.0, "p95_ms": 1.0,
    }


def test_oversized_labels_are_not_retained_in_counters_or_events():
    collector = MetricsCollector(max_label_length=64)
    collector.record_request("GET /" + "private@example.com" * 1000, 1.0, 500)
    assert collector.get_stats()["endpoint_counts"] == {"<other>": 1}
    assert list(collector.events)[0]["endpoint"] == "<other>"


def test_reset_releases_counter_label_budgets():
    collector = MetricsCollector(max_endpoint_labels=2, max_error_labels=2)
    collector.record_request("GET /first", 1.0, 200)
    collector.record_request("GET /second", 1.0, 500)
    collector.reset()
    collector.record_request("GET /third", 1.0, 500)
    assert collector.get_stats()["endpoint_counts"] == {"GET /third": 1}
    assert collector.get_stats()["error_breakdown"] == {"GET /third:500": 1}
    assert collector.get_window_stats()["requests"] == 1.0


@pytest.mark.parametrize("options", [
    {"max_endpoint_labels": 0}, {"max_error_labels": -1}, {"max_label_length": 0},
    {"max_endpoint_labels": "2"}, {"max_error_labels": True},
])
def test_label_budgets_require_positive_integers(options):
    with pytest.raises(ValueError):
        MetricsCollector(**options)
