"""
Routes for users
"""
import os
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Request
from slowapi import Limiter
from models.requests import NicknameUpdateRequest
from utils.cache import cache

logger = logging.getLogger(__name__)


def setup_users_routes(app, db, limiter: Limiter):
    """Setup user routes"""
    
    @app.get("/api/rating")
    async def get_rating(
        limit: int = Query(10, ge=1, le=100),
        offset: int = Query(0, ge=0),
        league: Optional[str] = Query(None)
    ):
        """
        Get rating - only users with nickname (with pagination)
        
        Returns a list of users sorted by total points, optionally filtered by league.
        
        **Example Request:**
        ```
        GET /api/rating?limit=50&offset=0&league=Алмас
        ```
        
        **Example Response:**
        ```json
        {
          "items": [
            {
              "id": 1,
              "nickname": "User1",
              "league": "Алмас",
              "total_points": 1000,
              "week_points": 100,
              "total_solved": 50,
              "email": "user1@example.com"
            }
          ],
          "total": 150,
          "limit": 50,
          "offset": 0,
          "has_more": true
        }
        ```
        
        **Query Parameters:**
        - `limit` (int, 1-100): Maximum number of users to return (default: 10)
        - `offset` (int, >=0): Number of users to skip (default: 0)
        - `league` (str, optional): Filter by league name (e.g., "Алмас", "Қола")
        
        **Error Codes:**
        - 200: Success
        - 400: Invalid parameters
        - 500: Internal server error
        """
        # Use cache for rating (cache for 30 seconds as per plan)
        cache_key = f"rating:{limit}:{offset}:{league or 'all'}"
        cached_rating = cache.get(cache_key)
        if cached_rating is not None:
            return cached_rating
        
        # Get total count for pagination
        total = await db.get_rating_count(league=league)
        
        # Get paginated rating
        rating = await db.get_rating(limit=limit, offset=offset, league=league)
        result = {
            "items": [
                {
                    "id": u["id"],
                    "nickname": u.get("nickname"),
                    "league": u["league"],
                    "total_points": u["total_points"],
                    "week_points": u["week_points"],
                    "total_solved": u["total_solved"],
                    "email": u.get("email")
                }
                for u in rating
            ],
            "total": total,
            "limit": limit,
            "offset": offset,
            "has_more": (offset + limit) < total
        }
        # Cache for 30 seconds (as per plan)
        cache.set(cache_key, result, ttl=30)
        return result

    @app.get("/api/user/web/{email}")
    async def get_user_web(
        email: str, 
        refresh_achievements: bool = Query(False),
        fields: Optional[str] = Query(None, description="Comma-separated list of fields to include (e.g., 'id,email,nickname,league')")
    ):
        """
        Get user statistics for web - creates user if doesn't exist
        
        Returns comprehensive user statistics including progress, achievements, and league information.
        
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
          "league": "Қола",
          "league_position": 5,
          "league_size": 30,
          "total_solved": 50,
          "week_solved": 10,
          "week_points": 100,
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
        cache_key = f"user:stats:{email}:{refresh_achievements}"
        if not refresh_achievements:
            cached_stats = cache.get(cache_key)
            if cached_stats is not None:
                return cached_stats
        
        user = await db.get_user_by_email(email)
        if not user:
            # Auto-create user for web interface
            admin_email = os.getenv("ADMIN_EMAIL")
            user = await db.create_user_by_email(email, check_admin_email=admin_email)
            logger.info(f"Created new web user: {email}")
            if admin_email and email.lower() == admin_email.lower():
                logger.info(f"User {email} created as admin")

        stats = await db.get_user_stats(user["id"])
        is_admin = await db.is_admin(email=email)
        
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
            except:
                pass
        
        # Get user achievements (optionally refresh; default off for speed)
        achievements = await db.get_user_achievements(user["id"])
        if refresh_achievements:
            try:
                await db.check_and_unlock_achievements(user["id"])
                achievements = await db.get_user_achievements(user["id"])
            except Exception as e:
                logger.error(f"Error checking achievements: {e}", exc_info=True)
        
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
            "league": user["league"],
            "league_position": stats.get("league_position"),
            "league_size": stats.get("league_size"),
            "total_solved": user["total_solved"],
            "week_solved": user["week_solved"],
            "week_points": user["week_points"],
            "total_points": user["total_points"],
            "streak": streak_value,
            "last_streak_date": last_streak_date_value,
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
    async def get_public_user_profile(identifier: str):
        """
        Get public user profile by ID or email (statistics and achievements)
        Does not require authentication
        Returns public data without email and is_admin
        
        Tries to parse identifier as integer (ID) first, then falls back to email
        
        **Example Request:**
        ```
        GET /api/user/public/123
        GET /api/user/public/user@example.com
        ```
        
        **Example Response:**
        ```json
        {
          "id": 123,
          "nickname": "TestUser",
          "league": "Қола",
          "league_position": 5,
          "league_size": 30,
          "total_solved": 50,
          "week_solved": 10,
          "week_points": 100,
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
        # Try to parse as integer (user ID) first
        user_id = None
        try:
            user_id = int(identifier)
        except ValueError:
            pass
        
        # Determine cache key and fetch method
        if user_id is not None:
            # Use ID-based cache and lookup
            cache_key = f"user:public:id:{user_id}"
            cached_profile = cache.get(cache_key)
            if cached_profile is not None:
                return cached_profile
            
            user = await db.get_user_by_id(user_id)
        else:
            # Use email-based cache and lookup
            email = identifier
            cache_key = f"user:public:{email}"
            cached_profile = cache.get(cache_key)
            if cached_profile is not None:
                return cached_profile
            
            user = await db.get_user_by_email(email)
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        stats = await db.get_user_stats(user["id"])
        
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
        achievements = await db.get_user_achievements(user["id"])
        
        # Return public profile data (WITHOUT email and is_admin)
        result = {
            "id": user["id"],
            "nickname": user.get("nickname"),
            "league": user["league"],
            "league_position": stats.get("league_position"),
            "league_size": stats.get("league_size"),
            "total_solved": user["total_solved"],
            "week_solved": user["week_solved"],
            "week_points": user["week_points"],
            "total_points": user["total_points"],
            "streak": streak_value,
            "last_streak_date": last_streak_date_value,
            "achievements": achievements
        }
        
        # Cache result (TTL 10 seconds)
        cache.set(cache_key, result, ttl=10)
        return result

    @app.post("/api/user/web/nickname")
    @limiter.limit("5/minute")
    async def update_nickname(request: Request, nickname_request: NicknameUpdateRequest):
        """Update user nickname"""
        await db.update_user_nickname(nickname_request.email, nickname_request.nickname)
        return {"success": True}

