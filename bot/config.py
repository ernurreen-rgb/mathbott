"""
Configuration and setup utilities
"""
import os
import logging
from pathlib import Path
from dotenv import load_dotenv

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
    """Get CORS allowed origins from environment"""
    allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
    allowed_origins = [origin.strip() for origin in allowed_origins if origin.strip()]

    # In development, allow all origins if explicitly set
    if os.getenv("ENVIRONMENT", "development").lower() == "development" and os.getenv("CORS_ALLOW_ALL", "false").lower() == "true":
        allowed_origins = ["*"]
    elif not allowed_origins:
        # Fallback to localhost in development
        allowed_origins = ["http://localhost:3000", "http://127.0.0.1:3000"]

    logger.info(f"CORS allowed origins: {allowed_origins}")
    return allowed_origins


def validate_configuration():
    """Validate configuration on startup"""
    environment = os.getenv("ENVIRONMENT", "development").lower()
    errors = []
    warnings = []
    
    # Trusted proxy secret for signed backend requests
    proxy_secret = os.getenv("INTERNAL_PROXY_SHARED_SECRET", "").strip()
    if environment == "production":
        if not proxy_secret or len(proxy_secret) < 32:
            errors.append("INTERNAL_PROXY_SHARED_SECRET must be set in production (minimum 32 characters)")
        else:
            logger.info("INTERNAL_PROXY_SHARED_SECRET is configured (production mode)")
    else:
        admin_secret = os.getenv("ADMIN_SECRET", "change-me-in-production")
        if admin_secret == "change-me-in-production":
            warnings.append("ADMIN_SECRET is using default value. Change it in development if you still use legacy admin bootstrap.")
    
    # Check CORS configuration
    allowed_origins = os.getenv("ALLOWED_ORIGINS", "")
    if environment == "production":
        if not allowed_origins or allowed_origins.strip() == "":
            errors.append("ALLOWED_ORIGINS must be set in production")
        elif "*" in allowed_origins:
            warnings.append("ALLOWED_ORIGINS contains '*'. This is insecure in production!")
    
    # Check PORT
    port = os.getenv("PORT", "8000")
    try:
        port_int = int(port)
        if port_int < 1 or port_int > 65535:
            errors.append(f"PORT must be between 1 and 65535, got {port_int}")
    except ValueError:
        errors.append(f"PORT must be a valid integer, got '{port}'")

    # Observability/alerts checks (warnings only to keep backward compatibility)
    sentry_dsn = os.getenv("SENTRY_DSN", "").strip()
    if environment == "production" and not sentry_dsn:
        warnings.append("SENTRY_DSN is not set. Production errors will not be reported to Sentry.")

    alerts_enabled = os.getenv("ALERTS_ENABLED", "false").lower() in {"1", "true", "yes", "y", "on"}
    telegram_enabled = os.getenv("ALERT_TELEGRAM_ENABLED", "false").lower() in {"1", "true", "yes", "y", "on"}
    if alerts_enabled and telegram_enabled:
        tg_token = os.getenv("ALERT_TELEGRAM_BOT_TOKEN", "").strip()
        tg_chat_id = os.getenv("ALERT_TELEGRAM_CHAT_ID", "").strip()
        if not tg_token or not tg_chat_id:
            warnings.append("Telegram alerts enabled but ALERT_TELEGRAM_BOT_TOKEN or ALERT_TELEGRAM_CHAT_ID is missing.")

    if environment == "production" and os.getenv("ALLOW_LEGACY_ADMIN_BOOTSTRAP", "false").lower() == "true":
        warnings.append("ALLOW_LEGACY_ADMIN_BOOTSTRAP is enabled in production. This weakens admin security.")
    
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

