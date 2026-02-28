"""
Admin reports moderation routes.
"""
from .common import *  # noqa: F401,F403


async def _update_task_from_report_common(
    *,
    task_id: int,
    text: str,
    answer: str,
    question_type: str,
    text_scale: str,
    options: Optional[str],
    subquestions: Optional[str],
    image: Optional[UploadFile],
    email: str,
    db: Database,
) -> Dict[str, Any]:
    admin_user = await require_admin(email=email, db=db, capability=CAPABILITY_REVIEW_MANAGE)

    task = await db.get_task_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    logger.info(
        "Update task from report: question_type=%s, has_options=%s, has_subquestions=%s, has_image=%s",
        question_type,
        bool(options),
        bool(subquestions),
        bool(image),
    )

    options_list = None
    if options and options.strip():
        try:
            options_list = json.loads(options)
            if not isinstance(options_list, list):
                raise ValueError("Options must be a JSON array")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid options JSON: {str(e)}")

    subquestions_list = None
    if subquestions and subquestions.strip():
        try:
            subquestions_list = json.loads(subquestions)
            if not isinstance(subquestions_list, list) or len(subquestions_list) != 2:
                raise ValueError("Subquestions must be a JSON array of length 2")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid subquestions JSON: {str(e)}")

    if question_type == "factor_grid":
        answer = _normalize_factor_grid_answer_or_raise(answer)
    text_scale_value = _normalize_text_scale(text_scale)
    image_filename = await save_image_upload(image) if image else None

    await db.update_task(task_id=task_id, text_scale=text_scale_value)

    linked_bank_task_id = task.get("bank_task_id")
    if isinstance(linked_bank_task_id, int) and linked_bank_task_id > 0:
        await db.update_bank_task(
            task_id=linked_bank_task_id,
            text=text.strip() if text.strip() else None,
            answer=answer.strip() if answer.strip() else None,
            question_type=question_type,
            text_scale=text_scale_value,
            options=options_list if options is not None else None,
            subquestions=subquestions_list if subquestions is not None else None,
            image_filename=image_filename,
            solution_filename=None,
            actor_user_id=admin_user["id"],
            source="admin_report_task_update",
        )

    logger.info("Task %s updated from report by admin %s", task_id, email)
    return {"success": True, "message": "Task updated successfully"}

def register_reports_routes(app: FastAPI, db: Database, limiter: Limiter):
    # Reports admin
    @app.get("/api/admin/reports")
    async def get_all_reports(
        email: str = Query(...),
        status: Optional[str] = Query(None),
        limit: int = Query(50, ge=1, le=500),
        db: Database = Depends(get_db)
    ):
        """Get all reports (admin only)"""
        try:
            await require_admin(email=email, db=db, capability=CAPABILITY_REVIEW_MANAGE)
            reports = await db.get_all_reports(status_filter=status, limit=limit)
            return reports
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error getting all reports: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Internal server error")

    @app.get("/api/admin/trial-test-reports")
    async def get_all_trial_test_reports(
        email: str = Query(...),
        status: Optional[str] = Query(None),
        limit: int = Query(50, ge=1, le=500),
        db: Database = Depends(get_db)
    ):
        """Get all trial test reports (admin only)"""
        try:
            await require_admin(email=email, db=db, capability=CAPABILITY_REVIEW_MANAGE)
            reports = await db.get_all_trial_test_reports(status_filter=status, limit=limit)
            return reports
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error getting all trial test reports: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Internal server error")

    @app.put("/api/admin/reports/{report_id}/status")
    async def update_report_status(
        report_id: int,
        status: str = Form(..., pattern="^(pending|in_progress|resolved|dismissed)$"),
        email: str = Query(...),
        db: Database = Depends(get_db)
    ):
        """Update report status (admin only)"""
        try:
            admin_user = await require_admin(email=email, db=db, capability=CAPABILITY_REVIEW_MANAGE)
            
            report = await db.get_report_by_id(report_id)
            if not report:
                raise HTTPException(status_code=404, detail="Report not found")
            
            resolved_by = admin_user["id"] if status == "resolved" else None
            success = await db.update_report_status(report_id, status, resolved_by)
            
            if success:
                logger.info(f"Report {report_id} status updated to {status} by admin {email}")
                return {"success": True, "message": f"Report status updated to {status}"}
            else:
                raise HTTPException(status_code=500, detail="Failed to update report status")
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error updating report status: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Internal server error")

    @app.put("/api/admin/trial-test-reports/{report_id}/status")
    async def update_trial_test_report_status(
        report_id: int,
        status: str = Form(..., pattern="^(pending|in_progress|resolved|dismissed)$"),
        email: str = Query(...),
        db: Database = Depends(get_db)
    ):
        """Update trial test report status (admin only)"""
        try:
            admin_user = await require_admin(email=email, db=db, capability=CAPABILITY_REVIEW_MANAGE)

            report = await db.get_trial_test_report_by_id(report_id)
            if not report:
                raise HTTPException(status_code=404, detail="Report not found")

            resolved_by = admin_user["id"] if status == "resolved" else None
            success = await db.update_trial_test_report_status(report_id, status, resolved_by)

            if success:
                logger.info(f"Trial test report {report_id} status updated to {status} by admin {email}")
                return {"success": True, "message": f"Report status updated to {status}"}
            else:
                raise HTTPException(status_code=500, detail="Failed to update report status")
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error updating trial test report status: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Internal server error")

    @app.delete("/api/admin/trial-test-reports/{report_id}")
    async def delete_trial_test_report(
        report_id: int,
        email: str = Query(...),
        db: Database = Depends(get_db)
    ):
        """Delete trial test report (admin only)"""
        try:
            await require_admin(email=email, db=db, capability=CAPABILITY_REVIEW_MANAGE)
            success = await db.delete_trial_test_report(report_id)
            if success:
                return {"success": True}
            raise HTTPException(status_code=404, detail="Report not found")
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error deleting trial test report: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Internal server error")

    @app.put("/api/admin/reports/tasks/{task_id}")
    async def update_task_from_report(
        task_id: int,
        text: str = Form(""),
        answer: str = Form(""),
        question_type: str = Form("input"),
        text_scale: str = Form("md"),
        options: Optional[str] = Form(None),
        subquestions: Optional[str] = Form(None),
        image: Optional[UploadFile] = File(None),
        email: str = Query(...),
        db: Database = Depends(get_db)
    ):
        """Update task directly from report (admin only, explicit route)."""
        try:
            return await _update_task_from_report_common(
                task_id=task_id,
                text=text,
                answer=answer,
                question_type=question_type,
                text_scale=text_scale,
                options=options,
                subquestions=subquestions,
                image=image,
                email=email,
                db=db,
            )
        except HTTPException:
            raise
        except Exception:
            logger.exception("Error updating task from report")
            raise HTTPException(status_code=500, detail="Internal server error")

    @app.delete("/api/admin/reports/{report_id}")
    async def delete_report(
        report_id: int,
        email: str = Query(...),
        db: Database = Depends(get_db)
    ):
        """Delete a report (admin only)"""
        try:
            await require_admin(email=email, db=db, capability=CAPABILITY_REVIEW_MANAGE)
            
            report = await db.get_report_by_id(report_id)
            if not report:
                raise HTTPException(status_code=404, detail="Report not found")
            
            success = await db.delete_report(report_id)
            
            if success:
                logger.info(f"Report {report_id} deleted by admin {email}")
                return {"success": True, "message": "Report deleted successfully"}
            else:
                raise HTTPException(status_code=500, detail="Failed to delete report")
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error deleting report: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Internal server error")

