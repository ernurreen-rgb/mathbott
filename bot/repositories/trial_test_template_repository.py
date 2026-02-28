"""
Trial test template repository
"""
import aiosqlite
import json
import logging
from typing import Optional, List, Dict, Any
from .base import BaseRepository

logger = logging.getLogger(__name__)


class TrialTestTemplateRepository(BaseRepository):
    """Repository for trial test template operations"""
    
    async def create_template(self, title: str, description: Optional[str] = None, sort_order: int = 0, created_by: Optional[int] = None) -> Dict[str, Any]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            await db.execute(
                """INSERT INTO trial_test_templates (title, description, sort_order, created_by)
                   VALUES (?, ?, ?, ?)""",
                (title, description, sort_order, created_by)
            )
            await db.commit()
            async with db.execute("SELECT * FROM trial_test_templates WHERE id = last_insert_rowid()") as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else {}

    async def get_templates(self) -> List[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """SELECT t.*, COUNT(tt.id) as task_count
                   FROM trial_test_templates t
                   LEFT JOIN trial_test_template_tasks tt ON t.id = tt.template_id
                   GROUP BY t.id
                   ORDER BY t.sort_order ASC, t.created_at DESC"""
            ) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]

    async def get_template_by_id(self, template_id: int) -> Optional[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM trial_test_templates WHERE id = ?", (template_id,)) as cursor:
                row = await cursor.fetchone()
                return {col: row[col] for col in row.keys()} if row else None

    async def update_template(self, template_id: int, title: Optional[str] = None, description: Optional[str] = None, sort_order: Optional[int] = None) -> Optional[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            updates = []
            params = []
            if title is not None:
                updates.append("title = ?")
                params.append(title)
            if description is not None:
                updates.append("description = ?")
                params.append(description)
            if sort_order is not None:
                updates.append("sort_order = ?")
                params.append(sort_order)
            if not updates:
                return await self.get_template_by_id(template_id)
            updates.append("updated_at = CURRENT_TIMESTAMP")
            params.append(template_id)
            await db.execute(f"UPDATE trial_test_templates SET {', '.join(updates)} WHERE id = ?", params)
            await db.commit()
            return await self.get_template_by_id(template_id)

    async def delete_template(self, template_id: int) -> bool:
        async with self._connection() as db:
            await db.execute("DELETE FROM trial_test_templates WHERE id = ?", (template_id,))
            await db.commit()
            return True

    async def create_template_task(self, template_id: int, text: str, answer: str, question_type: str = "input",
                                   options: Optional[List[Dict[str, str]]] = None, subquestions: Optional[List[Dict[str, Any]]] = None,
                                   image_filename: Optional[str] = None, solution_filename: Optional[str] = None,
                                   created_by: Optional[int] = None, sort_order: int = 0) -> Dict[str, Any]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            await db.execute(
                """INSERT INTO trial_test_template_tasks 
                   (template_id, text, answer, question_type, options, subquestions, image_filename, solution_filename, created_by, sort_order)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (template_id, text, answer, question_type, json.dumps(options) if options else None,
                 json.dumps(subquestions) if subquestions else None, image_filename, solution_filename, created_by, sort_order)
            )
            await db.commit()
            async with db.execute("SELECT * FROM trial_test_template_tasks WHERE id = last_insert_rowid()") as cursor:
                row = await cursor.fetchone()
                return {col: row[col] for col in row.keys()} if row else {}

    async def get_template_task(self, task_id: int) -> Optional[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM trial_test_template_tasks WHERE id = ?",
                (task_id,),
            ) as cursor:
                row = await cursor.fetchone()
                return {col: row[col] for col in row.keys()} if row else None

    async def update_template_task(
        self,
        task_id: int,
        text: Optional[str] = None,
        answer: Optional[str] = None,
        question_type: Optional[str] = None,
        options: Optional[List[Dict[str, Any]]] = None,
        subquestions: Optional[List[Dict[str, Any]]] = None,
        sort_order: Optional[int] = None,
        image_filename: Optional[str] = None,
        solution_filename: Optional[str] = None,
    ) -> None:
        async with self._connection() as db:
            updates = []
            params = []
            if text is not None:
                updates.append("text = ?")
                params.append(text)
            if answer is not None:
                updates.append("answer = ?")
                params.append(answer)
            if question_type is not None:
                updates.append("question_type = ?")
                params.append(question_type)
            if options is not None:
                updates.append("options = ?")
                params.append(json.dumps(options) if options else None)
            if subquestions is not None:
                updates.append("subquestions = ?")
                params.append(json.dumps(subquestions) if subquestions else None)
            if sort_order is not None:
                updates.append("sort_order = ?")
                params.append(sort_order)
            if image_filename is not None:
                updates.append("image_filename = ?")
                params.append(image_filename)
            if solution_filename is not None:
                updates.append("solution_filename = ?")
                params.append(solution_filename)
            if updates:
                updates.append("updated_at = CURRENT_TIMESTAMP")
                params.append(task_id)
                query = f"UPDATE trial_test_template_tasks SET {', '.join(updates)} WHERE id = ?"
                await db.execute(query, params)
                await db.commit()

    async def delete_template_task(self, template_id: int, task_id: int) -> bool:
        async with self._connection() as db:
            await db.execute(
                "DELETE FROM trial_test_template_tasks WHERE template_id = ? AND id = ?",
                (template_id, task_id)
            )
            await db.commit()
            return True

    async def get_template_tasks(self, template_id: int) -> List[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """SELECT * FROM trial_test_template_tasks
                   WHERE template_id = ?
                   ORDER BY sort_order, id""",
                (template_id,)
            ) as cursor:
                rows = await cursor.fetchall()
                result = []
                for row in rows:
                    if row:
                        task_dict = {col: row[col] for col in row.keys()}
                        task_dict["id"] = task_dict["id"]
                        task_dict["sort_order"] = task_dict.get("sort_order", 0)
                        result.append(task_dict)
                return result

    async def create_test_from_template(self, template_id: int, title: Optional[str] = None, 
                                       description: Optional[str] = None, sort_order: Optional[int] = None,
                                       created_by: Optional[int] = None) -> Dict[str, Any]:
        """Create a trial test from a template, copying all tasks"""
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            
            # Get template
            template = await self.get_template_by_id(template_id)
            if not template:
                raise ValueError(f"Template {template_id} not found")
            
            # Use provided title/description or fallback to template values
            final_title = title if title is not None else template.get("title", "")
            final_description = description if description is not None else template.get("description")
            final_sort_order = sort_order if sort_order is not None else template.get("sort_order", 0)
            
            # Create trial test
            await db.execute(
                """INSERT INTO trial_tests (title, description, sort_order, created_by)
                   VALUES (?, ?, ?, ?)""",
                (final_title, final_description, final_sort_order, created_by)
            )
            await db.commit()
            
            # Get created test ID
            async with db.execute("SELECT last_insert_rowid() as id") as cursor:
                row = await cursor.fetchone()
                test_id = row["id"] if row else None
            
            if not test_id:
                raise ValueError("Failed to create trial test")
            
            # Get template tasks
            template_tasks = await self.get_template_tasks(template_id)
            
            # Copy all tasks
            for task in template_tasks:
                await db.execute(
                    """INSERT INTO trial_test_tasks 
                       (trial_test_id, text, answer, question_type, options, subquestions, image_filename, solution_filename, created_by, sort_order)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (test_id, task.get("text", ""), task.get("answer", ""), 
                     task.get("question_type", "input"), task.get("options"), 
                     task.get("subquestions"), task.get("image_filename"), 
                     task.get("solution_filename"), created_by, task.get("sort_order", 0))
                )
            
            await db.commit()
            
            # Return created test
            async with db.execute("SELECT * FROM trial_tests WHERE id = ?", (test_id,)) as cursor:
                row = await cursor.fetchone()
                return {col: row[col] for col in row.keys()} if row else {}

    async def create_template_from_test(self, test_id: int, title: Optional[str] = None,
                                        description: Optional[str] = None, sort_order: Optional[int] = None,
                                        created_by: Optional[int] = None) -> Dict[str, Any]:
        """Create a template from an existing trial test, copying all tasks"""
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            
            # Get trial test (need to query directly)
            async with db.execute("SELECT * FROM trial_tests WHERE id = ?", (test_id,)) as cursor:
                row = await cursor.fetchone()
                if not row:
                    raise ValueError(f"Trial test {test_id} not found")
                test = {col: row[col] for col in row.keys()}
            
            # Use provided title/description or fallback to test values
            final_title = title if title is not None else test.get("title", "")
            final_description = description if description is not None else test.get("description")
            final_sort_order = sort_order if sort_order is not None else test.get("sort_order", 0)
            
            # Create template
            await db.execute(
                """INSERT INTO trial_test_templates (title, description, sort_order, created_by)
                   VALUES (?, ?, ?, ?)""",
                (final_title, final_description, final_sort_order, created_by)
            )
            await db.commit()
            
            # Get created template ID
            async with db.execute("SELECT last_insert_rowid() as id") as cursor:
                row = await cursor.fetchone()
                template_id = row["id"] if row else None
            
            if not template_id:
                raise ValueError("Failed to create template")
            
            # Get test tasks
            async with db.execute(
                """SELECT * FROM trial_test_tasks
                   WHERE trial_test_id = ? AND deleted_at IS NULL
                   ORDER BY sort_order, id""",
                (test_id,)
            ) as cursor:
                test_tasks = [dict(row) for row in await cursor.fetchall()]
            
            # Copy all tasks
            for task in test_tasks:
                await db.execute(
                    """INSERT INTO trial_test_template_tasks 
                       (template_id, text, answer, question_type, options, subquestions, image_filename, solution_filename, created_by, sort_order)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (template_id, task.get("text", ""), task.get("answer", ""), 
                     task.get("question_type", "input"), task.get("options"), 
                     task.get("subquestions"), task.get("image_filename"), 
                     task.get("solution_filename"), created_by, task.get("sort_order", 0))
                )
            
            await db.commit()
            
            # Return created template
            async with db.execute("SELECT * FROM trial_test_templates WHERE id = ?", (template_id,)) as cursor:
                row = await cursor.fetchone()
                return {col: row[col] for col in row.keys()} if row else {}
