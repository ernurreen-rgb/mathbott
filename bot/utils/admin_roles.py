"""Pure RBAC role and capability helpers (free of DB/FastAPI imports)."""
from __future__ import annotations

from typing import Any, Dict, List, Mapping, Optional

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


def normalize_admin_role(role: Optional[str]) -> Optional[str]:
    if role is None:
        return None
    normalized = str(role).strip().lower()
    if not normalized or normalized not in ADMIN_ROLES:
        return None
    return normalized


def get_role_permissions(role: Optional[str]) -> List[str]:
    normalized = normalize_admin_role(role)
    if normalized is None:
        return []
    return list(ROLE_PERMISSIONS.get(normalized, []))


def has_admin_capability(role: Optional[str], capability: str) -> bool:
    return capability in get_role_permissions(role)


def is_content_admin(user: Optional[Mapping[str, Any]]) -> bool:
    """Return True only when user is an admin with content_manage capability."""
    if not user or not user.get("is_admin"):
        return False
    return has_admin_capability(user.get("admin_role"), CAPABILITY_CONTENT_MANAGE)
