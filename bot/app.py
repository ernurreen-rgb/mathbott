"""
Фабрика для создания FastAPI приложения
"""
import logging
import time
from typing import Optional, Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.exceptions import RequestValidationError
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from database import Database
from middleware.error_handler import (
    http_exception_handler,
    validation_exception_handler,
    general_exception_handler,
)
from middleware.metrics_middleware import MetricsMiddleware
from middleware.csrf import CSRFMiddleware
from middleware.cache_headers_middleware import CacheHeadersMiddleware
from middleware.request_context_middleware import RequestContextMiddleware
from middleware.trusted_proxy_identity import TrustedProxyIdentityMiddleware
from middleware.ensure_signed_in_user import EnsureSignedInUserMiddleware
from config import get_cors_origins
from instrument import APP_VERSION, ENVIRONMENT, SENTRY_ENABLED
from settings import get_settings
from utils.internal_proxy_auth import (
    get_verified_proxy_client_key,
    has_proxy_signature_headers,
    verify_proxy_signature,
)

# Загрузить переменные окружения
environment = ENVIRONMENT

# Настроить логирование
logger = logging.getLogger(__name__)


def get_rate_limit_key(request: Request) -> str:
    """Rate limit signed proxy requests per user or signed client network, fallback to client IP."""
    if has_proxy_signature_headers(request):
        try:
            is_valid_proxy, proxy_email, _ = verify_proxy_signature(request)
            if is_valid_proxy:
                if proxy_email:
                    return f"user:{proxy_email}"
                client_key = get_verified_proxy_client_key(request)
                if client_key:
                    return f"proxy-client:{client_key}"
        except Exception:
            logger.debug("Failed to resolve proxy rate-limit key", exc_info=True)
    return get_remote_address(request)


def create_app(lifespan: Optional[Any] = None) -> FastAPI:
    """
    Создать и настроить FastAPI приложение.

    Args:
        lifespan: Optional async context manager for startup/shutdown (replaces on_event).

    Returns:
        FastAPI: Настроенное приложение
    """
    # Создать приложение (отключить публичные Swagger/ReDoc/OpenAPI в production)
    settings = get_settings()
    app = FastAPI(
        title="Mathbot API",
        version=APP_VERSION,
        lifespan=lifespan,
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None if settings.is_production else "/redoc",
        openapi_url=None if settings.is_production else "/openapi.json",
    )

    # Инициализировать базу данных и лимитер
    db = Database(settings.database_url, migration_url=settings.database_migration_url,
                  auto_migrate=settings.migrate_on_startup)
    limiter = Limiter(key_func=get_rate_limit_key)

    # Сохранить в app.state для доступа через dependencies
    app.state.db = db
    app.state.limiter = limiter
    app.state.environment = settings.environment
    app.state.version = APP_VERSION
    app.state.sentry_enabled = SENTRY_ENABLED
    app.state.started_at_epoch = time.time()

    # Настроить rate limiting
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # Настроить обработчики ошибок
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, general_exception_handler)

    # Добавить middleware (Starlette применяет add_middleware в порядке LIFO: последний добавленный — самый внешний)
    # Use FastAPI's built-in GZipMiddleware instead of custom CompressionMiddleware
    # It properly handles Content-Length for UTF-8 characters and is well-tested
    app.add_middleware(GZipMiddleware, minimum_size=1000, compresslevel=6)  # Compress responses >= 1KB
    app.add_middleware(CacheHeadersMiddleware)  # Add cache headers

    # CSRF middleware (fail-closed in production; can only be disabled in explicit dev/test environments)
    if settings.csrf_enabled or settings.is_production:
        app.add_middleware(CSRFMiddleware)

    # Added before TrustedProxyIdentityMiddleware so it runs just inside the identity check, with verified email.
    app.add_middleware(EnsureSignedInUserMiddleware)
    app.add_middleware(TrustedProxyIdentityMiddleware)

    # Metrics sits outside auth/CSRF so rejected 401/403 traffic is also observed.
    app.add_middleware(MetricsMiddleware)

    # CORS sits outside auth/CSRF so preflight OPTIONS and 401/403 responses carry proper CORS headers.
    allowed_origins = get_cors_origins()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["*"],
    )

    # Must be outermost middleware for request_id propagation through the full stack.
    app.add_middleware(RequestContextMiddleware)
    
    logger.info("FastAPI application created")
    return app
