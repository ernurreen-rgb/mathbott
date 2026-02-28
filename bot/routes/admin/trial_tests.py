"""
Admin trial test routes.
"""
from .common import *  # noqa: F401,F403

def register_trial_tests_routes(app: FastAPI, db: Database, limiter: Limiter):
    # Trial tests admin
    @app.get("/api/admin/trial-tests")
    async def get_admin_trial_tests(admin_user: dict = Depends(require_admin), db: Database = Depends(get_db)):
        """Get all trial tests (admin only)"""
        try:
            tests = await db.get_trial_tests()
            return tests
        except Exception as e:
            logger.error(f"Error getting trial tests: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Internal server error")

    @app.post("/api/admin/trial-tests")
    async def create_trial_test_admin(
        title: str = Form(...),
        description: Optional[str] = Form(None),
        sort_order: int = Form(0),
        expected_tasks_count: int = Form(40),
        email: str = Form(...),
        db: Database = Depends(get_db)
    ):
        """Create a new trial test (admin only)"""
        admin_user = await require_admin(email=email, db=db)
        
        try:
            test = await db.create_trial_test(
                title=title,
                description=description if description and description.strip() else None,
                sort_order=sort_order,
                created_by=admin_user["id"],
                expected_tasks_count=expected_tasks_count,
            )
            return test
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error creating trial test: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Internal server error")

    @app.put("/api/admin/trial-tests/{test_id}")
    async def update_trial_test_admin(
        test_id: int,
        title: Optional[str] = Form(None),
        description: Optional[str] = Form(None),
        sort_order: Optional[int] = Form(None),
        expected_tasks_count: Optional[int] = Form(None),
        email: str = Form(...),
        db: Database = Depends(get_db)
    ):
        """Update trial test (admin only)"""
        await require_admin(email=email, db=db)
        
        try:
            test = await db.update_trial_test(
                test_id=test_id,
                title=title,
                description=description if description and description.strip() else None,
                sort_order=sort_order,
                expected_tasks_count=expected_tasks_count,
            )
            if not test:
                raise HTTPException(status_code=404, detail="Trial test not found")
            return test
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error updating trial test: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Internal server error")

    @app.delete("/api/admin/trial-tests/{test_id}")
    async def delete_trial_test_admin(
        test_id: int,
        email: str = Query(...),
        db: Database = Depends(get_db)
    ):
        """Delete trial test (admin only)"""
        await require_admin(email=email, db=db)
        
        try:
            await db.delete_trial_test(test_id)
            return {"success": True}
        except Exception as e:
            logger.error(f"Error deleting trial test: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Internal server error")

    @app.get("/api/admin/trial-tests/{test_id}/tasks")
    async def get_trial_test_tasks_admin(
        test_id: int,
        email: str = Query(...),
        db: Database = Depends(get_db),
    ):
        """Get trial test tasks for admin editing, including answers and bank metadata."""
        await require_admin(email=email, db=db)

        test = await db.get_trial_test_by_id(test_id)
        if not test:
            raise HTTPException(status_code=404, detail="Trial test not found")

        tasks = await db.get_trial_test_tasks(test_id)
        serialized_tasks = [_serialize_bank_placement_task(task) for task in tasks]

        # Enrich topics for linked bank tasks.
        bank_ids = [
            int(t["bank_task_id"])
            for t in serialized_tasks
            if isinstance(t.get("bank_task_id"), int) and int(t["bank_task_id"]) > 0
        ]
        unique_bank_ids = sorted(set(bank_ids))
        topics_map: dict[int, List[str]] = {}
        for bank_id in unique_bank_ids:
            bank_task = await db.get_bank_task_by_id(bank_id, include_deleted=True)
            if not bank_task:
                continue
            topics_map[bank_id] = bank_task.get("topics") if isinstance(bank_task.get("topics"), list) else []
            for item in serialized_tasks:
                if item.get("bank_task_id") == bank_id:
                    item["bank_topics"] = topics_map[bank_id]
                    item["bank_difficulty"] = bank_task.get("difficulty") or item.get("bank_difficulty")
                    if isinstance(item.get("bank_task"), dict):
                        item["bank_task"]["difficulty"] = item["bank_difficulty"]
                        item["bank_task"]["topics"] = item["bank_topics"]

        return {
            "tasks": serialized_tasks,
            "placements": serialized_tasks,
            "expected_tasks_count": int(test.get("expected_tasks_count") or 40),
        }

    @app.put("/api/admin/trial-tests/{test_id}/slots/{slot_index}")
    async def upsert_trial_test_slot_admin(
        test_id: int,
        slot_index: int,
        payload: dict = Body(...),
        db: Database = Depends(get_db),
    ):
        """Upsert trial-test slot placement by slot index (1-based)."""
        email = payload.get("email")
        if not isinstance(email, str) or not email.strip():
            raise HTTPException(status_code=400, detail="email is required")
        admin_user = await require_admin(email=email, db=db)

        test = await db.get_trial_test_by_id(test_id)
        if not test:
            raise HTTPException(status_code=404, detail="Trial test not found")
        if slot_index < 1:
            raise HTTPException(status_code=400, detail="slot_index must be >= 1")

        raw_bank_task_id = payload.get("bank_task_id")
        bank_task_id: Optional[int] = None
        if raw_bank_task_id is not None:
            try:
                bank_task_id = int(raw_bank_task_id)
            except Exception:
                raise HTTPException(status_code=400, detail="bank_task_id must be integer")

        if bank_task_id:
            existing_bank = await db.get_bank_task_by_id(bank_task_id, include_deleted=False)
            if not existing_bank:
                raise HTTPException(status_code=404, detail="Bank task not found")
        else:
            text = str(payload.get("text") or "")
            answer = str(payload.get("answer") or "")
            question_type = str(payload.get("question_type") or "input")
            text_scale = _normalize_text_scale(payload.get("text_scale"))

            raw_options = payload.get("options")
            if isinstance(raw_options, str):
                options_list = _parse_options_json(raw_options)
            else:
                options_list = raw_options if isinstance(raw_options, list) else None

            raw_subquestions = payload.get("subquestions")
            if isinstance(raw_subquestions, str):
                subquestions_list = _parse_subquestions_json(raw_subquestions)
            else:
                subquestions_list = raw_subquestions if isinstance(raw_subquestions, list) else None

            _validate_trial_like_payload(question_type, options_list, subquestions_list)
            if question_type == "factor_grid":
                answer = _normalize_factor_grid_answer_or_raise(answer)

            difficulty_value = _validate_bank_difficulty(payload.get("bank_difficulty") or "B")
            raw_topics = payload.get("bank_topics")
            if isinstance(raw_topics, str):
                try:
                    topics_list = json.loads(raw_topics) if raw_topics.strip() else []
                except Exception as e:
                    raise HTTPException(status_code=400, detail=f"Invalid bank_topics JSON: {str(e)}")
            else:
                topics_list = raw_topics if isinstance(raw_topics, list) else []
            topics_value = _validate_bank_topics(topics_list)

            created_bank = await db.create_bank_task(
                text=text,
                answer=answer,
                question_type=question_type,
                text_scale=text_scale,
                difficulty=difficulty_value,
                topics=topics_value,
                options=options_list,
                subquestions=subquestions_list,
                image_filename=None,
                solution_filename=None,
                created_by=admin_user["id"],
            )
            bank_task_id = int(created_bank["id"])

        placement = await db.upsert_trial_test_slot(
            trial_test_id=test_id,
            slot_index=slot_index,
            bank_task_id=bank_task_id,
            created_by=admin_user["id"],
        )
        serialized = _serialize_bank_placement_task(placement)
        linked_bank = await db.get_bank_task_by_id(bank_task_id, include_deleted=True)
        if linked_bank:
            serialized["bank_topics"] = linked_bank.get("topics") if isinstance(linked_bank.get("topics"), list) else []
            if isinstance(serialized.get("bank_task"), dict):
                serialized["bank_task"]["topics"] = serialized["bank_topics"]
                serialized["bank_task"]["difficulty"] = linked_bank.get("difficulty")
        return serialized

    @app.delete("/api/admin/trial-tests/{test_id}/slots/{slot_index}")
    async def clear_trial_test_slot_admin(
        test_id: int,
        slot_index: int,
        email: str = Query(...),
        db: Database = Depends(get_db),
    ):
        """Clear trial-test slot placement by slot index (1-based)."""
        await require_admin(email=email, db=db)
        test = await db.get_trial_test_by_id(test_id)
        if not test:
            raise HTTPException(status_code=404, detail="Trial test not found")
        if slot_index < 1:
            raise HTTPException(status_code=400, detail="slot_index must be >= 1")
        cleared = await db.clear_trial_test_slot(test_id, slot_index)
        return {"success": True, "cleared": cleared}

    @app.post("/api/admin/trial-tests/{test_id}/tasks/create")
    async def create_task_for_trial_test_admin(
        test_id: int,
        text: str = Form(""),
        answer: str = Form(""),
        question_type: str = Form("input"),
        text_scale: str = Form("md"),
        options: Optional[str] = Form(None),
        subquestions: Optional[str] = Form(None),
        bank_difficulty: Optional[str] = Form(None),
        bank_topics: Optional[str] = Form(None),
        image: Optional[UploadFile] = File(None),
        sort_order: int = Form(0),
        email: str = Form(...),
        db: Database = Depends(get_db)
    ):
        """Create a new task for a trial test (admin only)"""
        admin_user = await require_admin(email=email, db=db)
        
        test = await db.get_trial_test_by_id(test_id)
        if not test:
            raise HTTPException(status_code=404, detail="Trial test not found")
        
        logger.info(
            "Create trial test task: question_type=%s, has_options=%s, has_subquestions=%s, has_image=%s",
            question_type,
            bool(options),
            bool(subquestions),
            bool(image),
        )
        options_list = None
        if options:
            try:
                options_list = json.loads(options)
                if not isinstance(options_list, list):
                    raise ValueError("Options must be a JSON array")
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Invalid options JSON: {str(e)}")

        if subquestions is not None and not subquestions.strip():
            subquestions = None
        subquestions_list = None
        if subquestions:
            try:
                subquestions_list = json.loads(subquestions)
                if not isinstance(subquestions_list, list) or len(subquestions_list) != 2:
                    raise ValueError("Subquestions must be a JSON array of length 2")
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Invalid subquestions JSON: {str(e)}")
        logger.info("Parsed subquestions (trial test create): %s", subquestions_list)

        difficulty_value = _validate_bank_difficulty(bank_difficulty) if bank_difficulty else "B"
        text_scale_value = _normalize_text_scale(text_scale)
        topics_value = _parse_bank_topics_json(bank_topics, default_when_missing=[]) or []

        bank_image_filename = await save_image_upload(image) if image else None

        bank_task = await db.create_bank_task(
            text=text,
            answer=answer,
            question_type=question_type,
            text_scale=text_scale_value,
            difficulty=difficulty_value,
            topics=topics_value,
            options=options_list,
            subquestions=subquestions_list,
            image_filename=bank_image_filename,
            solution_filename=None,
            created_by=admin_user["id"],
        )
        bank_task_id = bank_task.get("id")
        if not isinstance(bank_task_id, int):
            raise HTTPException(status_code=500, detail="Failed to create bank task")

        try:
            task = await db.create_trial_test_task(
                trial_test_id=test_id,
                text=text,
                answer=answer,
                question_type=question_type,
                text_scale=text_scale_value,
                options=options_list,
                subquestions=subquestions_list,
                image_filename=None,
                solution_filename=None,
                created_by=admin_user["id"],
                sort_order=sort_order,
                bank_task_id=bank_task_id,
            )
        except Exception:
            # Best effort rollback to avoid leaving orphaned active bank tasks.
            try:
                await db.soft_delete_bank_task(bank_task_id)
            except Exception:
                pass
            raise

        return task

    async def _update_trial_test_task_admin_common(
        *,
        test_id: int,
        task_id: int,
        text: str,
        answer: str,
        question_type: str,
        text_scale: str,
        options: Optional[str],
        subquestions: Optional[str],
        bank_difficulty: Optional[str],
        bank_topics: Optional[str],
        image: Optional[UploadFile],
        remove_image: Optional[str],
        sort_order: Optional[int],
        email: str,
        db: Database,
        source_label: str,
    ) -> dict:
        admin_user = await require_admin(email=email, db=db)
        remove_image_flag = str(remove_image).lower() in ("true", "1", "yes") if remove_image else False

        task = await db.get_trial_test_task(task_id)
        if not task or task.get("trial_test_id") != test_id:
            raise HTTPException(status_code=404, detail="Trial test task not found")

        if task.get("created_by") and task.get("created_by") != admin_user["id"]:
            raise HTTPException(status_code=403, detail="You can only edit your own tasks")

        logger.info(
            "Update trial test task %s: question_type=%s, has_options=%s, has_subquestions=%s, has_image=%s",
            source_label,
            question_type,
            bool(options),
            bool(subquestions),
            bool(image),
        )

        options_list = None
        if options:
            try:
                options_list = json.loads(options)
                if not isinstance(options_list, list):
                    raise ValueError("Options must be a JSON array")
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Invalid options JSON: {str(e)}")

        if subquestions is not None and not subquestions.strip():
            subquestions = None
        subquestions_list = None
        if subquestions:
            try:
                subquestions_list = json.loads(subquestions)
                if not isinstance(subquestions_list, list) or len(subquestions_list) != 2:
                    raise ValueError("Subquestions must be a JSON array of length 2")
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Invalid subquestions JSON: {str(e)}")
        logger.info("Parsed subquestions (trial test %s): %s", source_label, subquestions_list)

        difficulty_value = _validate_bank_difficulty(bank_difficulty) if bank_difficulty and bank_difficulty.strip() else None
        text_scale_value = _normalize_text_scale(text_scale)
        topics_value = _parse_bank_topics_json(bank_topics, default_when_missing=None)

        old_image_filename = task.get("image_filename")
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

        await db.update_trial_test_task(
            task_id=task_id,
            sort_order=sort_order,
            text_scale=text_scale_value,
        )

        bank_task_id = task.get("bank_task_id")
        if isinstance(bank_task_id, int) and bank_task_id > 0:
            bank_task = await db.get_bank_task_by_id(bank_task_id, include_deleted=True)
            if bank_task:
                await db.update_bank_task(
                    task_id=bank_task_id,
                    text=text if text else None,
                    answer=answer if answer else None,
                    question_type=question_type,
                    text_scale=text_scale_value,
                    options=options_list if options is not None else None,
                    subquestions=subquestions_list if subquestions is not None else None,
                    image_filename=image_filename,
                    solution_filename=None,
                    difficulty=difficulty_value,
                    topics=topics_value,
                    actor_user_id=admin_user["id"],
                    source="admin_trial_task_update",
                )

        return {"success": True}

    @app.put("/api/admin/trial-tests/{test_id}/tasks/{task_id}")
    async def update_task_for_trial_test_admin(
        test_id: int,
        task_id: int,
        text: str = Form(""),
        answer: str = Form(""),
        question_type: str = Form("input"),
        text_scale: str = Form("md"),
        options: Optional[str] = Form(None),
        subquestions: Optional[str] = Form(None),
        bank_difficulty: Optional[str] = Form(None),
        bank_topics: Optional[str] = Form(None),
        image: Optional[UploadFile] = File(None),
        remove_image: Optional[str] = Form(None),
        sort_order: Optional[int] = Form(None),
        email: str = Form(...),
        db: Database = Depends(get_db)
    ):
        """Update a task for a trial test (admin only)"""
        return await _update_trial_test_task_admin_common(
            test_id=test_id,
            task_id=task_id,
            text=text,
            answer=answer,
            question_type=question_type,
            text_scale=text_scale,
            options=options,
            subquestions=subquestions,
            bank_difficulty=bank_difficulty,
            bank_topics=bank_topics,
            image=image,
            remove_image=remove_image,
            sort_order=sort_order,
            email=email,
            db=db,
            source_label="PUT",
        )

    @app.post("/api/admin/trial-tests/{test_id}/tasks/{task_id}/update")
    async def update_task_for_trial_test_admin_post(
        test_id: int,
        task_id: int,
        text: str = Form(""),
        answer: str = Form(""),
        question_type: str = Form("input"),
        text_scale: str = Form("md"),
        options: Optional[str] = Form(None),
        subquestions: Optional[str] = Form(None),
        bank_difficulty: Optional[str] = Form(None),
        bank_topics: Optional[str] = Form(None),
        image: Optional[UploadFile] = File(None),
        remove_image: Optional[str] = Form(None),
        sort_order: Optional[int] = Form(None),
        email: str = Form(...),
        db: Database = Depends(get_db)
    ):
        """Update a task for a trial test (admin only, POST fallback)"""
        return await _update_trial_test_task_admin_common(
            test_id=test_id,
            task_id=task_id,
            text=text,
            answer=answer,
            question_type=question_type,
            text_scale=text_scale,
            options=options,
            subquestions=subquestions,
            bank_difficulty=bank_difficulty,
            bank_topics=bank_topics,
            image=image,
            remove_image=remove_image,
            sort_order=sort_order,
            email=email,
            db=db,
            source_label="POST",
        )

    @app.delete("/api/admin/trial-tests/{test_id}/tasks/{task_id}")
    async def remove_task_from_trial_test_admin(
        test_id: int,
        task_id: int,
        email: str = Query(...),
        db: Database = Depends(get_db)
    ):
        """Remove a task from a trial test (admin only)"""
        await require_admin(email=email, db=db)
        
        try:
            await db.remove_task_from_trial_test(test_id, task_id)
            return {"success": True}
        except Exception as e:
            logger.error(f"Error removing task from trial test: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Internal server error")

    @app.post("/api/admin/trial-tests/{test_id}/tasks/from-bank")
    async def add_tasks_from_bank_to_trial_test(
        test_id: int,
        payload: dict = Body(...),
        db: Database = Depends(get_db)
    ):
        """Copy selected bank tasks into a trial test as snapshots."""
        email = payload.get("email")
        bank_task_ids = payload.get("bank_task_ids")

        if not isinstance(email, str) or not email.strip():
            raise HTTPException(status_code=400, detail="email is required")
        if not isinstance(bank_task_ids, list):
            raise HTTPException(status_code=400, detail="bank_task_ids must be an array")
        if len(bank_task_ids) > 200:
            raise HTTPException(status_code=400, detail="Too many bank_task_ids (max 200)")

        admin_user = await require_admin(email=email, db=db)
        test = await db.get_trial_test_by_id(test_id)
        if not test:
            raise HTTPException(status_code=404, detail="Trial test not found")

        result = await db.copy_bank_tasks_to_trial_test(
            trial_test_id=test_id,
            bank_task_ids=bank_task_ids,
            created_by=admin_user["id"],
        )
        return result

