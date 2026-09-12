"""CMS routes: tasks."""
from .common import (
    Any,
    Body,
    CAPABILITY_REVIEW_MANAGE,
    CAPABILITY_SUPER_CRITICAL,
    Database,
    Depends,
    Dict,
    Form,
    HTTPException,
    MCQ_QUESTION_TYPES,
    Optional,
    Query,
    UploadFile,
    _get_allowed_mcq_answer_labels,
    _normalize_accepted_answers_or_raise,
    _normalize_answer_mode_or_raise,
    _normalize_text_scale,
    _normalize_trial_like_answer_or_raise,
    _parse_bank_topics_json,
    _parse_options_json,
    _parse_subquestions_json,
    _validate_bank_difficulty,
    _validate_trial_like_payload,
    aiosqlite,
    get_db,
    is_task_answer_correct,
    json,
    logger,
    require_admin,
    require_admin_any_admin,
    sanitize_html,
    save_image_upload,
    validate_email,
    validate_string_length,
    FastAPI,
    Limiter,
)


def register_task_content_routes(app: FastAPI, db: Database, limiter: Limiter):
    @app.get("/api/admin/tasks")
    async def get_admin_tasks(
        admin_user: dict = Depends(require_admin),
        db: Database = Depends(get_db),
        limit: int = Query(50, ge=1, le=200),
        offset: int = Query(0, ge=0)
    ):
        """Get all tasks created by admin (with pagination)"""
        tasks = await db.tasks.get_tasks_by_creator(admin_user["id"], limit=limit, offset=offset)
        total = await db.tasks.get_tasks_count_by_creator(admin_user["id"])
        return {
            "items": [
                {
                    "id": task["id"],
                    "text": task["text"],
                    "answer": task["answer"],
                    "accepted_answers": _normalize_accepted_answers_or_raise(task.get("accepted_answers")),
                    "question_type": task.get("question_type", "input"),
                    "text_scale": task.get("text_scale", "md"),
                    "created_at": task.get("created_at"),
                    "deleted_at": task.get("deleted_at"),
                    "difficulty": task.get("difficulty", 1)
                }
                for task in tasks
            ],
            "total": total,
            "limit": limit,
            "offset": offset,
            "has_more": (offset + limit) < total
        }

    @app.post("/api/admin/task-answer/preview-check")
    async def preview_task_answer_check(
        payload: dict = Body(...),
        admin_user: dict = Depends(require_admin_any_admin),
    ):
        """Check an unsaved task answer without recording progress or rewards."""
        task_payload = payload.get("task")
        if not isinstance(task_payload, dict):
            raise HTTPException(status_code=400, detail="task must be an object")

        user_answer = payload.get("user_answer")
        if not isinstance(user_answer, str) or not user_answer.strip():
            raise HTTPException(status_code=400, detail="user_answer is required")
        if len(user_answer) > 10000:
            raise HTTPException(status_code=400, detail="user_answer must be at most 10000 characters")

        question_type_raw = task_payload.get("question_type", "input")
        if not isinstance(question_type_raw, str):
            raise HTTPException(status_code=400, detail="question_type must be a string")
        question_type = question_type_raw.strip().lower() or "input"

        raw_options = task_payload.get("options")
        if raw_options is not None and not isinstance(raw_options, list):
            raise HTTPException(status_code=400, detail="options must be an array")
        options_list = raw_options if isinstance(raw_options, list) else None
        for option in options_list or []:
            if not isinstance(option, dict):
                raise HTTPException(status_code=400, detail="Each option must be an object")
            if not isinstance(option.get("label"), str) or not isinstance(option.get("text", ""), str):
                raise HTTPException(status_code=400, detail="Each option must contain string label and text")
            if len(option.get("text", "")) > 10000:
                raise HTTPException(status_code=400, detail="Option text must be at most 10000 characters")

        raw_subquestions = task_payload.get("subquestions")
        if raw_subquestions is not None and not isinstance(raw_subquestions, list):
            raise HTTPException(status_code=400, detail="subquestions must be an array")
        subquestions_list = raw_subquestions if isinstance(raw_subquestions, list) else None
        for subquestion in subquestions_list or []:
            if not isinstance(subquestion, dict) or not isinstance(subquestion.get("text", ""), str):
                raise HTTPException(status_code=400, detail="Each subquestion must contain string text")
            if len(subquestion.get("text", "")) > 10000:
                raise HTTPException(status_code=400, detail="Subquestion text must be at most 10000 characters")

        _validate_trial_like_payload(question_type, options_list, subquestions_list)
        answer_mode = _normalize_answer_mode_or_raise(task_payload.get("answer_mode"), question_type)

        correct_answer = task_payload.get("answer")
        if not isinstance(correct_answer, str) or not correct_answer.strip():
            raise HTTPException(status_code=400, detail="Correct answer is required")
        if len(correct_answer) > 10000:
            raise HTTPException(status_code=400, detail="Correct answer must be at most 10000 characters")
        if question_type == "tf" and correct_answer.strip().lower() not in {"true", "false"}:
            raise HTTPException(status_code=400, detail="tf answer must be true or false")
        if question_type == "select":
            try:
                select_answers = json.loads(correct_answer)
            except Exception:
                select_answers = None
            allowed_labels = set(_get_allowed_mcq_answer_labels(options_list))
            if (
                not isinstance(select_answers, list)
                or len(select_answers) != 2
                or any(str(value or "").strip().upper() not in allowed_labels for value in select_answers)
            ):
                raise HTTPException(status_code=400, detail="select answer must contain exactly 2 option labels")

        normalized_correct_answer = _normalize_trial_like_answer_or_raise(
            question_type,
            correct_answer,
            options_list,
        )
        accepted_answers = _normalize_accepted_answers_or_raise(task_payload.get("accepted_answers"))
        task_for_compare = {
            "question_type": question_type,
            "answer_mode": answer_mode,
            "answer": normalized_correct_answer,
            "accepted_answers": accepted_answers,
            "options": options_list,
            "subquestions": subquestions_list,
        }
        return {
            "correct": is_task_answer_correct(task_for_compare, user_answer),
            "question_type": question_type,
            "answer_mode": answer_mode,
        }

    @app.post("/api/admin/tasks")
    async def create_task_web(
        text: str = Form(...),
        answer: str = Form(...),
        text_scale: str = Form("md"),
        email: str = Form(...),
        db: Database = Depends(get_db)
    ):
        """Create task via web interface"""
        try:
            email = validate_email(email)
            text = validate_string_length(text, min_length=1, max_length=10000, field_name="Task text")
            answer = validate_string_length(answer, min_length=1, max_length=1000, field_name="Task answer")
            text = sanitize_html(text)
            answer = sanitize_html(answer)
            text_scale = _normalize_text_scale(text_scale)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        admin_user = await require_admin(email=email, db=db)

        task = await db.tasks.create_task(
            text=text,
            answer=answer,
            created_by=admin_user["id"],
            image_filename=None,
            solution_filename=None,
            text_scale=text_scale,
        )

        return {
            "id": task["id"],
            "text": task["text"],
            "answer": task["answer"]
        }

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

        task = await db.tasks.get_task_by_id(task_id)
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

        _validate_trial_like_payload(question_type, options_list, subquestions_list)
        answer = _normalize_trial_like_answer_or_raise(question_type, answer, options_list)
        text_scale_value = _normalize_text_scale(text_scale)

        image_filename = await save_image_upload(image) if image else None

        await db.tasks.update_task(task_id=task_id, text_scale=text_scale_value)

        linked_bank_task_id = task.get("bank_task_id")
        if isinstance(linked_bank_task_id, int) and linked_bank_task_id > 0:
            await db.bank_tasks.update_task(
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

    @app.put("/api/admin/tasks/{task_id}")
    async def update_task_web(
        task_id: int,
        text: str = Form(""),
        answer: str = Form(""),
        question_type: Optional[str] = Form(None),
        answer_mode: Optional[str] = Form(None),
        accepted_answers: Optional[str] = Form(None),
        text_scale: Optional[str] = Form(None),
        options: Optional[str] = Form(None),
        subquestions: Optional[str] = Form(None),
        bank_difficulty: Optional[str] = Form(None),
        bank_topics: Optional[str] = Form(None),
        email: Optional[str] = Form(None),
        email_query: Optional[str] = Query(None, alias="email"),
        task_type: Optional[str] = Form(None),
        sort_order: Optional[int] = Form(None),
        db: Database = Depends(get_db)
    ):
        """Update task via web interface"""
        email_form = email.strip() if isinstance(email, str) and email.strip() else None
        email_legacy = email_query.strip() if isinstance(email_query, str) and email_query.strip() else None
        effective_email = email_form or email_legacy
        if not effective_email:
            raise HTTPException(status_code=400, detail="email is required")

        # Form email takes priority. Query email enables legacy report update flow.
        cms_mode = bool(email_form)
        if not cms_mode:
            return await _update_task_from_report_common(
                task_id=task_id,
                text=text,
                answer=answer,
                question_type=question_type or "input",
                text_scale=text_scale or "md",
                options=options,
                subquestions=subquestions,
                image=None,
                email=effective_email,
                db=db,
            )

        admin_user = await require_admin(email=effective_email, db=db)

        task = await db.tasks.get_task_by_id(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        if task.get("created_by") != admin_user["id"]:
            raise HTTPException(status_code=403, detail="You can only edit your own tasks")

        options_list = _parse_options_json(options) if options is not None else None
        if subquestions is not None and not subquestions.strip():
            subquestions = None
        subquestions_list = _parse_subquestions_json(subquestions) if subquestions is not None else None

        effective_question_type = question_type or task.get("question_type", "input")
        effective_answer_mode = _normalize_answer_mode_or_raise(
            answer_mode if answer_mode is not None else task.get("answer_mode"),
            effective_question_type,
        )
        accepted_answers_value = (
            _normalize_accepted_answers_or_raise(accepted_answers)
            if accepted_answers is not None
            else None
        )
        effective_options = options_list if options_list is not None else task.get("options")
        effective_subquestions = subquestions_list if subquestions_list is not None else task.get("subquestions")
        _validate_trial_like_payload(
            effective_question_type,
            effective_options,
            effective_subquestions,
        )
        effective_answer = answer if answer is not None else task.get("answer", "")
        if effective_question_type in MCQ_QUESTION_TYPES:
            effective_answer = _normalize_trial_like_answer_or_raise(
                effective_question_type,
                effective_answer,
                effective_options if isinstance(effective_options, list) else None,
            )
            answer = effective_answer

        text_scale_value = _normalize_text_scale(text_scale) if text_scale is not None else None
        difficulty_value = _validate_bank_difficulty(bank_difficulty) if bank_difficulty and bank_difficulty.strip() else None
        topics_value = _parse_bank_topics_json(bank_topics, default_when_missing=None)

        await db.tasks.update_task(
            task_id=task_id,
            task_type=task_type,
            sort_order=sort_order,
            text_scale=text_scale_value,
        )

        linked_bank_task_id = task.get("bank_task_id")
        if isinstance(linked_bank_task_id, int) and linked_bank_task_id > 0:
            await db.bank_tasks.update_task(
                task_id=linked_bank_task_id,
                text=text if text else None,
                answer=answer if answer else None,
                question_type=question_type,
                answer_mode=effective_answer_mode,
                accepted_answers=accepted_answers_value,
                text_scale=text_scale_value,
                options=options_list if options is not None else None,
                subquestions=subquestions_list if subquestions is not None else None,
                difficulty=difficulty_value,
                topics=topics_value,
                actor_user_id=admin_user["id"],
                source="admin_module_task_update",
            )

        return {"success": True, "message": "Task updated successfully"}

    @app.delete("/api/admin/tasks/{task_id}")
    async def delete_task_web(
        task_id: int,
        email: str = Query(...),
        db: Database = Depends(get_db)
    ):
        """Delete task via web interface (soft delete - moves to trash)"""
        try:
            admin_user = await require_admin(email=email, db=db)

            task = await db.tasks.get_task_by_id(task_id)
            if not task:
                raise HTTPException(status_code=404, detail="Task not found")

            if task.get("deleted_at"):
                raise HTTPException(status_code=400, detail="Task is already in trash")

            if task.get("created_by") != admin_user["id"]:
                raise HTTPException(status_code=403, detail="You can only delete your own tasks")

            try:
                await db.tasks.soft_delete_task(task_id)
            except Exception as e:
                logger.error(f"Error in soft_delete_task: {e}", exc_info=True)
                raise HTTPException(status_code=500, detail="Internal server error")

            return {"success": True, "message": "Task moved to trash"}
            raise
        except Exception as e:
            logger.error(f"Error deleting task {task_id}: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Internal server error")

    @app.get("/api/admin/tasks/trash")
    async def get_trash_tasks(admin_user: dict = Depends(require_admin), db: Database = Depends(get_db)):
        """Get deleted tasks (trash)"""
        try:
            tasks = await db.tasks.get_deleted_tasks_by_creator(admin_user["id"])

            result = []
            for task in tasks:
                try:
                    result.append({
                        "id": task.get("id"),
                        "text": task.get("text", ""),
                        "answer": task.get("answer", ""),
                        "created_at": task.get("created_at"),
                        "deleted_at": task.get("deleted_at"),
                        "difficulty": task.get("difficulty", 1)
                    })
                except Exception as e:
                    logger.error(f"Error processing task {task.get('id', 'unknown')}: {e}", exc_info=True)
                    continue

            return result
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error in get_trash_tasks: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Internal server error")

    @app.post("/api/admin/tasks/{task_id}/restore")
    async def restore_task_web(
        task_id: int,
        email: str = Query(...),
        db: Database = Depends(get_db)
    ):
        """Restore task from trash"""
        admin_user = await require_admin(email=email, db=db)

        task = await db.tasks.get_task_by_id(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        if task.get("created_by") != admin_user["id"]:
            raise HTTPException(status_code=403, detail="You can only restore your own tasks")

        if not task.get("deleted_at"):
            raise HTTPException(status_code=400, detail="Task is not in trash")

        await db.tasks.restore_task(task_id)
        return {"success": True, "message": "Task restored successfully"}

    @app.post("/api/admin/tasks/trash/empty")
    async def empty_trash_web(
        email: str = Query(...),
        db: Database = Depends(get_db)
    ):
        """Empty trash - permanently delete all tasks in trash for current user"""
        try:
            admin_user = await require_admin(email=email, db=db, capability=CAPABILITY_SUPER_CRITICAL)

            deleted_count = await db.tasks.empty_trash(creator_id=admin_user["id"])
            id_reset = await db.tasks.reset_task_id_counter()

            logger.info(f"User {email} emptied trash: {deleted_count} tasks deleted. ID counter reset: {id_reset}")

            message = f"Корзина очищена. Удалено задач: {deleted_count}"
            if id_reset:
                message += ". Счетчик ID сброшен - новые задачи начнутся с #1"

            return {
                "success": True,
                "message": message,
                "deleted_count": deleted_count,
                "id_reset": id_reset
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error emptying trash: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Internal server error")

    @app.post("/api/admin/tasks/reset-id-counter")
    async def reset_task_id_counter_web(
        email: str = Query(...),
        db: Database = Depends(get_db)
    ):
        """Reset task ID counter (only works if all tasks are deleted)"""
        try:
            await require_admin(email=email, db=db, capability=CAPABILITY_SUPER_CRITICAL)

            async with aiosqlite.connect(db.db_path) as db_conn:
                async with db_conn.execute("SELECT COUNT(*) as count FROM tasks") as cursor:
                    row = await cursor.fetchone()
                    task_count = row[0] if row else 0

            success = await db.tasks.reset_task_id_counter()

            if success:
                logger.info(f"User {email} reset task ID counter")
                return {
                    "success": True,
                    "message": "Счетчик ID задач сброшен. Новые задачи начнутся с #1"
                }
            else:
                return {
                    "success": False,
                    "message": f"Не удалось сбросить счетчик. В базе данных еще есть задачи ({task_count} шт.). Удалите все задачи (включая корзину) перед сбросом счетчика."
                }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error resetting task ID counter: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Internal server error")
