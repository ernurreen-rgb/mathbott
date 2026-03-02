"""
User repository for user-related database operations
"""
import aiosqlite
import json
import logging
import time
from typing import Optional, Dict, Any, List
from models.db_models import League
from .base import BaseRepository

logger = logging.getLogger(__name__)

ADMIN_ROLE_CONTENT_EDITOR = "content_editor"
ADMIN_ROLE_REVIEWER = "reviewer"
ADMIN_ROLE_SUPER_ADMIN = "super_admin"
ALLOWED_ADMIN_ROLES = {
    ADMIN_ROLE_CONTENT_EDITOR,
    ADMIN_ROLE_REVIEWER,
    ADMIN_ROLE_SUPER_ADMIN,
}


class AdminRoleConflictError(Exception):
    """Raised when strict expected admin state does not match current state."""


class LastSuperAdminError(Exception):
    """Raised when operation would remove or demote the last super admin."""


def _normalize_admin_role(role: Optional[str]) -> Optional[str]:
    if role is None:
        return None
    normalized = str(role).strip().lower()
    if not normalized:
        return None
    if normalized not in ALLOWED_ADMIN_ROLES:
        raise ValueError(
            f"Invalid admin role '{role}'. Allowed: {', '.join(sorted(ALLOWED_ADMIN_ROLES))}"
        )
    return normalized


