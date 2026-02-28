"""
Admin auth and admin-check routes.
"""
from .common import *  # noqa: F401,F403


def _legacy_admin_bootstrap_enabled() -> bool:
    environment = os.getenv("ENVIRONMENT", "development").strip().lower() or "development"
    if environment != "production":
        return True
    return os.getenv("ALLOW_LEGACY_ADMIN_BOOTSTRAP", "false").strip().lower() == "true"


def register_auth_routes(app: FastAPI, db: Database, limiter: Limiter):
    @app.get("/api/admin/check")
    async def check_admin(
        current_user: dict = Depends(require_internal_identity),
        db: Database = Depends(get_db),
    ):
        """Check admin status for the authenticated proxy user."""
        email = str(current_user.get("email") or "").strip().lower()
        is_admin = await db.is_admin(email=email)
        role: Optional[str] = None
        if is_admin:
            role_raw = await db.get_admin_role(email=email)
            if role_raw and role_raw in ADMIN_ROLES:
                role = role_raw
            elif role_raw:
                logger.warning("Invalid admin role '%s' for user %s", role_raw, email)
            else:
                role = ADMIN_ROLE_SUPER_ADMIN
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
        admin_secret = os.getenv("ADMIN_SECRET", "change-me-in-production")
        if not admin_secret or admin_secret == "change-me-in-production":
            raise HTTPException(status_code=500, detail="ADMIN_SECRET not configured")
        if secret != admin_secret:
            logger.warning("Failed admin set attempt with invalid secret from %s", email)
            raise HTTPException(status_code=403, detail="Invalid secret")

        try:
            normalized_email = validate_email(email)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        user = await db.get_user_by_email(normalized_email)
        if not user:
            admin_email_env = os.getenv("ADMIN_EMAIL")
            await db.create_user_by_email(normalized_email, check_admin_email=admin_email_env)

        try:
            role_result = await db.change_admin_role_with_audit(
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
