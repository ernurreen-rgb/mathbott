"""
Admin и CMS роуты
"""
# Admin routes for CMS and trial tests
import os
import json
import logging
import base64
import hashlib
import hmac
import time
from datetime import datetime, timezone
from typing import Optional, List, Any, Dict, Tuple
import aiosqlite
from fastapi import FastAPI, HTTPException, Form, Query, Body, Request, Depends, UploadFile, File
from slowapi import Limiter

from dependencies import (
    ADMIN_ROLE_CONTENT_EDITOR,
    ADMIN_ROLE_REVIEWER,
    ADMIN_ROLE_SUPER_ADMIN,
    ADMIN_ROLES,
    CAPABILITY_REVIEW_MANAGE,
    CAPABILITY_SUPER_CRITICAL,
    get_db,
    get_role_permissions,
    require_internal_identity,
    require_admin,
    require_admin_any_admin,
    require_admin_review_manage,
    require_admin_super_critical,
)
from database import Database
from repositories.bank_task_repository import BankTaskVersionConflictError, BankTaskVersionDeleteError
from repositories.user_repository import AdminRoleConflictError, LastSuperAdminError
from utils.validation import canonicalize_factor_grid_answer, validate_email, validate_string_length, sanitize_html
from utils.file_storage import save_image_upload, delete_image_file
from utils.metrics import metrics

logger = logging.getLogger(__name__)

ALLOWED_BANK_DIFFICULTIES = {"A", "B", "C"}
BANK_SIMILARITY_THRESHOLD_DEFAULT = 0.8
BANK_SIMILARITY_LIMIT_DEFAULT = 10
BANK_QUALITY_DUPLICATE_THRESHOLD_DEFAULT = 0.92
BANK_IMPORT_LIMIT = 200
BANK_IMPORT_PREVIEW_TOKEN_TTL_SECONDS = 15 * 60
BANK_IMPORT_PREVIEW_TOKEN_VERSION = 1
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
    allowed_types = {"input", "tf", "mcq", "mcq6", "select", "factor_grid"}
    if question_type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"Unsupported question_type: {question_type}")

    if question_type in {"mcq", "mcq6", "select"} and options_list is None:
        raise HTTPException(status_code=400, detail="options are required for this question_type")
    if question_type == "mcq" and options_list is not None and len(options_list) != 4:
        raise HTTPException(status_code=400, detail="mcq requires exactly 4 options")
    if question_type == "mcq6" and options_list is not None and len(options_list) != 6:
        raise HTTPException(status_code=400, detail="mcq6 requires exactly 6 options")
    if question_type == "select" and options_list is not None and len(options_list) != 4:
        raise HTTPException(status_code=400, detail="select requires exactly 4 options")

    if question_type == "select":
        if subquestions_list is None or len(subquestions_list) != 2:
            raise HTTPException(status_code=400, detail="select requires 2 subquestions")
    elif question_type == "factor_grid":
        if options_list not in (None, []):
            raise HTTPException(status_code=400, detail="options are not allowed for factor_grid")
        if subquestions_list not in (None, []):
            raise HTTPException(status_code=400, detail="subquestions are not allowed for factor_grid")
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


def _normalize_factor_grid_answer_or_raise(raw_answer: Any) -> str:
    try:
        return canonicalize_factor_grid_answer(raw_answer)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


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


def _canonical_json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _normalize_email_for_token(email: str) -> str:
    return (email or "").strip().lower()


def _hash_import_payload(normalized_tasks: List[Dict[str, Any]]) -> str:
    canonical = _canonical_json_dumps(normalized_tasks)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _base64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _base64url_decode(value: str) -> bytes:
    padding = "=" * ((4 - len(value) % 4) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}")


def _get_import_preview_token_secret() -> str:
    value = os.getenv("IMPORT_PREVIEW_TOKEN_SECRET")
    if isinstance(value, str) and value.strip():
        return value.strip()
    fallback = os.getenv("ADMIN_SECRET", "change-me-in-production")
    if isinstance(fallback, str) and fallback.strip():
        return fallback.strip()
    raise HTTPException(
        status_code=500,
        detail={
            "code": "IMPORT_PREVIEW_SECRET_MISSING",
            "message": "Import preview token secret is not configured.",
        },
    )


def _issue_import_preview_token(email_norm: str, payload_hash: str) -> Tuple[str, int]:
    now_ts = int(time.time())
    exp_ts = now_ts + BANK_IMPORT_PREVIEW_TOKEN_TTL_SECONDS
    payload = {
        "v": BANK_IMPORT_PREVIEW_TOKEN_VERSION,
        "email_norm": email_norm,
        "payload_hash": payload_hash,
        "iat": now_ts,
        "exp": exp_ts,
    }
    payload_raw = _canonical_json_dumps(payload).encode("utf-8")
    payload_b64 = _base64url_encode(payload_raw)
    secret = _get_import_preview_token_secret().encode("utf-8")
    signature = hmac.new(secret, payload_b64.encode("utf-8"), hashlib.sha256).digest()
    token = f"{payload_b64}.{_base64url_encode(signature)}"
    return token, exp_ts


def _import_http_error(code: str, message: str, status_code: int = 400) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message})


