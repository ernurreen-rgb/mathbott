"""
Регистрация всех роутов приложения
"""
from fastapi import FastAPI
from slowapi import Limiter
from database import Database

from routes import core
from routes import modules
from routes import tasks
from routes import users
from routes import admin
from routes import trial_tests
from routes import trial_tests_coop
from routes import questions
from routes import reports
from routes import onboarding
from routes import export
from routes import friends


def register_routes(app: FastAPI, db: Database, limiter: Limiter):
    """
    Зарегистрировать все роуты приложения
    
    Args:
        app: FastAPI приложение
        db: Экземпляр Database
        limiter: Экземпляр Limiter
    """
    # Базовые роуты
    core.setup_core_routes(app, db, limiter)
    
    # Публичные роуты
    modules.setup_modules_routes(app, db, limiter)
    tasks.setup_tasks_routes(app, db, limiter)
    users.setup_users_routes(app, db, limiter)
    trial_tests.setup_trial_tests_routes(app, db, limiter)
    trial_tests_coop.setup_trial_tests_coop_routes(app, db, limiter)
    questions.setup_questions_routes(app, db, limiter)
    reports.setup_reports_routes(app, db, limiter)
    onboarding.setup_onboarding_routes(app, db, limiter)
    export.setup_export_routes(app, db)
    friends.setup_friends_routes(app, db, limiter)
    
    # Admin роуты (должны быть последними для правильного порядка)
    admin.setup_admin_routes(app, db, limiter)
