"""
Admin CMS/content routes.
"""
from .common import *  # noqa: F401,F403

def register_content_routes(app: FastAPI, db: Database, limiter: Limiter):
    # Tasks admin endpoints
    @app.get("/api/admin/tasks")
    async def get_admin_tasks(
        admin_user: dict = Depends(require_admin),
        db: Database = Depends(get_db),
        limit: int = Query(50, ge=1, le=200),
        offset: int = Query(0, ge=0)
    ):
        """Get all tasks created by admin (with pagination)"""
        tasks = await db.get_tasks_by_creator(admin_user["id"], limit=limit, offset=offset)
        total = await db.get_tasks_count_by_creator(admin_user["id"])
        return {
            "items": [
                {
                    "id": task["id"],
                    "text": task["text"],
                    "answer": task["answer"],
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
        
        task = await db.create_task(
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

        _validate_trial_like_payload(question_type, options_list, subquestions_list)
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
    @app.put("/api/admin/tasks/{task_id}")
    async def update_task_web(
        task_id: int,
        text: str = Form(""),
        answer: str = Form(""),
        question_type: Optional[str] = Form(None),
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

        task = await db.get_task_by_id(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        if task.get("created_by") != admin_user["id"]:
            raise HTTPException(status_code=403, detail="You can only edit your own tasks")

        options_list = _parse_options_json(options) if options is not None else None
        if subquestions is not None and not subquestions.strip():
            subquestions = None
        subquestions_list = _parse_subquestions_json(subquestions) if subquestions is not None else None

        effective_question_type = question_type or task.get("question_type", "input")
        effective_options = options_list if options_list is not None else task.get("options")
        effective_subquestions = subquestions_list if subquestions_list is not None else task.get("subquestions")
        _validate_trial_like_payload(
            effective_question_type,
            effective_options,
            effective_subquestions,
        )
        effective_answer = answer if answer is not None else task.get("answer", "")
        if effective_question_type == "factor_grid":
            effective_answer = _normalize_factor_grid_answer_or_raise(effective_answer)
            answer = effective_answer

        text_scale_value = _normalize_text_scale(text_scale) if text_scale is not None else None
        difficulty_value = _validate_bank_difficulty(bank_difficulty) if bank_difficulty and bank_difficulty.strip() else None
        topics_value = _parse_bank_topics_json(bank_topics, default_when_missing=None)

        await db.update_task(
            task_id=task_id,
            task_type=task_type,
            sort_order=sort_order,
            text_scale=text_scale_value,
        )

        linked_bank_task_id = task.get("bank_task_id")
        if isinstance(linked_bank_task_id, int) and linked_bank_task_id > 0:
            await db.update_bank_task(
                task_id=linked_bank_task_id,
                text=text if text else None,
                answer=answer if answer else None,
                question_type=question_type,
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
            
            task = await db.get_task_by_id(task_id)
            if not task:
                raise HTTPException(status_code=404, detail="Task not found")
            
            if task.get("deleted_at"):
                raise HTTPException(status_code=400, detail="Task is already in trash")
            
            if task.get("created_by") != admin_user["id"]:
                raise HTTPException(status_code=403, detail="You can only delete your own tasks")
            
            try:
                await db.soft_delete_task(task_id)
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
            tasks = await db.get_deleted_tasks_by_creator(admin_user["id"])
            
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
        
        task = await db.get_task_by_id(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        
        if task.get("created_by") != admin_user["id"]:
            raise HTTPException(status_code=403, detail="You can only restore your own tasks")
        
        if not task.get("deleted_at"):
            raise HTTPException(status_code=400, detail="Task is not in trash")
        
        await db.restore_task(task_id)
        return {"success": True, "message": "Task restored successfully"}
    @app.post("/api/admin/tasks/trash/empty")
    async def empty_trash_web(
        email: str = Query(...),
        db: Database = Depends(get_db)
    ):
        """Empty trash - permanently delete all tasks in trash for current user"""
        try:
            admin_user = await require_admin(email=email, db=db, capability=CAPABILITY_SUPER_CRITICAL)
            
            deleted_count = await db.empty_trash(creator_id=admin_user["id"])
            id_reset = await db.reset_task_id_counter()
            
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
            
            success = await db.reset_task_id_counter()
            
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

    # Modules CMS
    @app.get("/api/admin/modules")
    async def get_admin_modules(admin_user: dict = Depends(require_admin), db: Database = Depends(get_db)):
        """Get all modules for CMS"""
        modules = await db.get_all_modules()
        return modules

    @app.post("/api/admin/modules")
    async def create_module_cms(
        name: str = Form(...),
        description: Optional[str] = Form(None),
        icon: Optional[str] = Form(None),
        sort_order: int = Form(0),
        email: str = Form(...),
        db: Database = Depends(get_db)
    ):
        """Create module via CMS"""
        try:
            email = validate_email(email)
            name = validate_string_length(name, min_length=1, max_length=200, field_name="Module name")
            name = sanitize_html(name)
            if description:
                description = validate_string_length(description, min_length=1, max_length=2000, field_name="Description")
                description = sanitize_html(description)
            if icon:
                icon = validate_string_length(icon, min_length=1, max_length=100, field_name="Icon")
            if sort_order < 0 or sort_order > 10000:
                raise ValueError("Sort order must be between 0 and 10000")
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        
        await require_admin(email=email, db=db)
        
        description = description if description and description.strip() else None
        icon = icon if icon and icon.strip() else None
        
        try:
            module = await db.create_module(name, description, icon, sort_order)
            return module
        except Exception as e:
            logger.error(f"Error creating module: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Internal server error")

    @app.put("/api/admin/modules/{module_id}")
    async def update_module_cms(
        module_id: int,
        name: Optional[str] = Form(None),
        description: Optional[str] = Form(None),
        icon: Optional[str] = Form(None),
        sort_order: Optional[int] = Form(None),
        email: str = Form(...),
        db: Database = Depends(get_db)
    ):
        """Update module via CMS"""
        await require_admin(email=email, db=db)
        
        await db.update_module(module_id, name, description, icon, sort_order)
        module = await db.get_module_by_id(module_id)
        if not module:
            raise HTTPException(status_code=404, detail="Module not found")
        return module

    @app.delete("/api/admin/modules/{module_id}")
    async def delete_module_cms(
        module_id: int,
        email: str = Query(...),
        db: Database = Depends(get_db)
    ):
        """Delete module via CMS"""
        await require_admin(email=email, db=db)
        await db.delete_module(module_id)
        return {"success": True}

    # Sections CMS
    @app.get("/api/admin/modules/{module_id}/sections")
    async def get_admin_sections(
        module_id: int,
        email: str = Query(...),
        db: Database = Depends(get_db)
    ):
        """Get all sections for a module"""
        await require_admin(email=email, db=db)
        sections = await db.get_sections_by_module(module_id)
        return sections

    @app.post("/api/admin/modules/{module_id}/sections")
    async def create_section_cms(
        module_id: int,
        name: str = Form(...),
        sort_order: int = Form(0),
        description: Optional[str] = Form(None),
        email: str = Form(...),
        db: Database = Depends(get_db)
    ):
        """Create section via CMS"""
        await require_admin(email=email, db=db)
        section = await db.create_section(module_id, name, sort_order, description)
        return section

    @app.put("/api/admin/sections/{section_id}")
    async def update_section_cms(
        section_id: int,
        name: Optional[str] = Form(None),
        sort_order: Optional[int] = Form(None),
        description: Optional[str] = Form(None),
        guide: Optional[str] = Form(None),
        email: str = Form(...),
        db: Database = Depends(get_db)
    ):
        """Update section via CMS"""
        await require_admin(email=email, db=db)
        await db.update_section(section_id, name, sort_order, description, guide)
        section = await db.get_section_by_id(section_id)
        if not section:
            raise HTTPException(status_code=404, detail="Section not found")
        return section

    @app.delete("/api/admin/sections/{section_id}")
    async def delete_section_cms(
        section_id: int,
        email: str = Query(...),
        db: Database = Depends(get_db)
    ):
        """Delete section via CMS"""
        await require_admin(email=email, db=db)
        await db.delete_section(section_id)
        return {"success": True}

    # Tasks CMS (for sections)
    @app.get("/api/admin/sections/{section_id}/tasks")
    async def get_admin_section_tasks(
        section_id: int,
        email: str = Query(...),
        db: Database = Depends(get_db)
    ):
        """Get all tasks for a section"""
        await require_admin(email=email, db=db)
        tasks = await db.get_tasks_by_section(section_id)
        return [_serialize_bank_placement_task(task) for task in tasks]

    @app.post("/api/admin/sections/{section_id}/tasks")
    async def create_task_in_section_cms(
        section_id: int,
        text: str = Form(""),
        answer: str = Form(""),
        question_type: str = Form("input"),
        text_scale: str = Form("md"),
        options: Optional[str] = Form(None),
        subquestions: Optional[str] = Form(None),
        task_type: str = Form("standard"),
        sort_order: str = Form("0"),
        bank_task_id: Optional[int] = Form(None),
        bank_difficulty: Optional[str] = Form(None),
        bank_topics: Optional[str] = Form(None),
        image: Optional[UploadFile] = File(None),
        email: str = Form(...),
        questions: Optional[str] = Form(None),
        db: Database = Depends(get_db)
    ):
        """Create task in section via CMS"""
        try:
            logger.info(f"Creating task in section {section_id}: task_type={task_type}, sort_order={sort_order}, email={email}")
            
            admin_user = await require_admin(email=email, db=db)

            questions_list = None
            if questions:
                try:
                    questions_list = json.loads(questions)
                    if not isinstance(questions_list, list):
                        raise ValueError("Questions must be a JSON array")
                except (json.JSONDecodeError, ValueError) as e:
                    raise HTTPException(status_code=400, detail=f"Invalid questions JSON: {str(e)}")

            options_list = _parse_options_json(options)
            subquestions_list = _parse_subquestions_json(subquestions)
            if questions_list and options_list is None:
                options_list = questions_list

            if bank_task_id:
                bank_task = await db.get_bank_task_by_id(int(bank_task_id), include_deleted=False)
                if not bank_task:
                    raise HTTPException(status_code=404, detail="Bank task not found")
                linked_bank_task_id = int(bank_task_id)
                image_filename = None
            else:
                effective_qt = question_type or "input"
                _validate_trial_like_payload(effective_qt, options_list, subquestions_list)
                if effective_qt == "factor_grid":
                    answer = _normalize_factor_grid_answer_or_raise(answer)
                text_scale_value = _normalize_text_scale(text_scale)
                difficulty_value = _validate_bank_difficulty(bank_difficulty) if bank_difficulty else "B"
                topics_value = _parse_bank_topics_json(bank_topics, default_when_missing=[]) or []
                image_filename = await save_image_upload(image) if image else None

                bank_task = await db.create_bank_task(
                    text=text,
                    answer=answer,
                    question_type=effective_qt,
                    text_scale=text_scale_value,
                    difficulty=difficulty_value,
                    topics=topics_value,
                    options=options_list,
                    subquestions=subquestions_list,
                    image_filename=image_filename,
                    solution_filename=None,
                    created_by=admin_user["id"],
                )
                linked_bank_task_id = int(bank_task["id"])

            try:
                sort_order_int = int(sort_order) if sort_order and sort_order.strip() else 0
            except (ValueError, TypeError) as e:
                logger.warning(f"Invalid sort_order value: {sort_order}, using 0. Error: {e}")
                sort_order_int = 0

            logger.info(f"Creating task with: section_id={section_id}, task_type={task_type}, sort_order={sort_order_int}")

            task = await db.create_task_in_section(
                section_id=section_id,
                text=text,
                answer=answer,
                created_by=admin_user["id"],
                task_type=task_type,
                image_filename=image_filename,
                solution_filename=None,
                sort_order=sort_order_int,
                questions=questions_list,
                bank_task_id=linked_bank_task_id,
                text_scale=_normalize_text_scale(text_scale),
            )

            logger.info(f"Task created successfully: id={task.get('id')}")
            created_task = await db.get_task_by_id(task.get("id"))
            return _serialize_bank_placement_task(created_task or task)
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error creating task in section: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Internal server error")

    # Lessons CMS
    @app.get("/api/admin/sections/{section_id}/lessons")
    async def get_admin_lessons(
        section_id: int,
        email: str = Query(...),
        db: Database = Depends(get_db)
    ):
        """Get all lessons for a section"""
        await require_admin(email=email, db=db)
        return await db.get_lessons_by_section(section_id)

    @app.post("/api/admin/sections/{section_id}/lessons")
    async def create_lesson_cms(
        section_id: int,
        lesson_number: int = Form(...),
        title: Optional[str] = Form(None),
        sort_order: int = Form(0),
        email: str = Form(...),
        db: Database = Depends(get_db)
    ):
        """Create lesson via CMS"""
        await require_admin(email=email, db=db)
        lesson = await db.create_lesson(section_id, lesson_number, title, sort_order)
        return lesson

    @app.put("/api/admin/lessons/{lesson_id}")
    async def update_lesson_cms(
        lesson_id: int,
        lesson_number: Optional[int] = Form(None),
        title: Optional[str] = Form(None),
        sort_order: Optional[int] = Form(None),
        email: str = Form(...),
        db: Database = Depends(get_db)
    ):
        """Update lesson via CMS"""
        await require_admin(email=email, db=db)
        await db.update_lesson(lesson_id, lesson_number=lesson_number, title=title, sort_order=sort_order)
        lesson = await db.get_lesson_by_id(lesson_id)
        if not lesson:
            raise HTTPException(status_code=404, detail="Lesson not found")
        return lesson

    @app.delete("/api/admin/lessons/{lesson_id}")
    async def delete_lesson_cms(
        lesson_id: int,
        email: str = Query(...),
        db: Database = Depends(get_db)
    ):
        """Delete lesson via CMS"""
        await require_admin(email=email, db=db)
        await db.delete_lesson(lesson_id)
        return {"success": True}

    # Mini-lessons CMS
    @app.get("/api/admin/lessons/{lesson_id}/mini-lessons")
    async def get_admin_mini_lessons(
        lesson_id: int,
        email: str = Query(...),
        db: Database = Depends(get_db)
    ):
        """Get all mini-lessons for a lesson"""
        await require_admin(email=email, db=db)
        await db.ensure_default_mini_lessons(lesson_id)
        return await db.get_mini_lessons_by_lesson(lesson_id)

    @app.put("/api/admin/mini-lessons/{mini_lesson_id}")
    async def update_mini_lesson_cms(
        mini_lesson_id: int,
        title: Optional[str] = Form(None),
        sort_order: Optional[int] = Form(None),
        email: str = Form(...),
        db: Database = Depends(get_db)
    ):
        """Update mini-lesson via CMS"""
        await require_admin(email=email, db=db)
        await db.update_mini_lesson(mini_lesson_id, title=title, sort_order=sort_order)
        ml = await db.get_mini_lesson_by_id(mini_lesson_id)
        if not ml:
            raise HTTPException(status_code=404, detail="Mini-lesson not found")
        return ml

    # Tasks for mini-lessons CMS
    @app.get("/api/admin/mini-lessons/{mini_lesson_id}/tasks")
    async def get_admin_mini_lesson_tasks(
        mini_lesson_id: int,
        email: str = Query(...),
        db: Database = Depends(get_db)
    ):
        """Get all tasks for a mini-lesson"""
        await require_admin(email=email, db=db)
        tasks = await db.get_tasks_by_mini_lesson(mini_lesson_id)
        return [_serialize_bank_placement_task(task) for task in tasks]

    @app.post("/api/admin/mini-lessons/{mini_lesson_id}/tasks")
    async def create_task_in_mini_lesson_cms(
        mini_lesson_id: int,
        text: str = Form(""),
        answer: str = Form(""),
        question_type: str = Form("input"),
        text_scale: str = Form("md"),
        options: Optional[str] = Form(None),
        subquestions: Optional[str] = Form(None),
        image: Optional[UploadFile] = File(None),
        sort_order: int = Form(0),
        task_type: str = Form("standard"),
        bank_task_id: Optional[int] = Form(None),
        bank_difficulty: Optional[str] = Form(None),
        bank_topics: Optional[str] = Form(None),
        email: str = Form(...),
        db: Database = Depends(get_db)
    ):
        """Create task in mini-lesson via CMS"""
        admin_user = await require_admin(email=email, db=db)
        
        logger.info(
            "Create mini-lesson task: question_type=%s, has_options=%s, has_subquestions=%s, has_image=%s",
            question_type,
            bool(options),
            bool(subquestions),
            bool(image),
        )
        options_list = _parse_options_json(options)
        subquestions_list = _parse_subquestions_json(subquestions)
        logger.info("Parsed subquestions (mini-lesson): %s", subquestions_list)

        if bank_task_id:
            bank_task = await db.get_bank_task_by_id(int(bank_task_id), include_deleted=False)
            if not bank_task:
                raise HTTPException(status_code=404, detail="Bank task not found")
            linked_bank_task_id = int(bank_task_id)
            image_filename = None
        else:
            _validate_trial_like_payload(question_type, options_list, subquestions_list)
            if question_type == "factor_grid":
                answer = _normalize_factor_grid_answer_or_raise(answer)
            text_scale_value = _normalize_text_scale(text_scale)
            difficulty_value = _validate_bank_difficulty(bank_difficulty) if bank_difficulty else "B"
            topics_value = _parse_bank_topics_json(bank_topics, default_when_missing=[]) or []
            image_filename = await save_image_upload(image) if image else None

            bank_task = await db.create_bank_task(
                text=text,
                answer=answer,
                question_type=question_type,
                text_scale=text_scale_value,
                difficulty=difficulty_value,
                topics=topics_value,
                options=options_list,
                subquestions=subquestions_list,
                image_filename=image_filename,
                solution_filename=None,
                created_by=admin_user["id"],
            )
            linked_bank_task_id = int(bank_task["id"])

        task = await db.create_task_in_mini_lesson(
            mini_lesson_id=mini_lesson_id,
            text=text,
            answer=answer,
            created_by=admin_user["id"],
            question_type=question_type,
            options=options_list,
            subquestions=subquestions_list,
            sort_order=sort_order,
            task_type=task_type,
            image_filename=image_filename,
            solution_filename=None,
            bank_task_id=linked_bank_task_id,
            text_scale=_normalize_text_scale(text_scale),
        )
        created_task = await db.get_task_by_id(task.get("id"))
        return _serialize_bank_placement_task(created_task or task)

