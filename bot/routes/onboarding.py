"""
Onboarding роуты
"""
import os
import logging
from fastapi import FastAPI, HTTPException, Query, Form, Request, Depends
from slowapi import Limiter

from dependencies import get_db
from database import Database

logger = logging.getLogger(__name__)


def setup_onboarding_routes(app: FastAPI, db: Database, limiter: Limiter):
    """Настроить onboarding роуты"""
    
    @app.get("/api/user/onboarding/status")
    async def get_onboarding_status(
        email: str = Query(...),
        db: Database = Depends(get_db)
    ):
        """Check if user has completed onboarding"""
        user = await db.get_user_by_email(email)
        if not user:
            return {"completed": False}
        
        is_completed = await db.is_onboarding_completed(user["id"])
        return {"completed": is_completed}

    @app.post("/api/user/onboarding")
    @limiter.limit("5/minute")
    async def save_onboarding(
        request: Request,
        email: str = Form(...),
        how_did_you_hear: str = Form(...),
        math_level: str = Form(...),
        nickname: str = Form(...),
        db: Database = Depends(get_db)
    ):
        """Save onboarding data"""
        user = await db.get_user_by_email(email)
        if not user:
            admin_email = os.getenv("ADMIN_EMAIL")
            user = await db.create_user_by_email(email, check_admin_email=admin_email)
        
        # Validate inputs
        if not nickname or not nickname.strip():
            raise HTTPException(status_code=400, detail="Nickname is required")
        
        if len(nickname.strip()) < 2:
            raise HTTPException(status_code=400, detail="Nickname must be at least 2 characters")
        
        if len(nickname.strip()) > 50:
            raise HTTPException(status_code=400, detail="Nickname must be less than 50 characters")
        
        await db.save_onboarding(
            user["id"],
            how_did_you_hear.strip(),
            math_level.strip(),
            nickname.strip()
        )
        
        return {"success": True, "message": "Onboarding completed"}
