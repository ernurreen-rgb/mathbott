"""
Curriculum repository for modules, sections, lessons, and mini-lessons
"""
import aiosqlite
import logging
from typing import Optional, Dict, Any, List
from .base import BaseRepository

logger = logging.getLogger(__name__)


class CurriculumRepository(BaseRepository):
    """Repository for curriculum operations (modules, sections, lessons, mini-lessons)"""
    
    # Modules
    async def create_module(self, name: str, description: Optional[str] = None, icon: Optional[str] = None, sort_order: int = 0) -> Dict[str, Any]:
        """Create a new module"""
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            await db.execute(
                """INSERT INTO modules (name, description, icon, sort_order)
                   VALUES (?, ?, ?, ?)""",
                (name, description, icon, sort_order)
            )
            await db.commit()
            async with db.execute(
                "SELECT * FROM modules WHERE id = LAST_INSERT_ROWID()"
            ) as cursor:
                row = await cursor.fetchone()
                return dict(row)

    async def get_all_modules(self) -> List[Dict[str, Any]]:
        """Get all modules ordered by sort_order"""
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM modules ORDER BY sort_order ASC, id ASC"
            ) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]

    async def get_module_by_id(self, module_id: int) -> Optional[Dict[str, Any]]:
        """Get module by ID"""
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM modules WHERE id = ?", (module_id,)
            ) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else None

    async def update_module(self, module_id: int, name: Optional[str] = None, description: Optional[str] = None, icon: Optional[str] = None, sort_order: Optional[int] = None):
        """Update module"""
        async with self._connection() as db:
            updates = []
            params = []
            if name is not None:
                updates.append("name = ?")
                params.append(name)
            if description is not None:
                updates.append("description = ?")
                params.append(description)
            if icon is not None:
                updates.append("icon = ?")
                params.append(icon)
            if sort_order is not None:
                updates.append("sort_order = ?")
                params.append(sort_order)
            
            if updates:
                updates.append("updated_at = CURRENT_TIMESTAMP")
                params.append(module_id)
                query = f"UPDATE modules SET {', '.join(updates)} WHERE id = ?"
                await db.execute(query, params)
                await db.commit()

    async def delete_module(self, module_id: int):
        """Delete module (cascade will delete sections and tasks)"""
        async with self._connection() as db:
            await db.execute("PRAGMA foreign_keys = ON")
            await db.execute("DELETE FROM modules WHERE id = ?", (module_id,))
            await db.commit()

    # Sections
    async def create_section(self, module_id: int, name: str, sort_order: int = 0, description: Optional[str] = None) -> Dict[str, Any]:
        """Create a new section"""
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            await db.execute(
                """INSERT INTO sections (module_id, name, sort_order, description)
                   VALUES (?, ?, ?, ?)""",
                (module_id, name, sort_order, description)
            )
            await db.commit()
            async with db.execute(
                "SELECT * FROM sections WHERE id = LAST_INSERT_ROWID()"
            ) as cursor:
                row = await cursor.fetchone()
                return dict(row)

    async def get_sections_by_module(self, module_id: int) -> List[Dict[str, Any]]:
        """Get all sections for a module ordered by sort_order"""
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM sections WHERE module_id = ? ORDER BY sort_order ASC, id ASC",
                (module_id,)
            ) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]

    async def get_section_by_id(self, section_id: int) -> Optional[Dict[str, Any]]:
        """Get section by ID"""
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM sections WHERE id = ?", (section_id,)
            ) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else None

    async def update_section(self, section_id: int, name: Optional[str] = None, sort_order: Optional[int] = None, description: Optional[str] = None, guide: Optional[str] = None):
        """Update section"""
        async with self._connection() as db:
            updates = []
            params = []
            if name is not None:
                updates.append("name = ?")
                params.append(name)
            if sort_order is not None:
                updates.append("sort_order = ?")
                params.append(sort_order)
            if description is not None:
                updates.append("description = ?")
                params.append(description)
            if guide is not None:
                updates.append("guide = ?")
                params.append(guide)
            
            if updates:
                updates.append("updated_at = CURRENT_TIMESTAMP")
                params.append(section_id)
                query = f"UPDATE sections SET {', '.join(updates)} WHERE id = ?"
                await db.execute(query, params)
                await db.commit()

    async def delete_section(self, section_id: int):
        """Delete section"""
        async with self._connection() as db:
            await db.execute("PRAGMA foreign_keys = ON")
            await db.execute("DELETE FROM sections WHERE id = ?", (section_id,))
            await db.commit()

    # Lessons
    async def create_lesson(
        self,
        section_id: int,
        lesson_number: int,
        title: Optional[str] = None,
        sort_order: int = 0
    ) -> Dict[str, Any]:
        """Create a lesson in a section and ensure 4 mini-lessons exist."""
        async with self._connection() as db:
            await db.execute("PRAGMA foreign_keys = ON")
            db.row_factory = aiosqlite.Row
            await db.execute(
                """INSERT INTO lessons (section_id, lesson_number, title, sort_order)
                   VALUES (?, ?, ?, ?)""",
                (section_id, lesson_number, title, sort_order),
            )
            await db.commit()
            async with db.execute("SELECT * FROM lessons WHERE id = LAST_INSERT_ROWID()") as cursor:
                row = await cursor.fetchone()
                lesson = dict(row) if row else None

            if not lesson:
                raise RuntimeError("Failed to create lesson")

            # Ensure 4 mini-lessons
            await self.ensure_default_mini_lessons(lesson["id"])
            return lesson

    async def ensure_default_mini_lessons(self, lesson_id: int) -> None:
        """Ensure mini_lessons (1..4) exist for a lesson."""
        async with self._connection() as db:
            await db.execute("PRAGMA foreign_keys = ON")
            async with db.execute(
                "SELECT mini_index FROM mini_lessons WHERE lesson_id = ?",
                (lesson_id,),
            ) as cursor:
                existing = {row[0] for row in await cursor.fetchall()}

            for i in range(1, 5):
                if i in existing:
                    continue
                await db.execute(
                    """INSERT INTO mini_lessons (lesson_id, mini_index, title, sort_order)
                       VALUES (?, ?, ?, ?)""",
                    (lesson_id, i, f"Мини-урок {i}", i - 1),
                )
            await db.commit()

    async def get_lessons_by_section(self, section_id: int) -> List[Dict[str, Any]]:
        """Get lessons for section ordered by sort_order, lesson_number."""
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """SELECT * FROM lessons
                   WHERE section_id = ?
                   ORDER BY sort_order ASC, lesson_number ASC, id ASC""",
                (section_id,),
            ) as cursor:
                rows = await cursor.fetchall()
                return [dict(r) for r in rows]

    async def get_lesson_by_id(self, lesson_id: int) -> Optional[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM lessons WHERE id = ?", (lesson_id,)) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else None

    async def update_lesson(
        self,
        lesson_id: int,
        lesson_number: Optional[int] = None,
        title: Optional[str] = None,
        sort_order: Optional[int] = None,
    ) -> None:
        async with self._connection() as db:
            updates = []
            params: List[Any] = []
            if lesson_number is not None:
                updates.append("lesson_number = ?")
                params.append(lesson_number)
            if title is not None:
                updates.append("title = ?")
                params.append(title)
            if sort_order is not None:
                updates.append("sort_order = ?")
                params.append(sort_order)
            if updates:
                updates.append("updated_at = CURRENT_TIMESTAMP")
                params.append(lesson_id)
                await db.execute(f"UPDATE lessons SET {', '.join(updates)} WHERE id = ?", params)
                await db.commit()

    async def delete_lesson(self, lesson_id: int) -> None:
        """Delete a lesson and all its mini-lessons and tasks."""
        async with self._connection() as db:
            await db.execute("PRAGMA foreign_keys = ON")
            async with db.execute("SELECT id FROM mini_lessons WHERE lesson_id = ?", (lesson_id,)) as cursor:
                mini_ids = [row[0] for row in await cursor.fetchall()]
            if mini_ids:
                placeholders = ",".join("?" * len(mini_ids))
                await db.execute(f"DELETE FROM tasks WHERE mini_lesson_id IN ({placeholders})", mini_ids)
            await db.execute("DELETE FROM lessons WHERE id = ?", (lesson_id,))
            await db.commit()

    # Mini-lessons
    async def get_mini_lessons_by_lesson(self, lesson_id: int) -> List[Dict[str, Any]]:
        """Get 4 mini-lessons for a lesson ordered by mini_index."""
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """SELECT * FROM mini_lessons
                   WHERE lesson_id = ?
                   ORDER BY mini_index ASC""",
                (lesson_id,),
            ) as cursor:
                rows = await cursor.fetchall()
                return [dict(r) for r in rows]

    async def get_mini_lesson_by_id(self, mini_lesson_id: int) -> Optional[Dict[str, Any]]:
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM mini_lessons WHERE id = ?", (mini_lesson_id,)) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else None

    async def update_mini_lesson(
        self,
        mini_lesson_id: int,
        title: Optional[str] = None,
        sort_order: Optional[int] = None
    ) -> None:
        async with self._connection() as db:
            updates = []
            params: List[Any] = []
            if title is not None:
                updates.append("title = ?")
                params.append(title)
            if sort_order is not None:
                updates.append("sort_order = ?")
                params.append(sort_order)
            if updates:
                updates.append("updated_at = CURRENT_TIMESTAMP")
                params.append(mini_lesson_id)
                await db.execute(f"UPDATE mini_lessons SET {', '.join(updates)} WHERE id = ?", params)
                await db.commit()

    async def create_task_in_mini_lesson(
        self,
        mini_lesson_id: int,
        text: str,
        answer: str,
        question_type: str = "input",
        options: Optional[str] = None,
        subquestions: Optional[str] = None,
        image_filename: Optional[str] = None,
        solution_filename: Optional[str] = None,
        created_by: Optional[int] = None,
        task_type: str = "standard",
        sort_order: int = 0,
        bank_task_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Create a task placement in a mini-lesson."""
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            await db.execute(
                """INSERT INTO tasks (mini_lesson_id, bank_task_id, task_type, sort_order, created_by)
                   VALUES (?, ?, ?, ?, ?)""",
                (mini_lesson_id, bank_task_id, task_type, sort_order, created_by),
            )
            await db.commit()
            async with db.execute(
                "SELECT * FROM tasks WHERE id = LAST_INSERT_ROWID()"
            ) as cursor:
                row = await cursor.fetchone()
                return dict(row)

    async def create_task_in_section(
        self,
        section_id: int,
        text: str,
        answer: str,
        question_type: str = "input",
        options: Optional[str] = None,
        image_filename: Optional[str] = None,
        solution_filename: Optional[str] = None,
        created_by: Optional[int] = None,
        task_type: str = "standard",
        sort_order: int = 0,
        bank_task_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Create a task placement in a section (legacy endpoint support)."""
        async with self._connection() as db:
            db.row_factory = aiosqlite.Row
            await db.execute(
                """INSERT INTO tasks (section_id, bank_task_id, task_type, sort_order, created_by)
                   VALUES (?, ?, ?, ?, ?)""",
                (section_id, bank_task_id, task_type, sort_order, created_by),
            )
            await db.commit()
            async with db.execute(
                "SELECT * FROM tasks WHERE id = LAST_INSERT_ROWID()"
            ) as cursor:
                row = await cursor.fetchone()
                return dict(row)

