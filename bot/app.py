"""
Фабрика для создания FastAPI приложения
"""
import os
import logging
import time
from typing import Optional, Any

from fastapi import FastAPI, HTTPException
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
from middleware.connection_cleanup_middleware import ConnectionCleanupMiddleware
from middleware.cache_headers_middleware import CacheHeadersMiddleware
from middleware.request_context_middleware import RequestContextMiddleware
from config import get_cors_origins
from instrument import APP_VERSION, ENVIRONMENT, SENTRY_ENABLED

# Загрузить переменные окружения
environment = ENVIRONMENT

# Настроить логирование
logger = logging.getLogger(__name__)


def create_app(lifespan: Optional[Any] = None) -> FastAPI:
    """
    Создать и настроить FastAPI приложение.

    Args:
        lifespan: Optional async context manager for startup/shutdown (replaces on_event).

    Returns:
        FastAPI: Настроенное приложение
    """
    # Создать приложение
    app = FastAPI(title="Mathbot API", version=APP_VERSION, lifespan=lifespan)
    
    # Инициализировать базу данных и лимитер
    db_path = os.getenv("DB_PATH", "mathbot.db")
    db = Database(db_path=db_path)
    limiter = Limiter(key_func=get_remote_address)
    
    # Сохранить в app.state для доступа через dependencies
    app.state.db = db
    app.state.limiter = limiter
    app.state.environment = environment
    app.state.version = APP_VERSION
    app.state.sentry_enabled = SENTRY_ENABLED
    app.state.started_at_epoch = time.time()
    
    # Настроить rate limiting
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    
    # Настроить обработчики ошибок
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, general_exception_handler)
    
    # Добавить middleware
    app.add_middleware(ConnectionCleanupMiddleware)  # Must be first to cleanup connections
    # Use FastAPI's built-in GZipMiddleware instead of custom CompressionMiddleware
    # It properly handles Content-Length for UTF-8 characters and is well-tested
    app.add_middleware(GZipMiddleware, minimum_size=1000, compresslevel=6)  # Compress responses >= 1KB
    app.add_middleware(CacheHeadersMiddleware)  # Add cache headers
    app.add_middleware(MetricsMiddleware)
    
    # Настроить CORS
    allowed_origins = get_cors_origins()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["*"],
    )
    
    # CSRF middleware (опционально, можно отключить в development)
    if os.getenv("CSRF_ENABLED", "false").lower() == "true" or environment == "production":
        app.add_middleware(CSRFMiddleware)

    # Must be outermost middleware for request_id propagation through the full stack.
    app.add_middleware(RequestContextMiddleware)
    
    logger.info("FastAPI application created")
    return app
