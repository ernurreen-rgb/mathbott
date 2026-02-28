"""
Routes for modules, sections, and lessons
"""
import logging
from typing import Optional, Dict, List
from fastapi import APIRouter, HTTPException, Query
from utils.cache import cache

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/modules", tags=["modules"])


def setup_modules_routes(app, db, limiter):
    """Setup module routes"""
    
    @app.get("/api/modules/map")
    async def get_modules_map(email: Optional[str] = Query(None)):
        """
        Get modules map with user progress (Карта Модулей) - optimized with batch queries and caching
        
        Returns a list of modules with their sections and progress information.
        
        **Example Request:**
        ```
        GET /api/modules/map?email=user@example.com
        ```
        
        **Example Response:**
        ```json
        [
          {
            "id": 1,
            "name": "Алгебра",
            "description": "Основы алгебры",
            "icon": "📐",
            "sort_order": 1,
            "progress": {
              "completed": false,
              "total_lessons": 50,
              "completed_lessons": 10,
              "progress": 0.2
            },
            "sections": [
              {
                "id": 1,
                "name": "Раздел 1",
                "sort_order": 1,
                "progress": {
                  "completed": false,
                  "total": 10,
                  "completed_count": 2,
                  "progress": 0.2
                }
              }
            ]
          }
        ]
        ```
        
        **Error Codes:**
        - 200: Success
        - 500: Internal server error
        """
        # Cache key includes email for user-specific progress
        cache_key = f"modules:map:{email or 'anonymous'}"
        cached_result = cache.get(cache_key)
        if cached_result is not None:
            return cached_result
        
        # Cache modules structure (without user progress) for 5 minutes
        cache_key_modules = "modules:all"
        cached_modules = cache.get(cache_key_modules)
        
        if cached_modules is None:
            modules = await db.get_all_modules()
            cache.set(cache_key_modules, modules, ttl=300)
        else:
            modules = cached_modules
        
        user_id = None
        if email:
            user = await db.get_user_by_email(email)
            if user:
                user_id = user["id"]
        
        # Optimized: batch fetch all sections for all modules
        # Group sections by module_id
        sections_by_module: Dict[int, List[Dict]] = {}
        for module in modules:
            sections = await db.get_sections_by_module(module["id"])
            sections_by_module[module["id"]] = sections
        
        result = []
        
        # Batch calculate progress for all modules and sections if user is logged in
        if user_id:
            # Calculate all module progress
            module_progress_map = {}
            for module in modules:
                module_progress_map[module["id"]] = await db.calculate_module_completion(user_id, module["id"])
            
            # Calculate all section progress
            section_progress_map = {}
            for sections_list in sections_by_module.values():
                for section in sections_list:
                    section_progress_map[section["id"]] = await db.calculate_section_completion(user_id, section["id"])
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
        fields: Optional[str] = Query(None, description="Comma-separated list of fields to include (e.g., 'id,name,sections')")
    ):
        """Get module details with sections and tasks (Страница Модуля)"""
        module = await db.get_module_by_id(module_id)
        if not module:
            raise HTTPException(status_code=404, detail="Module not found")
        
        user_id = None
        if email:
            user = await db.get_user_by_email(email)
            if user:
                user_id = user["id"]
        
        # Get sections with lessons (new curriculum)
        sections = await db.get_sections_by_module(module_id)
        sections_data = []
        
        for section in sections:
            section_progress = await db.calculate_section_completion(user_id, section["id"]) if user_id else None

            lessons = await db.get_lessons_by_section(section["id"])
            lessons_data = []
            for lesson in lessons:
                lesson_progress = await db.calculate_lesson_completion(user_id, lesson["id"]) if user_id else None
                mini_lessons = await db.get_mini_lessons_by_lesson(lesson["id"])
                mini_data = []
                for ml in mini_lessons:
                    ml_progress = await db.calculate_mini_lesson_completion(user_id, ml["id"]) if user_id else None
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
    async def get_lesson_details(lesson_id: int, email: Optional[str] = Query(None)):
        """Get lesson details with 4 mini-lessons and tasks + user progress."""
        lesson = await db.get_lesson_by_id(lesson_id)
        if not lesson:
            raise HTTPException(status_code=404, detail="Lesson not found")

        section = await db.get_section_by_id(lesson["section_id"])
        module_id = section["module_id"] if section else None

        user_id = None
        if email:
            user = await db.get_user_by_email(email)
            if user:
                user_id = user["id"]

        # Ensure defaults exist
        await db.ensure_default_mini_lessons(lesson_id)
        mini_lessons = await db.get_mini_lessons_by_lesson(lesson_id)

        lesson_progress = await db.calculate_lesson_completion(user_id, lesson_id) if user_id else None

        result_mini = []
        for ml in mini_lessons:
            tasks = await db.get_tasks_by_mini_lesson(ml["id"])
            task_progress = await db.get_user_progress_for_mini_lesson(user_id, ml["id"]) if user_id else {}

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
                    "question_type": t.get("question_type", "input"),
                    "text_scale": t.get("text_scale", "md"),
                    "options": options,
                    "subquestions": subquestions,
                    "sort_order": t.get("sort_order", 0),
                    "status": task_progress.get(t["id"], "not_started")
                })

            ml_progress = await db.calculate_mini_lesson_completion(user_id, ml["id"]) if user_id else None
            result_mini.append({
                "id": ml["id"],
                "mini_index": ml["mini_index"],
                "title": ml.get("title"),
                "progress": ml_progress,
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
            "mini_lessons": result_mini
        }

