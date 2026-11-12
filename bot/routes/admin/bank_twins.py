"""
Admin routes for twin tasks: number-only variants used by module mistake review.
"""
from .common import *  # noqa: F401,F403
from repositories.bank_task_repository import BankTwinError
from services import ai_twins
from services.ai_twins import AiTwinError, TwinDraft

_AI_ERROR_STATUS = {"not_configured": 503, "timeout": 504}


def _validated_ai_draft(source: dict, draft: TwinDraft) -> dict:
    """Apply the bank's own payload rules to an AI draft; raises HTTPException when it breaks them."""
    question_type = source.get("question_type") or "input"
    options = [option.model_dump() for option in draft.options] if draft.options else None
    subquestions = [item.model_dump() for item in draft.subquestions] if draft.subquestions else None
    if question_type not in {*MCQ_QUESTION_TYPES, "select"}:
        options = None
    if question_type != "select":
        subquestions = None
    _validate_trial_like_payload(question_type, options, subquestions)
    answer = _normalize_trial_like_answer_or_raise(question_type, draft.answer, options)
    if question_type == "select":
        # Matching answers are derived from the sub-questions, as the bank form does.
        answer = json.dumps([str(item["correct"]).strip().upper() for item in subquestions])
    elif question_type == "tf":
        answer = answer.strip().lower()
        if answer not in {"true", "false"}:
            raise HTTPException(status_code=400, detail="tf answer must be true or false")
    return {
        "text": draft.text,
        "answer": answer,
        "accepted_answers": _normalize_accepted_answers_or_raise(draft.accepted_answers),
        "options": options,
        "subquestions": subquestions,
    }


