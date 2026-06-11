"""
Configuration and setup utilities
"""
import logging
from pathlib import Path
from dotenv import load_dotenv

from settings import DEFAULT_ADMIN_SECRET, get_settings

logger = logging.getLogger(__name__)


def load_environment():
    """Load environment variables from .env.local or .env file"""
    env_path = Path(__file__).parent / ".env.local"
    if not env_path.exists():
        env_path = Path(__file__).parent / ".env"
    if env_path.exists():
        load_dotenv(env_path)
        logging.info(f"Loaded environment variables from {env_path}")


def get_cors_origins():
    """Get CORS allowed origins from settings"""
    allowed_origins = get_settings().cors_origins()
    logger.info(f"CORS allowed origins: {allowed_origins}")
    return allowed_origins


def validate_configuration():
    """Validate configuration on startup"""
    settings = get_settings()
    errors = []
    warnings = []

    # Trusted proxy secret for signed backend requests
    if settings.is_production:
        if not settings.internal_proxy_shared_secret or len(settings.internal_proxy_shared_secret) < 32:
            errors.append("INTERNAL_PROXY_SHARED_SECRET must be set in production (minimum 32 characters)")
        else:
            logger.info("INTERNAL_PROXY_SHARED_SECRET is configured (production mode)")
    else:
        if settings.admin_secret == DEFAULT_ADMIN_SECRET:
            warnings.append("ADMIN_SECRET is using default value. Change it in development if you still use legacy admin bootstrap.")

    # Check CORS configuration
    if settings.is_production:
        if not settings.allowed_origins.strip():
            errors.append("ALLOWED_ORIGINS must be set in production")
        elif "*" in settings.allowed_origins:
            warnings.append("ALLOWED_ORIGINS contains '*'. This is insecure in production!")

    # Check PORT
    if settings.port < 1 or settings.port > 65535:
        errors.append(f"PORT must be between 1 and 65535, got {settings.port}")

    # Observability/alerts checks (warnings only to keep backward compatibility)
    if settings.is_production and not settings.sentry_dsn:
        warnings.append("SENTRY_DSN is not set. Production errors will not be reported to Sentry.")

    if settings.alerts_enabled and settings.alert_telegram_enabled:
        if not settings.alert_telegram_bot_token or not settings.alert_telegram_chat_id:
            warnings.append("Telegram alerts enabled but ALERT_TELEGRAM_BOT_TOKEN or ALERT_TELEGRAM_CHAT_ID is missing.")

    if settings.is_production and settings.allow_legacy_admin_bootstrap:
        warnings.append("ALLOW_LEGACY_ADMIN_BOOTSTRAP is ignored in production. Legacy admin bootstrap routes stay disabled.")

    # Log errors and warnings
    if errors:
        logger.error("=" * 80)
        logger.error("CONFIGURATION ERRORS:")
        for error in errors:
            logger.error(f"  - {error}")
        logger.error("=" * 80)
        raise ValueError("Configuration validation failed. Please fix the errors above.")

    if warnings:
        logger.warning("=" * 80)
        logger.warning("CONFIGURATION WARNINGS:")
        for warning in warnings:
            logger.warning(f"  - {warning}")
        logger.warning("=" * 80)
