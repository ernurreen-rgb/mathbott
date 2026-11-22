"""
Dependency injection helpers for FastAPI routes.
"""
from __future__ import annotations

import logging
from typing import Dict, List, Optional

from fastapi import Depends, HTTPException, Request

from database import Database
from settings import get_settings
from utils.admin_roles import (
    ADMIN_ROLE_CONTENT_EDITOR,
    ADMIN_ROLE_REVIEWER,
    ADMIN_ROLE_SUPER_ADMIN,
    ADMIN_ROLES,
    CAPABILITY_CONTENT_MANAGE,
    CAPABILITY_REVIEW_MANAGE,
    CAPABILITY_SUPER_CRITICAL,
    ROLE_PERMISSIONS,
    get_role_permissions,
    has_admin_capability,
    is_content_admin,
    normalize_admin_role as _normalize_admin_role,
)
from utils.internal_proxy_auth import has_proxy_signature_headers, verify_proxy_signature
from utils.request_context import get_current_request

logger = logging.getLogger(__name__)


async def get_db(request: Request) -> Database:
    return request.app.state.db


def _get_runtime_environment() -> str:
    return get_settings().environment


def _resolve_request(request: Optional[Request]) -> Optional[Request]:
    return request or get_current_request()


def _resolve_legacy_email(*, email: Optional[str], request: Optional[Request]) -> Optional[str]:
    if isinstance(email, str) and email.strip():
        return email.strip().lower()
    if request is not None:
        query_email = (request.query_params.get("email") or "").strip().lower()
        if query_email:
            return query_email
    return None


async def _resolve_authenticated_email(
    *,
    request: Optional[Request],
    email: Optional[str] = None,
) -> str:
    resolved_request = _resolve_request(request)
    settings = get_settings()

    if resolved_request is not None and has_proxy_signature_headers(resolved_request):
        is_valid_proxy, proxy_email, _ = verify_proxy_signature(resolved_request)
        if not is_valid_proxy:
            raise HTTPException(status_code=401, detail="Invalid trusted proxy signature.")
        if not proxy_email:
            raise HTTPException(status_code=401, detail="Authenticated proxy user is missing.")
        if isinstance(email, str) and email.strip() and email.strip().lower() != proxy_email:
            raise HTTPException(status_code=403, detail="Client email does not match authenticated user.")
        return proxy_email

    if settings.is_production:
        raise HTTPException(status_code=401, detail="Trusted proxy authentication required.")

    fallback_email = _resolve_legacy_email(email=email, request=resolved_request)
    if not fallback_email:
        raise HTTPException(status_code=401, detail="Authenticated user identity is required.")
    return fallback_email


async def resolve_authenticated_email(
    *,
    request: Optional[Request] = None,
    email: Optional[str] = None,
) -> str:
    """Resolve and verify the caller's authenticated email from signed proxy headers (or legacy dev fallback)."""
    return await _resolve_authenticated_email(request=request, email=email)


async def require_internal_identity(
    request: Request = None,
    email: Optional[str] = None,
    db: Database = Depends(get_db),
) -> dict:
    authenticated_email = await _resolve_authenticated_email(request=request, email=email)
    user = await db.users.get_user_by_email(authenticated_email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    enriched_user = dict(user)
    enriched_user["email"] = authenticated_email
    return enriched_user


async def optional_internal_identity(request: Request, db: Database = Depends(get_db)) -> Optional[dict]:
    """Resolve a signed account when present, without disabling guest workflows."""
    if has_proxy_signature_headers(request):
        valid, email, _ = verify_proxy_signature(request)
        if not valid:
            raise HTTPException(status_code=401, detail="Invalid trusted proxy signature.")
        if not email:
            return None
        query_email = (request.query_params.get("email") or "").strip().lower()
        if query_email and query_email != email:
            raise HTTPException(status_code=403, detail="Client email does not match authenticated user.")
        user = await db.users.get_user_by_email(email)
        if not user:
            return None
        enriched = dict(user)
        enriched["email"] = email
        return enriched
    if get_settings().is_production:
        return None
    email = _resolve_legacy_email(email=None, request=request)
    if not email:
        return None
    user = await db.users.get_user_by_email(email)
    if not user:
        return None
    enriched = dict(user)
    enriched["email"] = email
    return enriched


async def _require_admin_with_capability(
    *,
    email: Optional[str] = None,
    request: Request = None,
    db: Database,
    capability: Optional[str],
) -> dict:
    authenticated_email = await _resolve_authenticated_email(request=request, email=email)

    is_admin = await db.users.is_admin(email=authenticated_email)
    if not is_admin:
        raise HTTPException(status_code=403, detail="Access denied. Admin rights required.")

    user = await db.users.get_user_by_email(authenticated_email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    raw_role = user.get("admin_role")
    admin_role = _normalize_admin_role(raw_role)
    if admin_role is None:
        logger.warning("Missing or invalid admin_role='%s' for user email=%s", raw_role, authenticated_email)
        raise HTTPException(status_code=403, detail="Access denied. Invalid or unassigned admin role.")

    if capability and not has_admin_capability(admin_role, capability):
        raise HTTPException(status_code=403, detail="Access denied. Insufficient admin role.")

    enriched_user = dict(user)
    enriched_user["email"] = authenticated_email
    enriched_user["admin_role"] = admin_role
    enriched_user["permissions"] = get_role_permissions(admin_role)
    enriched_user["is_super_admin"] = admin_role == ADMIN_ROLE_SUPER_ADMIN
    return enriched_user


async def require_admin(
    email: Optional[str] = None,
    request: Request = None,
    db: Database = Depends(get_db),
) -> dict:
    """FastAPI dependency and helper enforcing content_manage capability (no query-param capability override)."""
    return await _require_admin_with_capability(
        email=email,
        request=request,
        db=db,
        capability=CAPABILITY_CONTENT_MANAGE,
    )


async def require_admin_any_admin(
    email: Optional[str] = None,
    request: Request = None,
    db: Database = Depends(get_db),
) -> dict:
    return await _require_admin_with_capability(email=email, request=request, db=db, capability=None)


async def require_admin_review_manage(
    email: Optional[str] = None,
    request: Request = None,
    db: Database = Depends(get_db),
) -> dict:
    return await _require_admin_with_capability(
        email=email,
        request=request,
        db=db,
        capability=CAPABILITY_REVIEW_MANAGE,
    )


async def require_admin_super_critical(
    email: Optional[str] = None,
    request: Request = None,
    db: Database = Depends(get_db),
) -> dict:
    return await _require_admin_with_capability(
        email=email,
        request=request,
        db=db,
        capability=CAPABILITY_SUPER_CRITICAL,
    )
