"""CMS routes: lessons."""
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
    logger,
    require_admin,
    save_image_upload,
    FastAPI,
    Limiter,
)


def register_lesson_content_routes(app: FastAPI, db: Database, limiter: Limiter):
    @app.get("/api/admin/sections/{section_id}/lessons")
    async def get_admin_lessons(
        section_id: int,
        email: str = Query(...),
        db: Database = Depends(get_db)
    ):
        """Get all lessons for a section"""
        await require_admin(email=email, db=db)
        return await db.curriculum.get_lessons_by_section(section_id)

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
        lesson = await db.curriculum.create_lesson(section_id, lesson_number, title, sort_order)
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
        await db.curriculum.update_lesson(lesson_id, lesson_number=lesson_number, title=title, sort_order=sort_order)
        lesson = await db.curriculum.get_lesson_by_id(lesson_id)
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
        await db.curriculum.delete_lesson(lesson_id)
        return {"success": True}

    @app.get("/api/admin/lessons/{lesson_id}/mini-lessons")
    async def get_admin_mini_lessons(
        lesson_id: int,
        email: str = Query(...),
        db: Database = Depends(get_db)
    ):
        """Get all mini-lessons for a lesson"""
        await require_admin(email=email, db=db)
        await db.curriculum.ensure_default_mini_lessons(lesson_id)
        return await db.curriculum.get_mini_lessons_by_lesson(lesson_id)

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
        await db.curriculum.update_mini_lesson(mini_lesson_id, title=title, sort_order=sort_order)
        ml = await db.curriculum.get_mini_lesson_by_id(mini_lesson_id)
        if not ml:
            raise HTTPException(status_code=404, detail="Mini-lesson not found")
        return ml

    @app.get("/api/admin/mini-lessons/{mini_lesson_id}/tasks")
    async def get_admin_mini_lesson_tasks(
        mini_lesson_id: int,
        email: str = Query(...),
        db: Database = Depends(get_db)
    ):
        """Get all tasks for a mini-lesson"""
        await require_admin(email=email, db=db)
        tasks = await db.tasks.get_tasks_by_mini_lesson(mini_lesson_id)
        return [_serialize_bank_placement_task(task) for task in tasks]

    @app.post("/api/admin/mini-lessons/{mini_lesson_id}/tasks")
    async def create_task_in_mini_lesson_cms(
        mini_lesson_id: int,
        text: str = Form(""),
        answer: str = Form(""),
        question_type: str = Form("input"),
        answer_mode: Optional[str] = Form(None),
        accepted_answers: Optional[str] = Form(None),
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
            bank_task = await db.bank_tasks.get_task_by_id(int(bank_task_id), include_deleted=False)
            if not bank_task:
                raise HTTPException(status_code=404, detail="Bank task not found")
            linked_bank_task_id = int(bank_task_id)
            image_filename = None
        else:
            answer_mode_value = _normalize_answer_mode_or_raise(answer_mode, question_type)
            accepted_answers_value = _normalize_accepted_answers_or_raise(accepted_answers)
            _validate_trial_like_payload(question_type, options_list, subquestions_list)
            answer = _normalize_trial_like_answer_or_raise(question_type, answer, options_list)
            text_scale_value = _normalize_text_scale(text_scale)
            difficulty_value = _validate_bank_difficulty(bank_difficulty) if bank_difficulty else "B"
            topics_value = _parse_bank_topics_json(bank_topics, default_when_missing=[]) or []
            image_filename = await save_image_upload(image) if image else None

            bank_task = await db.bank_tasks.create_task(
                text=text,
                answer=answer,
                question_type=question_type,
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
        created_task = await db.tasks.get_task_by_id(task.get("id"))
        return _serialize_bank_placement_task(created_task or task)
