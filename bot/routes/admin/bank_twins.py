"""
Admin routes for twin tasks: number-only variants used by module mistake review.
"""
from .common import *  # noqa: F401,F403
from repositories.bank_task_repository import BankTwinError


def register_bank_twin_routes(app: FastAPI, db: Database, limiter: Limiter):
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
