"""
Trial tests роуты (публичные)
"""
import json
import logging
from typing import Optional
from fastapi import FastAPI, HTTPException, Query, Body, Depends
from slowapi import Limiter

from dependencies import get_db
from database import Database
from utils.cache import cache
from utils.scoring import build_reward_identity
from utils.validation import normalize_task_answer_for_compare

logger = logging.getLogger(__name__)


def setup_trial_tests_routes(app: FastAPI, db: Database, limiter: Limiter):
    """Настроить trial tests роуты"""
    
    @app.get("/api/trial-tests")
    async def get_trial_tests(
        email: Optional[str] = Query(None),
        attempted_only: Optional[bool] = Query(False),
        db: Database = Depends(get_db)
    ):
        """Get all trial tests, or only those the user has attempted when attempted_only=true and email is provided"""
        try:
            if attempted_only and email:
                user = await db.get_user_by_email(email)
                if not user:
                    raise HTTPException(status_code=404, detail="User not found")
                results = await db.get_user_trial_test_results(user["id"], trial_test_id=None)
                # Только тесты, которые пользователь прошёл (хотя бы одна попытка с процентом >= 50%)
                PASS_PERCENT = 50.0
                passed_ids = {
                    r["trial_test_id"] for r in results
                    if (r.get("percentage") or 0) >= PASS_PERCENT
                }
                if not passed_ids:
                    return []
                all_tests = await db.get_trial_tests()
                return [t for t in all_tests if t.get("id") in passed_ids]
            tests = await db.get_trial_tests()
            return tests
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error getting trial tests: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

    @app.get("/api/trial-tests/drafts")
    async def get_trial_test_draft_ids(
        email: str = Query(...),
        db: Database = Depends(get_db)
    ):
        """Return list of trial_test_id for which the user has a draft (for «Продолжить» on list page)."""
        try:
            user = await db.get_user_by_email(email)
            if not user:
                raise HTTPException(status_code=404, detail="User not found")
            test_ids = await db.get_user_trial_test_draft_ids(user["id"])
            return {"test_ids": test_ids}
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error getting trial test draft ids: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

    @app.get("/api/trial-tests/{test_id}")
    async def get_trial_test_details(
        test_id: int,
        email: Optional[str] = Query(None),
        db: Database = Depends(get_db)
    ):
        """Get trial test details with tasks (without correct answers)"""
        try:
            test = await db.get_trial_test_by_id(test_id)
            if not test:
                raise HTTPException(status_code=404, detail="Trial test not found")
            
            if not isinstance(test, dict):
                test = dict(test) if hasattr(test, '__iter__') else {}
            
            tasks = await db.get_trial_test_tasks(test_id)
            if tasks is None:
                tasks = []
            
            tasks_data = []
            for t in tasks:
                try:
                    if not isinstance(t, dict):
                        t = dict(t) if hasattr(t, '__iter__') else {}
                    
                    options = None
                    if t.get("options"):
                        try:
                            options_value = t["options"]
                            if isinstance(options_value, str):
                                options = json.loads(options_value)
                            elif isinstance(options_value, list):
                                options = options_value
                        except Exception:
                            options = None

                    subquestions = None
                    if t.get("subquestions"):
                        try:
                            subq_value = t["subquestions"]
                            if isinstance(subq_value, str):
                                subquestions = json.loads(subq_value)
                            elif isinstance(subq_value, list):
                                subquestions = subq_value
                        except Exception:
                            subquestions = None
                    
                    tasks_data.append({
                        "id": t.get("id"),
                        "text": t.get("text", ""),
                        "question_type": t.get("question_type", "input"),
                        "text_scale": t.get("text_scale", "md"),
                        "options": options,
                        "subquestions": subquestions,
                        "image_filename": t.get("image_filename"),
                        "sort_order": t.get("sort_order", 0),
                    })
                except Exception as e:
                    logger.error(f"Error formatting task: {e}", exc_info=True)
                    continue
            
            return {
                "id": test.get("id"),
                "title": test.get("title", ""),
                "description": test.get("description"),
                "expected_tasks_count": test.get("expected_tasks_count", 40),
                "created_at": test.get("created_at"),
                "tasks": tasks_data
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error getting trial test details: {e}", exc_info=True)
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
    
    @app.post("/api/trial-tests/{test_id}/submit")
    async def submit_trial_test(
        test_id: int,
        request: dict = Body(...),
        db: Database = Depends(get_db)
    ):
        """Submit trial test answers and get results"""
        try:
            email = request.get("email")
            answers = request.get("answers", {})
            
            if not email:
                raise HTTPException(status_code=400, detail="Email is required")
            
            user = await db.get_user_by_email(email)
            if not user:
                raise HTTPException(status_code=404, detail="User not found")
            
            test = await db.get_trial_test_by_id(test_id)
            if not test:
                raise HTTPException(status_code=404, detail="Trial test not found")
            
            tasks = await db.get_trial_test_tasks(test_id)
            if not tasks:
                raise HTTPException(status_code=404, detail="No tasks found in trial test")
            
            results = {}
            score = 0
            total = len(tasks)
            had_any_correct = False
            
            for task in tasks:
                task_id = task["id"]
                user_answer = answers.get(str(task_id), answers.get(int(task_id), "")).strip()
                
                correct_answer = task.get("answer", "").strip()
                
                user_normalized = normalize_task_answer_for_compare(task, user_answer)
                correct_normalized = normalize_task_answer_for_compare(task, correct_answer)
                
                is_correct = user_normalized == correct_normalized
                
                if is_correct:
                    score += 1
                    had_any_correct = True
                
                results[int(task_id)] = {
                    "answer": user_answer,
                    "correct": is_correct,
                    "correct_answer": task.get("answer")
                }
            
            percentage = (score / total * 100) if total > 0 else 0.0
            
            answers_for_db = {int(k): v for k, v in results.items()}
            await db.save_trial_test_result(
                user_id=user["id"],
                trial_test_id=test_id,
                score=score,
                total=total,
                percentage=percentage,
                answers=answers_for_db
            )

            awarded_any = False
            for task in tasks:
                task_result = results.get(int(task["id"])) or {}
                if not task_result.get("correct"):
                    continue
                reward = build_reward_identity(task, surface="trial_test")
                award_result = await db.award_task_reward_once(
                    user_id=user["id"],
                    reward_key=reward["reward_key"],
                    bank_task_id=reward["bank_task_id"],
                    difficulty=reward["difficulty"],
                    points=reward["points"],
                    source="trial_test",
                    source_ref_id=int(task["id"]),
                )
                awarded_any = awarded_any or bool(award_result.get("awarded"))

            if had_any_correct:
                await db.update_streak(user["id"])
            if awarded_any:
                await db.check_and_unlock_achievements(user["id"])

            await db.delete_trial_test_draft(user["id"], test_id)
            logger.info(f"[draft] draft deleted after submit user_id={user['id']} test_id={test_id}")
            cache.invalidate_pattern(f"user:stats:{email}")
            cache.invalidate_pattern("rating:")

            return {
                "score": score,
                "total": total,
                "percentage": round(percentage, 2),
                "results": results
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error submitting trial test: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
    
    @app.get("/api/trial-tests/{test_id}/draft")
    async def get_trial_test_draft(
        test_id: int,
        email: str = Query(...),
        db: Database = Depends(get_db)
    ):
        """Get user's draft (answers + current_task_index) for this trial test"""
        try:
            logger.info(f"[draft] GET draft test_id={test_id} email={email}")
            user = await db.get_user_by_email(email)
            if not user:
                logger.warning(f"[draft] GET draft user not found email={email}")
                raise HTTPException(status_code=404, detail="User not found")
            draft = await db.get_trial_test_draft(user["id"], test_id)
            if not draft:
                logger.info(f"[draft] GET draft no draft for user_id={user['id']} test_id={test_id}")
                return {"answers": {}, "current_task_index": 0}
            answers_raw = draft.get("answers") or "{}"
            answers = json.loads(answers_raw) if isinstance(answers_raw, str) else answers_raw
            answers_int = {int(k): v for k, v in answers.items()}
            idx = draft.get("current_task_index") or 0
            logger.info(f"[draft] GET draft found user_id={user['id']} test_id={test_id} answers_count={len(answers_int)} current_task_index={idx}")
            return {"answers": answers_int, "current_task_index": idx}
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error getting trial test draft: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

    @app.put("/api/trial-tests/{test_id}/draft")
    async def save_trial_test_draft(
        test_id: int,
        request: dict = Body(...),
        db: Database = Depends(get_db)
    ):
        """Save draft (answers + current_task_index). Called on change with debounce."""
        try:
            email = request.get("email")
            answers = request.get("answers", {})
            current_task_index = request.get("current_task_index", 0)
            logger.info(f"[draft] PUT draft test_id={test_id} email={email} answers_keys={list(answers.keys()) if answers else []} current_task_index={current_task_index}")
            if not email:
                logger.warning("[draft] PUT draft missing email")
                raise HTTPException(status_code=400, detail="Email is required")
            user = await db.get_user_by_email(email)
            if not user:
                logger.warning(f"[draft] PUT draft user not found email={email}")
                raise HTTPException(status_code=404, detail="User not found")
            answers_int = {}
            for k, v in answers.items():
                try:
                    key = int(k) if not isinstance(k, int) else k
                    if v is not None and v != "":
                        answers_int[key] = str(v)
                except (TypeError, ValueError):
                    continue
            await db.upsert_trial_test_draft(user["id"], test_id, answers_int, current_task_index)
            logger.info(f"[draft] PUT draft saved user_id={user['id']} test_id={test_id} answers_count={len(answers_int)}")
            return {"ok": True}
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error saving trial test draft: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

    @app.get("/api/trial-tests/{test_id}/results")
    async def get_trial_test_results(
        test_id: int,
        email: str = Query(...),
        db: Database = Depends(get_db)
    ):
        """Get user's trial test results for a specific test"""
        try:
            user = await db.get_user_by_email(email)
            if not user:
                raise HTTPException(status_code=404, detail="User not found")
            
            results = await db.get_user_trial_test_results(user["id"], trial_test_id=test_id)
            
            for result in results:
                if result.get("answers"):
                    try:
                        result["answers"] = json.loads(result["answers"]) if isinstance(result["answers"], str) else result["answers"]
                    except Exception:
                        result["answers"] = {}
            
            return results
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error getting trial test results: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
