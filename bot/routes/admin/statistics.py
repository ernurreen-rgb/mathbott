"""
Admin statistics routes: one endpoint per tab of the statistics workspace.

Every endpoint takes the same period and the viewer's UTC offset, so "today" and the
daily series follow the admin's clock instead of the server's.
"""
from typing import Literal

from repositories.statistics_repository import (
    DEFAULT_TZ_OFFSET_MINUTES,
    MAX_TZ_OFFSET_MINUTES,
    MIN_TZ_OFFSET_MINUTES,
    StatsWindow,
    build_window,
)

from .common import *  # noqa: F401,F403


def statistics_window(
    period: Literal["7d", "30d", "90d", "all"] = Query("30d"),
    tz_offset: int = Query(DEFAULT_TZ_OFFSET_MINUTES, ge=MIN_TZ_OFFSET_MINUTES, le=MAX_TZ_OFFSET_MINUTES),
) -> StatsWindow:
    return build_window(period, tz_offset)


def register_statistics_routes(app: FastAPI, db: Database, limiter: Limiter):
    @app.get("/api/admin/statistics/overview")
    async def get_statistics_overview(
        admin_user: dict = Depends(require_admin_review_manage),
        db: Database = Depends(get_db),
        window: StatsWindow = Depends(statistics_window),
        exclude_admins: bool = Query(False),
    ):
        return await db.statistics.get_overview(window, exclude_admins=exclude_admins)

    @app.get("/api/admin/statistics/students")
    async def get_statistics_students(
        admin_user: dict = Depends(require_admin_review_manage),
        db: Database = Depends(get_db),
        window: StatsWindow = Depends(statistics_window),
        exclude_admins: bool = Query(False),
    ):
        # Other roles see nicknames only; email is personal data.
        return await db.statistics.get_students(
            window, exclude_admins=exclude_admins, include_email=bool(admin_user.get("is_super_admin")),
        )

    @app.get("/api/admin/statistics/tasks")
    async def get_statistics_tasks(
        admin_user: dict = Depends(require_admin_review_manage),
        db: Database = Depends(get_db),
        window: StatsWindow = Depends(statistics_window),
        exclude_admins: bool = Query(False),
    ):
        return await db.statistics.get_tasks(window, exclude_admins=exclude_admins)

    @app.get("/api/admin/statistics/modules")
    async def get_statistics_modules(
        admin_user: dict = Depends(require_admin_review_manage),
        db: Database = Depends(get_db),
        window: StatsWindow = Depends(statistics_window),
        exclude_admins: bool = Query(False),
    ):
        return await db.statistics.get_modules(window, exclude_admins=exclude_admins)

    @app.get("/api/admin/statistics/trial-tests")
    async def get_statistics_trial_tests(
        admin_user: dict = Depends(require_admin_review_manage),
        db: Database = Depends(get_db),
        window: StatsWindow = Depends(statistics_window),
        exclude_admins: bool = Query(False),
    ):
        return await db.statistics.get_trial_tests(window, exclude_admins=exclude_admins)

    @app.get("/api/admin/statistics/quizzes")
    async def get_statistics_quizzes(
        admin_user: dict = Depends(require_admin_review_manage),
        db: Database = Depends(get_db),
        window: StatsWindow = Depends(statistics_window),
    ):
        return await db.statistics.get_quizzes(window)
