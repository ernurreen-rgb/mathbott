"""Helpers for stripping solution-only fields from public task payloads."""
from __future__ import annotations

from typing import Any, Dict, List, Optional
import json

from utils.validation import get_mcq_answer_count, normalize_answer_mode


_SOLUTION_KEYS = {
    "answer",
    "accepted_answers",
    "correct",
    "correct_answer",
    "solution",
    "solution_filename",
}


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


def task_review_snapshot(task: Dict[str, Any]) -> Dict[str, Any]:
    """Freeze the displayed task with the answer that was graded, not its bank link."""
    snapshot = {key: task.get(key) for key in (
        "id", "text", "text_scale", "question_type", "sort_order", "image_filename",
    )}
    snapshot["answer_mode"] = normalize_answer_mode(task.get("answer_mode"), task.get("question_type"))
    snapshot["correct_count"] = get_mcq_answer_count(task.get("answer")) if task.get("question_type") in {"mcq", "mcq6"} else 1
    for key in ("options", "subquestions"):
        value = task.get(key)
        if isinstance(value, str):
            try:
                value = json.loads(value)
            except (ValueError, TypeError):
                value = None
        snapshot[key] = strip_solution_fields(value)
    return snapshot
