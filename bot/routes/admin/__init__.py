"""
Admin routes package.
"""
from fastapi import FastAPI
from slowapi import Limiter

from database import Database
from .auth import register_auth_routes
from .roles import register_roles_routes
from .content import register_content_routes
from .trial_tests import register_trial_tests_routes
from .bank import register_bank_routes
from .reports import register_reports_routes
from .ops import register_ops_routes
from .statistics import register_statistics_routes


def setup_admin_routes(app: FastAPI, db: Database, limiter: Limiter):
    """Setup admin/CMS routes in a fixed registration order."""
    register_auth_routes(app, db, limiter)
    register_roles_routes(app, db, limiter)
    register_content_routes(app, db, limiter)
    register_trial_tests_routes(app, db, limiter)
    register_bank_routes(app, db, limiter)
    register_reports_routes(app, db, limiter)
    register_ops_routes(app, db, limiter)
    register_statistics_routes(app, db, limiter)
