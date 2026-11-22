"""Compatibility imports for the existing common API."""
import os
import json
import logging
import base64
import hashlib
import hmac
import time
from datetime import datetime, timezone
from typing import Optional, List, Any, Dict, Tuple
import storage as db_driver
from fastapi import FastAPI, HTTPException, Form, Query, Body, Request, Depends, UploadFile, File
from slowapi import Limiter
from dependencies import (
    ADMIN_ROLE_CONTENT_EDITOR,
    ADMIN_ROLE_REVIEWER,
    ADMIN_ROLE_SUPER_ADMIN,
    ADMIN_ROLES,
    CAPABILITY_CONTENT_MANAGE,
    CAPABILITY_REVIEW_MANAGE,
    CAPABILITY_SUPER_CRITICAL,
    get_db,
    get_role_permissions,
    has_admin_capability,
    require_internal_identity,
    require_admin,
    require_admin_any_admin,
    require_admin_review_manage,
    require_admin_super_critical,
)
from database import Database
from repositories.bank_task_repository import BankTaskVersionConflictError, BankTaskVersionDeleteError
from repositories.user_repository import AdminRoleConflictError, LastSuperAdminError
from settings import DEFAULT_ADMIN_SECRET, get_settings
from utils.validation import (
    MAX_MCQ_CORRECT_OPTIONS,
    is_task_answer_correct,
    normalize_accepted_answers,
    normalize_answer_mode,
    normalize_task_answer_for_compare,
    parse_mcq_answer_labels,
    serialize_mcq_answer_labels,
    validate_email,
    validate_string_length,
    sanitize_html,
)
from utils.file_storage import delete_image_file, normalize_stored_image_filename, save_image_upload
from utils.metrics import metrics

from .content_validation import (
    logger,
    ALLOWED_BANK_DIFFICULTIES,
    BANK_SIMILARITY_THRESHOLD_DEFAULT,
    BANK_SIMILARITY_LIMIT_DEFAULT,
    BANK_QUALITY_DUPLICATE_THRESHOLD_DEFAULT,
    BANK_IMPORT_LIMIT,
    BANK_IMPORT_PREVIEW_TOKEN_TTL_SECONDS,
    BANK_IMPORT_PREVIEW_TOKEN_VERSION,
    MCQ_QUESTION_TYPES,
    MCQ_OPTION_LABELS,
    MIN_MCQ_OPTIONS,
    MAX_MCQ_OPTIONS,
    BANK_AUDIT_ACTIONS,
    OPS_TIMESERIES_RANGES,
    OPS_TIMESERIES_STEPS,
    OPS_TIMESERIES_DEFAULT_STEP,
    OPS_INCIDENT_STATUSES,
    OPS_INCIDENT_SEVERITIES,
    ImportTaskValidationError,
    _normalize_topic_name,
    _validate_bank_topics,
    _validate_bank_difficulty,
    _normalize_text_scale,
    _normalize_answer_mode_or_raise,
    _normalize_accepted_answers_or_raise,
    _parse_options_json,
    _parse_subquestions_json,
    _parse_bank_topics_json,
    _validate_trial_like_payload,
    _parse_json_safe,
    _get_allowed_mcq_answer_labels,
    _normalize_mcq_answer_or_raise,
    _normalize_trial_like_answer_or_raise,
    _parse_bool_flag,
    _build_similar_conflict_payload,
    _raise_version_conflict_from_exception,
    _http_detail_to_message,
)

from .import_tokens import (
    _canonical_json_dumps,
    _normalize_email_for_token,
    _hash_import_payload,
    _base64url_encode,
    _base64url_decode,
    _get_import_preview_token_secret,
    _issue_import_preview_token,
    _consume_import_preview_token_jti,
    _import_http_error,
    _verify_import_preview_token,
)

from .import_payload import (
    _collect_import_dedup_conflicts,
    _build_import_similar_conflict_detail,
    _normalize_import_tf_answer,
    _normalize_import_select_answer,
    _normalize_import_mcq_answer,
    _normalize_import_options,
    _normalize_import_subquestions,
    _validate_option_labels_for_question_type,
    _normalize_import_bank_task,
)

from .content_serialization import (
    _serialize_bank_task_for_import_export,
    _serialize_bank_placement_task,
)


def _can_manage_admin_task(task: Dict[str, Any], admin_user: Dict[str, Any]) -> bool:
    """Allow super_admin on any task, and allow content admins on their own or unowned (created_by=NULL) tasks."""
    if admin_user.get("is_super_admin"):
        return True
    created_by = task.get("created_by")
    if created_by is None:
        return True
    return created_by == admin_user["id"]


async def _replacement_bank_task_fields(
    db: Database,
    previous_bank_task_id: Optional[int],
    *,
    text: Optional[str],
    answer: Optional[str],
    question_type: Optional[str],
    answer_mode: Optional[str],
    accepted_answers: Optional[List[str]],
    text_scale: Optional[str],
    difficulty: Optional[str],
    topics: Optional[List[str]],
    options: Optional[List[Dict[str, Any]]],
    subquestions: Optional[List[Dict[str, Any]]],
    image_filename: Optional[str],
) -> Dict[str, Any]:
    """create_task() arguments for a bank task that replaces a missing or trashed one.

    None means "not submitted": the field keeps the old bank task's content (a trashed task
    still has it), so a partial edit never blanks text, choices, image or solution. An empty
    image_filename removes the image.
    """
    previous: Dict[str, Any] = {}
    if isinstance(previous_bank_task_id, int) and previous_bank_task_id > 0:
        previous = await db.bank_tasks.get_task_by_id(previous_bank_task_id, include_deleted=True) or {}

    def pick(submitted: Any, key: str) -> Any:
        return previous.get(key) if submitted is None else submitted

    return {
        "text": pick(text, "text") or "",
        "answer": pick(answer, "answer") or "",
        "question_type": pick(question_type, "question_type") or "input",
        "answer_mode": pick(answer_mode, "answer_mode") or "choices",
        "accepted_answers": pick(accepted_answers, "accepted_answers"),
        "text_scale": pick(text_scale, "text_scale") or "md",
        "difficulty": pick(difficulty, "difficulty") or "B",
        "topics": pick(topics, "topics") or [],
        "options": pick(options, "options"),
        "subquestions": pick(subquestions, "subquestions"),
        "image_filename": pick(image_filename, "image_filename") or None,
        "solution_filename": previous.get("solution_filename"),
    }


__all__ =[name for name in globals().keys() if not name.startswith("__")]
