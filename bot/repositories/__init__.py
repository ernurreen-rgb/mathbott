"""
Database repositories for Mathbot
"""
from .base import BaseRepository
from .user_repository import UserRepository
from .task_repository import TaskRepository
from .curriculum_repository import CurriculumRepository
from .progress_repository import ProgressRepository
from .solution_repository import SolutionRepository
from .rating_repository import RatingRepository
from .achievement_repository import AchievementRepository
from .trial_test_repository import TrialTestRepository
from .trial_test_coop_repository import TrialTestCoopRepository
from .bank_task_repository import BankTaskRepository
from .report_repository import ReportRepository
from .trial_test_report_repository import TrialTestReportRepository
from .statistics_repository import StatisticsRepository
from .friends_repository import FriendsRepository
from .ops_repository import OpsRepository
from .onboarding_repository import OnboardingRepository

__all__ = [
    "BaseRepository",
    "UserRepository",
    "TaskRepository",
    "CurriculumRepository",
    "ProgressRepository",
    "SolutionRepository",
    "RatingRepository",
    "AchievementRepository",
    "TrialTestRepository",
    "TrialTestCoopRepository",
    "BankTaskRepository",
    "ReportRepository",
    "TrialTestReportRepository",
    "StatisticsRepository",
    "FriendsRepository",
    "OpsRepository",
    "OnboardingRepository",
]
