"""
Reports роуты
"""
import logging
from fastapi import FastAPI, HTTPException, Body, Depends, Request
from slowapi import Limiter

from dependencies import get_db, require_internal_identity
from database import Database
from models.requests import ReportRequest, TrialTestReportRequest

logger = logging.getLogger(__name__)

_REPORT_SECRET_FIELDS = ("task_answer", "answer", "accepted_answers")


def _strip_report_answers(reports: list[dict]) -> list[dict]:
    return [
        {k: v for k, v in report.items() if k not in _REPORT_SECRET_FIELDS}
        for report in reports
    ]


def setup_reports_routes(app: FastAPI, db: Database, limiter: Limiter):
    """Настроить reports роуты"""

    @app.post("/api/reports")
    @limiter.limit("15/minute")
    async def create_report(
        request: Request,
        payload: ReportRequest = Body(...),
        current_user: dict = Depends(require_internal_identity),
        db: Database = Depends(get_db)
    ):
        """Create a new report about a task"""
        try:
            user = current_user

            # A broken task is often noticed before answering it, so no attempt is required:
            # forcing a guess would also record a first-attempt mistake for the review.
            task = await db.tasks.get_task_by_id(payload.task_id)
            if not task:
                raise HTTPException(status_code=404, detail="Есеп табылмады")

            # Check if user already reported this task
            user_reports = await db.reports.get_user_reports(user["id"])
            existing_report = next((r for r in user_reports if r["task_id"] == payload.task_id), None)
            if existing_report:
                raise HTTPException(status_code=400, detail="Сіз бұл есепті бұрын жібергенсіз")

            # Create report
            report = await db.reports.create_report(user["id"], payload.task_id, payload.message)
            logger.info(f"Report created: user_id={user['id']}, task_id={payload.task_id}")

            return {
                "id": report["id"],
                "status": report["status"],
                "created_at": report["created_at"],
                "message": "Report submitted successfully"
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error creating report: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Шағымды жіберу мүмкін болмады")

    @app.get("/api/reports")
    async def get_user_reports(
        current_user: dict = Depends(require_internal_identity),
        db: Database = Depends(get_db)
    ):
        """Get user's own reports (without exposing task answers)"""
        try:
            reports = await db.reports.get_user_reports(current_user["id"])
            return _strip_report_answers(reports)
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error getting user reports: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Internal server error")

    @app.post("/api/trial-test-reports")
    @limiter.limit("15/minute")
    async def create_trial_test_report(
        request: Request,
        payload: TrialTestReportRequest = Body(...),
        current_user: dict = Depends(require_internal_identity),
        db: Database = Depends(get_db)
    ):
        """Create a new report about a trial test task"""
        try:
            user = current_user

            trial_test = await db.trial_tests.get_trial_test_by_id(payload.trial_test_id)
            if not trial_test:
                raise HTTPException(status_code=404, detail="Сынақ тесті табылмады")

            task = await db.trial_tests.get_trial_test_task(payload.task_id)
            if not task or task.get("trial_test_id") != payload.trial_test_id:
                raise HTTPException(status_code=404, detail="Есеп табылмады")

            # Check if user already reported this trial test task
            if await db.trial_test_reports.has_user_reported_trial_test_task(user["id"], payload.task_id):
                raise HTTPException(status_code=400, detail="Сіз бұл есепті бұрын жібергенсіз")

            report = await db.trial_test_reports.create_trial_test_report(
                user["id"], payload.trial_test_id, payload.task_id, payload.message
            )
            logger.info(
                "Trial test report created: user_id=%s, trial_test_id=%s, task_id=%s",
                user["id"], payload.trial_test_id, payload.task_id
            )

            return {
                "id": report["id"],
                "status": report["status"],
                "created_at": report["created_at"],
                "message": "Report submitted successfully"
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error creating trial test report: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Шағымды жіберу мүмкін болмады")

    @app.get("/api/trial-test-reports")
    async def get_user_trial_test_reports(
        current_user: dict = Depends(require_internal_identity),
        db: Database = Depends(get_db)
    ):
        """Get user's own trial test reports (without exposing task answers)"""
        try:
            reports = await db.trial_test_reports.get_user_trial_test_reports(current_user["id"])
            return _strip_report_answers(reports)
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error getting user trial test reports: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Internal server error")
