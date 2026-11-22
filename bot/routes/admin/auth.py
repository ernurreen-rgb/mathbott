"""
Admin auth and admin-check routes.
"""
from utils.admin_roles import normalize_admin_role

from .common import (
    ADMIN_ROLE_SUPER_ADMIN,
    DEFAULT_ADMIN_SECRET,
    Database,
    Depends,
    FastAPI,
    HTTPException,
    Limiter,
    Optional,
    Query,
    get_db,
    get_role_permissions,
    get_settings,
    hmac,
    logger,
    require_internal_identity,
    validate_email,
)


def _legacy_admin_bootstrap_enabled() -> bool:
    settings = get_settings()
    return (not settings.is_production) and settings.allow_legacy_admin_bootstrap


def register_auth_routes(app: FastAPI, db: Database, limiter: Limiter):
    @app.get("/api/admin/check")
    async def check_admin(
        current_user: dict = Depends(require_internal_identity),
        db: Database = Depends(get_db),
    ):
        """Check admin status for the authenticated proxy user.

        Every page's menu asks this, so it answers from the user row the identity check already
        loaded instead of reading that row again.
        """
        is_admin = bool(current_user.get("is_admin"))
        role: Optional[str] = None
        if is_admin:
            role_raw = current_user.get("admin_role")
            role = normalize_admin_role(role_raw)
            if role is None:
                logger.warning(
                    "Missing or invalid admin role '%s' for user id=%s", role_raw, current_user.get("id")
                )
                is_admin = False
        return {
            "is_admin": is_admin,
            "role": role,
            "is_super_admin": role == ADMIN_ROLE_SUPER_ADMIN if role else False,
            "permissions": get_role_permissions(role),
            "user": {
                "id": current_user.get("id"),
                "email": current_user.get("email"),
                "nickname": current_user.get("nickname"),
            },
        }

    if not _legacy_admin_bootstrap_enabled():
        return

    @app.post("/api/admin/set-admin")
    async def set_admin_endpoint(
        email: str = Query(...),
        secret: str = Query(...),
        db: Database = Depends(get_db),
    ):
        """Legacy endpoint: set admin role to super_admin (development only)."""
        admin_secret = get_settings().admin_secret
        if not admin_secret or admin_secret == DEFAULT_ADMIN_SECRET:
            raise HTTPException(status_code=500, detail="ADMIN_SECRET not configured")
        if not hmac.compare_digest(secret, admin_secret):
            logger.warning("Failed admin set attempt with invalid secret from %s", email)
            raise HTTPException(status_code=403, detail="Invalid secret")

        try:
            normalized_email = validate_email(email)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        user = await db.users.get_user_by_email(normalized_email)
        if not user:
            admin_email_env = get_settings().admin_email
            await db.users.create_user_by_email(normalized_email, check_admin_email=admin_email_env)

        try:
            role_result = await db.users.change_admin_role_with_audit(
                target_email=normalized_email,
                role=ADMIN_ROLE_SUPER_ADMIN,
                set_admin=True,
                actor_user_id=None,
                actor_email="legacy_secret",
                source="legacy_set_admin",
                actor_verified=False,
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        logger.info(
            "Admin role set via legacy set-admin API for: %s -> %s (changed=%s)",
            role_result["target_user"]["email"],
            ADMIN_ROLE_SUPER_ADMIN,
            role_result["changed"],
        )
        return {"success": True, "message": f"User {email} is now admin"}
