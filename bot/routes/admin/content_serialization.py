"""content serialization helpers extracted without changing calculation rules."""
from typing import Any, Dict
from utils.validation import normalize_accepted_answers, normalize_answer_mode
from .content_validation import ALLOWED_BANK_DIFFICULTIES, _parse_json_safe


def _serialize_bank_task_for_import_export(task: dict) -> Dict[str, Any]:
    text_scale_raw = str(task.get("text_scale") or "md").strip().lower()
    text_scale = text_scale_raw if text_scale_raw in {"sm", "md", "lg"} else "md"

    difficulty_raw = str(task.get("difficulty") or "B").strip().upper()
    difficulty = difficulty_raw if difficulty_raw in ALLOWED_BANK_DIFFICULTIES else "B"

    topics = task.get("topics")
    topics_value = topics if isinstance(topics, list) else []

    options = _parse_json_safe(task.get("options"))
    options_value = options if isinstance(options, list) else None

    subquestions = _parse_json_safe(task.get("subquestions"))
    subquestions_value = subquestions if isinstance(subquestions, list) else None
    try:
        accepted_answers = normalize_accepted_answers(task.get("accepted_answers"))
    except ValueError:
        accepted_answers = []

    image_filename_raw = task.get("image_filename")
    image_filename = (
        image_filename_raw.strip()
        if isinstance(image_filename_raw, str) and image_filename_raw.strip()
        else None
    )

    solution_filename_raw = task.get("solution_filename")
    solution_filename = (
        solution_filename_raw.strip()
        if isinstance(solution_filename_raw, str) and solution_filename_raw.strip()
        else None
    )

    return {
        "text": str(task.get("text") or ""),
        "answer": str(task.get("answer") or ""),
        "question_type": str(task.get("question_type") or "input"),
        "answer_mode": normalize_answer_mode(task.get("answer_mode"), task.get("question_type")),
        "accepted_answers": accepted_answers,
        "text_scale": text_scale,
        "difficulty": difficulty,
        "topics": topics_value,
        "options": options_value,
        "subquestions": subquestions_value,
        "image_filename": image_filename,
        "solution_filename": solution_filename,
    }


def _serialize_bank_placement_task(task: dict) -> dict:
    options = _parse_json_safe(task.get("options"))
    subquestions = _parse_json_safe(task.get("subquestions"))
    text_scale = task.get("text_scale") or "md"
    try:
        accepted_answers = normalize_accepted_answers(task.get("accepted_answers"))
    except ValueError:
        accepted_answers = []
    bank_task = {
        "id": task.get("bank_task_id"),
        "text": task.get("text", ""),
        "answer": task.get("answer", ""),
        "question_type": task.get("question_type", "input"),
        "answer_mode": normalize_answer_mode(task.get("answer_mode"), task.get("question_type")),
        "accepted_answers": accepted_answers,
        "text_scale": text_scale,
        "options": options if isinstance(options, list) else None,
        "subquestions": subquestions if isinstance(subquestions, list) else None,
        "image_filename": task.get("image_filename"),
        "solution_filename": task.get("solution_filename"),
        "difficulty": task.get("bank_difficulty") or task.get("difficulty"),
    }
    return {
        "id": task.get("id"),
        "section_id": task.get("section_id"),
        "mini_lesson_id": task.get("mini_lesson_id"),
        "trial_test_id": task.get("trial_test_id"),
        "bank_task_id": task.get("bank_task_id"),
        "sort_order": task.get("sort_order", 0),
        "task_type": task.get("task_type"),
        "deleted_at": task.get("deleted_at"),
        "text": bank_task["text"],
        "answer": bank_task["answer"],
        "question_type": bank_task["question_type"],
        "answer_mode": bank_task["answer_mode"],
        "accepted_answers": bank_task["accepted_answers"],
        "text_scale": text_scale,
        "options": bank_task["options"],
        "subquestions": bank_task["subquestions"],
        "image_filename": bank_task["image_filename"],
        "solution_filename": bank_task["solution_filename"],
        "bank_difficulty": bank_task["difficulty"],
        "bank_task": bank_task,
    }
