"""
Admin analytics of first-attempt mistakes in module lessons and of their review.
"""
from typing import Literal
from datetime import timedelta

from .common import *  # noqa: F401,F403

_PERIOD_DAYS = {"7d": 7, "30d": 30, "all": None}
_TASK_LIMIT = 50
_STUDENT_LIMIT = 100


def register_mistake_analytics_routes(app: FastAPI, db: Database, limiter: Limiter):
    @app.get("/api/admin/mistake-analytics")
    async def get_mistake_analytics(
        admin_user: dict = Depends(require_admin_any_admin),
        db: Database = Depends(get_db),
        period: Literal["7d", "30d", "all"] = Query("30d"),
        module_id: Optional[int] = Query(None, ge=1),
    ):
        days = _PERIOD_DAYS[period]
        # solutions.created_at is stored as UTC "YYYY-MM-DD HH:MM:SS" on both engines.
        since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S") if days else None
        result = await db.module_review.get_mistake_analytics(module_id=module_id, since=since)

        counts = await db.bank_tasks.twin_counts([task["bank_task_id"] for task in result["tasks"]])
        for task in result["tasks"]:
            task["twin_count"] = counts["approved"].get(task["bank_task_id"], 0)
            task["twin_draft_count"] = counts["drafts"].get(task["bank_task_id"], 0)
        result["summary"]["tasks_without_twins"] = sum(1 for task in result["tasks"] if not task["twin_count"])
        result["tasks"] = result["tasks"][:_TASK_LIMIT]

        result["students"] = result["students"][:_STUDENT_LIMIT]
        if not admin_user.get("is_super_admin"):
            # Other roles see nicknames only; email is personal data.
            for student in result["students"]:
                student.pop("email", None)
        return {**result, "filters": {"period": period, "module_id": module_id}}