class UserRepository(BaseRepository):
    """Repository for user operations"""
    
    async def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        """Get user by email"""
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM users WHERE email = ?", (email,)
            ) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else None

    async def get_user_by_id(self, user_id: int) -> Optional[Dict[str, Any]]:
        """Get user by ID"""
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM users WHERE id = ?", (user_id,)
            ) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else None

    async def create_user_by_email(self, email: str, check_admin_email: Optional[str] = None) -> Dict[str, Any]:
        """Create new user by email (for web users without telegram_id)"""
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            # Check if user already exists
            async with db.execute(
                "SELECT * FROM users WHERE email = ?", (email,)
            ) as cursor:
                existing = await cursor.fetchone()
                if existing:
                    return dict(existing)
            
            # Assign to a league group (simple round-robin)
            async with db.execute("SELECT COUNT(*) as count FROM users") as cursor:
                count_row = await cursor.fetchone()
                group = (count_row["count"] // 30) if count_row else 0

            # Generate a unique negative telegram_id from email hash
            email_hash = hash(email)
            dummy_telegram_id = -(abs(email_hash) % (2**31 - 1))
            
            # Check if this ID already exists
            async with db.execute("SELECT * FROM users WHERE telegram_id = ?", (dummy_telegram_id,)) as cursor:
                existing_id = await cursor.fetchone()
                if existing_id:
                    dummy_telegram_id = -(abs(email_hash + int(time.time())) % (2**31 - 1))
            
            # Check if this email should be admin
            is_admin = False
            admin_role = None
            if check_admin_email and email.lower() == check_admin_email.lower():
                is_admin = True
                admin_role = ADMIN_ROLE_SUPER_ADMIN
            
            await db.execute(
                """INSERT INTO users (telegram_id, email, league, league_group, is_admin, admin_role)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    dummy_telegram_id,
                    email,
                    League.KOLA.value,
                    group,
                    1 if is_admin else 0,
                    admin_role,
                )
            )
            await db.commit()

            async with db.execute(
                "SELECT * FROM users WHERE email = ?", (email,)
            ) as cursor:
                row = await cursor.fetchone()
                return dict(row)

    async def update_user_nickname(self, email: str, nickname: str):
        """Update user nickname"""
        async with self._connection() as db:
            await db.execute(
                "UPDATE users SET nickname = ? WHERE email = ?",
                (nickname, email)
            )
            await db.commit()

    async def get_all_users(self) -> List[Dict[str, Any]]:
        """Get all users"""
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM users ORDER BY id") as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]

    async def list_admin_users(
        self,
        *,
        search: Optional[str] = None,
        role: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """List admin users with RBAC roles."""
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            roles = sorted(ALLOWED_ADMIN_ROLES)
            where = [
                "is_admin = 1",
                "email IS NOT NULL",
                f"admin_role IN ({','.join(['?'] * len(roles))})",
            ]
            params: List[Any] = [*roles]

            cleaned_search = " ".join((search or "").strip().split()).lower()
            if cleaned_search:
                where.append("LOWER(email) LIKE ?")
                params.append(f"%{cleaned_search}%")

            normalized_role = _normalize_admin_role(role) if role is not None else None
            if normalized_role:
                where.append("admin_role = ?")
                params.append(normalized_role)

            where_clause = " AND ".join(where)
            async with db.execute(
                f"SELECT COUNT(*) FROM users WHERE {where_clause}",
                params,
            ) as cursor:
                row = await cursor.fetchone()
                total = int(row[0]) if row else 0

            async with db.execute(
                f"""
                SELECT id, email, admin_role, created_at, last_active
                FROM users
                WHERE {where_clause}
                ORDER BY last_active DESC, id DESC
                LIMIT ? OFFSET ?
                """,
                [*params, limit, offset],
            ) as cursor:
                rows = await cursor.fetchall()

            items: List[Dict[str, Any]] = []
            for row in rows:
                item = dict(row)
                item["role"] = item.pop("admin_role")
                items.append(item)

            return {
                "items": items,
                "total": total,
                "limit": limit,
                "offset": offset,
                "has_more": (offset + limit) < total,
            }

    async def get_admin_audit_log_by_id(self, audit_id: int) -> Optional[Dict[str, Any]]:
        """Get one admin audit row by id."""
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """
                SELECT id, domain, action, entity_type, entity_id, actor_user_id, actor_email,
                       summary, changed_fields_json, metadata_json, created_at
                FROM admin_audit_logs
                WHERE id = ?
                """,
                (audit_id,),
            ) as cursor:
                row = await cursor.fetchone()
            if not row:
                return None
            item = dict(row)
            try:
                item["changed_fields"] = json.loads(item.pop("changed_fields_json", "[]") or "[]")
            except Exception:
                item["changed_fields"] = []
            try:
                item["metadata"] = json.loads(item.pop("metadata_json", "{}") or "{}")
            except Exception:
                item["metadata"] = {}
            return item

    async def is_admin(self, user_id: Optional[int] = None, email: Optional[str] = None) -> bool:
        """Check if user is admin"""
        async with self._connection() as db:
            if user_id:
                async with db.execute(
                    "SELECT is_admin FROM users WHERE id = ?", (user_id,)
                ) as cursor:
                    row = await cursor.fetchone()
                    return bool(row[0]) if row else False
            elif email:
                async with db.execute(
                    "SELECT is_admin FROM users WHERE email = ?", (email,)
                ) as cursor:
                    row = await cursor.fetchone()
                    return bool(row[0]) if row else False
            return False

    async def set_admin(self, user_id: Optional[int] = None, email: Optional[str] = None, is_admin: bool = True):
        """Set admin status for user"""
        async with self._connection() as db:
            if user_id:
                if is_admin:
                    await db.execute(
                        """
                        UPDATE users
                        SET is_admin = 1,
                            admin_role = COALESCE(NULLIF(TRIM(admin_role), ''), ?)
                        WHERE id = ?
                        """,
                        (ADMIN_ROLE_SUPER_ADMIN, user_id),
                    )
                else:
                    await db.execute(
                        "UPDATE users SET is_admin = 0, admin_role = NULL WHERE id = ?",
                        (user_id,),
                    )
            elif email:
                if is_admin:
                    await db.execute(
                        """
                        UPDATE users
                        SET is_admin = 1,
                            admin_role = COALESCE(NULLIF(TRIM(admin_role), ''), ?)
                        WHERE email = ?
                        """,
                        (ADMIN_ROLE_SUPER_ADMIN, email),
                    )
                else:
                    await db.execute(
                        "UPDATE users SET is_admin = 0, admin_role = NULL WHERE email = ?",
                        (email,),
                    )
            await db.commit()

    async def get_admin_role(self, user_id: Optional[int] = None, email: Optional[str] = None) -> Optional[str]:
        """Get normalized admin role for user."""
        async with self._connection() as db:
            row = None
            if user_id:
                async with db.execute(
                    "SELECT admin_role FROM users WHERE id = ?",
                    (user_id,),
                ) as cursor:
                    row = await cursor.fetchone()
            elif email:
                async with db.execute(
                    "SELECT admin_role FROM users WHERE email = ?",
                    (email,),
                ) as cursor:
                    row = await cursor.fetchone()
            if not row:
                return None
            try:
                return _normalize_admin_role(row[0])
            except ValueError:
                logger.warning("Invalid admin_role in DB for user_id=%s email=%s", user_id, email)
                return None

    async def set_admin_role(
        self,
        *,
        role: Optional[str],
        user_id: Optional[int] = None,
        email: Optional[str] = None,
    ) -> None:
        """Set admin role (and sync is_admin flag)."""
        normalized_role = _normalize_admin_role(role)
        is_admin_value = 1 if normalized_role else 0
        async with self._connection() as db:
            if user_id:
                await db.execute(
                    "UPDATE users SET is_admin = ?, admin_role = ? WHERE id = ?",
                    (is_admin_value, normalized_role, user_id),
                )
            elif email:
                await db.execute(
                    "UPDATE users SET is_admin = ?, admin_role = ? WHERE email = ?",
                    (is_admin_value, normalized_role, email),
                )
            await db.commit()

    async def set_admin_with_role(
        self,
        *,
        is_admin: bool,
        role: Optional[str] = None,
        user_id: Optional[int] = None,
        email: Optional[str] = None,
    ) -> None:
        """Set admin flag and role atomically."""
        normalized_role = _normalize_admin_role(role)
        effective_role = normalized_role
        if is_admin and effective_role is None:
            effective_role = ADMIN_ROLE_SUPER_ADMIN
        if not is_admin:
            effective_role = None
        await self.set_admin_role(role=effective_role, user_id=user_id, email=email)

    async def change_admin_role_with_audit(
        self,
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
        """Set admin role flag and persist role_change audit event on real changes."""
        normalized_role: Optional[str] = None
        if set_admin:
            normalized_role = _normalize_admin_role(role)
            if normalized_role is None:
                raise ValueError("role is required")
        else:
            normalized_role = None

        normalized_expected_role: Optional[str] = None
        if expected_current_role is not None:
            normalized_expected_role = _normalize_admin_role(expected_current_role)
        if expected_current_is_admin is not None and not isinstance(expected_current_is_admin, bool):
            raise ValueError("expected_current_is_admin must be boolean")

        normalized_target_email = " ".join((target_email or "").strip().split()).lower()
        if not normalized_target_email:
            raise ValueError("target_email is required")

        normalized_actor_email = " ".join((actor_email or "").strip().split()).lower() or "unknown"

        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            try:
                async with db.execute(
                    "SELECT id, email, is_admin, admin_role FROM users WHERE email = ?",
                    (normalized_target_email,),
                ) as cursor:
                    row = await cursor.fetchone()

                if not row:
                    raise ValueError("Target user not found")

                target_user_id = int(row["id"])
                target_user_email = row["email"] or normalized_target_email
                previous_is_admin = bool(row["is_admin"])

                try:
                    previous_role = _normalize_admin_role(row["admin_role"])
                except ValueError:
                    logger.warning(
                        "Invalid existing admin_role while changing role for user_id=%s email=%s",
                        target_user_id,
                        target_user_email,
                    )
                    previous_role = None

                if expected_current_is_admin is not None and previous_is_admin != expected_current_is_admin:
                    raise AdminRoleConflictError("Expected current is_admin does not match target user state")
                if expected_current_role is not None and previous_role != normalized_expected_role:
                    raise AdminRoleConflictError("Expected current role does not match target user state")

                new_is_admin = bool(set_admin)
                if previous_role == ADMIN_ROLE_SUPER_ADMIN and (not new_is_admin or normalized_role != ADMIN_ROLE_SUPER_ADMIN):
                    async with db.execute(
                        """
                        SELECT COUNT(*)
                        FROM users
                        WHERE is_admin = 1
                          AND admin_role = ?
                        """,
                        (ADMIN_ROLE_SUPER_ADMIN,),
                    ) as count_cursor:
                        count_row = await count_cursor.fetchone()
                    super_admin_count = int(count_row[0]) if count_row else 0
                    if super_admin_count <= 1:
                        raise LastSuperAdminError("At least one super_admin must remain")

                changed = (previous_is_admin != new_is_admin) or (previous_role != normalized_role)
                result: Dict[str, Any] = {
                    "changed": changed,
                    "previous_role": previous_role,
                    "new_role": normalized_role,
                    "previous_is_admin": previous_is_admin,
                    "new_is_admin": new_is_admin,
                    "target_user": {
                        "id": target_user_id,
                        "email": target_user_email,
                        "previous_role": previous_role,
                        "new_role": normalized_role,
                        "previous_is_admin": previous_is_admin,
                        "new_is_admin": new_is_admin,
                    },
                    "audit_id": None,
                }

                if not changed:
                    return result

                if new_is_admin:
                    await db.execute(
                        "UPDATE users SET is_admin = 1, admin_role = ? WHERE id = ?",
                        (normalized_role, target_user_id),
                    )
                else:
                    await db.execute(
                        "UPDATE users SET is_admin = 0, admin_role = NULL WHERE id = ?",
                        (target_user_id,),
                    )

                from_display = previous_role if previous_role is not None else "null"
                to_display = normalized_role if normalized_role is not None else "null"
                if new_is_admin:
                    summary = f"Role changed for {target_user_email}: {from_display} -> {to_display}"
                else:
                    summary = f"Admin access removed for {target_user_email}: {from_display} -> null"

                changed_fields: List[str] = []
                if previous_is_admin != new_is_admin:
                    changed_fields.append("is_admin")
                if previous_role != normalized_role:
                    changed_fields.append("admin_role")

                metadata = {
                    "target_user_id": target_user_id,
                    "target_email": target_user_email,
                    "from_role": previous_role,
                    "to_role": normalized_role,
                    "from_is_admin": previous_is_admin,
                    "to_is_admin": new_is_admin,
                    "source": source,
                    "actor_verified": bool(actor_verified),
                }
                if restored_from_audit_id is not None:
                    metadata["restored_from_audit_id"] = int(restored_from_audit_id)
                if expected_current_role is not None:
                    metadata["restore_expected_to_role"] = normalized_expected_role
                if expected_current_is_admin is not None:
                    metadata["restore_expected_to_is_admin"] = bool(expected_current_is_admin)
                audit_cursor = await db.execute(
                    """
                    INSERT INTO admin_audit_logs
                    (
                        domain, action, entity_type, entity_id,
                        actor_user_id, actor_email, summary,
                        changed_fields_json, metadata_json
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        "bank",
                        "role_change",
                        "admin_user",
                        target_user_id,
                        actor_user_id,
                        normalized_actor_email,
                        summary,
                        json.dumps(changed_fields, ensure_ascii=False),
                        json.dumps(metadata, ensure_ascii=False),
                    ),
                )
                result["audit_id"] = int(audit_cursor.lastrowid)
                await db.commit()
                return result
            except Exception:
                await db.rollback()
                raise

    async def get_solved_task_ids(self, user_id: int) -> List[int]:
        """Get list of task IDs that user has solved correctly"""
        async with self._connection() as db:
            async with db.execute(
                "SELECT DISTINCT task_id FROM solutions WHERE user_id = ? AND is_correct = 1",
                (user_id,)
            ) as cursor:
                rows = await cursor.fetchall()
                return [row[0] for row in rows]

    async def award_task_reward_once(
        self,
        *,
        user_id: int,
        reward_key: str,
        bank_task_id: Optional[int],
        difficulty: str,
        points: int,
        source: str,
        source_ref_id: Optional[int],
    ) -> Dict[str, Any]:
        """Award task points once per unique reward key for a user."""
        async with self._connection() as db:
            try:
                await db.execute(
                    """
                    INSERT INTO user_task_rewards
                    (user_id, reward_key, bank_task_id, difficulty, points_awarded, source, source_ref_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        user_id,
                        reward_key,
                        bank_task_id,
                        difficulty,
                        points,
                        source,
                        source_ref_id,
                    ),
                )
            except aiosqlite.IntegrityError:
                return {"awarded": False, "points": 0}

            await db.execute(
                """
                UPDATE users SET
                    total_points = total_points + ?,
                    week_points = week_points + ?,
                    total_solved = total_solved + 1,
                    week_solved = week_solved + 1,
                    last_active = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (points, points, user_id),
            )
            await db.commit()
            return {"awarded": True, "points": points}

    async def update_streak(self, user_id: int):
        """Update user streak - increment if solved today or yesterday, reset if longer gap"""
        try:
            async with self._connection() as db:
                async with db.execute(
                    "SELECT streak, last_streak_date FROM users WHERE id = ?", (user_id,)
                ) as cursor:
                    row = await cursor.fetchone()
                    if not row:
                        return
                    
                    current_streak = row[0] or 0
                    last_streak_date_str = row[1]
                    
                    from datetime import date, datetime
                    today = date.today()
                    
                    if last_streak_date_str:
                        try:
                            if isinstance(last_streak_date_str, str):
                                if ' ' in last_streak_date_str:
                                    last_streak_date = datetime.strptime(last_streak_date_str.split()[0], "%Y-%m-%d").date()
                                else:
                                    last_streak_date = datetime.strptime(last_streak_date_str, "%Y-%m-%d").date()
                            else:
                                last_streak_date = last_streak_date_str
                            
                            days_diff = (today - last_streak_date).days
                            
                            if days_diff == 0:
                                new_streak = current_streak
                            elif days_diff == 1:
                                new_streak = current_streak + 1
                            else:
                                new_streak = 1
                        except Exception as e:
                            import logging
                            logger = logging.getLogger(__name__)
                            logger.error(f"Error parsing streak date: {e}, value: {last_streak_date_str}")
                            new_streak = 1
                    else:
                        new_streak = 1
                    
                    await db.execute(
                        """UPDATE users SET streak = ?, last_streak_date = ? WHERE id = ?""",
                        (new_streak, today.isoformat(), user_id)
                    )
                    await db.commit()
                    
                    if new_streak > current_streak and new_streak in [7, 30, 100]:
                        try:
                            from utils.notifications import send_streak_notification
                            user = await self.get_user_by_id(user_id)
                            if user and user.get("email"):
                                await send_streak_notification(user["email"], new_streak)
                        except Exception as e:
                            import logging
                            logger = logging.getLogger(__name__)
                            logger.error(f"Error sending streak notification: {e}", exc_info=True)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error updating streak for user {user_id}: {e}", exc_info=True)

