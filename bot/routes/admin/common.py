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

__all__ = [name for name in globals().keys() if not name.startswith("__")]
