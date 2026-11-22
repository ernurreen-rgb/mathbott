"""
Routes for modules, sections, and lessons
"""
import logging
from typing import Optional, Dict, List
from fastapi import APIRouter, Depends, HTTPException, Query
from dependencies import optional_internal_identity
from utils.cache import cache
from utils.public_payload import public_options, public_subquestions
from utils.validation import get_mcq_answer_count, normalize_answer_mode

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/modules", tags=["modules"])


def setup_modules_routes(app, db, limiter):
    """Setup module routes"""
    
    @app.get("/api/modules/map")
    async def get_modules_map(
        email: Optional[str] = Query(None),
        current_user: Optional[dict] = Depends(optional_internal_identity),
    ):
        """
        Get modules map with user progress (Карта Модулей) - optimized with batch queries and caching
        """
        user_id = current_user["id"] if current_user else None
        cache_identity = current_user["email"] if current_user and current_user.get("email") else "anonymous"
        cache_key = f"modules:map:{cache_identity}"
        cached_result = cache.get(cache_key)
        if cached_result is not None:
            return cached_result
        
        # Cache modules structure (without user progress) for 5 minutes
        cache_key_modules = "modules:all"
        cached_modules = cache.get(cache_key_modules)
        
        if cached_modules is None:
            modules = await db.curriculum.get_all_modules()
            cache.set(cache_key_modules, modules, ttl=300)
        else:
            modules = cached_modules
        
        # Batch fetch all sections in a single query (H-28).
        cache_key_sections = "modules:sections:all"
        cached_sections = cache.get(cache_key_sections)
        if cached_sections is None:
            all_sections = await db.curriculum.get_all_sections()
            cache.set(cache_key_sections, all_sections, ttl=300)
        else:
            all_sections = cached_sections

        sections_by_module: Dict[int, List[Dict]] = {module["id"]: [] for module in modules}
        for section in all_sections:
            mid = section.get("module_id")
            if mid in sections_by_module:
                sections_by_module[mid].append(section)

        result = []

        # Batch calculate progress for all modules and sections in 1-2 queries when signed in.
        if user_id:
            module_progress_map, section_progress_map = await db.progress.calculate_modules_map_progress(
                user_id, sections_by_module
            )
        else:
            module_progress_map = {}
            section_progress_map = {}
        
        for module in modules:
            sections = sections_by_module.get(module["id"], [])
            
            # Get module progress from map
            module_progress = module_progress_map.get(module["id"]) if user_id else None
            
            # Build sections with progress
            sections_data = []
            for section in sections:
                section_progress = section_progress_map.get(section["id"]) if user_id else None
                
                sections_data.append({
                    "id": section["id"],
                    "name": section["name"],
                    "sort_order": section["sort_order"],
                    "description": section.get("description"),
                    "guide": section.get("guide"),
                    "progress": section_progress
                })
            
            result.append({
                "id": module["id"],
                "name": module["name"],
                "description": module.get("description"),
                "icon": module.get("icon"),
                "sort_order": module["sort_order"],
                "progress": module_progress,
                "sections": sections_data
            })
        
        # Cache result with shorter TTL for user-specific data (1-2 minutes)
        cache.set(cache_key, result, ttl=120)
        return result

    @app.get("/api/modules/{module_id}")
    async def get_module_details(
        module_id: int, 
        email: Optional[str] = Query(None),
        fields: Optional[str] = Query(None, description="Comma-separated list of fields to include (e.g., 'id,name,sections')"),
        current_user: Optional[dict] = Depends(optional_internal_identity),
    ):
        """Get module details with sections and tasks (Страница Модуля)"""
        module = await db.curriculum.get_module_by_id(module_id)
        if not module:
            raise HTTPException(status_code=404, detail="Module not found")
        
        user_id = current_user["id"] if current_user else None
        is_admin = bool(current_user.get("is_admin")) if current_user else False

        # Admins open every lesson so they can check content; students wait for their mistake review.
        locks = (await db.module_review.get_lesson_gate(user_id, module_id))["locks"] if user_id and not is_admin else {}

        # The whole module in a few queries: it used to take one or more per section, lesson and
        # mini-lesson, about 230 for a module of 30 lessons, and two seconds per page.
        outline = await db.curriculum.get_module_outline(module_id)
        progress = await db.progress.calculate_module_page_progress(user_id, module_id) if user_id else None

        sections = outline["sections"]
        sections_data = []

        for section in sections:
            section_progress = progress["sections"].get(int(section["id"])) if progress else None

            lessons = outline["lessons_by_section"].get(int(section["id"]), [])
            lessons_data = []
            for lesson in lessons:
                lesson_progress = progress["lessons"].get(int(lesson["id"])) if progress else None
                mini_lessons = outline["minis_by_lesson"].get(int(lesson["id"]), [])
                mini_data = []
                for ml in mini_lessons:
                    ml_progress = progress["minis"].get(int(ml["id"])) if progress else None
                    mini_data.append({
                        "id": ml["id"],
                        "mini_index": ml["mini_index"],
                        "title": ml.get("title"),
                        "progress": ml_progress
                    })

                lessons_data.append({
                    "id": lesson["id"],
                    "lesson_number": lesson.get("lesson_number"),
                    "title": lesson.get("title"),
                    "sort_order": lesson.get("sort_order", 0),
                    "progress": lesson_progress,
                    "lock": locks.get(lesson["id"]),
                    "mini_lessons": mini_data
                })
            
            sections_data.append({
                "id": section["id"],
                "name": section["name"],
                "sort_order": section["sort_order"],
                "description": section.get("description"),
                "guide": section.get("guide"),
                "progress": section_progress,
                "lessons": lessons_data
            })
        
        result = {
            "id": module["id"],
            "name": module["name"],
            "description": module.get("description"),
            "icon": module.get("icon"),
            "sort_order": module["sort_order"],
            "sections": sections_data
        }
        
        # Apply field selection if specified
        if fields:
            field_list = [f.strip() for f in fields.split(",")]
            filtered_result = {}
            for field in field_list:
                if field in result:
                    filtered_result[field] = result[field]
            # Always include id for identification
            if "id" not in field_list:
                filtered_result["id"] = result["id"]
            result = filtered_result
        
        return result

    @app.get("/api/lessons/{lesson_id}")
    async def get_lesson_details(
        lesson_id: int,
        email: Optional[str] = Query(None),
        current_user: Optional[dict] = Depends(optional_internal_identity),
    ):
        """Get lesson details with mini-lessons and tasks + user progress."""
        lesson = await db.curriculum.get_lesson_by_id(lesson_id)
        if not lesson:
            raise HTTPException(status_code=404, detail="Lesson not found")

        section = await db.curriculum.get_section_by_id(lesson["section_id"])
        module_id = section["module_id"] if section else None

        user_id = current_user["id"] if current_user else None
        is_admin = bool(current_user.get("is_admin")) if current_user else False

        mini_lessons = await db.curriculum.get_mini_lessons_by_lesson(lesson_id)

        lock = None
        next_lesson = None
        guest_tasks_restricted = False
        if module_id:
            gate = (
                await db.module_review.get_lesson_gate(user_id, module_id)
                if user_id and not is_admin
                else {"lessons": await db.module_review.get_module_lesson_order(module_id), "locks": {}}
            )
            lock = gate["locks"].get(lesson_id)
            order = [item["id"] for item in gate["lessons"]]
            if user_id is None and (not order or order[0] != lesson_id):
                # Guests may only preview the first lesson of a module; later lessons require sign-in
                # so calling GET /api/lessons/{id} without identity can never bypass the Lesson Gate.
                guest_tasks_restricted = True
            if lesson_id in order and order.index(lesson_id) + 1 < len(order):
                following = gate["lessons"][order.index(lesson_id) + 1]
                next_lesson = {
                    **following,
                    "locked": (following["id"] in gate["locks"]) or (user_id is None),
                }
        elif user_id is None:
            guest_tasks_restricted = True

        # The lesson is reloaded after every answer, so the mini-lessons share each query instead of
        # asking for their tasks, progress and completion one by one (about 25 queries before).
        mini_ids = [int(ml["id"]) for ml in mini_lessons]
        lesson_progress, mini_progress = (
            await db.progress.calculate_lesson_page_progress(user_id, lesson_id, mini_lessons)
            if user_id else (None, {})
        )
        review_summaries = await db.module_review.get_lesson_summaries(user_id, mini_ids) if user_id else {}
        # A closed lesson (or unauthenticated access past lesson 1) shows only its outline.
        tasks_by_mini = {} if (lock or guest_tasks_restricted) else await db.tasks.get_tasks_by_mini_lessons(mini_ids)
        task_progress = await db.progress.get_user_progress_for_mini_lessons(user_id, mini_ids) if user_id else {}

        result_mini = []
        for ml in mini_lessons:
            tasks = tasks_by_mini.get(int(ml["id"]), [])

            tasks_data = []
            for t in tasks:
                options = None
                if t.get("options"):
                    try:
                        import json
                        options = json.loads(t["options"])
                    except Exception:
                        options = None
                subquestions = None
                if t.get("subquestions"):
                    try:
                        import json
                        subquestions = json.loads(t["subquestions"])
                    except Exception:
                        subquestions = None
                tasks_data.append({
                    "id": t["id"],
                    "text": t.get("text", ""),
                    "image_filename": t.get("image_filename"),
                    "question_type": t.get("question_type", "input"),
                    "answer_mode": normalize_answer_mode(t.get("answer_mode"), t.get("question_type")),
                    "correct_count": (
                        get_mcq_answer_count(t.get("answer"))
                        if (t.get("question_type") or "input") in {"mcq", "mcq6"}
                        else 1
                    ),
                    "text_scale": t.get("text_scale", "md"),
                    "options": public_options(options),
                    "subquestions": public_subquestions(subquestions),
                    "sort_order": t.get("sort_order", 0),
                    "status": task_progress.get(t["id"], "not_started"),
                    "answer": t.get("answer") if task_progress.get(t["id"]) == "completed" else None,
                })

            ml_progress = mini_progress.get(int(ml["id"])) if user_id else None
            result_mini.append({
                "id": ml["id"],
                "mini_index": ml["mini_index"],
                "title": ml.get("title"),
                "progress": ml_progress,
                "review": review_summaries.get(ml["id"]),
                "tasks": tasks_data
            })

        return {
            "id": lesson["id"],
            "module_id": module_id,
            "section_id": lesson["section_id"],
            "lesson_number": lesson.get("lesson_number"),
            "title": lesson.get("title"),
            "sort_order": lesson.get("sort_order", 0),
            "progress": lesson_progress,
            "lock": lock,
            "next_lesson": next_lesson,
            "mini_lessons": result_mini
        }
