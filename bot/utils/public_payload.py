"""Helpers for stripping solution-only fields from public task payloads."""
from __future__ import annotations

from typing import Any, Dict, List, Optional


_SOLUTION_KEYS = {"answer", "correct", "correct_answer", "solution", "solution_filename"}


def strip_solution_fields(value: Any) -> Any:
    """Recursively remove answer/solution fields from public API payloads."""
    if isinstance(value, list):
        return [strip_solution_fields(item) for item in value]
    if isinstance(value, dict):
        return {
            key: strip_solution_fields(item)
            for key, item in value.items()
            if key not in _SOLUTION_KEYS
        }
    return value


def public_subquestions(value: Any) -> Optional[List[Dict[str, Any]]]:
    if not isinstance(value, list):
        return None
    return strip_solution_fields(value)

