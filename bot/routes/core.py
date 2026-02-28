"""
Базовые роуты приложения (root, health check)
"""
import logging
from pathlib import Path
from datetime import datetime
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import FileResponse
from slowapi import Limiter

from utils.file_storage import get_images_dir

logger = logging.getLogger(__name__)


def setup_core_routes(app: FastAPI, db, limiter: Limiter):
    """Настроить базовые роуты"""
    
    @app.get("/")
    @limiter.limit("60/minute")
    async def root(request: Request):
        """Корневой эндпоинт API"""
        return {"message": "Mathbot API", "version": "1.0.0"}
    
    @app.get("/api/health")
    async def health_check(request: Request):
        """Проверка здоровья сервиса для мониторинга"""
        try:
            # Проверить подключение к БД
            test_user = await db.get_user_by_email("health-check@test.com")
            db_status = "ok"
        except Exception as e:
            logger.error(f"Health check DB error: {e}")
            db_status = "error"
        
        started_at_epoch = float(getattr(request.app.state, "started_at_epoch", 0.0) or 0.0)
        uptime_sec = 0
        if started_at_epoch > 0:
            uptime_sec = max(0, int(datetime.now().timestamp() - started_at_epoch))

        return {
            "status": "healthy" if db_status == "ok" else "degraded",
            "database": db_status,
            "timestamp": datetime.now().isoformat(),
            "uptime_sec": uptime_sec,
            "version": getattr(request.app.state, "version", "unknown"),
            "environment": getattr(request.app.state, "environment", "development"),
        }

    @app.get("/api/images/{filename}")
    async def get_image(filename: str):
        """Serve uploaded task images"""
        images_dir = get_images_dir().resolve()
        file_path = (images_dir / filename).resolve()
        if images_dir not in file_path.parents:
            raise HTTPException(status_code=400, detail="Invalid filename")
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Image not found")
        return FileResponse(file_path)
