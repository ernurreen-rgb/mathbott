"""
In-memory metrics collection for request performance monitoring.
"""
from __future__ import annotations

import time
from collections import deque
from datetime import datetime
from typing import Any, Deque, Dict, List


class MetricsCollector:
    """In-memory collector with ring-buffer events and windowed aggregations."""

    def __init__(self, *, max_endpoint_labels: int = 512, max_error_labels: int = 2048, max_label_length: int = 256):
        for limit in (max_endpoint_labels, max_error_labels, max_label_length):
            if type(limit) is not int or limit < 1:
                raise ValueError("Metric label budgets must be positive integers")
        self.max_endpoint_labels = max_endpoint_labels
        self.max_error_labels = max_error_labels
        self.max_label_length = max_label_length
        self.error_counts: Dict[str, int] = {}
        self.endpoint_counts: Dict[str, int] = {}
        self.max_history = 10000
        self.events: Deque[Dict[str, Any]] = deque()

    def _bounded_label(self, label: str, counts: Dict[str, int], limit: int) -> str:
        # Reserve one slot for overflow, retaining totals instead of evicting
        # previously counted labels. Normalize before storing events as well.
        if not isinstance(label, str) or len(label) > self.max_label_length:
            return "<other>"
        if label in counts or len(counts) < limit - 1:
            return label
        return "<other>"

    @staticmethod
    def _calc_p95(values: List[float]) -> float:
        if not values:
            return 0.0
        ordered = sorted(values)
        idx = max(0, min(len(ordered) - 1, int(len(ordered) * 0.95)))
        return float(ordered[idx])

    def _window_events(self, window_seconds: int) -> List[Dict[str, Any]]:
        if window_seconds <= 0:
            return list(self.events)
        now_ts = time.time()
        cutoff = now_ts - float(window_seconds)
        return [item for item in self.events if float(item.get("ts", 0.0)) >= cutoff]

    def record_request(self, endpoint: str, duration: float, status_code: int):
        """Record a request event.

        duration unit is caller-defined; middleware records milliseconds.
        """
        endpoint = self._bounded_label(endpoint, self.endpoint_counts, self.max_endpoint_labels)
        self.endpoint_counts[endpoint] = self.endpoint_counts.get(endpoint, 0) + 1
        code = int(status_code)
        event = {
            "ts": time.time(),
            "endpoint": endpoint,
            "duration": float(duration),
            "status_code": code,
        }
        self.events.append(event)
        while len(self.events) > int(self.max_history):
            self.events.popleft()

        if code >= 400:
            error = self._bounded_label(f"{endpoint}:{code}", self.error_counts, self.max_error_labels)
            self.error_counts[error] = self.error_counts.get(error, 0) + 1

    def get_window_stats(self, window_seconds: int = 300) -> Dict[str, float]:
        events = self._window_events(window_seconds)
        durations = [float(item.get("duration", 0.0)) for item in events]
        request_count = len(events)
        error_count = sum(1 for item in events if int(item.get("status_code", 0)) >= 500)

        avg_ms = (sum(durations) / request_count) if request_count > 0 else 0.0
        p95_ms = self._calc_p95(durations)
        error_rate = ((error_count * 100.0) / request_count) if request_count > 0 else 0.0
        return {
            "requests": float(request_count),
            "errors": float(error_count),
            "error_rate": float(error_rate),
            "p95_ms": float(p95_ms),
            "avg_ms": float(avg_ms),
        }

    def get_stats(self) -> Dict:
        """Get current statistics (backward-compatible format)."""
        durations = [float(item.get("duration", 0.0)) for item in self.events]
        if not durations:
            return {
                "total_requests": 0,
                "avg_response_time": 0,
                "min_response_time": 0,
                "max_response_time": 0,
                "error_count": sum(self.error_counts.values()),
                "endpoint_counts": dict(self.endpoint_counts),
            }

        return {
            "total_requests": len(durations),
            "avg_response_time": sum(durations) / len(durations),
            "min_response_time": min(durations),
            "max_response_time": max(durations),
            "p95_response_time": self._calc_p95(durations),
            "error_count": sum(self.error_counts.values()),
            "error_breakdown": dict(self.error_counts),
            "endpoint_counts": dict(self.endpoint_counts),
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }

    def reset(self):
        """Reset all metrics."""
        self.events.clear()
        self.error_counts.clear()
        self.endpoint_counts.clear()


metrics = MetricsCollector()

