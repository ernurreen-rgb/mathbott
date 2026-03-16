"""
Database models and migrations for Mathbot
"""
import aiosqlite
import asyncio
import json
import logging
import sqlite3
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

from models.db_models import League, LEAGUE_ORDER
from migrations.schema import create_schema
from repositories.user_repository import UserRepository
from repositories.task_repository import TaskRepository
from repositories.curriculum_repository import CurriculumRepository
from repositories.progress_repository import ProgressRepository
from repositories.solution_repository import SolutionRepository
from repositories.rating_repository import RatingRepository
from repositories.achievement_repository import AchievementRepository
from repositories.trial_test_repository import TrialTestRepository
from repositories.trial_test_coop_repository import TrialTestCoopRepository
from repositories.bank_task_repository import BankTaskRepository
from repositories.report_repository import ReportRepository
from repositories.trial_test_report_repository import TrialTestReportRepository
from repositories.statistics_repository import StatisticsRepository
from repositories.friends_repository import FriendsRepository
from repositories.ops_repository import OpsRepository
from utils.connection_pool import ConnectionPool

logger = logging.getLogger(__name__)


class Database:
    def __init__(self, db_path: str = "mathbot.db", use_pool: bool = True):
        self.db_path = db_path
        self.sqlite_timeout_seconds = 30
        self.sqlite_busy_timeout_ms = 8000
        self.use_pool = use_pool
        
        # Initialize connection pool if enabled
        self.connection_pool: Optional[ConnectionPool] = None
        if use_pool:
            self.connection_pool = ConnectionPool(
                db_path=db_path,
                min_size=2,
                max_size=10,
                timeout=self.sqlite_timeout_seconds,
                busy_timeout_ms=self.sqlite_busy_timeout_ms
            )
        
        # Initialize repositories with connection pool
        self.users = UserRepository(db_path, connection_pool=self.connection_pool)
        self.tasks = TaskRepository(db_path, connection_pool=self.connection_pool)
        self.curriculum = CurriculumRepository(db_path, connection_pool=self.connection_pool)
        self.progress = ProgressRepository(db_path, connection_pool=self.connection_pool)
        self.solutions = SolutionRepository(db_path, connection_pool=self.connection_pool)
        self.rating = RatingRepository(db_path, connection_pool=self.connection_pool)
        self.achievements = AchievementRepository(db_path, connection_pool=self.connection_pool)
        self.trial_tests = TrialTestRepository(db_path, connection_pool=self.connection_pool)
        self.trial_test_coop = TrialTestCoopRepository(db_path, connection_pool=self.connection_pool)
        self.bank_tasks = BankTaskRepository(db_path, connection_pool=self.connection_pool)
        self.reports = ReportRepository(db_path, connection_pool=self.connection_pool)
        self.trial_test_reports = TrialTestReportRepository(db_path, connection_pool=self.connection_pool)
        self.statistics = StatisticsRepository(db_path, connection_pool=self.connection_pool)
        self.friends = FriendsRepository(db_path, connection_pool=self.connection_pool)
        self.ops = OpsRepository(db_path, connection_pool=self.connection_pool)

    async def _configure_connection(self, db: aiosqlite.Connection) -> None:
        # Improve concurrency (readers don't block writers as much)
        await db.execute("PRAGMA foreign_keys = ON")
        try:
            await db.execute("PRAGMA journal_mode = WAL")
            await db.execute("PRAGMA synchronous = NORMAL")
        except Exception:
            # Some environments may not allow changing journal mode; ignore.
            pass
        try:
            await db.execute(f"PRAGMA busy_timeout = {int(self.sqlite_busy_timeout_ms)}")
        except Exception:
            pass

    async def init(self):
        """Initialize database and create tables"""
        async with aiosqlite.connect(self.db_path, timeout=self.sqlite_timeout_seconds) as db:
            await self._configure_connection(db)
            # Use schema creation from migrations module
            await create_schema(db)
        
        # Initialize connection pool if enabled
        if self.connection_pool:
            await self.connection_pool.initialize()
            logger.info("Connection pool initialized")

    # Delegate user methods to UserRepository
    async def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        """Get user by email"""
        return await self.users.get_user_by_email(email)

    async def create_user_by_email(self, email: str, check_admin_email: Optional[str] = None) -> Dict[str, Any]:
        """Create new user by email (for web users without telegram_id)"""
        return await self.users.create_user_by_email(email, check_admin_email)

    async def update_user_nickname(self, email: str, nickname: str):
        """Update user nickname"""
        return await self.users.update_user_nickname(email, nickname)

    async def get_solved_task_ids(self, user_id: int) -> List[int]:
        """Get list of task IDs that user has solved correctly"""
        return await self.users.get_solved_task_ids(user_id)

    # Delegate task methods to TaskRepository
    async def get_random_task(self, exclude_ids: Optional[List[int]] = None) -> Optional[Dict[str, Any]]:
        """Get random task (excluding deleted tasks and optionally specific task IDs)"""
        return await self.tasks.get_random_task(exclude_ids)

    async def get_task_by_id(self, task_id: int) -> Optional[Dict[str, Any]]:
        """Get task by ID"""
        return await self.tasks.get_task_by_id(task_id)

    # Delegate remaining task methods to TaskRepository
    async def create_task(
        self,
        text: str,
        answer: str,
        created_by: int,
        image_filename: Optional[str] = None,
        solution_filename: Optional[str] = None,
        difficulty: int = 1,
        text_scale: str = "md",
    ) -> Dict[str, Any]:
        """Create new task"""
        return await self.tasks.create_task(
            text,
            answer,
            created_by,
            image_filename,
            solution_filename,
            difficulty,
            question_type="input",
            text_scale=text_scale,
        )

    async def update_task(
        self,
        task_id: int,
        text: Optional[str] = None,
        answer: Optional[str] = None,
        question_type: Optional[str] = None,
        text_scale: Optional[str] = None,
        options: Optional[str] = None,
        subquestions: Optional[str] = None,
        image_filename: Optional[str] = None,
        solution_filename: Optional[str] = None,
        task_type: Optional[str] = None,
        sort_order: Optional[int] = None
    ):
        """Update task"""
        return await self.tasks.update_task(
            task_id=task_id,
            text=text,
            answer=answer,
            question_type=question_type,
            text_scale=text_scale,
            options=options,
            subquestions=subquestions,
            image_filename=image_filename,
            solution_filename=solution_filename,
            task_type=task_type,
            sort_order=sort_order,
        )

    async def get_all_tasks(self) -> List[Dict[str, Any]]:
        """Get all tasks"""
        return await self.tasks.get_all_tasks()
    
    async def get_tasks_by_creator(
        self, 
        creator_id: int, 
        include_deleted: bool = False,
        limit: int = 50,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """Get tasks created by specific user with pagination"""
        return await self.tasks.get_tasks_by_creator(creator_id, include_deleted, limit, offset)
    
    async def get_tasks_count_by_creator(self, creator_id: int, include_deleted: bool = False) -> int:
        """Get total count of tasks created by specific user"""
        return await self.tasks.get_tasks_count_by_creator(creator_id, include_deleted)
    
    async def get_deleted_tasks_by_creator(self, creator_id: int) -> List[Dict[str, Any]]:
        """Get deleted tasks created by specific user"""
        return await self.tasks.get_deleted_tasks_by_creator(creator_id)
    
    async def soft_delete_task(self, task_id: int):
        """Mark task as deleted (soft delete)"""
        return await self.tasks.soft_delete_task(task_id)
    
    async def restore_task(self, task_id: int):
        """Restore task from trash"""
        return await self.tasks.restore_task(task_id)
    
    async def cleanup_old_deleted_tasks(self, days: int = 10):
        """Permanently delete tasks that have been in trash for more than specified days"""
        return await self.tasks.cleanup_old_deleted_tasks(days)

    async def empty_trash(self, creator_id: Optional[int] = None) -> int:
        """Permanently delete all tasks in trash (optionally for specific creator)"""
        return await self.tasks.empty_trash(creator_id)

    async def reset_task_id_counter(self) -> bool:
        """Reset AUTOINCREMENT counter for tasks table (use with caution!)
        Only works if ALL tasks are deleted (including those in trash)"""
        return await self.tasks.reset_task_id_counter()

    async def check_answer(self, task_id: int, user_answer: str) -> bool:
        """Check if answer is correct"""
        return await self.tasks.check_answer(task_id, user_answer)

    # Delegate user methods
    async def update_streak(self, user_id: int):
        """Update user streak"""
        return await self.users.update_streak(user_id)

    async def get_user_by_id(self, user_id: int) -> Optional[Dict[str, Any]]:
        """Get user by ID"""
        return await self.users.get_user_by_id(user_id)

    # ========== FRIENDS METHODS ==========

    async def create_friend_invite(self, inviter_id: int, expires_at: Optional[str]) -> Dict[str, Any]:
        return await self.friends.create_invite(inviter_id, expires_at)

    async def get_friend_invite(self, token: str) -> Optional[Dict[str, Any]]:
        return await self.friends.get_invite_by_token(token)

    async def mark_friend_invite_accepted(self, token: str, accepted_by: int) -> None:
        return await self.friends.mark_invite_accepted(token, accepted_by)

    async def expire_friend_invite(self, token: str) -> None:
        return await self.friends.expire_invite(token)

    async def revoke_friend_invite(self, token: str, inviter_id: int) -> None:
        return await self.friends.revoke_invite(token, inviter_id)

    async def list_friend_invites(self, inviter_id: int, status: Optional[str] = None) -> List[Dict[str, Any]]:
        return await self.friends.list_invites_by_inviter(inviter_id, status=status)

    async def are_friends(self, user_id: int, other_id: int) -> bool:
        return await self.friends.are_friends(user_id, other_id)

    async def create_friendship(self, user_id: int, friend_id: int) -> None:
        return await self.friends.create_friendship(user_id, friend_id)

    async def delete_friendship(self, user_id: int, friend_id: int) -> None:
        return await self.friends.delete_friendship(user_id, friend_id)

    async def list_friends(self, user_id: int) -> List[Dict[str, Any]]:
        return await self.friends.list_friends(user_id)

    async def is_blocked_between(self, user_id: int, other_id: int) -> bool:
        return await self.friends.is_blocked_between(user_id, other_id)

    async def create_friend_request(self, sender_id: int, receiver_id: int, status: str = "pending") -> None:
        return await self.friends.create_friend_request(sender_id, receiver_id, status=status)

    async def get_friend_request_by_id(self, request_id: int) -> Optional[Dict[str, Any]]:
        return await self.friends.get_friend_request_by_id(request_id)

    async def get_pending_friend_request(self, sender_id: int, receiver_id: int) -> Optional[Dict[str, Any]]:
        return await self.friends.get_pending_request(sender_id, receiver_id)

    async def get_pending_friend_request_between(self, user_id: int, other_id: int) -> Optional[Dict[str, Any]]:
        return await self.friends.get_pending_request_between(user_id, other_id)

    async def update_friend_request_status(self, request_id: int, status: str) -> None:
        return await self.friends.update_friend_request_status(request_id, status)

    async def list_incoming_friend_requests(self, user_id: int) -> List[Dict[str, Any]]:
        return await self.friends.list_incoming_requests(user_id)

    async def list_outgoing_friend_requests(self, user_id: int) -> List[Dict[str, Any]]:
        return await self.friends.list_outgoing_requests(user_id)

    async def block_user(self, blocker_id: int, blocked_id: int) -> None:
        return await self.friends.block_user(blocker_id, blocked_id)

    async def unblock_user(self, blocker_id: int, blocked_id: int) -> None:
        return await self.friends.unblock_user(blocker_id, blocked_id)

    async def list_blocked_users(self, blocker_id: int) -> List[Dict[str, Any]]:
        return await self.friends.list_blocked_users(blocker_id)

    async def get_all_users(self) -> List[Dict[str, Any]]:
        """Get all users"""
        return await self.users.get_all_users()

    async def list_admin_users(
        self,
        *,
        search: Optional[str] = None,
        role: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """List admin users with roles."""
        return await self.users.list_admin_users(search=search, role=role, limit=limit, offset=offset)

    async def get_admin_audit_log_by_id(self, audit_id: int) -> Optional[Dict[str, Any]]:
        """Get admin audit event by id."""
        return await self.users.get_admin_audit_log_by_id(audit_id)

    async def is_admin(self, user_id: Optional[int] = None, email: Optional[str] = None) -> bool:
        """Check if user is admin"""
        return await self.users.is_admin(user_id, email)

    async def set_admin(self, user_id: Optional[int] = None, email: Optional[str] = None, is_admin: bool = True):
        """Set admin status for user"""
        return await self.users.set_admin(user_id, email, is_admin)

    async def get_admin_role(self, user_id: Optional[int] = None, email: Optional[str] = None) -> Optional[str]:
        """Get RBAC admin role for user."""
        return await self.users.get_admin_role(user_id=user_id, email=email)

    async def set_admin_role(
        self,
        *,
        role: Optional[str],
        user_id: Optional[int] = None,
        email: Optional[str] = None,
    ) -> None:
        """Set admin role (and synchronize is_admin flag)."""
        await self.users.set_admin_role(role=role, user_id=user_id, email=email)

    async def set_admin_with_role(
        self,
        *,
        is_admin: bool,
        role: Optional[str] = None,
        user_id: Optional[int] = None,
        email: Optional[str] = None,
    ) -> None:
        """Set admin flag and role together."""
        await self.users.set_admin_with_role(
            is_admin=is_admin,
            role=role,
            user_id=user_id,
            email=email,
        )

    async def change_admin_role_with_audit(
        self,
        *,
        target_email: str,
        role: Optional[str],
        set_admin: bool,
        actor_user_id: Optional[int],
        actor_email: Optional[str],
        source: str,
        actor_verified: bool,
        expected_current_role: Optional[str] = None,
        expected_current_is_admin: Optional[bool] = None,
        restored_from_audit_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Change admin role and persist role_change audit event."""
        return await self.users.change_admin_role_with_audit(
            target_email=target_email,
            role=role,
            set_admin=set_admin,
            actor_user_id=actor_user_id,
            actor_email=actor_email,
            source=source,
            actor_verified=actor_verified,
            expected_current_role=expected_current_role,
            expected_current_is_admin=expected_current_is_admin,
            restored_from_audit_id=restored_from_audit_id,
        )

    # Delegate solution methods
    async def record_solution(
        self,
        user_id: int,
        task_id: int,
        answer: str,
        is_correct: bool,
        task_snapshot: Optional[Dict[str, Any]] = None,
    ):
        """Record user solution"""
        return await self.solutions.record_solution(
            user_id, task_id, answer, is_correct,
            self.progress, self.users, self.achievements, self.rating, self.tasks, task_snapshot
        )

    async def award_task_reward_once(
        self,
        *,
        user_id: int,
        reward_key: str,
        bank_task_id: Optional[int],
        difficulty: str,
        points: int,
        source: str,
        source_ref_id: Optional[int],
    ) -> Dict[str, Any]:
        """Award task points once per unique reward key for a user."""
        return await self.users.award_task_reward_once(
            user_id=user_id,
            reward_key=reward_key,
            bank_task_id=bank_task_id,
            difficulty=difficulty,
            points=points,
            source=source,
            source_ref_id=source_ref_id,
        )

    # Delegate rating methods
    async def get_rating(self, limit: int = 10, offset: int = 0, league: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get rating with pagination"""
        return await self.rating.get_rating(limit=limit, offset=offset, league=league)
    
    async def get_rating_count(self, league: Optional[str] = None) -> int:
        """Get total count of users in rating"""
        return await self.rating.get_rating_count(league=league)

    async def get_league_rating(self, league: str, group: int) -> List[Dict[str, Any]]:
        """Get rating for specific league group"""
        return await self.rating.get_league_rating(league, group)

    async def reset_week(self):
        """Reset weekly statistics and update leagues"""
        return await self.rating.reset_week(self.users)

    async def get_user_stats(self, user_id: int) -> Dict[str, Any]:
        """Get user statistics"""
        return await self.rating.get_user_stats(user_id)


    # Delegate achievement methods
    async def check_and_unlock_achievements(self, user_id: int):
        """Check user stats and unlock achievements"""
        return await self.achievements.check_and_unlock_achievements(user_id, self.users, self.rating)

    async def get_user_achievements(self, user_id: int) -> List[Dict[str, Any]]:
        """Get all achievements for user"""
        return await self.achievements.get_user_achievements(user_id)

    # ========== MODULES, SECTIONS, AND PROGRESS METHODS ==========

    # Modules CRUD
    # Delegate curriculum methods to CurriculumRepository
    async def create_module(self, name: str, description: Optional[str] = None, icon: Optional[str] = None, sort_order: int = 0) -> Dict[str, Any]:
        """Create a new module"""
        return await self.curriculum.create_module(name, description, icon, sort_order)

    async def get_all_modules(self) -> List[Dict[str, Any]]:
        """Get all modules ordered by sort_order"""
        return await self.curriculum.get_all_modules()

    async def get_module_by_id(self, module_id: int) -> Optional[Dict[str, Any]]:
        """Get module by ID"""
        return await self.curriculum.get_module_by_id(module_id)

    async def update_module(self, module_id: int, name: Optional[str] = None, description: Optional[str] = None, icon: Optional[str] = None, sort_order: Optional[int] = None):
        """Update module"""
        return await self.curriculum.update_module(module_id, name, description, icon, sort_order)

    async def delete_module(self, module_id: int):
        """Delete module (cascade will delete sections and tasks)"""
        return await self.curriculum.delete_module(module_id)

    # Sections CRUD
    async def create_section(self, module_id: int, name: str, sort_order: int = 0, description: Optional[str] = None) -> Dict[str, Any]:
        """Create a new section"""
        return await self.curriculum.create_section(module_id, name, sort_order, description)

    async def get_sections_by_module(self, module_id: int) -> List[Dict[str, Any]]:
        """Get all sections for a module ordered by sort_order"""
        return await self.curriculum.get_sections_by_module(module_id)

    async def get_section_by_id(self, section_id: int) -> Optional[Dict[str, Any]]:
        """Get section by ID"""
        return await self.curriculum.get_section_by_id(section_id)

    async def update_section(self, section_id: int, name: Optional[str] = None, sort_order: Optional[int] = None, description: Optional[str] = None, guide: Optional[str] = None):
        """Update section"""
        return await self.curriculum.update_section(section_id, name, sort_order, description, guide)

    async def delete_section(self, section_id: int):
        """Delete section"""
        return await self.curriculum.delete_section(section_id)

    # Lessons (Уроки) and mini-lessons (4 шага внутри урока)
    async def create_lesson(
        self,
        section_id: int,
        lesson_number: int,
        title: Optional[str] = None,
        sort_order: int = 0
    ) -> Dict[str, Any]:
        """Create a lesson in a section and ensure 4 mini-lessons exist."""
        return await self.curriculum.create_lesson(section_id, lesson_number, title, sort_order)

    async def ensure_default_mini_lessons(self, lesson_id: int) -> None:
        """Ensure mini_lessons (1..4) exist for a lesson."""
        return await self.curriculum.ensure_default_mini_lessons(lesson_id)

    async def get_lessons_by_section(self, section_id: int) -> List[Dict[str, Any]]:
        """Get lessons for section ordered by sort_order, lesson_number."""
        return await self.curriculum.get_lessons_by_section(section_id)

    async def get_lesson_by_id(self, lesson_id: int) -> Optional[Dict[str, Any]]:
        return await self.curriculum.get_lesson_by_id(lesson_id)

    async def update_lesson(
        self,
        lesson_id: int,
        lesson_number: Optional[int] = None,
        title: Optional[str] = None,
        sort_order: Optional[int] = None,
    ) -> None:
        return await self.curriculum.update_lesson(lesson_id, lesson_number, title, sort_order)

    async def delete_lesson(self, lesson_id: int) -> None:
        """Delete a lesson and all its mini-lessons and tasks."""
        return await self.curriculum.delete_lesson(lesson_id)

    async def get_mini_lessons_by_lesson(self, lesson_id: int) -> List[Dict[str, Any]]:
        """Get 4 mini-lessons for a lesson ordered by mini_index."""
        return await self.curriculum.get_mini_lessons_by_lesson(lesson_id)

    async def get_mini_lesson_by_id(self, mini_lesson_id: int) -> Optional[Dict[str, Any]]:
        return await self.curriculum.get_mini_lesson_by_id(mini_lesson_id)

    async def update_mini_lesson(
        self,
        mini_lesson_id: int,
        title: Optional[str] = None,
        sort_order: Optional[int] = None
    ) -> None:
        return await self.curriculum.update_mini_lesson(mini_lesson_id, title, sort_order)

    # Delegate task methods related to mini-lessons and sections
    async def get_tasks_by_mini_lesson(self, mini_lesson_id: int) -> List[Dict[str, Any]]:
        """Get tasks for mini-lesson ordered by sort_order."""
        return await self.tasks.get_tasks_by_mini_lesson(mini_lesson_id)

    async def create_task_in_mini_lesson(
        self,
        mini_lesson_id: int,
        text: str,
        answer: str,
        created_by: int,
        question_type: str = "input",
        text_scale: str = "md",
        options: Optional[List[Dict[str, Any]]] = None,
        subquestions: Optional[List[Dict[str, Any]]] = None,
        sort_order: int = 0,
        task_type: str = "standard",
        image_filename: Optional[str] = None,
        solution_filename: Optional[str] = None,
        difficulty: int = 1,
        bank_task_id: Optional[int] = None,
        bank_topics: Optional[List[str]] = None,
        bank_difficulty: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Create a placement task in mini-lesson, creating bank content when needed."""
        resolved_bank_task_id = bank_task_id
        if not resolved_bank_task_id:
            bank_task = await self.create_bank_task(
                text=text,
                answer=answer,
                question_type=question_type,
                text_scale=text_scale,
                difficulty=(bank_difficulty or "B"),
                topics=bank_topics or [],
                options=options,
                subquestions=subquestions,
                image_filename=image_filename,
                solution_filename=solution_filename,
                created_by=created_by,
            )
            resolved_bank_task_id = bank_task.get("id")

        return await self.curriculum.create_task_in_mini_lesson(
            mini_lesson_id=mini_lesson_id,
            text=text,
            answer=answer,
            question_type=question_type,
            options=None,
            subquestions=None,
            image_filename=image_filename,
            solution_filename=solution_filename,
            created_by=created_by,
            task_type=task_type,
            sort_order=sort_order,
            bank_task_id=resolved_bank_task_id,
        )

    # Tasks - update to support sections
    async def create_task_in_section(
        self,
        section_id: int,
        text: str,
        answer: str,
        created_by: int,
        task_type: str = "standard",
        image_filename: Optional[str] = None,
        solution_filename: Optional[str] = None,
        difficulty: int = 1,
        sort_order: int = 0,
        questions: Optional[List[Dict[str, Any]]] = None,
        bank_task_id: Optional[int] = None,
        question_type: str = "input",
        text_scale: str = "md",
        options: Optional[List[Dict[str, Any]]] = None,
        subquestions: Optional[List[Dict[str, Any]]] = None,
        bank_topics: Optional[List[str]] = None,
        bank_difficulty: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Create placement task in section, creating bank content when needed."""
        resolved_question_type = question_type or "input"
        resolved_options = options
        if questions and len(questions) > 0 and resolved_options is None:
            # Legacy: questions list was passed via "questions"
            resolved_options = questions

        resolved_bank_task_id = bank_task_id
        if not resolved_bank_task_id:
            bank_task = await self.create_bank_task(
                text=text,
                answer=answer,
                question_type=resolved_question_type,
                text_scale=text_scale,
                difficulty=(bank_difficulty or "B"),
                topics=bank_topics or [],
                options=resolved_options,
                subquestions=subquestions,
                image_filename=image_filename,
                solution_filename=solution_filename,
                created_by=created_by,
            )
            resolved_bank_task_id = bank_task.get("id")

        return await self.curriculum.create_task_in_section(
            section_id=section_id,
            text=text,
            answer=answer,
            question_type=resolved_question_type,
            options=None,
            image_filename=image_filename,
            solution_filename=solution_filename,
            created_by=created_by,
            task_type=task_type,
            sort_order=sort_order,
            bank_task_id=resolved_bank_task_id,
        )

    async def get_tasks_by_section(self, section_id: int) -> List[Dict[str, Any]]:
        """Get all tasks for a section ordered by sort_order"""
        return await self.tasks.get_tasks_by_section(section_id)

    # Progress tracking
    # Delegate progress methods
    async def update_task_progress(self, user_id: int, task_id: int, status: str = "completed"):
        """Update or create user progress for a task"""
        return await self.progress.update_task_progress(user_id, task_id, status)
    
    async def check_if_task_all_questions_completed(self, user_id: int, task_id: int) -> bool:
        """Check if all questions in a task are completed correctly"""
        questions = await self.progress.get_task_questions(task_id)
        if not questions:
            return True
        progress = await self.progress.get_user_task_question_progress(user_id, task_id)
        if len(progress) < len(questions):
            return False
        for i in range(len(questions)):
            if i not in progress or not progress[i]:
                return False
        return True

    async def get_user_task_progress(self, user_id: int, task_id: int) -> Optional[Dict[str, Any]]:
        """Get user progress for a specific task"""
        return await self.progress.get_user_task_progress(user_id, task_id)

    async def get_user_progress_for_section(self, user_id: int, section_id: int) -> Dict[int, str]:
        """Get progress for all tasks in a section"""
        return await self.progress.get_user_progress_for_section(user_id, section_id)

    async def get_user_progress_for_module(self, user_id: int, module_id: int) -> Dict[int, str]:
        """Get progress for all tasks in a module"""
        return await self.progress.get_user_progress_for_module(user_id, module_id)

    async def get_user_progress_for_mini_lesson(self, user_id: int, mini_lesson_id: int) -> Dict[int, str]:
        """Get progress for all tasks in a mini-lesson"""
        return await self.progress.get_user_progress_for_mini_lesson(user_id, mini_lesson_id)

    async def calculate_mini_lesson_completion(self, user_id: int, mini_lesson_id: int) -> Dict[str, Any]:
        """Calculate mini-lesson completion"""
        return await self.progress.calculate_mini_lesson_completion(user_id, mini_lesson_id)

    async def calculate_lesson_completion(self, user_id: int, lesson_id: int) -> Dict[str, Any]:
        """Calculate lesson completion"""
        return await self.progress.calculate_lesson_completion(user_id, lesson_id, self.curriculum)

    async def calculate_section_completion(self, user_id: int, section_id: int) -> Dict[str, Any]:
        """Calculate section completion"""
        return await self.progress.calculate_section_completion(user_id, section_id)

    async def calculate_module_completion(self, user_id: int, module_id: int) -> Dict[str, Any]:
        """Calculate module completion"""
        return await self.progress.calculate_module_completion(user_id, module_id, self.curriculum)

    # Delegate task question methods
    async def get_task_questions(self, task_id: int) -> List[Dict[str, Any]]:
        """Get all questions for a task"""
        return await self.progress.get_task_questions(task_id)

    async def check_task_question_answer(self, task_id: int, question_index: int, user_answer: str) -> bool:
        """Check if answer for a specific question is correct"""
        return await self.progress.check_task_question_answer(task_id, question_index, user_answer)

    async def record_task_question_progress(self, user_id: int, task_id: int, question_index: int, is_correct: bool):
        """Record user progress for a question"""
        return await self.progress.record_task_question_progress(user_id, task_id, question_index, is_correct)

    async def get_user_task_question_progress(self, user_id: int, task_id: int) -> Dict[int, bool]:
        """Get user progress for all questions in a task"""
        return await self.progress.get_user_task_question_progress(user_id, task_id)

    # ========== BANK TASKS METHODS ==========

    async def get_bank_tasks(
        self,
        include_deleted: bool = False,
        search: Optional[str] = None,
        difficulty: Optional[str] = None,
        topics: Optional[List[str]] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> Dict[str, Any]:
        return await self.bank_tasks.list_tasks(
            include_deleted=include_deleted,
            search=search,
            difficulty=difficulty,
            topics=topics,
            limit=limit,
            offset=offset,
        )

    async def export_bank_tasks(self, include_deleted: bool = False) -> List[Dict[str, Any]]:
        return await self.bank_tasks.export_tasks(include_deleted=include_deleted)

    async def get_bank_quality_summary(self) -> Dict[str, Any]:
        return await self.bank_tasks.get_quality_summary()

    async def get_bank_quality_dead_tasks(
        self,
        *,
        search: Optional[str] = None,
        difficulty: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> Dict[str, Any]:
        return await self.bank_tasks.list_quality_dead_tasks(
            search=search,
            difficulty=difficulty,
            limit=limit,
            offset=offset,
        )

    async def get_bank_quality_no_topics_tasks(
        self,
        *,
        search: Optional[str] = None,
        difficulty: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> Dict[str, Any]:
        return await self.bank_tasks.list_quality_no_topics_tasks(
            search=search,
            difficulty=difficulty,
            limit=limit,
            offset=offset,
        )

    async def get_bank_quality_duplicate_clusters(
        self,
        *,
        threshold: float = 0.92,
        search: Optional[str] = None,
        difficulty: Optional[str] = None,
        question_type: Optional[str] = None,
        limit: int = 10,
        offset: int = 0,
    ) -> Dict[str, Any]:
        return await self.bank_tasks.list_quality_duplicate_clusters(
            threshold=threshold,
            search=search,
            difficulty=difficulty,
            question_type=question_type,
            limit=limit,
            offset=offset,
        )

    async def get_bank_task_by_id(self, task_id: int, include_deleted: bool = False) -> Optional[Dict[str, Any]]:
        return await self.bank_tasks.get_task_by_id(task_id, include_deleted=include_deleted)

    async def create_bank_task(
        self,
        text: str,
        answer: str,
        question_type: str,
        difficulty: str,
        text_scale: str = "md",
        topics: Optional[List[str]] = None,
        options: Optional[List[Dict[str, Any]]] = None,
        subquestions: Optional[List[Dict[str, Any]]] = None,
        image_filename: Optional[str] = None,
        solution_filename: Optional[str] = None,
        created_by: Optional[int] = None,
        source: Optional[str] = "admin_bank_create",
        reason: Optional[str] = None,
    ) -> Dict[str, Any]:
        return await self.bank_tasks.create_task(
            text=text,
            answer=answer,
            question_type=question_type,
            text_scale=text_scale,
            difficulty=difficulty,
            topics=topics,
            options=options,
            subquestions=subquestions,
            image_filename=image_filename,
            solution_filename=solution_filename,
            created_by=created_by,
            source=source,
            reason=reason,
        )

    async def create_bank_tasks_bulk_atomic(
        self,
        *,
        tasks: List[Dict[str, Any]],
        created_by: Optional[int] = None,
        actor_email: Optional[str] = None,
        source: Optional[str] = "admin_bank_import",
        reason: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        return await self.bank_tasks.create_tasks_bulk_atomic(
            tasks=tasks,
            created_by=created_by,
            actor_email=actor_email,
            source=source,
            reason=reason,
        )

    async def update_bank_task(
        self,
        task_id: int,
        text: Optional[str] = None,
        answer: Optional[str] = None,
        question_type: Optional[str] = None,
        text_scale: Optional[str] = None,
        difficulty: Optional[str] = None,
        topics: Optional[List[str]] = None,
        options: Optional[List[Dict[str, Any]]] = None,
        subquestions: Optional[List[Dict[str, Any]]] = None,
        image_filename: Optional[str] = None,
        solution_filename: Optional[str] = None,
        actor_user_id: Optional[int] = None,
        source: Optional[str] = "admin_bank_update",
        reason: Optional[str] = None,
        expected_current_version: Optional[int] = None,
    ) -> Optional[Dict[str, Any]]:
        return await self.bank_tasks.update_task(
            task_id=task_id,
            text=text,
            answer=answer,
            question_type=question_type,
            text_scale=text_scale,
            difficulty=difficulty,
            topics=topics,
            options=options,
            subquestions=subquestions,
            image_filename=image_filename,
            solution_filename=solution_filename,
            actor_user_id=actor_user_id,
            source=source,
            reason=reason,
            expected_current_version=expected_current_version,
        )

    async def soft_delete_bank_task(
        self,
        task_id: int,
        actor_user_id: Optional[int] = None,
        source: Optional[str] = "admin_bank_soft_delete",
        reason: Optional[str] = None,
    ) -> bool:
        return await self.bank_tasks.soft_delete_task(
            task_id=task_id,
            actor_user_id=actor_user_id,
            source=source,
            reason=reason,
        )

    async def restore_bank_task(
        self,
        task_id: int,
        actor_user_id: Optional[int] = None,
        source: Optional[str] = "admin_bank_restore",
        reason: Optional[str] = None,
    ) -> bool:
        return await self.bank_tasks.restore_task(
            task_id=task_id,
            actor_user_id=actor_user_id,
            source=source,
            reason=reason,
        )

    async def hard_delete_bank_task(
        self,
        task_id: int,
        actor_user_id: Optional[int] = None,
        actor_email: Optional[str] = None,
    ) -> bool:
        return await self.bank_tasks.hard_delete_task(
            task_id,
            actor_user_id=actor_user_id,
            actor_email=actor_email,
        )

    async def cleanup_old_deleted_bank_tasks(self, days: int = 30) -> int:
        return await self.bank_tasks.cleanup_old_deleted_tasks(days)

    async def get_bank_topics(self, query: Optional[str] = None, limit: int = 20) -> List[str]:
        return await self.bank_tasks.list_topics(query=query, limit=limit)

    async def get_bank_task_versions(
        self,
        task_id: int,
        limit: int = 50,
        offset: int = 0,
    ) -> Dict[str, Any]:
        return await self.bank_tasks.list_task_versions(task_id=task_id, limit=limit, offset=offset)

    async def get_bank_task_version(self, task_id: int, version_no: int) -> Optional[Dict[str, Any]]:
        return await self.bank_tasks.get_task_version(task_id=task_id, version_no=version_no)

    async def delete_bank_task_version(
        self,
        task_id: int,
        version_no: int,
        actor_user_id: Optional[int] = None,
        actor_email: Optional[str] = None,
    ) -> bool:
        return await self.bank_tasks.delete_task_version(
            task_id=task_id,
            version_no=version_no,
            actor_user_id=actor_user_id,
            actor_email=actor_email,
        )

    async def rollback_bank_task(
        self,
        task_id: int,
        target_version: int,
        actor_user_id: Optional[int] = None,
        actor_email: Optional[str] = None,
        source: Optional[str] = "admin_bank_rollback",
        reason: Optional[str] = None,
        expected_current_version: Optional[int] = None,
    ) -> Optional[Dict[str, Any]]:
        return await self.bank_tasks.rollback_task(
            task_id=task_id,
            target_version=target_version,
            actor_user_id=actor_user_id,
            actor_email=actor_email,
            source=source,
            reason=reason,
            expected_current_version=expected_current_version,
        )

    async def get_bank_audit_logs(
        self,
        *,
        action: Optional[str] = None,
        task_id: Optional[int] = None,
        actor_email: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> Dict[str, Any]:
        return await self.bank_tasks.list_admin_audit_logs(
            action=action,
            task_id=task_id,
            actor_email=actor_email,
            limit=limit,
            offset=offset,
        )

    async def get_bank_task_usage(self, task_id: int, include_deleted: bool = False) -> Dict[str, Any]:
        return await self.bank_tasks.get_task_usage(task_id=task_id, include_deleted=include_deleted)

    async def find_similar_bank_tasks(
        self,
        *,
        text: str,
        options: Optional[List[Dict[str, Any]]] = None,
        question_type: Optional[str] = None,
        exclude_task_id: Optional[int] = None,
        threshold: float = 0.8,
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        return await self.bank_tasks.find_similar_tasks(
            text=text,
            options=options,
            question_type=question_type,
            exclude_task_id=exclude_task_id,
            threshold=threshold,
            limit=limit,
        )

    async def copy_bank_tasks_to_trial_test(
        self,
        trial_test_id: int,
        bank_task_ids: List[int],
        created_by: Optional[int] = None,
    ) -> Dict[str, Any]:
        return await self.bank_tasks.copy_tasks_to_trial_test(
            trial_test_id=trial_test_id,
            bank_task_ids=bank_task_ids,
            created_by=created_by,
        )

    # ========== TRIAL TESTS METHODS ==========

    # Delegate trial test methods to TrialTestRepository
    async def create_trial_test(
        self,
        title: str,
        description: Optional[str] = None,
        sort_order: int = 0,
        created_by: Optional[int] = None,
        expected_tasks_count: int = 40,
    ) -> Dict[str, Any]:
        """Create a new trial test"""
        return await self.trial_tests.create_trial_test(
            title=title,
            description=description,
            sort_order=sort_order,
            created_by=created_by,
            expected_tasks_count=expected_tasks_count,
        )

    async def get_trial_tests(self) -> List[Dict[str, Any]]:
        """Get all trial tests"""
        return await self.trial_tests.get_trial_tests()

    async def get_trial_test_by_id(self, test_id: int) -> Optional[Dict[str, Any]]:
        """Get trial test by ID"""
        return await self.trial_tests.get_trial_test_by_id(test_id)

    async def update_trial_test(
        self,
        test_id: int,
        title: Optional[str] = None,
        description: Optional[str] = None,
        sort_order: Optional[int] = None,
        expected_tasks_count: Optional[int] = None,
    ) -> Optional[Dict[str, Any]]:
        """Update trial test"""
        return await self.trial_tests.update_trial_test(
            test_id=test_id,
            title=title,
            description=description,
            sort_order=sort_order,
            expected_tasks_count=expected_tasks_count,
        )

    async def delete_trial_test(self, test_id: int) -> bool:
        """Delete trial test (cascade will delete related records)"""
        return await self.trial_tests.delete_trial_test(test_id)

    async def create_trial_test_task(
        self,
        trial_test_id: int,
        text: str,
        answer: str,
        question_type: str = "input",
        text_scale: str = "md",
        options: Optional[List[Dict[str, str]]] = None,
        subquestions: Optional[List[Dict[str, Any]]] = None,
        image_filename: Optional[str] = None,
        solution_filename: Optional[str] = None,
        created_by: Optional[int] = None,
        sort_order: int = 0,
        bank_task_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Create a new task for a trial test"""
        return await self.trial_tests.create_trial_test_task(
            trial_test_id, text, answer, question_type, text_scale, options,
            subquestions,
            image_filename, solution_filename, created_by, sort_order, bank_task_id
        )

    async def remove_task_from_trial_test(self, trial_test_id: int, task_id: int) -> bool:
        """Remove a task from a trial test (soft delete)"""
        return await self.trial_tests.remove_task_from_trial_test(trial_test_id, task_id)

    async def remove_trial_test_tasks_by_bank_task_id(self, bank_task_id: int) -> int:
        """Remove all active trial-test tasks linked to a bank task."""
        return await self.trial_tests.remove_tasks_by_bank_task_id(bank_task_id)

    async def get_trial_test_tasks(self, trial_test_id: int) -> List[Dict[str, Any]]:
        """Get all tasks for a trial test, ordered by sort_order"""
        return await self.trial_tests.get_trial_test_tasks(trial_test_id)

    async def upsert_trial_test_slot(
        self,
        trial_test_id: int,
        slot_index: int,
        *,
        bank_task_id: Optional[int],
        created_by: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Create/update placement in a fixed slot."""
        return await self.trial_tests.upsert_trial_test_slot(
            trial_test_id=trial_test_id,
            slot_index=slot_index,
            bank_task_id=bank_task_id,
            created_by=created_by,
        )

    async def clear_trial_test_slot(self, trial_test_id: int, slot_index: int) -> int:
        """Soft-delete placement in a fixed slot."""
        return await self.trial_tests.clear_trial_test_slot(trial_test_id, slot_index)

    async def get_trial_test_task(self, task_id: int) -> Optional[Dict[str, Any]]:
        """Get a trial test task by ID"""
        return await self.trial_tests.get_trial_test_task(task_id)

    async def update_trial_test_task(
        self,
        task_id: int,
        text: Optional[str] = None,
        answer: Optional[str] = None,
        question_type: Optional[str] = None,
        text_scale: Optional[str] = None,
        options: Optional[List[Dict[str, Any]]] = None,
        subquestions: Optional[List[Dict[str, Any]]] = None,
        sort_order: Optional[int] = None,
        image_filename: Optional[str] = None,
        solution_filename: Optional[str] = None,
    ) -> None:
        """Update a trial test task"""
        return await self.trial_tests.update_trial_test_task(
            task_id=task_id,
            text=text,
            answer=answer,
            question_type=question_type,
            text_scale=text_scale,
            options=options,
            subquestions=subquestions,
            sort_order=sort_order,
            image_filename=image_filename,
            solution_filename=solution_filename,
        )

    async def save_trial_test_result(
        self, 
        user_id: int, 
        trial_test_id: int, 
        score: int, 
        total: int, 
        percentage: float, 
        answers: Dict[int, Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Save trial test result"""
        return await self.trial_tests.save_trial_test_result(user_id, trial_test_id, score, total, percentage, answers)

    async def submit_trial_test_attempt(
        self,
        *,
        user_id: int,
        trial_test_id: int,
        score: int,
        total: int,
        percentage: float,
        answers: Dict[int, Dict[str, Any]],
        rewards: List[Dict[str, Any]],
        should_update_streak: bool,
        delete_draft: bool = True,
    ) -> Dict[str, Any]:
        """Persist a full trial-test submit atomically."""
        return await self.trial_tests.submit_trial_test_attempt(
            user_id=user_id,
            trial_test_id=trial_test_id,
            score=score,
            total=total,
            percentage=percentage,
            answers=answers,
            rewards=rewards,
            should_update_streak=should_update_streak,
            delete_draft=delete_draft,
        )

    async def get_user_trial_test_results(self, user_id: int, trial_test_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """Get trial test results for a user"""
        return await self.trial_tests.get_user_trial_test_results(user_id, trial_test_id)

    async def get_trial_test_draft(self, user_id: int, trial_test_id: int) -> Optional[Dict[str, Any]]:
        """Get draft for a user's trial test"""
        return await self.trial_tests.get_trial_test_draft(user_id, trial_test_id)

    async def upsert_trial_test_draft(
        self, user_id: int, trial_test_id: int, answers: Dict[int, str], current_task_index: int
    ) -> None:
        """Save or update draft"""
        await self.trial_tests.upsert_trial_test_draft(user_id, trial_test_id, answers, current_task_index)

    async def delete_trial_test_draft(self, user_id: int, trial_test_id: int) -> None:
        """Delete draft after submit"""
        await self.trial_tests.delete_trial_test_draft(user_id, trial_test_id)

    async def get_user_trial_test_draft_ids(self, user_id: int) -> List[int]:
        """Return trial_test_id list for which the user has a draft."""
        return await self.trial_tests.get_user_trial_test_draft_ids(user_id)

    # ========== TRIAL TEST COOP METHODS ==========

    async def create_trial_test_coop_session(self, trial_test_id: int, owner_id: int) -> Dict[str, Any]:
        """Create a coop session for a trial test"""
        return await self.trial_test_coop.create_session(trial_test_id, owner_id)

    async def get_trial_test_coop_session(self, session_id: int) -> Optional[Dict[str, Any]]:
        """Get coop session by ID"""
        return await self.trial_test_coop.get_session(session_id)

    async def update_trial_test_coop_session_status(self, session_id: int, status: str) -> None:
        """Update coop session status"""
        await self.trial_test_coop.update_session_status(session_id, status)

    async def add_trial_test_coop_participant(self, session_id: int, user_id: int, color: str) -> Dict[str, Any]:
        """Add participant to coop session"""
        return await self.trial_test_coop.add_participant(session_id, user_id, color)

    async def get_trial_test_coop_participant(self, session_id: int, user_id: int) -> Optional[Dict[str, Any]]:
        """Get participant in coop session"""
        return await self.trial_test_coop.get_participant(session_id, user_id)

    async def list_trial_test_coop_participants(self, session_id: int) -> List[Dict[str, Any]]:
        """List participants in coop session"""
        return await self.trial_test_coop.list_participants(session_id)

    async def set_trial_test_coop_participant_finished(self, session_id: int, user_id: int, is_finished: bool = True) -> None:
        """Update participant finished flag"""
        await self.trial_test_coop.set_participant_finished(session_id, user_id, is_finished)

    async def upsert_trial_test_coop_answer(self, session_id: int, user_id: int, task_id: int, answer: str) -> None:
        """Upsert coop answer for a task"""
        await self.trial_test_coop.upsert_answer(session_id, user_id, task_id, answer)

    async def list_trial_test_coop_answers_for_user(self, session_id: int, user_id: int) -> List[Dict[str, Any]]:
        """List coop answers for a user in a session"""
        return await self.trial_test_coop.list_answers_for_user(session_id, user_id)

    async def create_trial_test_coop_result_link(self, session_id: int, user_id: int, trial_test_result_id: int) -> Dict[str, Any]:
        """Link coop session to trial_test_results"""
        return await self.trial_test_coop.create_result_link(session_id, user_id, trial_test_result_id)

    async def get_trial_test_coop_results(self, session_id: int) -> List[Dict[str, Any]]:
        """Get coop results for a session"""
        return await self.trial_test_coop.get_results_for_session(session_id)

    async def create_trial_test_coop_invite(self, session_id: int, sender_id: int, receiver_id: int) -> Dict[str, Any]:
        """Create an invite to a coop session"""
        return await self.trial_test_coop.create_invite(session_id, sender_id, receiver_id)

    async def get_trial_test_coop_invite(self, session_id: int, receiver_id: int) -> Optional[Dict[str, Any]]:
        """Get pending invite for a receiver"""
        return await self.trial_test_coop.get_invite(session_id, receiver_id)

    async def update_trial_test_coop_invite_status(self, invite_id: int, status: str) -> None:
        """Update invite status (accepted/declined)"""
        await self.trial_test_coop.update_invite_status(invite_id, status)

    async def list_trial_test_coop_incoming_invites(self, receiver_id: int) -> List[Dict[str, Any]]:
        """List incoming coop invites for a user"""
        return await self.trial_test_coop.list_incoming_invites(receiver_id)

    # ========== REPORT METHODS ==========
    # Delegate report methods to ReportRepository
    async def create_report(self, user_id: int, task_id: int, message: str) -> Dict[str, Any]:
        """Create a new report about a task"""
        return await self.reports.create_report(user_id, task_id, message)

    async def get_user_reports(self, user_id: int) -> List[Dict[str, Any]]:
        """Get all reports submitted by a user"""
        return await self.reports.get_user_reports(user_id)

    async def get_all_reports(self, status_filter: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
        """Get all reports (admin only)"""
        return await self.reports.get_all_reports(status_filter, limit)

    async def get_report_by_id(self, report_id: int) -> Optional[Dict[str, Any]]:
        """Get a specific report by ID"""
        return await self.reports.get_report_by_id(report_id)

    async def update_report_status(self, report_id: int, status: str, resolved_by: Optional[int] = None) -> bool:
        """Update report status (admin only)"""
        return await self.reports.update_report_status(report_id, status, resolved_by)

    async def can_user_report_task(self, user_id: int, task_id: int) -> bool:
        """Check if user can report this task (has attempted it)"""
        return await self.reports.can_user_report_task(user_id, task_id)

    async def delete_report(self, report_id: int) -> bool:
        """Delete a report by ID (admin only)"""
        return await self.reports.delete_report(report_id)

    # ========== TRIAL TEST REPORT METHODS ==========
    async def create_trial_test_report(
        self, user_id: int, trial_test_id: int, trial_test_task_id: int, message: str
    ) -> Dict[str, Any]:
        """Create a new report about a trial test task"""
        return await self.trial_test_reports.create_trial_test_report(
            user_id, trial_test_id, trial_test_task_id, message
        )

    async def get_user_trial_test_reports(self, user_id: int) -> List[Dict[str, Any]]:
        """Get all reports submitted by a user for trial tests"""
        return await self.trial_test_reports.get_user_trial_test_reports(user_id)

    async def get_all_trial_test_reports(
        self, status_filter: Optional[str] = None, limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get all trial test reports (admin only)"""
        return await self.trial_test_reports.get_all_trial_test_reports(status_filter, limit)

    async def get_trial_test_report_by_id(self, report_id: int) -> Optional[Dict[str, Any]]:
        """Get a specific trial test report by ID"""
        return await self.trial_test_reports.get_trial_test_report_by_id(report_id)

    async def update_trial_test_report_status(
        self, report_id: int, status: str, resolved_by: Optional[int] = None
    ) -> bool:
        """Update trial test report status (admin only)"""
        return await self.trial_test_reports.update_trial_test_report_status(
            report_id, status, resolved_by
        )

    async def delete_trial_test_report(self, report_id: int) -> bool:
        """Delete a trial test report by ID (admin only)"""
        return await self.trial_test_reports.delete_trial_test_report(report_id)

    async def has_user_reported_trial_test_task(self, user_id: int, task_id: int) -> bool:
        """Check if user already reported this trial test task"""
        return await self.trial_test_reports.has_user_reported_trial_test_task(user_id, task_id)

    async def can_user_report_trial_test_task(
        self, user_id: int, trial_test_id: int, task_id: int
    ) -> bool:
        """Check if user can report this trial test task (has attempted it)"""
        return await self.trial_test_reports.can_user_report_trial_test_task(
            user_id, trial_test_id, task_id
        )

    # ========== ONBOARDING METHODS ==========
    
    async def is_onboarding_completed(self, user_id: int) -> bool:
        """Check if user has completed onboarding"""
        async with aiosqlite.connect(self.db_path, timeout=self.sqlite_timeout_seconds) as db:
            await self._configure_connection(db)
            async with db.execute(
                "SELECT onboarding_completed FROM users WHERE id = ?",
                (user_id,)
            ) as cursor:
                row = await cursor.fetchone()
                return bool(row[0]) if row else False
    
    async def save_onboarding(self, user_id: int, how_did_you_hear: str, math_level: str, nickname: str) -> bool:
        """Save onboarding data and mark user as completed"""
        async with aiosqlite.connect(self.db_path, timeout=self.sqlite_timeout_seconds) as db:
            await self._configure_connection(db)
            # Save onboarding data
            async with db.execute(
                """INSERT OR REPLACE INTO user_onboarding 
                   (user_id, how_did_you_hear, math_level, nickname, completed_at)
                   VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)""",
                (user_id, how_did_you_hear, math_level, nickname)
            ):
                pass
            # Update user nickname
            async with db.execute(
                "UPDATE users SET nickname = ? WHERE id = ?",
                (nickname, user_id)
            ):
                pass
            # Mark onboarding as completed
            async with db.execute(
                "UPDATE users SET onboarding_completed = 1 WHERE id = ?",
                (user_id,)
            ):
                pass
            await db.commit()
            return True
    
    async def get_onboarding_statistics(self) -> Dict[str, Any]:
        """Get onboarding statistics for admin"""
        try:
            async with aiosqlite.connect(self.db_path, timeout=self.sqlite_timeout_seconds) as db:
                await self._configure_connection(db)
                db.row_factory = aiosqlite.Row
                
                # Check if table exists
                async with db.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name='user_onboarding'"
                ) as cursor:
                    table_exists = await cursor.fetchone()
                    if not table_exists:
                        # Return empty stats if table doesn't exist yet
                        return {
                            "total_completed": 0,
                            "how_did_you_hear": {},
                            "math_level": {}
                        }
                
                # Total completed onboarding
                async with db.execute("SELECT COUNT(*) as count FROM user_onboarding") as cursor:
                    total_row = await cursor.fetchone()
                    total = total_row[0] if total_row else 0
                
                # Statistics by "how did you hear"
                how_did_you_hear_stats = {}
                async with db.execute(
                    """SELECT how_did_you_hear, COUNT(*) as count 
                       FROM user_onboarding 
                       WHERE how_did_you_hear IS NOT NULL 
                       GROUP BY how_did_you_hear 
                       ORDER BY count DESC"""
                ) as cursor:
                    rows = await cursor.fetchall()
                    for row in rows:
                        how_did_you_hear_stats[row["how_did_you_hear"]] = row["count"]
                
                # Statistics by math level
                math_level_stats = {}
                async with db.execute(
                    """SELECT math_level, COUNT(*) as count 
                       FROM user_onboarding 
                       WHERE math_level IS NOT NULL 
                       GROUP BY math_level 
                       ORDER BY count DESC"""
                ) as cursor:
                    rows = await cursor.fetchall()
                    for row in rows:
                        math_level_stats[row["math_level"]] = row["count"]
                
                # Level labels mapping
                level_labels = {
                    "beginner": "Бастапқы деңгей",
                    "intermediate": "Орташа деңгей",
                    "advanced": "Жоғары деңгей",
                    "expert": "Маман деңгейі"
                }
                
                # Format math level stats with labels
                formatted_math_level_stats = {}
                for level, count in math_level_stats.items():
                    formatted_math_level_stats[level_labels.get(level, level)] = count
                
                return {
                    "total_completed": total,
                    "how_did_you_hear": how_did_you_hear_stats,
                    "math_level": formatted_math_level_stats
                }
        except Exception as e:
            logger.error(f"Error getting onboarding statistics: {e}", exc_info=True)
            # Return empty stats on error
            return {
                "total_completed": 0,
                "how_did_you_hear": {},
                "math_level": {}
            }

    # ========== ADMIN STATISTICS METHODS ==========
    
    # Delegate statistics methods to StatisticsRepository
    async def get_admin_statistics(self) -> Dict[str, Any]:
        """Get comprehensive admin statistics"""
        return await self.statistics.get_admin_statistics(self.tasks)

    # ========== OPS / PRODUCTION HEALTH METHODS ==========

    async def probe_database(self) -> bool:
        """Lightweight DB liveness probe."""
        try:
            async with aiosqlite.connect(self.db_path, timeout=self.sqlite_timeout_seconds) as db:
                await self._configure_connection(db)
                async with db.execute("SELECT 1") as cursor:
                    row = await cursor.fetchone()
                    return bool(row and int(row[0]) == 1)
        except Exception:
            return False

    async def add_ops_health_sample(
        self,
        *,
        service_status: str,
        database_status: str,
        requests_5m: int,
        errors_5m: int,
        error_rate_5m: float,
        p95_ms_5m: float,
        avg_ms_5m: float,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> int:
        return await self.ops.add_health_sample(
            service_status=service_status,
            database_status=database_status,
            requests_5m=requests_5m,
            errors_5m=errors_5m,
            error_rate_5m=error_rate_5m,
            p95_ms_5m=p95_ms_5m,
            avg_ms_5m=avg_ms_5m,
            metadata=metadata,
        )

    async def get_latest_ops_health_sample(self) -> Optional[Dict[str, Any]]:
        return await self.ops.get_latest_health_sample()

    async def get_ops_health_timeseries(self, *, range_sql: str, step_seconds: int) -> List[Dict[str, Any]]:
        return await self.ops.list_health_timeseries(range_sql=range_sql, step_seconds=step_seconds)

    async def get_open_ops_incidents_count(self) -> int:
        return await self.ops.count_open_incidents()

    async def get_open_ops_incident_by_fingerprint(self, fingerprint: str) -> Optional[Dict[str, Any]]:
        return await self.ops.get_open_incident_by_fingerprint(fingerprint=fingerprint)

    async def open_or_update_ops_incident(
        self,
        *,
        kind: str,
        severity: str,
        fingerprint: str,
        title: str,
        message: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        return await self.ops.open_or_update_incident(
            kind=kind,
            severity=severity,
            fingerprint=fingerprint,
            title=title,
            message=message,
            metadata=metadata,
        )

    async def resolve_ops_incident(
        self,
        *,
        fingerprint: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        return await self.ops.resolve_incident(fingerprint=fingerprint, metadata=metadata)

    async def mark_ops_incident_telegram_sent(self, incident_id: int) -> None:
        await self.ops.touch_incident_telegram_sent(incident_id=incident_id)

    async def list_ops_incidents(
        self,
        *,
        status: str = "open",
        severity: str = "all",
        limit: int = 20,
        offset: int = 0,
    ) -> Dict[str, Any]:
        return await self.ops.list_incidents(
            status=status,
            severity=severity,
            limit=limit,
            offset=offset,
        )

    async def cleanup_old_ops_health_samples(self, retention_days: int) -> int:
        return await self.ops.cleanup_old_health_samples(retention_days=retention_days)

    async def cleanup_old_ops_incidents(self, retention_days: int) -> int:
        return await self.ops.cleanup_old_incidents(retention_days=retention_days)

