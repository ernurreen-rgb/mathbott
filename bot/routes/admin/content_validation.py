"""content validation helpers extracted without changing calculation rules."""
import json
import logging
from typing import Optional, List, Any
from fastapi import HTTPException
from utils.validation import MAX_MCQ_CORRECT_OPTIONS, normalize_accepted_answers, normalize_answer_mode, parse_mcq_answer_labels, serialize_mcq_answer_labels


logger = logging.getLogger(__name__)


ALLOWED_BANK_DIFFICULTIES = {"A", "B", "C"}


BANK_SIMILARITY_THRESHOLD_DEFAULT = 0.8


BANK_SIMILARITY_LIMIT_DEFAULT = 10


BANK_QUALITY_DUPLICATE_THRESHOLD_DEFAULT = 0.92


BANK_IMPORT_LIMIT = 200


BANK_IMPORT_PREVIEW_TOKEN_TTL_SECONDS = 15 * 60


BANK_IMPORT_PREVIEW_TOKEN_VERSION = 1


MCQ_QUESTION_TYPES = {"mcq", "mcq6"}


MCQ_OPTION_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"]


MIN_MCQ_OPTIONS = 4


MAX_MCQ_OPTIONS = len(MCQ_OPTION_LABELS)


BANK_AUDIT_ACTIONS = {"import_confirm", "version_delete", "rollback", "hard_delete", "role_change"}


OPS_TIMESERIES_RANGES = {"1h": "-1 hour", "24h": "-24 hours", "7d": "-7 days"}


OPS_TIMESERIES_STEPS = {"1m": 60, "5m": 300, "1h": 3600}


OPS_TIMESERIES_DEFAULT_STEP = {"1h": "1m", "24h": "5m", "7d": "1h"}


OPS_INCIDENT_STATUSES = {"open", "resolved", "all"}


OPS_INCIDENT_SEVERITIES = {"critical", "high", "medium", "all"}


class ImportTaskValidationError(Exception):
    """Structured validation error for JSON import payload."""

    def __init__(self, field: str, message: str):
        super().__init__(message)
        self.field = field
        self.message = message


def _normalize_topic_name(raw_topic: str) -> str:
    return " ".join((raw_topic or "").strip().split())


def _validate_bank_topics(topics: Optional[List[str]]) -> List[str]:
    if topics is None:
        return []
    if not isinstance(topics, list):
        raise HTTPException(status_code=400, detail="topics must be an array")

    cleaned_topics: List[str] = []
    seen: set[str] = set()
    for raw_topic in topics:
        if not isinstance(raw_topic, str):
            raise HTTPException(status_code=400, detail="Each topic must be a string")
        topic = _normalize_topic_name(raw_topic)
        if not topic:
            continue
        if len(topic) > 64:
            raise HTTPException(status_code=400, detail="Topic length must be <= 64")
        topic_norm = topic.lower()
        if topic_norm in seen:
            continue
        seen.add(topic_norm)
        cleaned_topics.append(topic)

    if len(cleaned_topics) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 topics allowed")

    return cleaned_topics


def _validate_bank_difficulty(difficulty: str) -> str:
    normalized = (difficulty or "").strip().upper()
    if normalized not in ALLOWED_BANK_DIFFICULTIES:
        raise HTTPException(status_code=400, detail="difficulty must be one of A, B, C")
    return normalized


def _normalize_text_scale(value: Any) -> str:
    if value is None:
        return "md"
    if not isinstance(value, str):
        raise HTTPException(status_code=400, detail="text_scale must be one of sm, md, lg")
    normalized = value.strip().lower() or "md"
    if normalized not in {"sm", "md", "lg"}:
        raise HTTPException(status_code=400, detail="text_scale must be one of sm, md, lg")
    return normalized


def _normalize_answer_mode_or_raise(value: Any, question_type: str) -> str:
    if value is not None and not isinstance(value, str):
        raise HTTPException(status_code=400, detail="answer_mode must be choices or written")
    raw = str(value or "").strip().lower()
    if question_type in {"mcq", "mcq6", "select"} and raw and raw not in {"choices", "written"}:
        raise HTTPException(status_code=400, detail="answer_mode must be choices or written")
    return normalize_answer_mode(raw, question_type)


