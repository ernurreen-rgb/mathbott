"""
Admin role management routes.
"""
from .common import *  # noqa: F401,F403


def _legacy_role_bootstrap_enabled() -> bool:
    environment = os.getenv("ENVIRONMENT", "development").strip().lower() or "development"
    if environment != "production":
        return True
    return os.getenv("ALLOW_LEGACY_ADMIN_BOOTSTRAP", "false").strip().lower() == "true"


def register_roles_routes(app: FastAPI, db: Database, limiter: Limiter):
    async def _change_admin_role_common(
        *,
        target_email: str,
        role: Optional[str],
        set_admin: bool,
        actor_user_id: Optional[int],
        actor_email: Optional[str],
        source: str,
        actor_verified: bool,
        expected_current_role: Optional[str] = None,
        expected_current_is_admin: Optional[bool] = None,
        restored_from_audit_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        try:
            normalized_target_email = validate_email(target_email)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        normalized_role: Optional[str] = None
        if set_admin:
            normalized_role = str(role or "").strip().lower()
            if normalized_role not in ADMIN_ROLES:
                raise HTTPException(
                    status_code=400,
                    detail="role must be one of content_editor, reviewer, super_admin",
                )

        user = await db.get_user_by_email(normalized_target_email)
        if not user:
            if not set_admin:
                raise HTTPException(status_code=404, detail="Target user not found")
            admin_email_env = os.getenv("ADMIN_EMAIL")
            await db.create_user_by_email(normalized_target_email, check_admin_email=admin_email_env)

        try:
            return await db.change_admin_role_with_audit(
                target_email=normalized_target_email,
                role=normalized_role,
                set_admin=set_admin,
                actor_user_id=actor_user_id,
                actor_email=actor_email,
                source=source,
                actor_verified=actor_verified,
                expected_current_role=expected_current_role,
                expected_current_is_admin=expected_current_is_admin,
                restored_from_audit_id=restored_from_audit_id,
            )
        except LastSuperAdminError:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "LAST_SUPER_ADMIN_REQUIRED",
                    "message": "At least one super_admin must remain in the system.",
                },
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    if _legacy_role_bootstrap_enabled():
        @app.post("/api/admin/set-role")
        async def set_admin_role_endpoint(
            email: str = Query(...),
            role: str = Query(...),
            secret: str = Query(...),
            db: Database = Depends(get_db),
        ):
            """Set RBAC admin role for user (development only)."""
            admin_secret = os.getenv("ADMIN_SECRET", "change-me-in-production")
            if not admin_secret or admin_secret == "change-me-in-production":
                raise HTTPException(status_code=500, detail="ADMIN_SECRET not configured")
            if secret != admin_secret:
                logger.warning("Failed set-role attempt with invalid secret for %s", email)
                raise HTTPException(status_code=403, detail="Invalid secret")
            role_result = await _change_admin_role_common(
                target_email=email,
                role=role,
                set_admin=True,
                actor_user_id=None,
                actor_email="legacy_secret",
                source="legacy_set_role",
                actor_verified=False,
            )
            logger.info(
                "Admin role changed via legacy API for %s: %s -> %s (changed=%s)",
                role_result["target_user"]["email"],
                role_result["previous_role"],
                role_result["new_role"],
                role_result["changed"],
            )
            return {
                "success": True,
                "changed": role_result["changed"],
                "message": f"User {role_result['target_user']['email']} role set to {role_result['new_role']}",
            }

    @app.get("/api/admin/roles")
    async def get_admin_roles(
        admin_user: dict = Depends(require_admin_super_critical),
        db: Database = Depends(get_db),
        search: Optional[str] = Query(None),
        role: Optional[str] = Query(None),
        limit: int = Query(20, ge=1, le=100),
        offset: int = Query(0, ge=0),
    ):
        normalized_role: Optional[str] = None
        if role is not None and role.strip():
            normalized_role = role.strip().lower()
            if normalized_role not in ADMIN_ROLES:
                raise HTTPException(
                    status_code=400,
                    detail="role must be one of content_editor, reviewer, super_admin",
                )
        return await db.list_admin_users(
            search=search,
            role=normalized_role,
            limit=limit,
            offset=offset,
        )

    @app.post("/api/admin/roles")
    async def set_admin_role_by_super(
        payload: dict = Body(...),
        admin_user: dict = Depends(require_admin_super_critical),
        db: Database = Depends(get_db),
    ):
        target_email = payload.get("target_email")
        role = payload.get("role")
        remove_admin = payload.get("remove_admin", False)
        if remove_admin is None:
            remove_admin = False
        if not isinstance(target_email, str) or not target_email.strip():
            raise HTTPException(status_code=400, detail="target_email is required")
        if not isinstance(remove_admin, bool):
            raise HTTPException(status_code=400, detail="remove_admin must be boolean")
        if remove_admin:
            if target_email.strip().lower() == str(admin_user.get("email") or "").strip().lower():
                raise HTTPException(status_code=400, detail="Cannot remove your own admin access")
        else:
            if not isinstance(role, str) or not role.strip():
                raise HTTPException(status_code=400, detail="role is required")

        role_result = await _change_admin_role_common(
            target_email=target_email,
            role=role if isinstance(role, str) else None,
            set_admin=(not remove_admin),
            actor_user_id=admin_user.get("id"),
            actor_email=admin_user.get("email"),
            source="admin_roles_ui",
            actor_verified=True,
        )
        logger.info(
            "Admin role changed by super-admin %s for %s: %s -> %s (changed=%s)",
            admin_user.get("email"),
            role_result["target_user"]["email"],
            role_result["previous_role"],
            role_result["new_role"],
            role_result["changed"],
        )
        response: Dict[str, Any] = {
            "success": True,
            "changed": role_result["changed"],
            "target_user": role_result["target_user"],
        }
        if role_result["changed"] and role_result.get("audit_id") is not None:
            response["audit_id"] = role_result["audit_id"]
        return response

    @app.post("/api/admin/roles/restore")
    async def restore_admin_role_from_audit(
        payload: dict = Body(...),
        admin_user: dict = Depends(require_admin_super_critical),
        db: Database = Depends(get_db),
    ):
        audit_id_raw = payload.get("audit_id")
        if audit_id_raw is None:
            raise HTTPException(status_code=400, detail="audit_id is required")
        try:
            audit_id = int(audit_id_raw)
        except Exception:
            raise HTTPException(status_code=400, detail="audit_id must be integer")
        if audit_id < 1:
            raise HTTPException(status_code=400, detail="audit_id must be >= 1")

        audit_item = await db.get_admin_audit_log_by_id(audit_id)
        if not audit_item:
            raise HTTPException(
                status_code=404,
                detail={
                    "code": "ROLE_RESTORE_AUDIT_NOT_FOUND",
                    "message": "Audit event not found",
                },
            )
        if (
            audit_item.get("domain") != "bank"
            or audit_item.get("action") != "role_change"
            or audit_item.get("entity_type") != "admin_user"
        ):
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "ROLE_RESTORE_INVALID_EVENT",
                    "message": "Audit event cannot be used for role restore",
                },
            )

        metadata = audit_item.get("metadata")
        if not isinstance(metadata, dict):
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "ROLE_RESTORE_INVALID_EVENT",
                    "message": "Audit event metadata is invalid",
                },
            )

        target_email = metadata.get("target_email")
        from_role = metadata.get("from_role")
        to_role = metadata.get("to_role")
        from_is_admin = metadata.get("from_is_admin")
        to_is_admin = metadata.get("to_is_admin")

        if not isinstance(target_email, str) or not target_email.strip():
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "ROLE_RESTORE_INVALID_EVENT",
                    "message": "Audit event metadata is invalid",
                },
            )
        if not isinstance(from_is_admin, bool) or not isinstance(to_is_admin, bool):
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "ROLE_RESTORE_INVALID_EVENT",
                    "message": "Audit event metadata is invalid",
                },
            )
        if from_is_admin and (not isinstance(from_role, str) or not from_role.strip()):
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "ROLE_RESTORE_INVALID_EVENT",
                    "message": "Audit event metadata is invalid",
                },
            )
        if to_is_admin and (not isinstance(to_role, str) or not to_role.strip()):
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "ROLE_RESTORE_INVALID_EVENT",
                    "message": "Audit event metadata is invalid",
                },
            )
        if from_role is not None and not isinstance(from_role, str):
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "ROLE_RESTORE_INVALID_EVENT",
                    "message": "Audit event metadata is invalid",
                },
            )
        if to_role is not None and not isinstance(to_role, str):
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "ROLE_RESTORE_INVALID_EVENT",
                    "message": "Audit event metadata is invalid",
                },
            )
        if isinstance(from_role, str) and from_role.strip().lower() not in ADMIN_ROLES:
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "ROLE_RESTORE_INVALID_EVENT",
                    "message": "Audit event metadata is invalid",
                },
            )
        if isinstance(to_role, str) and to_role.strip().lower() not in ADMIN_ROLES:
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "ROLE_RESTORE_INVALID_EVENT",
                    "message": "Audit event metadata is invalid",
                },
            )

        try:
            role_result = await _change_admin_role_common(
                target_email=target_email,
                role=from_role if isinstance(from_role, str) else None,
                set_admin=from_is_admin,
                actor_user_id=admin_user.get("id"),
                actor_email=admin_user.get("email"),
                source="admin_roles_restore",
                actor_verified=True,
                expected_current_role=to_role if isinstance(to_role, str) else None,
                expected_current_is_admin=to_is_admin,
                restored_from_audit_id=audit_id,
            )
        except AdminRoleConflictError:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "ROLE_RESTORE_CONFLICT",
                    "message": "Current target user role state differs from selected audit event.",
                },
            )
        except LastSuperAdminError:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "LAST_SUPER_ADMIN_REQUIRED",
                    "message": "At least one super_admin must remain in the system.",
                },
            )

        response: Dict[str, Any] = {
            "success": True,
            "changed": role_result["changed"],
            "target_user": role_result["target_user"],
            "restored_from_audit_id": audit_id,
        }
        if role_result["changed"] and role_result.get("audit_id") is not None:
            response["audit_id"] = role_result["audit_id"]
        return response

