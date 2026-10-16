"""Authenticated Vercel Cron endpoint; disabled without a configured secret."""
import hmac

from fastapi import Depends, FastAPI, Header, HTTPException

from dependencies import get_db
from services.maintenance import run_maintenance_cycle
from settings import get_settings


def setup_maintenance_routes(app: FastAPI):
    @app.get("/api/maintenance")
    async def maintenance(authorization: str = Header(default=""), db=Depends(get_db)):
        secret = get_settings().cron_secret
        if not secret or not hmac.compare_digest(authorization.encode(), f"Bearer {secret}".encode()):
            raise HTTPException(status_code=401, detail="Unauthorized")
        return await run_maintenance_cycle(db)
