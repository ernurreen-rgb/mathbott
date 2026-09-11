"""
Routes for users
"""
import logging
from typing import Optional
from fastapi import HTTPException, Query, Request
from slowapi import Limiter
from models.requests import NicknameUpdateRequest
from settings import get_settings
from utils.cache import cache

logger = logging.getLogger(__name__)


def setup_users_routes(app, db, limiter: Limiter):
    """Setup user routes"""
    
    @app.get("/api/user/web/{email}")
    async def get_user_web(
        email: str, 
        refresh_achievements: bool = Query(False),
        fields: Optional[str] = Query(None, description="Comma-separated list of fields to include (e.g., 'id,email,nickname')")
    ):
        """
        Get user statistics for web - creates user if doesn't exist
        
        Returns user progress and achievements.
        
        **Example Request:**
        ```
        GET /api/user/web/user@example.com?refresh_achievements=true
        ```
        
        **Example Response:**
        ```json
        {
          "id": 1,
          "email": "user@example.com",
          "nickname": "TestUser",
          "total_solved": 50,
          "total_points": 500,
          "streak": 3,
          "last_streak_date": "2024-01-15",
          "is_admin": false,
          "achievements": [
            {
              "id": 1,
              "name": "First Solve",
              "unlocked": true,
              "unlocked_at": "2024-01-10T10:00:00Z"
            }
          ]
        }
        ```
        
        **Query Parameters:**
        - `refresh_achievements` (bool): If true, recalculates achievements before returning (default: false)
        
        **Error Codes:**
        - 200: Success (user created if didn't exist)
        - 500: Internal server error
        """
        # Cache user stats (TTL 10 seconds as per plan)
        fields_key = ",".join(sorted(f.strip() for f in fields.split(",") if f.strip())) if fields else "all"
        cache_key = f"user:stats:{email}:{refresh_achievements}:{fields_key}"
        if not refresh_achievements:
            cached_stats = cache.get(cache_key)
            if cached_stats is not None:
                return cached_stats
        
        user = await db.users.get_user_by_email(email)
        if not user:
            # Auto-create user for web interface
            admin_email = get_settings().admin_email
            user = await db.users.create_user_by_email(email, check_admin_email=admin_email)
            logger.info(f"Created new web user: {email}")
            if admin_email and email.lower() == admin_email.lower():
                logger.info(f"User {email} created as admin")

        is_admin = await db.users.is_admin(email=email)
        
        # Check and update streak if needed (in case user hasn't solved today but streak needs checking)
        # Only check if last_streak_date exists and is not today
        if user.get("last_streak_date"):
            from datetime import date, datetime
            try:
                last_streak_date = datetime.strptime(user["last_streak_date"], "%Y-%m-%d").date()
                today = date.today()
                if (today - last_streak_date).days > 1:
                    # Streak might need reset, but don't update here - let it update on next solve
                    pass
            except (ValueError, TypeError):
                pass
        
        # Get user achievements (optionally refresh; default off for speed)
        achievements = await db.achievements.get_user_achievements(user["id"])
        if refresh_achievements:
            try:
                await db.check_and_unlock_achievements(user["id"])
                achievements = await db.achievements.get_user_achievements(user["id"])
            except Exception as e:
                logger.error(f"Error checking achievements: {e}", exc_info=True)

        recent_activity_timestamps = await db.users.get_recent_activity_timestamps(user["id"])
        
        # Normalize last_streak_date for the frontend (string YYYY-MM-DD or null)
        last_streak_date_value = user.get("last_streak_date")
        try:
            from datetime import date, datetime
            if isinstance(last_streak_date_value, (date, datetime)):
                last_streak_date_value = last_streak_date_value.date().isoformat() if isinstance(last_streak_date_value, datetime) else last_streak_date_value.isoformat()
            elif isinstance(last_streak_date_value, str) and " " in last_streak_date_value:
                # e.g. "2025-12-19 00:00:00" -> "2025-12-19"
                last_streak_date_value = last_streak_date_value.split()[0]
        except Exception:
            pass

        # If streak is already broken (gap >= 2 days), show 0 on web until the next solve resets it.
        streak_value = int(user.get("streak", 0) or 0)
        if last_streak_date_value:
            try:
                from datetime import date, datetime
                last_streak_date_parsed = (
                    datetime.strptime(last_streak_date_value, "%Y-%m-%d").date()
                    if isinstance(last_streak_date_value, str)
                    else last_streak_date_value
                )
                if (date.today() - last_streak_date_parsed).days > 1:
                    streak_value = 0
            except Exception:
                # If parsing fails, keep stored streak_value
                pass

        result = {
            "id": user["id"],
            "email": user["email"],
            "nickname": user.get("nickname"),
            "total_solved": user["total_solved"],
            "total_points": user["total_points"],
            "streak": streak_value,
            "last_streak_date": last_streak_date_value,
            "recent_activity_timestamps": recent_activity_timestamps,
            "is_admin": is_admin,
            "achievements": achievements
        }
        
        # Apply field selection if specified
        if fields:
            field_list = [f.strip() for f in fields.split(",")]
            filtered_result = {k: v for k, v in result.items() if k in field_list}
            # Always include id and email for identification
            if "id" not in field_list:
                filtered_result["id"] = result["id"]
            if "email" not in field_list:
                filtered_result["email"] = result["email"]
            result = filtered_result
        
        # Cache result (TTL 10 seconds as per plan)
        cache.set(cache_key, result, ttl=10)
        return result

    @app.get("/api/user/public/{identifier}")
    @limiter.limit("30/minute")
    async def get_public_user_profile(request: Request, identifier: str):
        """
        Get public user profile by ID (statistics and achievements)
        Does not require authentication; rate limited to slow down profile enumeration
        Returns public data without email and is_admin
        
        **Example Request:**
        ```
        GET /api/user/public/123
        ```
        
        **Example Response:**
        ```json
        {
          "id": 123,
          "nickname": "TestUser",
          "total_solved": 50,
          "total_points": 500,
          "streak": 3,
          "last_streak_date": "2024-01-15",
          "achievements": [...]
        }
        ```
        
        **Error Codes:**
        - 200: Success
        - 404: User not found
        - 500: Internal server error
        """
        try:
            user_id = int(identifier)
        except ValueError:
            raise HTTPException(status_code=404, detail="User not found")

        if user_id <= 0:
            raise HTTPException(status_code=404, detail="User not found")

        cache_key = f"user:public:id:{user_id}"
        cached_profile = cache.get(cache_key)
        if cached_profile is not None:
            return cached_profile

        user = await db.users.get_user_by_id(user_id)
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Check and normalize streak (same logic as get_user_web)
        last_streak_date_value = user.get("last_streak_date")
        try:
            from datetime import date, datetime
            if isinstance(last_streak_date_value, (date, datetime)):
                last_streak_date_value = last_streak_date_value.date().isoformat() if isinstance(last_streak_date_value, datetime) else last_streak_date_value.isoformat()
            elif isinstance(last_streak_date_value, str) and " " in last_streak_date_value:
                last_streak_date_value = last_streak_date_value.split()[0]
        except Exception:
            pass
        
        streak_value = int(user.get("streak", 0) or 0)
        if last_streak_date_value:
            try:
                from datetime import date, datetime
                last_streak_date_parsed = (
                    datetime.strptime(last_streak_date_value, "%Y-%m-%d").date()
                    if isinstance(last_streak_date_value, str)
                    else last_streak_date_value
                )
                if (date.today() - last_streak_date_parsed).days > 1:
                    streak_value = 0
            except Exception:
                pass
        
        # Get user achievements
        achievements = await db.achievements.get_user_achievements(user["id"])
        recent_activity_timestamps = await db.users.get_recent_activity_timestamps(user["id"])
        
        # Return public profile data (WITHOUT email and is_admin)
        result = {
            "id": user["id"],
            "nickname": user.get("nickname"),
            "total_solved": user["total_solved"],
            "total_points": user["total_points"],
            "streak": streak_value,
            "last_streak_date": last_streak_date_value,
            "recent_activity_timestamps": recent_activity_timestamps,
            "achievements": achievements
        }
        
        # Cache result (TTL 10 seconds)
        cache.set(cache_key, result, ttl=10)
        return result

    @app.post("/api/user/web/nickname")
    @limiter.limit("5/minute")
    async def update_nickname(request: Request, nickname_request: NicknameUpdateRequest):
        """Update user nickname"""
        await db.users.update_user_nickname(nickname_request.email, nickname_request.nickname)
        return {"success": True}
