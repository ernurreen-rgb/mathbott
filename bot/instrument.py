"""
Process bootstrap for environment, logging, and Sentry.

Import this module as early as possible in the application entry point.
"""
from __future__ import annotations

import logging
import os

from config import load_environment
from utils.logging_config import setup_logging
from utils.sentry import init_sentry


load_environment()

ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
APP_VERSION = os.getenv("APP_VERSION", "1.0.0")

setup_logging(environment=ENVIRONMENT, log_level=LOG_LEVEL)
logger = logging.getLogger(__name__)

SENTRY_ENABLED = init_sentry(
    environment=ENVIRONMENT,
    release=f"mathbot-backend@{APP_VERSION}",
)

logger.debug(
    "instrumentation_bootstrap_complete",
    extra={
        "extra_fields": {
            "event": "instrumentation_bootstrap",
            "sentry_enabled": SENTRY_ENABLED,
            "environment": ENVIRONMENT,
        }
    },
)