def _verify_import_preview_token(token: Any, expected_email_norm: str) -> Dict[str, Any]:
    if not isinstance(token, str) or not token.strip():
        raise _import_http_error("IMPORT_PREVIEW_TOKEN_REQUIRED", "preview_token is required for confirm mode")

    raw = token.strip()
    parts = raw.split(".")
    if len(parts) != 2 or not parts[0] or not parts[1]:
        raise _import_http_error("IMPORT_PREVIEW_TOKEN_INVALID", "preview_token is invalid")
    payload_b64, signature_b64 = parts

    try:
        payload_raw = _base64url_decode(payload_b64)
        signature_raw = _base64url_decode(signature_b64)
    except Exception:
        raise _import_http_error("IMPORT_PREVIEW_TOKEN_INVALID", "preview_token is invalid")

    secret = _get_import_preview_token_secret().encode("utf-8")
    expected_signature = hmac.new(secret, payload_b64.encode("utf-8"), hashlib.sha256).digest()
    if not hmac.compare_digest(signature_raw, expected_signature):
        raise _import_http_error("IMPORT_PREVIEW_TOKEN_INVALID", "preview_token is invalid")

    try:
        payload = json.loads(payload_raw.decode("utf-8"))
    except Exception:
        raise _import_http_error("IMPORT_PREVIEW_TOKEN_INVALID", "preview_token is invalid")

    if not isinstance(payload, dict):
        raise _import_http_error("IMPORT_PREVIEW_TOKEN_INVALID", "preview_token is invalid")

    token_version = payload.get("v")
    email_norm = payload.get("email_norm")
    payload_hash = payload.get("payload_hash")
    exp_ts = payload.get("exp")
    iat_ts = payload.get("iat")

    if token_version != BANK_IMPORT_PREVIEW_TOKEN_VERSION:
        raise _import_http_error("IMPORT_PREVIEW_TOKEN_INVALID", "preview_token is invalid")
    if not isinstance(email_norm, str) or not email_norm:
        raise _import_http_error("IMPORT_PREVIEW_TOKEN_INVALID", "preview_token is invalid")
    if not isinstance(payload_hash, str) or not payload_hash:
        raise _import_http_error("IMPORT_PREVIEW_TOKEN_INVALID", "preview_token is invalid")
    if not isinstance(exp_ts, int) or not isinstance(iat_ts, int):
        raise _import_http_error("IMPORT_PREVIEW_TOKEN_INVALID", "preview_token is invalid")
    if email_norm != expected_email_norm:
        raise _import_http_error("IMPORT_PREVIEW_TOKEN_INVALID", "preview_token does not match current user")

    now_ts = int(time.time())
    if exp_ts < now_ts:
        raise _import_http_error("IMPORT_PREVIEW_TOKEN_EXPIRED", "preview_token expired. Run dry-run again.")

    return payload


async def _collect_import_dedup_conflicts(
    db: Database,
    normalized_tasks: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    conflicts: List[Dict[str, Any]] = []
    for idx, task in enumerate(normalized_tasks):
        similar_tasks = await db.find_similar_bank_tasks(
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


def _normalize_import_factor_grid_answer(raw_answer: Any) -> str:
    try:
        return canonicalize_factor_grid_answer(raw_answer)
    except ValueError as exc:
        raise ImportTaskValidationError("answer", str(exc))


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
    if question_type not in {"mcq", "mcq6", "select"} or options is None:
        return
    labels = [str(item.get("label") or "").strip().upper() for item in options]
    expected = ["A", "B", "C", "D", "E", "F"] if question_type == "mcq6" else ["A", "B", "C", "D"]
    if len(labels) != len(expected) or set(labels) != set(expected):
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
    image_filename = raw_image_filename if (isinstance(raw_image_filename, str) and raw_image_filename.strip()) else None

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
    elif question_type == "factor_grid":
        answer = _normalize_import_factor_grid_answer(raw_answer)
    elif question_type == "tf":
        answer = _normalize_import_tf_answer(raw_answer)
    elif question_type in {"mcq", "mcq6"}:
        answer = str(raw_answer or "").strip().upper()
        if not answer:
            raise ImportTaskValidationError("answer", "answer is required for mcq/mcq6")
        allowed = {"A", "B", "C", "D"} if question_type == "mcq" else {"A", "B", "C", "D", "E", "F"}
        if answer not in allowed:
            raise ImportTaskValidationError(
                "answer",
                f"{question_type} answer must be one of {', '.join(sorted(allowed))}",
            )
        if options:
            option_labels = {str(item.get("label") or "").strip().upper() for item in options}
            if answer not in option_labels:
                raise ImportTaskValidationError("answer", "answer must match one of options labels")
    else:
        answer = str(raw_answer or "")
        if not answer.strip():
            raise ImportTaskValidationError("answer", "answer is required")

    return {
        "text": text,
        "answer": answer,
        "question_type": question_type,
        "text_scale": text_scale,
        "difficulty": difficulty,
        "topics": topics,
        "options": options,
        "subquestions": subquestions,
        "image_filename": image_filename,
        "solution_filename": solution_filename,
    }


def _serialize_bank_placement_task(task: dict) -> dict:
    options = _parse_json_safe(task.get("options"))
    subquestions = _parse_json_safe(task.get("subquestions"))
    text_scale = task.get("text_scale") or "md"
    bank_task = {
        "id": task.get("bank_task_id"),
        "text": task.get("text", ""),
        "answer": task.get("answer", ""),
        "question_type": task.get("question_type", "input"),
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
        "text_scale": text_scale,
        "options": bank_task["options"],
        "subquestions": bank_task["subquestions"],
        "image_filename": bank_task["image_filename"],
        "solution_filename": bank_task["solution_filename"],
        "bank_difficulty": bank_task["difficulty"],
        "bank_task": bank_task,
    }



__all__ = [name for name in globals().keys() if not name.startswith("__")]
