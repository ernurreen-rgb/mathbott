"""
In-memory metrics collection for request performance monitoring.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque
from datetime import datetime
from typing import Any, Deque, Dict, List


class MetricsCollector:
    """In-memory collector with ring-buffer events and windowed aggregations."""

    def __init__(self):
        self.error_counts: Dict[str, int] = defaultdict(int)
        self.endpoint_counts: Dict[str, int] = defaultdict(int)
        self.max_history = 10000
        self.events: Deque[Dict[str, Any]] = deque()

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
        self.endpoint_counts[endpoint] += 1
        event = {
            "ts": time.time(),
            "endpoint": endpoint,
            "duration": float(duration),
            "status_code": int(status_code),
        }
        self.events.append(event)
        while len(self.events) > int(self.max_history):
            self.events.popleft()

        if int(status_code) >= 400:
            self.error_counts[f"{endpoint}:{status_code}"] += 1

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

