"""
Dependency injection helpers for FastAPI routes.
"""
from __future__ import annotations

import logging
import os
from typing import Dict, List, Optional

import aiosqlite
from fastapi import Depends, HTTPException, Query, Request
from slowapi import Limiter

from database import Database
from utils.internal_proxy_auth import has_proxy_signature_headers, verify_proxy_signature
from utils.request_context import get_current_request

logger = logging.getLogger(__name__)

ADMIN_ROLE_CONTENT_EDITOR = "content_editor"
ADMIN_ROLE_REVIEWER = "reviewer"
ADMIN_ROLE_SUPER_ADMIN = "super_admin"
ADMIN_ROLES = {
    ADMIN_ROLE_CONTENT_EDITOR,
    ADMIN_ROLE_REVIEWER,
    ADMIN_ROLE_SUPER_ADMIN,
}

CAPABILITY_CONTENT_MANAGE = "content_manage"
CAPABILITY_REVIEW_MANAGE = "review_manage"
CAPABILITY_SUPER_CRITICAL = "super_critical"

ROLE_PERMISSIONS: Dict[str, List[str]] = {
    ADMIN_ROLE_CONTENT_EDITOR: [CAPABILITY_CONTENT_MANAGE],
    ADMIN_ROLE_REVIEWER: [CAPABILITY_REVIEW_MANAGE],
    ADMIN_ROLE_SUPER_ADMIN: [
        CAPABILITY_CONTENT_MANAGE,
        CAPABILITY_REVIEW_MANAGE,
        CAPABILITY_SUPER_CRITICAL,
    ],
}


async def get_db(request: Request) -> Database:
    return request.app.state.db


async def get_limiter(request: Request) -> Limiter:
    return request.app.state.limiter


def _get_runtime_environment() -> str:
    return os.getenv("ENVIRONMENT", "development").strip().lower() or "development"


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
    environment = _get_runtime_environment()

    if resolved_request is not None and has_proxy_signature_headers(resolved_request):
        is_valid_proxy, proxy_email, _ = verify_proxy_signature(resolved_request)
        if not is_valid_proxy:
            raise HTTPException(status_code=401, detail="Invalid trusted proxy signature.")
        if not proxy_email:
            raise HTTPException(status_code=401, detail="Authenticated proxy user is missing.")
        return proxy_email

    if environment == "production":
        raise HTTPException(status_code=401, detail="Trusted proxy authentication required.")

    fallback_email = _resolve_legacy_email(email=email, request=resolved_request)
    if not fallback_email:
        raise HTTPException(status_code=401, detail="Authenticated user identity is required.")
    return fallback_email


def _normalize_admin_role(role: Optional[str]) -> Optional[str]:
    if role is None:
        return None
    normalized = str(role).strip().lower()
    if not normalized:
        return None
    if normalized not in ADMIN_ROLES:
        return None
    return normalized


def get_role_permissions(role: Optional[str]) -> List[str]:
    normalized = _normalize_admin_role(role)
    if normalized is None:
        return []
    return list(ROLE_PERMISSIONS.get(normalized, []))


def has_admin_capability(role: Optional[str], capability: str) -> bool:
    return capability in get_role_permissions(role)


async def require_internal_identity(
    request: Request = None,
    email: Optional[str] = None,
    db: Database = Depends(get_db),
) -> dict:
    authenticated_email = await _resolve_authenticated_email(request=request, email=email)
    user = await db.get_user_by_email(authenticated_email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    enriched_user = dict(user)
    enriched_user["email"] = authenticated_email
    return enriched_user


async def require_admin(
    email: Optional[str] = None,
    request: Request = None,
    db: Database = Depends(get_db),
    capability: Optional[str] = CAPABILITY_CONTENT_MANAGE,
) -> dict:
    authenticated_email = await _resolve_authenticated_email(request=request, email=email)

    is_admin = await db.is_admin(email=authenticated_email)
    if not is_admin:
        raise HTTPException(status_code=403, detail="Access denied. Admin rights required.")

    user = await db.get_user_by_email(authenticated_email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    raw_role = user.get("admin_role")
    admin_role = _normalize_admin_role(raw_role)
    if raw_role is not None and str(raw_role).strip() and admin_role is None:
        logger.warning("Invalid admin_role='%s' for user email=%s", raw_role, authenticated_email)
        raise HTTPException(status_code=403, detail="Access denied. Invalid admin role.")
    if admin_role is None:
        admin_role = ADMIN_ROLE_SUPER_ADMIN

    if capability and not has_admin_capability(admin_role, capability):
        raise HTTPException(status_code=403, detail="Access denied. Insufficient admin role.")

    enriched_user = dict(user)
    enriched_user["email"] = authenticated_email
    enriched_user["admin_role"] = admin_role
    enriched_user["permissions"] = get_role_permissions(admin_role)
    enriched_user["is_super_admin"] = admin_role == ADMIN_ROLE_SUPER_ADMIN
    return enriched_user


async def require_admin_any_admin(
    email: Optional[str] = None,
    request: Request = None,
    db: Database = Depends(get_db),
) -> dict:
    return await require_admin(email=email, request=request, db=db, capability=None)


async def require_admin_content_manage(
    email: Optional[str] = None,
    request: Request = None,
    db: Database = Depends(get_db),
) -> dict:
    return await require_admin(
        email=email,
        request=request,
        db=db,
        capability=CAPABILITY_CONTENT_MANAGE,
    )


async def require_admin_review_manage(
    email: Optional[str] = None,
    request: Request = None,
    db: Database = Depends(get_db),
) -> dict:
    return await require_admin(
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
    return await require_admin(
        email=email,
        request=request,
        db=db,
        capability=CAPABILITY_SUPER_CRITICAL,
    )


async def get_current_user(
    email: Optional[str] = Query(None),
    db: Database = Depends(get_db),
) -> Optional[dict]:
    if not email:
        return None
    user = await db.get_user_by_email(email)
    return user


async def get_db_connection(request: Request) -> aiosqlite.Connection:
    db: Database = request.app.state.db

    if db.connection_pool:
        conn = await db.connection_pool.acquire()
        if not hasattr(request.state, "db_connections"):
            request.state.db_connections = []
        request.state.db_connections.append(conn)
        return conn

    conn = await aiosqlite.connect(
        db.db_path,
        timeout=db.sqlite_timeout_seconds,
    )
    await db._configure_connection(conn)
    return conn
