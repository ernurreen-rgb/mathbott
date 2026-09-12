"""import payload helpers extracted without changing calculation rules."""
import json
from typing import Optional, List, Any, Dict
from fastapi import HTTPException
from database import Database
from utils.validation import MAX_MCQ_CORRECT_OPTIONS, normalize_accepted_answers, parse_mcq_answer_labels, serialize_mcq_answer_labels
from utils.file_storage import normalize_stored_image_filename
from .content_validation import BANK_SIMILARITY_LIMIT_DEFAULT, BANK_SIMILARITY_THRESHOLD_DEFAULT, ImportTaskValidationError, MCQ_OPTION_LABELS, MCQ_QUESTION_TYPES, _get_allowed_mcq_answer_labels, _http_detail_to_message, _normalize_answer_mode_or_raise, _normalize_text_scale, _validate_bank_difficulty, _validate_bank_topics, _validate_trial_like_payload


async def _collect_import_dedup_conflicts(
    db: Database,
    normalized_tasks: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    conflicts: List[Dict[str, Any]] = []
    for idx, task in enumerate(normalized_tasks):
        similar_tasks = await db.bank_tasks.find_similar_tasks(
            text=task.get("text", ""),
            options=task.get("options"),
            question_type=task.get("question_type"),
            threshold=BANK_SIMILARITY_THRESHOLD_DEFAULT,
            limit=BANK_SIMILARITY_LIMIT_DEFAULT,
        )
        if similar_tasks:
            conflicts.append(
                {
                    "index": idx,
                    "similar_tasks": similar_tasks,
                }
            )
    return conflicts


def _build_import_similar_conflict_detail(conflicts: List[Dict[str, Any]]) -> Dict[str, Any]:
    first = conflicts[0] if conflicts else {"index": None, "similar_tasks": []}
    return {
        "code": "SIMILAR_TASKS_FOUND",
        "message": "Found similar bank tasks. Confirm save to continue.",
        "task_index": first.get("index"),
        "similar_tasks": first.get("similar_tasks") or [],
        "conflicts": conflicts,
    }


def _normalize_import_tf_answer(raw_answer: Any) -> str:
    if isinstance(raw_answer, bool):
        return "true" if raw_answer else "false"
    value = str(raw_answer or "").strip().lower()
    if value in {"true", "1", "t", "yes", "y", "on"}:
        return "true"
    if value in {"false", "0", "f", "no", "n", "off"}:
        return "false"
    raise ImportTaskValidationError("answer", "tf answer must be true/false")


def _normalize_import_select_answer(raw_answer: Any) -> str:
    parsed: Any = None
    if isinstance(raw_answer, list):
        parsed = raw_answer
    elif isinstance(raw_answer, str):
        if not raw_answer.strip():
            raise ImportTaskValidationError("answer", "select answer is required")
        try:
            parsed = json.loads(raw_answer)
        except Exception:
            raise ImportTaskValidationError(
                "answer",
                "select answer must be an array or JSON-stringified array",
            )
    else:
        raise ImportTaskValidationError(
            "answer",
            "select answer must be an array or JSON-stringified array",
        )

    if not isinstance(parsed, list) or len(parsed) != 2:
        raise ImportTaskValidationError("answer", "select answer must contain exactly 2 items")

    normalized: List[str] = []
    for idx, item in enumerate(parsed):
        label = str(item or "").strip().upper()
        if label not in {"A", "B", "C", "D"}:
            raise ImportTaskValidationError(
                "answer",
                f"select answer item #{idx + 1} must be one of A, B, C, D",
            )
        normalized.append(label)
    return json.dumps(normalized, ensure_ascii=False)


def _normalize_import_mcq_answer(
    raw_answer: Any,
    options: Optional[List[dict]],
    question_type: str,
) -> str:
    labels = parse_mcq_answer_labels(raw_answer)
    if not labels:
        raise ImportTaskValidationError("answer", "answer is required for mcq/mcq6")
    if len(labels) > MAX_MCQ_CORRECT_OPTIONS:
        raise ImportTaskValidationError(
            "answer",
            f"{question_type} answer can contain at most {MAX_MCQ_CORRECT_OPTIONS} correct options",
        )

    allowed = _get_allowed_mcq_answer_labels(options)
    invalid = [label for label in labels if label not in allowed]
    if invalid:
        raise ImportTaskValidationError(
            "answer",
            f"{question_type} answer must use only {', '.join(allowed)}",
        )
    return serialize_mcq_answer_labels(labels)


def _normalize_import_options(raw_options: Any) -> Optional[List[dict]]:
    if raw_options is None:
        return None
    if not isinstance(raw_options, list):
        raise ImportTaskValidationError("options", "options must be an array or null")

    normalized: List[dict] = []
    for idx, item in enumerate(raw_options):
        if not isinstance(item, dict):
            raise ImportTaskValidationError("options", f"options[{idx}] must be an object")
        raw_label = item.get("label")
        raw_text = item.get("text", "")
        if not isinstance(raw_label, str) or not raw_label.strip():
            raise ImportTaskValidationError("options", f"options[{idx}].label must be a non-empty string")
        if not isinstance(raw_text, str):
            raise ImportTaskValidationError("options", f"options[{idx}].text must be a string")
        normalized.append(
            {
                "label": raw_label.strip().upper(),
                "text": raw_text,
            }
        )
    return normalized


def _normalize_import_subquestions(raw_subquestions: Any, question_type: str) -> Optional[List[dict]]:
    if raw_subquestions is None:
        return None
    if not isinstance(raw_subquestions, list):
        raise ImportTaskValidationError("subquestions", "subquestions must be an array or null")

    normalized: List[dict] = []
    for idx, item in enumerate(raw_subquestions):
        if not isinstance(item, dict):
            raise ImportTaskValidationError("subquestions", f"subquestions[{idx}] must be an object")
        raw_text = item.get("text", "")
        if not isinstance(raw_text, str):
            raise ImportTaskValidationError("subquestions", f"subquestions[{idx}].text must be a string")
        raw_correct = item.get("correct")
        if question_type == "select":
            if not raw_text.strip():
                raise ImportTaskValidationError("subquestions", f"subquestions[{idx}].text is required for select")
            if not isinstance(raw_correct, str) or not raw_correct.strip():
                raise ImportTaskValidationError("subquestions", f"subquestions[{idx}].correct is required for select")
            correct = raw_correct.strip().upper()
            if correct not in {"A", "B", "C", "D"}:
                raise ImportTaskValidationError(
                    "subquestions",
                    f"subquestions[{idx}].correct must be one of A, B, C, D",
                )
            normalized.append({"text": raw_text.strip(), "correct": correct})
        else:
            row: Dict[str, Any] = {"text": raw_text}
            if raw_correct is not None:
                if not isinstance(raw_correct, str):
                    raise ImportTaskValidationError("subquestions", f"subquestions[{idx}].correct must be a string")
                row["correct"] = raw_correct.strip().upper()
            normalized.append(row)
    return normalized


def _validate_option_labels_for_question_type(question_type: str, options: Optional[List[dict]]) -> None:
    if question_type not in {*MCQ_QUESTION_TYPES, "select"} or options is None:
        return
    labels = [str(item.get("label") or "").strip().upper() for item in options]
    expected = (
        MCQ_OPTION_LABELS[: len(options)]
        if question_type in MCQ_QUESTION_TYPES
        else ["A", "B", "C", "D"]
    )
    if labels != expected:
        raise ImportTaskValidationError(
            "options",
            f"{question_type} options labels must be exactly {', '.join(expected)}",
        )


def _normalize_import_bank_task(raw_task: Any) -> Dict[str, Any]:
    if not isinstance(raw_task, dict):
        raise ImportTaskValidationError("task", "Each task must be a JSON object")

    raw_text = raw_task.get("text")
    if not isinstance(raw_text, str) or not raw_text.strip():
        raise ImportTaskValidationError("text", "text is required and must be a non-empty string")
    text = raw_text.strip()

    raw_question_type = raw_task.get("question_type", "input")
    if raw_question_type is None:
        question_type = "input"
    elif isinstance(raw_question_type, str):
        question_type = raw_question_type.strip().lower() or "input"
    else:
        raise ImportTaskValidationError("question_type", "question_type must be a string")

    options = _normalize_import_options(raw_task.get("options"))
    subquestions = _normalize_import_subquestions(raw_task.get("subquestions"), question_type)
    _validate_option_labels_for_question_type(question_type, options)

    try:
        _validate_trial_like_payload(question_type, options, subquestions)
    except HTTPException as exc:
        raise ImportTaskValidationError("question_type", _http_detail_to_message(exc.detail))

    try:
        answer_mode = _normalize_answer_mode_or_raise(raw_task.get("answer_mode"), question_type)
    except HTTPException as exc:
        raise ImportTaskValidationError("answer_mode", _http_detail_to_message(exc.detail))

    try:
        accepted_answers = normalize_accepted_answers(raw_task.get("accepted_answers"))
    except ValueError as exc:
        raise ImportTaskValidationError("accepted_answers", str(exc)) from exc

    raw_difficulty = raw_task.get("difficulty", "B")
    if raw_difficulty is None:
        raw_difficulty = "B"
    if not isinstance(raw_difficulty, str):
        raise ImportTaskValidationError("difficulty", "difficulty must be a string")
    try:
        difficulty = _validate_bank_difficulty(raw_difficulty)
    except HTTPException as exc:
        raise ImportTaskValidationError("difficulty", _http_detail_to_message(exc.detail))

    raw_topics = raw_task.get("topics", [])
    if raw_topics is None:
        raw_topics = []
    if not isinstance(raw_topics, list):
        raise ImportTaskValidationError("topics", "topics must be an array or null")
    try:
        topics = _validate_bank_topics(raw_topics)
    except HTTPException as exc:
        raise ImportTaskValidationError("topics", _http_detail_to_message(exc.detail))

    raw_image_filename = raw_task.get("image_filename")
    if raw_image_filename is not None and not isinstance(raw_image_filename, str):
        raise ImportTaskValidationError("image_filename", "image_filename must be a string or null")
    image_filename = None
    if isinstance(raw_image_filename, str) and raw_image_filename.strip():
        image_filename = normalize_stored_image_filename(raw_image_filename)
        if image_filename is None:
            raise ImportTaskValidationError("image_filename", "image_filename is not a safe stored image filename")

    raw_solution_filename = raw_task.get("solution_filename")
    if raw_solution_filename is not None and not isinstance(raw_solution_filename, str):
        raise ImportTaskValidationError("solution_filename", "solution_filename must be a string or null")
    solution_filename = (
        raw_solution_filename
        if (isinstance(raw_solution_filename, str) and raw_solution_filename.strip())
        else None
    )

    raw_text_scale = raw_task.get("text_scale", "md")
    if raw_text_scale is None:
        raw_text_scale = "md"
    try:
        text_scale = _normalize_text_scale(raw_text_scale)
    except HTTPException as exc:
        raise ImportTaskValidationError("text_scale", _http_detail_to_message(exc.detail))

    raw_answer = raw_task.get("answer")
    if question_type == "select":
        answer = _normalize_import_select_answer(raw_answer)
    elif question_type == "tf":
        answer = _normalize_import_tf_answer(raw_answer)
    elif question_type in MCQ_QUESTION_TYPES:
        answer = _normalize_import_mcq_answer(raw_answer, options, question_type)
    else:
        answer = str(raw_answer or "")
        if not answer.strip():
            raise ImportTaskValidationError("answer", "answer is required")

    return {
        "text": text,
        "answer": answer,
        "question_type": question_type,
        "answer_mode": answer_mode,
        "accepted_answers": accepted_answers,
        "text_scale": text_scale,
        "difficulty": difficulty,
        "topics": topics,
        "options": options,
        "subquestions": subquestions,
        "image_filename": image_filename,
        "solution_filename": solution_filename,
    }
