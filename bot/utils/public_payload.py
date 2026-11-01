"""Helpers for stripping solution-only fields from public task payloads."""
from __future__ import annotations

from typing import Any, Dict, List, Optional
import json

from utils.validation import get_mcq_answer_count, normalize_answer_mode


_SOLUTION_KEYS = {
    "answer",
    "accepted_answers",
    "correct",
    "is_correct",
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


def public_options(value: Any) -> Optional[List[Dict[str, str]]]:
    """Expose only typed display fields, including for legacy/imported choices."""
    if not isinstance(value, list):
        return None
    return [
        {"label": option["label"], "text": option.get("text", "")}
        for option in value
        if isinstance(option, dict) and isinstance(option.get("label"), str)
        and isinstance(option.get("text", ""), str)
    ]


def public_subquestions(value: Any) -> Optional[List[Dict[str, Any]]]:
    """Expose prompt and legacy choice text, without grading metadata."""
    if not isinstance(value, list):
        return None
    result = []
    for item in value:
        if not isinstance(item, dict) or not isinstance(item.get("text", ""), str):
            continue
        prompt: Dict[str, Any] = {"text": item.get("text", "")}
        if isinstance(item.get("choices"), list):
            choices: List[Any] = []
            for choice in item["choices"]:
                if isinstance(choice, str):
                    choices.append(choice)
                elif isinstance(choice, dict):
                    choices.extend(public_subquestions([choice]) or [])
            prompt["choices"] = choices
        result.append(prompt)
    return result


def _public_task_field(key: str, value: Any, question_type: Any) -> Any:
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (ValueError, TypeError):
            value = None
    if key == "options" and isinstance(question_type, str) and question_type in {"mcq", "mcq6", "select"}:
        return public_options(value)
    if key == "subquestions":
        return public_subquestions(value)
    return strip_solution_fields(value)


def public_review_answers(value: Any) -> Dict[str, Any]:
    """Sanitize old nested snapshots without rewriting grades or display counts."""
    if not isinstance(value, dict):
        return {}
    answers = dict(value)
    for task_id, review in value.items():
        if not isinstance(review, dict) or not isinstance(review.get("task"), dict):
            continue
        task = review["task"]
        snapshot = dict(task)
        for key in ("options", "subquestions"):
            snapshot[key] = _public_task_field(key, task.get(key), task.get("question_type"))
        answers[task_id] = {**review, "task": snapshot}
    return answers


def task_review_snapshot(task: Dict[str, Any]) -> Dict[str, Any]:
    """Freeze the displayed task with the answer that was graded, not its bank link."""
    snapshot = {key: task.get(key) for key in (
        "id", "text", "text_scale", "question_type", "sort_order", "image_filename",
    )}
    snapshot["answer_mode"] = normalize_answer_mode(task.get("answer_mode"), task.get("question_type"))
    snapshot["correct_count"] = get_mcq_answer_count(task.get("answer")) if task.get("question_type") in {"mcq", "mcq6"} else 1
    for key in ("options", "subquestions"):
        snapshot[key] = _public_task_field(key, task.get(key), task.get("question_type"))
    return snapshot
