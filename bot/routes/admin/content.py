"""Register CMS routes in their original order."""
from fastapi import FastAPI
from slowapi import Limiter

from database import Database
from .content_tasks import register_task_content_routes
from .content_curriculum import register_curriculum_content_routes
from .content_lessons import register_lesson_content_routes


def register_content_routes(app: FastAPI, db: Database, limiter: Limiter):
    register_task_content_routes(app, db, limiter)
    register_curriculum_content_routes(app, db, limiter)
    register_lesson_content_routes(app, db, limiter)
