"""Where an API cold start spends its time, for the first response's Server-Timing header.

Students' devices copy that header into their request timings (routes/client_timings.py), so a
slow first request shows how long the process existed before our code ran, how long the code
took to import, how long startup took, and how long the request then waited to be handled.
Imported first by main.py; it only uses the standard library.
"""
from __future__ import annotations

import os
import time
from typing import Dict, Optional

STARTED = time.perf_counter()
_marks: Dict[str, float] = {}
_reported = False


def _process_age_ms() -> Optional[float]:
    """How long this process ran before this module was imported (Linux only)."""
    try:
        with open("/proc/self/stat", encoding="ascii") as stat:
            # The command name may contain spaces; the fields after its closing parenthesis are fixed.
            fields = stat.read().rsplit(")", 1)[1].split()
        started_ticks = int(fields[19])  # field 22 of /proc/[pid]/stat: start time in clock ticks
        with open("/proc/uptime", encoding="ascii") as uptime:
            uptime_seconds = float(uptime.read().split()[0])
        age = (uptime_seconds - started_ticks / os.sysconf("SC_CLK_TCK")) * 1000.0
    except (OSError, ValueError, IndexError, AttributeError):
        return None
    # A restored VM snapshot can make the numbers meaningless; keep only plausible ones.
    return age if 0 <= age < 120_000 else None


PROCESS_AGE_MS = _process_age_ms()


def mark(name: str) -> None:
    """Note when a boot phase ended: "imported" (main.py loaded), "startup" and "ready" (lifespan)."""
    _marks.setdefault(name, time.perf_counter())


def cold_start_metrics(request_started: float) -> Optional[str]:
    """Server-Timing metrics for the first request this process serves; None afterwards."""
    global _reported
    if _reported:
        return None
    _reported = True
    parts = ["api-cold"]
    if PROCESS_AGE_MS is not None:
        parts.append(f"api-process;dur={PROCESS_AGE_MS:.1f}")
    imported = _marks.get("imported")
    if imported is not None:
        parts.append(f"api-import;dur={(imported - STARTED) * 1000:.1f}")
    startup, ready = _marks.get("startup"), _marks.get("ready")
    if startup is not None and ready is not None:
        parts.append(f"api-startup;dur={(ready - startup) * 1000:.1f}")
    if ready is not None:
        parts.append(f"api-wait;dur={max(0.0, request_started - ready) * 1000:.1f}")
    return ", ".join(parts)


def reset_for_tests() -> None:
    global _reported
    _reported = False
    _marks.clear()
