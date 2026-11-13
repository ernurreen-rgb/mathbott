"""
Database container: connection pool + repositories + cross-repository orchestration.

Routes access repositories directly (db.users, db.bank_tasks, ...) or through
the per-repository providers in dependencies.py. The only methods kept on this
class are init/shutdown plumbing and operations that span multiple repositories.
"""
import asyncio
import logging

import storage as db_driver
from typing import Optional, List, Dict, Any

from migrations.postgres_runner import run_postgres_migrations
from migrations.seeds import run_seeds
from repositories.user_repository import UserRepository
from repositories.task_repository import TaskRepository
from repositories.curriculum_repository import CurriculumRepository
from repositories.progress_repository import ProgressRepository
from repositories.solution_repository import SolutionRepository
from repositories.achievement_repository import AchievementRepository
from repositories.trial_test_repository import TrialTestRepository
from repositories.bank_task_repository import BankTaskRepository
from repositories.report_repository import ReportRepository
from repositories.trial_test_report_repository import TrialTestReportRepository
from repositories.statistics_repository import StatisticsRepository
from repositories.friends_repository import FriendsRepository
from repositories.ops_repository import OpsRepository
from repositories.onboarding_repository import OnboardingRepository
from repositories.quiz_repository import QuizRepository
from repositories.module_review_repository import ModuleReviewRepository
from utils.connection_pool import ConnectionPool

logger = logging.getLogger(__name__)


class Database:
    def __init__(self, database_url: str, use_pool: bool = True, migration_url: str = "", auto_migrate: bool = True):
        self.database_url = db_driver.require_postgres_url(database_url)
        self.migration_url = migration_url
        self.auto_migrate = auto_migrate
        self.connect_timeout_seconds = 30
        self.use_pool = use_pool

        # Initialize connection pool if enabled
        self.connection_pool: Optional[ConnectionPool] = None
        if use_pool:
            self.connection_pool = ConnectionPool(
                database_url=self.database_url,
                min_size=0,
                max_size=2,
                timeout=self.connect_timeout_seconds,
            )

        # Initialize repositories with connection pool
        url, pool = self.database_url, self.connection_pool
        self.users = UserRepository(url, connection_pool=pool)
        self.tasks = TaskRepository(url, connection_pool=pool)
        self.curriculum = CurriculumRepository(url, connection_pool=pool)
        self.progress = ProgressRepository(url, connection_pool=pool)
        self.solutions = SolutionRepository(url, connection_pool=pool)
        self.achievements = AchievementRepository(url, connection_pool=pool)
        self.trial_tests = TrialTestRepository(url, connection_pool=pool)
        self.bank_tasks = BankTaskRepository(url, connection_pool=pool)
        self.reports = ReportRepository(url, connection_pool=pool)
        self.trial_test_reports = TrialTestReportRepository(url, connection_pool=pool)
        self.statistics = StatisticsRepository(url, connection_pool=pool)
        self.friends = FriendsRepository(url, connection_pool=pool)
        self.ops = OpsRepository(url, connection_pool=pool)
        self.onboarding = OnboardingRepository(url, connection_pool=pool)
        self.quizzes = QuizRepository(url, connection_pool=pool)
        self.module_review = ModuleReviewRepository(url, connection_pool=pool)

    async def init(self):
        """Initialize database: apply PostgreSQL migrations, then idempotent seeds"""
        if self.auto_migrate:
            await asyncio.to_thread(run_postgres_migrations, self.migration_url or self.database_url)
            async with db_driver.connect(self.database_url, timeout=self.connect_timeout_seconds) as db:
                await run_seeds(db)

        # Initialize connection pool if enabled
        if self.connection_pool:
            await self.connection_pool.initialize()
            logger.info("Connection pool initialized")

    # --- Cross-repository orchestration ---


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
            self.progress, self.users, self.achievements, self.tasks, task_snapshot
        )

    async def check_and_unlock_achievements(self, user_id: int):
        """Check user stats and unlock achievements"""
        return await self.achievements.check_and_unlock_achievements(user_id, self.users)

    async def calculate_lesson_completion(self, user_id: int, lesson_id: int) -> Dict[str, Any]:
        """Calculate lesson completion"""
        return await self.progress.calculate_lesson_completion(user_id, lesson_id, self.curriculum)

    async def calculate_module_completion(self, user_id: int, module_id: int) -> Dict[str, Any]:
        """Calculate module completion"""
        return await self.progress.calculate_module_completion(user_id, module_id, self.curriculum)

    async def create_task_in_mini_lesson(
        self,
        mini_lesson_id: int,
        text: str,
        answer: str,
        created_by: int,
        question_type: str = "input",
        accepted_answers: Optional[List[str]] = None,
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
            bank_task = await self.bank_tasks.create_task(
                text=text,
                answer=answer,
                question_type=question_type,
                accepted_answers=accepted_answers,
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
        accepted_answers: Optional[List[str]] = None,
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
            bank_task = await self.bank_tasks.create_task(
                text=text,
                answer=answer,
                question_type=resolved_question_type,
                accepted_answers=accepted_answers,
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
