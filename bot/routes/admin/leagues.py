"""
Admin league routes.
"""
from .common import *  # noqa: F401,F403


def register_league_routes(app: FastAPI, db: Database, limiter: Limiter):
    @app.get("/api/admin/leagues")
    async def get_admin_leagues(
        admin_user: dict = Depends(require_admin_review_manage),
        db: Database = Depends(get_db),
    ):
        """List all league groups with participant counts."""
        try:
            groups = await db.rating.get_league_groups()
            return {"items": groups}
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error getting league groups: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Internal server error")

    @app.get("/api/admin/leagues/participants")
    async def get_admin_league_participants(
        league: str = Query(..., min_length=1),
        group: int = Query(..., ge=0),
        limit: int = Query(100, ge=1, le=100),
        offset: int = Query(0, ge=0),
        admin_user: dict = Depends(require_admin_review_manage),
        db: Database = Depends(get_db),
    ):
        """List participants inside one league group."""
        try:
            return await db.rating.get_league_group_participants(
                league=league,
                group=group,
                limit=limit,
                offset=offset,
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error getting league participants: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Internal server error")
