"""
Admin statistics routes.
"""
from .common import *  # noqa: F401,F403

def register_statistics_routes(app: FastAPI, db: Database, limiter: Limiter):
    # Statistics
    @app.get("/api/admin/statistics")
    async def get_admin_statistics(admin_user: dict = Depends(require_admin_review_manage), db: Database = Depends(get_db)):
        """Get comprehensive admin statistics"""
        try:
            stats = await db.get_admin_statistics()
            return stats
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error getting admin statistics: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Internal server error")

    @app.get("/api/admin/onboarding-statistics")
    async def get_onboarding_statistics(admin_user: dict = Depends(require_admin_review_manage), db: Database = Depends(get_db)):
        """Get onboarding statistics (admin only)"""
        try:
            stats = await db.get_onboarding_statistics()
            return stats
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error getting onboarding statistics: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Internal server error")