def register_bank_twin_routes(app: FastAPI, db: Database, limiter: Limiter):
    @app.get("/api/admin/bank/ai-twins/status")
    async def get_ai_twin_status(admin_user: dict = Depends(require_admin_any_admin)):
        settings = get_settings()
        return {
            "enabled": settings.ai_twins_enabled,
            "model": settings.ai_twin_model or None,
            "drafts_per_request": ai_twins.TWIN_DRAFTS_PER_REQUEST,
        }

    @app.post("/api/admin/bank/tasks/{task_id}/twins/ai-drafts")
    @limiter.limit("20/hour")
    async def create_ai_twin_drafts(
        request: Request,
        task_id: int,
        email: str = Form(...),
        db: Database = Depends(get_db),
    ):
        admin_user = await require_admin(email=email, db=db)
        source = await db.bank_tasks.get_task_by_id(task_id)
        if not source:
            raise HTTPException(status_code=404, detail="Bank task not found")
        if source.get("twin_source_id"):
            raise HTTPException(status_code=400, detail="Егіздің өз егізі болмайды. Бастапқы есепке егіз қосыңыз.")
        if source.get("image_filename"):
            # Numbers drawn in the picture would no longer match the changed text.
            raise HTTPException(status_code=400, detail="Суреті бар есепке ЖИ егіз жасамайды: сандар суретте болуы мүмкін. Егізді қолмен жасаңыз.")
        try:
            drafts = await ai_twins.generate_twin_drafts(source)
        except AiTwinError as exc:
            raise HTTPException(status_code=_AI_ERROR_STATUS.get(exc.kind, 502), detail=str(exc))

        model = get_settings().ai_twin_model
        created, skipped = [], []
        for index, draft in enumerate(drafts, start=1):
            try:
                payload = _validated_ai_draft(source, draft)
                created.append(await db.bank_tasks.create_twin(
                    task_id,
                    **payload,
                    question_type=source.get("question_type") or "input",
                    answer_mode=source.get("answer_mode") or "choices",
                    text_scale=source.get("text_scale") or "md",
                    difficulty=source.get("difficulty") or "B",
                    topics=source.get("topics") or [],
                    image_filename=None,
                    keep_source_image=False,
                    created_by=admin_user["id"],
                    actor_email=admin_user.get("email"),
                    status="draft",
                    origin="ai",
                    ai_model=model,
                ))
            except (HTTPException, BankTwinError) as exc:
                skipped.append({"index": index, "reason": exc.detail if isinstance(exc, HTTPException) else str(exc)})
        return {"items": created, "skipped": skipped, "model": model}

    @app.post("/api/admin/bank/tasks/{task_id}/ai-check")
    @limiter.limit("120/hour")
    async def check_ai_twin(
        request: Request,
        task_id: int,
        email: str = Form(...),
        db: Database = Depends(get_db),
    ):
        await require_admin(email=email, db=db)
        if not await db.bank_tasks.get_twin_link(task_id):
            raise HTTPException(status_code=404, detail="Бұл есеп егіз емес.")
        task = await db.bank_tasks.get_task_by_id(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Bank task not found")
        version = int(task.get("current_version") or 1)
        try:
            solved = await ai_twins.solve_task(task)
        except AiTwinError as exc:
            if exc.kind != "not_configured":
                await db.bank_tasks.record_twin_check(task_id, status="error", answer=None, version=version)
            raise HTTPException(status_code=_AI_ERROR_STATUS.get(exc.kind, 502), detail=str(exc))
        status = "match" if is_task_answer_correct(task, solved) else "mismatch"
        await db.bank_tasks.record_twin_check(task_id, status=status, answer=solved, version=version)
        return {"status": status, "answer": solved, "checked_version": version}

    @app.post("/api/admin/bank/tasks/{task_id}/approve")
    async def approve_twin_draft(
        task_id: int,
        email: str = Form(...),
        db: Database = Depends(get_db),
    ):
        admin_user = await require_admin(email=email, db=db)
        task = await db.bank_tasks.get_task_by_id(task_id)
        if not task or not task.get("twin_source_id"):
            raise HTTPException(status_code=404, detail="Бұл есеп егіз емес.")
        if not await db.bank_tasks.approve_twin(task_id, actor_user_id=admin_user["id"], actor_email=admin_user.get("email")):
            raise HTTPException(status_code=409, detail="Егіз мақұлданып қойылған.")
        return await db.bank_tasks.get_task_by_id(task_id)
    @app.get("/api/admin/bank/tasks/{task_id}/twins")
    async def get_bank_task_twins(
        task_id: int,
        admin_user: dict = Depends(require_admin_any_admin),
        db: Database = Depends(get_db),
    ):
        task = await db.bank_tasks.get_task_by_id(task_id, include_deleted=True)
        if not task:
            raise HTTPException(status_code=404, detail="Bank task not found")
        items = [] if task.get("twin_source_id") else await db.bank_tasks.list_twins(task_id)
        return {"source_id": task_id, "twin_source_id": task.get("twin_source_id"), "items": items}

    @app.post("/api/admin/bank/tasks/{task_id}/twins")
    async def create_bank_task_twin(
        task_id: int,
        text: str = Form(""),
        answer: str = Form(""),
        question_type: str = Form("input"),
        answer_mode: Optional[str] = Form(None),
        accepted_answers: Optional[str] = Form(None),
        text_scale: str = Form("md"),
        difficulty: str = Form("B"),
        topics: Optional[str] = Form(None),
        options: Optional[str] = Form(None),
        subquestions: Optional[str] = Form(None),
        keep_source_image: Optional[str] = Form(None),
        image: Optional[UploadFile] = File(None),
        email: str = Form(...),
        db: Database = Depends(get_db),
    ):
        admin_user = await require_admin(email=email, db=db)
        difficulty_value = _validate_bank_difficulty(difficulty)
        text_scale_value = _normalize_text_scale(text_scale)
        options_list = _parse_options_json(options)
        subquestions_list = _parse_subquestions_json(subquestions)
        _validate_trial_like_payload(question_type, options_list, subquestions_list)
        answer_mode_value = _normalize_answer_mode_or_raise(answer_mode, question_type)
        accepted_answers_value = _normalize_accepted_answers_or_raise(accepted_answers)
        answer = _normalize_trial_like_answer_or_raise(question_type, answer, options_list)
        if not text.strip():
            raise HTTPException(status_code=400, detail="Егіз есептің мәтінін толтырыңыз.")
        if not str(answer or "").strip():
            raise HTTPException(status_code=400, detail="Егіз есептің жауабын толтырыңыз.")

        parsed_topics = []
        if topics is not None and topics.strip():
            try:
                parsed_topics = json.loads(topics)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Invalid topics JSON: {str(e)}")
        validated_topics = _validate_bank_topics(parsed_topics)

        # Twins are deliberately near-identical to their source, so no duplicate check runs here.
        image_filename = await save_image_upload(image) if image else None
        try:
            return await db.bank_tasks.create_twin(
                task_id,
                text=text,
                answer=answer,
                question_type=question_type,
                answer_mode=answer_mode_value,
                accepted_answers=accepted_answers_value,
                text_scale=text_scale_value,
                difficulty=difficulty_value,
                topics=validated_topics,
                options=options_list,
                subquestions=subquestions_list,
                image_filename=image_filename,
                keep_source_image=_parse_bool_flag(keep_source_image),
                created_by=admin_user["id"],
                actor_email=admin_user.get("email"),
            )
        except BankTwinError as exc:
            if image_filename:
                delete_image_file(image_filename)
            raise HTTPException(status_code=404 if exc.code == "not_found" else 400, detail=str(exc))
