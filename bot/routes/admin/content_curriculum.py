"""CMS routes: curriculum."""
from .common import (
    Database,
    Depends,
    File,
    Form,
    HTTPException,
    Optional,
    Query,
    UploadFile,
    _normalize_accepted_answers_or_raise,
    _normalize_answer_mode_or_raise,
    _normalize_text_scale,
    _normalize_trial_like_answer_or_raise,
    _parse_bank_topics_json,
    _parse_options_json,
    _parse_subquestions_json,
    _serialize_bank_placement_task,
    _validate_bank_difficulty,
    _validate_trial_like_payload,
    get_db,
    json,
    logger,
    require_admin,
    sanitize_html,
    save_image_upload,
    validate_email,
    validate_string_length,
    FastAPI,
    Limiter,
)


def register_curriculum_content_routes(app: FastAPI, db: Database, limiter: Limiter):
    @app.get("/api/admin/modules")
    async def get_admin_modules(admin_user: dict = Depends(require_admin), db: Database = Depends(get_db)):
        """Get all modules for CMS"""
        modules = await db.curriculum.get_all_modules()
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
            module = await db.curriculum.create_module(name, description, icon, sort_order)
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

        await db.curriculum.update_module(module_id, name, description, icon, sort_order)
        module = await db.curriculum.get_module_by_id(module_id)
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
        await db.curriculum.delete_module(module_id)
        return {"success": True}

    @app.get("/api/admin/modules/{module_id}/sections")
    async def get_admin_sections(
        module_id: int,
        email: str = Query(...),
        db: Database = Depends(get_db)
    ):
        """Get all sections for a module"""
        await require_admin(email=email, db=db)
        sections = await db.curriculum.get_sections_by_module(module_id)
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
        section = await db.curriculum.create_section(module_id, name, sort_order, description)
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
        await db.curriculum.update_section(section_id, name, sort_order, description, guide)
        section = await db.curriculum.get_section_by_id(section_id)
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
        await db.curriculum.delete_section(section_id)
        return {"success": True}

    @app.get("/api/admin/sections/{section_id}/tasks")
    async def get_admin_section_tasks(
        section_id: int,
        email: str = Query(...),
        db: Database = Depends(get_db)
    ):
        """Get all tasks for a section"""
        await require_admin(email=email, db=db)
        tasks = await db.tasks.get_tasks_by_section(section_id)
        return [_serialize_bank_placement_task(task) for task in tasks]

    @app.post("/api/admin/sections/{section_id}/tasks")
    async def create_task_in_section_cms(
        section_id: int,
        text: str = Form(""),
        answer: str = Form(""),
        question_type: str = Form("input"),
        answer_mode: Optional[str] = Form(None),
        accepted_answers: Optional[str] = Form(None),
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
                bank_task = await db.bank_tasks.get_task_by_id(int(bank_task_id), include_deleted=False)
                if not bank_task:
                    raise HTTPException(status_code=404, detail="Bank task not found")
                linked_bank_task_id = int(bank_task_id)
                image_filename = None
            else:
                effective_qt = question_type or "input"
                answer_mode_value = _normalize_answer_mode_or_raise(answer_mode, effective_qt)
                accepted_answers_value = _normalize_accepted_answers_or_raise(accepted_answers)
                _validate_trial_like_payload(effective_qt, options_list, subquestions_list)
                answer = _normalize_trial_like_answer_or_raise(effective_qt, answer, options_list)
                text_scale_value = _normalize_text_scale(text_scale)
                difficulty_value = _validate_bank_difficulty(bank_difficulty) if bank_difficulty else "B"
                topics_value = _parse_bank_topics_json(bank_topics, default_when_missing=[]) or []
                image_filename = await save_image_upload(image) if image else None

                bank_task = await db.bank_tasks.create_task(
                    text=text,
                    answer=answer,
                    question_type=effective_qt,
                    answer_mode=answer_mode_value,
                    accepted_answers=accepted_answers_value,
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
            created_task = await db.tasks.get_task_by_id(task.get("id"))
            return _serialize_bank_placement_task(created_task or task)
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error creating task in section: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Internal server error")
