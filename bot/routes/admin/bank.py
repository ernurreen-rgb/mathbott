"""
Admin bank routes.
"""
from .common import *  # noqa: F401,F403
from fastapi import Response

def register_bank_routes(app: FastAPI, db: Database, limiter: Limiter):
    # Bank tasks admin
    @app.get("/api/admin/bank/tasks")
    async def get_bank_tasks(
        admin_user: dict = Depends(require_admin_any_admin),
        db: Database = Depends(get_db),
        search: Optional[str] = Query(None),
        difficulty: Optional[str] = Query(None),
        topics: Optional[str] = Query(None, description="Comma-separated topics"),
        limit: int = Query(20, ge=1, le=100),
        offset: int = Query(0, ge=0),
    ):
        topics_list = [_normalize_topic_name(t) for t in (topics or "").split(",") if _normalize_topic_name(t)]
        difficulty_value = _validate_bank_difficulty(difficulty) if difficulty else None
        return await db.get_bank_tasks(
            include_deleted=False,
            search=search,
            difficulty=difficulty_value,
            topics=topics_list,
            limit=limit,
            offset=offset,
        )

    @app.get("/api/admin/bank/tasks/trash")
    async def get_bank_tasks_trash(
        admin_user: dict = Depends(require_admin_any_admin),
        db: Database = Depends(get_db),
        search: Optional[str] = Query(None),
        difficulty: Optional[str] = Query(None),
        topics: Optional[str] = Query(None, description="Comma-separated topics"),
        limit: int = Query(20, ge=1, le=100),
        offset: int = Query(0, ge=0),
    ):
        topics_list = [_normalize_topic_name(t) for t in (topics or "").split(",") if _normalize_topic_name(t)]
        difficulty_value = _validate_bank_difficulty(difficulty) if difficulty else None
        return await db.get_bank_tasks(
            include_deleted=True,
            search=search,
            difficulty=difficulty_value,
            topics=topics_list,
            limit=limit,
            offset=offset,
        )

    @app.get("/api/admin/bank/tasks/export")
    async def export_bank_tasks_json(
        admin_user: dict = Depends(require_admin_any_admin),
        db: Database = Depends(get_db),
    ):
        items = await db.export_bank_tasks(include_deleted=False)
        export_payload = [_serialize_bank_task_for_import_export(item) for item in items]
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        filename = f"bank_tasks_export_{timestamp}.json"
        return Response(
            content=json.dumps(export_payload, ensure_ascii=False, indent=2),
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    @app.get("/api/admin/bank/quality/summary")
    async def get_bank_quality_summary(
        admin_user: dict = Depends(require_admin_review_manage),
        db: Database = Depends(get_db),
    ):
        summary = await db.get_bank_quality_summary()
        summary["default_similarity_threshold"] = BANK_QUALITY_DUPLICATE_THRESHOLD_DEFAULT
        return summary

    @app.get("/api/admin/bank/quality/dead")
    async def get_bank_quality_dead_tasks(
        admin_user: dict = Depends(require_admin_review_manage),
        db: Database = Depends(get_db),
        search: Optional[str] = Query(None),
        difficulty: Optional[str] = Query(None),
        limit: int = Query(20),
        offset: int = Query(0),
    ):
        if limit < 1 or limit > 100:
            raise HTTPException(status_code=400, detail="limit must be between 1 and 100")
        if offset < 0:
            raise HTTPException(status_code=400, detail="offset must be >= 0")
        difficulty_value = _validate_bank_difficulty(difficulty) if difficulty else None
        return await db.get_bank_quality_dead_tasks(
            search=search,
            difficulty=difficulty_value,
            limit=limit,
            offset=offset,
        )

    @app.get("/api/admin/bank/quality/no-topics")
    async def get_bank_quality_no_topics_tasks(
        admin_user: dict = Depends(require_admin_review_manage),
        db: Database = Depends(get_db),
        search: Optional[str] = Query(None),
        difficulty: Optional[str] = Query(None),
        limit: int = Query(20),
        offset: int = Query(0),
    ):
        if limit < 1 or limit > 100:
            raise HTTPException(status_code=400, detail="limit must be between 1 and 100")
        if offset < 0:
            raise HTTPException(status_code=400, detail="offset must be >= 0")
        difficulty_value = _validate_bank_difficulty(difficulty) if difficulty else None
        return await db.get_bank_quality_no_topics_tasks(
            search=search,
            difficulty=difficulty_value,
            limit=limit,
            offset=offset,
        )

    @app.get("/api/admin/bank/quality/duplicates")
    async def get_bank_quality_duplicate_clusters(
        admin_user: dict = Depends(require_admin_review_manage),
        db: Database = Depends(get_db),
        threshold: float = Query(BANK_QUALITY_DUPLICATE_THRESHOLD_DEFAULT),
        search: Optional[str] = Query(None),
        difficulty: Optional[str] = Query(None),
        question_type: Optional[str] = Query(None),
        limit: int = Query(10),
        offset: int = Query(0),
    ):
        if threshold < 0.80 or threshold > 0.99:
            raise HTTPException(status_code=400, detail="threshold must be between 0.80 and 0.99")
        if limit < 1 or limit > 50:
            raise HTTPException(status_code=400, detail="limit must be between 1 and 50")
        if offset < 0:
            raise HTTPException(status_code=400, detail="offset must be >= 0")

        difficulty_value = _validate_bank_difficulty(difficulty) if difficulty else None

        question_type_value: Optional[str] = None
        if question_type is not None and question_type.strip():
            normalized_question_type = question_type.strip().lower()
            if normalized_question_type not in {"input", "tf", "mcq", "mcq6", "select", "factor_grid"}:
                raise HTTPException(
                    status_code=400,
                    detail="question_type must be one of input, tf, mcq, mcq6, select, factor_grid",
                )
            question_type_value = normalized_question_type

        return await db.get_bank_quality_duplicate_clusters(
            threshold=threshold,
            search=search,
            difficulty=difficulty_value,
            question_type=question_type_value,
            limit=limit,
            offset=offset,
        )

    @app.get("/api/admin/bank/audit")
    async def get_bank_audit_logs(
        admin_user: dict = Depends(require_admin_review_manage),
        db: Database = Depends(get_db),
        action: Optional[str] = Query(None),
        task_id: Optional[int] = Query(None),
        actor_email: Optional[str] = Query(None),
        limit: int = Query(20),
        offset: int = Query(0),
    ):
        if action is not None and action not in BANK_AUDIT_ACTIONS:
            raise HTTPException(
                status_code=400,
                detail=f"action must be one of {', '.join(sorted(BANK_AUDIT_ACTIONS))}",
            )
        if task_id is not None and int(task_id) < 1:
            raise HTTPException(status_code=400, detail="task_id must be >= 1")
        if limit < 1 or limit > 100:
            raise HTTPException(status_code=400, detail="limit must be between 1 and 100")
        if offset < 0:
            raise HTTPException(status_code=400, detail="offset must be >= 0")

        return await db.get_bank_audit_logs(
            action=action,
            task_id=task_id,
            actor_email=actor_email,
            limit=limit,
            offset=offset,
        )

    @app.post("/api/admin/bank/tasks/similar")
    async def find_similar_bank_tasks(
        payload: dict = Body(...),
        db: Database = Depends(get_db),
    ):
        email = payload.get("email")
        if not isinstance(email, str) or not email.strip():
            raise HTTPException(status_code=400, detail="email is required")
        await require_admin_any_admin(email=email, db=db)

        text = payload.get("text")
        if not isinstance(text, str) or not text.strip():
            raise HTTPException(status_code=400, detail="text is required")

        options = payload.get("options")
        if options is not None and not isinstance(options, list):
            raise HTTPException(status_code=400, detail="options must be an array when provided")

        question_type = payload.get("question_type")
        if question_type is not None and not isinstance(question_type, str):
            raise HTTPException(status_code=400, detail="question_type must be a string when provided")

        exclude_task_id = payload.get("exclude_task_id")
        if exclude_task_id is not None:
            try:
                exclude_task_id = int(exclude_task_id)
            except Exception:
                raise HTTPException(status_code=400, detail="exclude_task_id must be an integer")

        threshold_raw = payload.get("threshold", BANK_SIMILARITY_THRESHOLD_DEFAULT)
        limit_raw = payload.get("limit", BANK_SIMILARITY_LIMIT_DEFAULT)
        try:
            threshold = float(threshold_raw)
        except Exception:
            raise HTTPException(status_code=400, detail="threshold must be numeric")
        try:
            limit = int(limit_raw)
        except Exception:
            raise HTTPException(status_code=400, detail="limit must be integer")

        threshold = max(0.5, min(1.0, threshold))
        limit = max(1, min(50, limit))

        items = await db.find_similar_bank_tasks(
            text=text,
            options=options,
            question_type=question_type,
            exclude_task_id=exclude_task_id,
            threshold=threshold,
            limit=limit,
        )
        return {"items": items, "threshold": threshold, "limit": limit}

    @app.get("/api/admin/bank/tasks/{task_id}/versions")
    async def get_bank_task_versions(
        task_id: int,
        admin_user: dict = Depends(require_admin_any_admin),
        db: Database = Depends(get_db),
        limit: int = Query(50, ge=1, le=200),
        offset: int = Query(0, ge=0),
    ):
        task = await db.get_bank_task_by_id(task_id, include_deleted=True)
        if not task:
            raise HTTPException(status_code=404, detail="Bank task not found")
        return await db.get_bank_task_versions(task_id=task_id, limit=limit, offset=offset)

    @app.get("/api/admin/bank/tasks/{task_id}/versions/{version_no}")
    async def get_bank_task_version(
        task_id: int,
        version_no: int,
        admin_user: dict = Depends(require_admin_any_admin),
        db: Database = Depends(get_db),
    ):
        task = await db.get_bank_task_by_id(task_id, include_deleted=True)
        if not task:
            raise HTTPException(status_code=404, detail="Bank task not found")
        item = await db.get_bank_task_version(task_id=task_id, version_no=version_no)
        if not item:
            raise HTTPException(status_code=404, detail="Version not found")
        return item

    @app.delete("/api/admin/bank/tasks/{task_id}/versions/{version_no}")
    async def delete_bank_task_version(
        task_id: int,
        version_no: int,
        email: str = Query(...),
        db: Database = Depends(get_db),
    ):
        admin_user = await require_admin(email=email, db=db)
        if version_no < 1:
            raise HTTPException(status_code=400, detail="version_no must be >= 1")

        task = await db.get_bank_task_by_id(task_id, include_deleted=True)
        if not task:
            raise HTTPException(status_code=404, detail="Bank task not found")

        try:
            deleted = await db.delete_bank_task_version(
                task_id=task_id,
                version_no=version_no,
                actor_user_id=admin_user["id"],
                actor_email=admin_user.get("email"),
            )
        except BankTaskVersionDeleteError as exc:
            if str(exc) == "LAST_VERSION":
                raise HTTPException(
                    status_code=400,
                    detail={
                        "code": "LAST_VERSION_DELETE_FORBIDDEN",
                        "message": "Cannot permanently delete the last remaining version.",
                    },
                )
            raise

        if not deleted:
            raise HTTPException(status_code=404, detail="Version not found")
        return {"success": True}

    @app.post("/api/admin/bank/tasks/{task_id}/rollback")
    async def rollback_bank_task(
        task_id: int,
        payload: dict = Body(...),
        db: Database = Depends(get_db),
    ):
        email = payload.get("email")
        if not isinstance(email, str) or not email.strip():
            raise HTTPException(status_code=400, detail="email is required")
        admin_user = await require_admin(email=email, db=db)

        target_version = payload.get("target_version")
        if target_version is None:
            raise HTTPException(status_code=400, detail="target_version is required")
        try:
            target_version = int(target_version)
        except Exception:
            raise HTTPException(status_code=400, detail="target_version must be integer")
        if target_version < 1:
            raise HTTPException(status_code=400, detail="target_version must be >= 1")

        expected_current_version = payload.get("expected_current_version")
        if expected_current_version is not None:
            try:
                expected_current_version = int(expected_current_version)
            except Exception:
                raise HTTPException(status_code=400, detail="expected_current_version must be integer")

        reason = payload.get("reason")
        if reason is not None and not isinstance(reason, str):
            raise HTTPException(status_code=400, detail="reason must be string")

        task = await db.get_bank_task_by_id(task_id, include_deleted=True)
        if not task:
            raise HTTPException(status_code=404, detail="Bank task not found")
        if task.get("deleted_at"):
            raise HTTPException(status_code=400, detail="Cannot rollback a task from trash")

        try:
            updated = await db.rollback_bank_task(
                task_id=task_id,
                target_version=target_version,
                actor_user_id=admin_user["id"],
                actor_email=admin_user.get("email"),
                source="admin_bank_rollback",
                reason=reason,
                expected_current_version=expected_current_version,
            )
        except BankTaskVersionConflictError as exc:
            raise _raise_version_conflict_from_exception(exc)

        if not updated:
            raise HTTPException(status_code=404, detail="Version not found")
        return updated

    @app.get("/api/admin/bank/tasks/{task_id}/usage")
    async def get_bank_task_usage(
        task_id: int,
        admin_user: dict = Depends(require_admin_any_admin),
        db: Database = Depends(get_db),
        scope: str = Query("active"),
    ):
        task = await db.get_bank_task_by_id(task_id, include_deleted=True)
        if not task:
            raise HTTPException(status_code=404, detail="Bank task not found")
        include_deleted = str(scope).strip().lower() == "all"
        return await db.get_bank_task_usage(task_id=task_id, include_deleted=include_deleted)

    @app.get("/api/admin/bank/tasks/{task_id}")
    async def get_bank_task(
        task_id: int,
        admin_user: dict = Depends(require_admin_any_admin),
        db: Database = Depends(get_db),
    ):
        task = await db.get_bank_task_by_id(task_id, include_deleted=True)
        if not task:
            raise HTTPException(status_code=404, detail="Bank task not found")
        return task

    @app.post("/api/admin/bank/tasks/import")
    async def import_bank_tasks(
        payload: dict = Body(...),
        db: Database = Depends(get_db),
    ):
        mode_raw = payload.get("mode")
        if not isinstance(mode_raw, str) or not mode_raw.strip():
            raise _import_http_error("IMPORT_MODE_REQUIRED", "mode is required and must be dry_run or confirm")
        mode = mode_raw.strip().lower()
        if mode not in {"dry_run", "confirm"}:
            raise _import_http_error("IMPORT_MODE_INVALID", "mode must be dry_run or confirm")

        email = payload.get("email")
        if not isinstance(email, str) or not email.strip():
            raise HTTPException(status_code=400, detail="email is required")
        admin_user = await require_admin(email=email, db=db)
        email_norm = _normalize_email_for_token(email)

        raw_tasks = payload.get("tasks")
        if isinstance(raw_tasks, dict):
            task_payloads = [raw_tasks]
        elif isinstance(raw_tasks, list):
            task_payloads = raw_tasks
        else:
            raise HTTPException(status_code=400, detail="tasks must be an object or an array")

        if len(task_payloads) == 0:
            raise HTTPException(status_code=400, detail="tasks must not be empty")
        if len(task_payloads) > BANK_IMPORT_LIMIT:
            raise HTTPException(
                status_code=400,
                detail=f"Too many tasks in one import (max {BANK_IMPORT_LIMIT})",
            )

        normalized_tasks: List[Dict[str, Any]] = []
        errors: List[Dict[str, Any]] = []
        for idx, raw_task in enumerate(task_payloads):
            try:
                normalized_tasks.append(_normalize_import_bank_task(raw_task))
            except ImportTaskValidationError as exc:
                errors.append(
                    {
                        "index": idx,
                        "field": exc.field,
                        "message": exc.message,
                    }
                )

        payload_hash = _hash_import_payload(normalized_tasks)

        if mode == "dry_run":
            conflicts = await _collect_import_dedup_conflicts(db, normalized_tasks) if normalized_tasks else []
            token, exp_ts = _issue_import_preview_token(email_norm=email_norm, payload_hash=payload_hash)
            invalid_count = len(errors)
            total_tasks = len(task_payloads)
            valid_count = total_tasks - invalid_count
            duplicate_count = len(conflicts)
            return {
                "mode": "dry_run",
                "preview_token": token,
                "expires_at": datetime.fromtimestamp(exp_ts, tz=timezone.utc).isoformat(),
                "summary": {
                    "total_tasks": total_tasks,
                    "valid_count": valid_count,
                    "invalid_count": invalid_count,
                    "duplicate_count": duplicate_count,
                    "can_confirm": invalid_count == 0,
                    "requires_dedup_confirmation": duplicate_count > 0,
                },
                "validation_errors": errors,
                "duplicate_conflicts": conflicts,
            }

        token_payload = _verify_import_preview_token(payload.get("preview_token"), expected_email_norm=email_norm)
        token_payload_hash = str(token_payload.get("payload_hash") or "")
        if token_payload_hash != payload_hash:
            raise _import_http_error(
                "IMPORT_PREVIEW_PAYLOAD_MISMATCH",
                "Payload differs from the dry-run preview payload. Run dry-run again.",
            )

        if errors:
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "IMPORT_VALIDATION_FAILED",
                    "errors": errors,
                },
            )

        conflicts = await _collect_import_dedup_conflicts(db, normalized_tasks) if normalized_tasks else []
        dedup_flag = _parse_bool_flag(payload.get("dedup_confirmed"))
        if conflicts and not dedup_flag:
            raise HTTPException(status_code=409, detail=_build_import_similar_conflict_detail(conflicts))

        created_items = await db.create_bank_tasks_bulk_atomic(
            tasks=normalized_tasks,
            created_by=admin_user["id"],
            actor_email=admin_user.get("email"),
            source="admin_bank_import",
        )
        created_ids = [
            int(item["id"])
            for item in created_items
            if isinstance(item, dict) and isinstance(item.get("id"), int)
        ]
        return {
            "mode": "confirm",
            "created_count": len(created_ids),
            "created_ids": created_ids,
        }

    @app.post("/api/admin/bank/tasks")
    async def create_bank_task(
        text: str = Form(""),
        answer: str = Form(""),
        question_type: str = Form("input"),
        text_scale: str = Form("md"),
        difficulty: str = Form("B"),
        topics: Optional[str] = Form(None),
        options: Optional[str] = Form(None),
        subquestions: Optional[str] = Form(None),
        dedup_confirmed: Optional[str] = Form(None),
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
        if question_type == "factor_grid":
            answer = _normalize_factor_grid_answer_or_raise(answer)

        parsed_topics = []
        if topics is not None and topics.strip():
            try:
                parsed_topics = json.loads(topics)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Invalid topics JSON: {str(e)}")
        validated_topics = _validate_bank_topics(parsed_topics)

        dedup_flag = _parse_bool_flag(dedup_confirmed)
        similar_tasks = await db.find_similar_bank_tasks(
            text=text,
            options=options_list,
            question_type=question_type,
            threshold=BANK_SIMILARITY_THRESHOLD_DEFAULT,
            limit=BANK_SIMILARITY_LIMIT_DEFAULT,
        )
        if similar_tasks and not dedup_flag:
            raise HTTPException(status_code=409, detail=_build_similar_conflict_payload(similar_tasks))

        image_filename = await save_image_upload(image) if image else None

        task = await db.create_bank_task(
            text=text,
            answer=answer,
            question_type=question_type,
            text_scale=text_scale_value,
            difficulty=difficulty_value,
            topics=validated_topics,
            options=options_list,
            subquestions=subquestions_list,
            image_filename=image_filename,
            solution_filename=None,
            created_by=admin_user["id"],
            source="admin_bank_create",
        )
        return task

    @app.put("/api/admin/bank/tasks/{task_id}")
    async def update_bank_task(
        task_id: int,
        text: Optional[str] = Form(None),
        answer: Optional[str] = Form(None),
        question_type: Optional[str] = Form(None),
        text_scale: Optional[str] = Form(None),
        difficulty: Optional[str] = Form(None),
        topics: Optional[str] = Form(None),
        options: Optional[str] = Form(None),
        subquestions: Optional[str] = Form(None),
        dedup_confirmed: Optional[str] = Form(None),
        expected_current_version: Optional[int] = Form(None),
        image: Optional[UploadFile] = File(None),
        remove_image: Optional[str] = Form(None),
        email: str = Form(...),
        db: Database = Depends(get_db),
    ):
        admin_user = await require_admin(email=email, db=db)
        existing = await db.get_bank_task_by_id(task_id, include_deleted=True)
        if not existing:
            raise HTTPException(status_code=404, detail="Bank task not found")

        options_list = _parse_options_json(options) if options is not None else None
        subquestions_list = _parse_subquestions_json(subquestions) if subquestions is not None else None
        effective_question_type = question_type or existing.get("question_type", "input")
        effective_options = options_list if options_list is not None else existing.get("options")
        effective_subquestions = (
            subquestions_list if subquestions_list is not None else existing.get("subquestions")
        )
        _validate_trial_like_payload(
            effective_question_type,
            effective_options,
            effective_subquestions,
        )
        effective_answer = answer if answer is not None else existing.get("answer", "")
        if effective_question_type == "factor_grid":
            effective_answer = _normalize_factor_grid_answer_or_raise(effective_answer)
            answer = effective_answer

        text_scale_value = _normalize_text_scale(text_scale) if text_scale is not None else None
        difficulty_value = _validate_bank_difficulty(difficulty) if difficulty is not None else None

        topics_value: Optional[List[str]] = None
        if topics is not None:
            if topics.strip():
                try:
                    parsed_topics = json.loads(topics)
                except Exception as e:
                    raise HTTPException(status_code=400, detail=f"Invalid topics JSON: {str(e)}")
            else:
                parsed_topics = []
            topics_value = _validate_bank_topics(parsed_topics)

        remove_image_flag = str(remove_image).lower() in ("true", "1", "yes") if remove_image else False
        old_image_filename = existing.get("image_filename")
        if remove_image_flag:
            if old_image_filename:
                delete_image_file(old_image_filename)
            image_filename = ""
        elif image:
            if old_image_filename:
                delete_image_file(old_image_filename)
            image_filename = await save_image_upload(image)
        else:
            image_filename = None

        dedup_flag = _parse_bool_flag(dedup_confirmed)
        effective_text = text if text is not None else (existing.get("text") or "")
        effective_question_type = question_type if question_type is not None else (existing.get("question_type") or "input")
        effective_options_for_dedup = options_list if options_list is not None else existing.get("options")
        similar_tasks = await db.find_similar_bank_tasks(
            text=effective_text,
            options=effective_options_for_dedup if isinstance(effective_options_for_dedup, list) else None,
            question_type=effective_question_type,
            exclude_task_id=task_id,
            threshold=BANK_SIMILARITY_THRESHOLD_DEFAULT,
            limit=BANK_SIMILARITY_LIMIT_DEFAULT,
        )
        if similar_tasks and not dedup_flag:
            raise HTTPException(status_code=409, detail=_build_similar_conflict_payload(similar_tasks))

        try:
            updated = await db.update_bank_task(
                task_id=task_id,
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
                actor_user_id=admin_user["id"],
                source="admin_bank_update",
                expected_current_version=expected_current_version,
            )
        except BankTaskVersionConflictError as exc:
            raise _raise_version_conflict_from_exception(exc)
        if not updated:
            raise HTTPException(status_code=404, detail="Bank task not found")
        return updated

    @app.delete("/api/admin/bank/tasks/{task_id}")
    async def delete_bank_task(
        task_id: int,
        email: str = Query(...),
        db: Database = Depends(get_db),
    ):
        admin_user = await require_admin(email=email, db=db)
        existing = await db.get_bank_task_by_id(task_id, include_deleted=True)
        if not existing:
            raise HTTPException(status_code=404, detail="Bank task not found")
        if existing.get("deleted_at"):
            raise HTTPException(status_code=400, detail="Bank task is already in trash")
        await db.soft_delete_bank_task(
            task_id,
            actor_user_id=admin_user["id"],
            source="admin_bank_soft_delete",
        )
        return {"success": True}

    @app.post("/api/admin/bank/tasks/{task_id}/restore")
    async def restore_bank_task(
        task_id: int,
        email: str = Query(...),
        db: Database = Depends(get_db),
    ):
        admin_user = await require_admin(email=email, db=db)
        existing = await db.get_bank_task_by_id(task_id, include_deleted=True)
        if not existing:
            raise HTTPException(status_code=404, detail="Bank task not found")
        if not existing.get("deleted_at"):
            raise HTTPException(status_code=400, detail="Bank task is not in trash")
        await db.restore_bank_task(
            task_id,
            actor_user_id=admin_user["id"],
            source="admin_bank_restore",
        )
        restored = await db.get_bank_task_by_id(task_id, include_deleted=True)
        return restored

    @app.delete("/api/admin/bank/tasks/{task_id}/permanent")
    async def permanently_delete_bank_task(
        task_id: int,
        email: str = Query(...),
        db: Database = Depends(get_db),
    ):
        admin_user = await require_admin(email=email, db=db, capability=CAPABILITY_SUPER_CRITICAL)
        existing = await db.get_bank_task_by_id(task_id, include_deleted=True)
        if not existing:
            raise HTTPException(status_code=404, detail="Bank task not found")
        if not existing.get("deleted_at"):
            raise HTTPException(status_code=400, detail="Bank task must be moved to trash first")

        image_filename = existing.get("image_filename")

        deleted = await db.hard_delete_bank_task(
            task_id,
            actor_user_id=admin_user["id"],
            actor_email=admin_user.get("email"),
        )
        if not deleted:
            raise HTTPException(status_code=404, detail="Bank task not found")
        if image_filename:
            delete_image_file(image_filename)
        return {"success": True}

    @app.get("/api/admin/bank/topics")
    async def get_bank_topics(
        admin_user: dict = Depends(require_admin_any_admin),
        db: Database = Depends(get_db),
        q: Optional[str] = Query(None),
        limit: int = Query(20, ge=1, le=100),
    ):
        items = await db.get_bank_topics(query=q, limit=limit)
        return {"items": items}

    # Trial test templates removed in bank-only mode.

