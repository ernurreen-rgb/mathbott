"""
Process bootstrap for environment, logging, and Sentry.

Import this module as early as possible in the application entry point.
"""
from __future__ import annotations

import logging

from config import load_environment
from settings import get_settings
from utils.logging_config import setup_logging
from utils.sentry import init_sentry


load_environment()

_settings = get_settings()
ENVIRONMENT = _settings.environment
LOG_LEVEL = _settings.log_level
APP_VERSION = _settings.app_version

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