def _normalize_accepted_answers_or_raise(value: Any) -> List[str]:
    try:
        return normalize_accepted_answers(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _parse_options_json(options: Optional[str]) -> Optional[List[dict]]:
    if options is None:
        return None
    if not options.strip():
        return []
    try:
        parsed = json.loads(options)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid options JSON: {str(e)}")
    if not isinstance(parsed, list):
        raise HTTPException(status_code=400, detail="options must be a JSON array")
    return parsed


def _parse_subquestions_json(subquestions: Optional[str]) -> Optional[List[dict]]:
    if subquestions is None:
        return None
    if not subquestions.strip():
        return []
    try:
        parsed = json.loads(subquestions)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid subquestions JSON: {str(e)}")
    if not isinstance(parsed, list) or len(parsed) != 2:
        raise HTTPException(status_code=400, detail="subquestions must be a JSON array of length 2")
    return parsed


def _parse_bank_topics_json(raw_topics: Optional[str], *, default_when_missing: Optional[List[str]] = None) -> Optional[List[str]]:
    if raw_topics is None:
        return default_when_missing
    if not raw_topics.strip():
        return []
    try:
        parsed = json.loads(raw_topics)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid bank_topics JSON: {str(e)}")
    return _validate_bank_topics(parsed)


def _validate_trial_like_payload(
    question_type: str,
    options_list: Optional[List[dict]],
    subquestions_list: Optional[List[dict]],
) -> None:
    allowed_types = {"input", "tf", "mcq", "mcq6", "select"}
    if question_type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"Unsupported question_type: {question_type}")

    if question_type in {*MCQ_QUESTION_TYPES, "select"} and options_list is None:
        raise HTTPException(status_code=400, detail="options are required for this question_type")
    if question_type in MCQ_QUESTION_TYPES and options_list is not None:
        if not MIN_MCQ_OPTIONS <= len(options_list) <= MAX_MCQ_OPTIONS:
            raise HTTPException(
                status_code=400,
                detail=f"{question_type} requires {MIN_MCQ_OPTIONS} to {MAX_MCQ_OPTIONS} options",
            )
        labels = [str(item.get("label") or "").strip().upper() if isinstance(item, dict) else "" for item in options_list]
        expected = MCQ_OPTION_LABELS[: len(options_list)]
        if labels != expected:
            raise HTTPException(
                status_code=400,
                detail=f"{question_type} options labels must be exactly {', '.join(expected)}",
            )
    if question_type == "select" and options_list is not None and len(options_list) != 4:
        raise HTTPException(status_code=400, detail="select requires exactly 4 options")
    if question_type == "select" and options_list is not None:
        labels = [str(item.get("label") or "").strip().upper() if isinstance(item, dict) else "" for item in options_list]
        expected = ["A", "B", "C", "D"]
        if labels != expected:
            raise HTTPException(
                status_code=400,
                detail=f"select options labels must be exactly {', '.join(expected)}",
            )

    if question_type == "select":
        if subquestions_list is None or len(subquestions_list) != 2:
            raise HTTPException(status_code=400, detail="select requires 2 subquestions")
    elif subquestions_list not in (None, []):
        raise HTTPException(status_code=400, detail="subquestions are only allowed for select question_type")


def _parse_json_safe(value):
    if value is None:
        return None
    if isinstance(value, (list, dict)):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return value
    return value


def _get_allowed_mcq_answer_labels(options_list: Optional[List[dict]]) -> List[str]:
    labels = [
        str(item.get("label") or "").strip().upper()
        for item in (options_list or [])
        if isinstance(item, dict) and str(item.get("label") or "").strip()
    ]
    return labels or MCQ_OPTION_LABELS[:MIN_MCQ_OPTIONS]


def _normalize_mcq_answer_or_raise(
    raw_answer: Any,
    options_list: Optional[List[dict]],
    question_type: str,
) -> str:
    labels = parse_mcq_answer_labels(raw_answer)
    if not labels:
        raise HTTPException(status_code=400, detail="answer is required for mcq/mcq6")
    if len(labels) > MAX_MCQ_CORRECT_OPTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"{question_type} answer can contain at most {MAX_MCQ_CORRECT_OPTIONS} correct options",
        )

    allowed = _get_allowed_mcq_answer_labels(options_list)
    invalid = [label for label in labels if label not in allowed]
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=f"{question_type} answer must use only {', '.join(allowed)}",
        )
    return serialize_mcq_answer_labels(labels)


def _normalize_trial_like_answer_or_raise(
    question_type: str,
    raw_answer: Any,
    options_list: Optional[List[dict]],
) -> str:
    if question_type in MCQ_QUESTION_TYPES:
        return _normalize_mcq_answer_or_raise(raw_answer, options_list, question_type)
    return str(raw_answer or "")


def _parse_bool_flag(raw_value: Optional[str]) -> bool:
    if raw_value is None:
        return False
    return str(raw_value).strip().lower() in {"1", "true", "yes", "y", "on"}


def _build_similar_conflict_payload(similar_tasks: List[dict]) -> dict:
    return {
        "code": "SIMILAR_TASKS_FOUND",
        "message": "Found similar bank tasks. Confirm save to continue.",
        "similar_tasks": similar_tasks,
    }


def _raise_version_conflict_from_exception(exc: Exception) -> HTTPException:
    current_version: Optional[int] = None
    text = str(exc or "")
    if text.startswith("VERSION_CONFLICT:"):
        try:
            current_version = int(text.split(":", 1)[1])
        except Exception:
            current_version = None
    return HTTPException(
        status_code=409,
        detail={
            "code": "VERSION_CONFLICT",
            "message": "Bank task has been updated by another session.",
            "current_version": current_version,
        },
    )


def _http_detail_to_message(detail: Any) -> str:
    if isinstance(detail, str):
        return detail
    if isinstance(detail, dict):
        message = detail.get("message")
        if isinstance(message, str) and message.strip():
            return message
        try:
            return json.dumps(detail, ensure_ascii=False)
        except Exception:
            return str(detail)
    return str(detail)
