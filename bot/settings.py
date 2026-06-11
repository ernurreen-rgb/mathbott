"""
Central application settings backed by pydantic-settings.

All environment access for business code goes through `get_settings()`.
`.env` files are loaded into os.environ by `config.load_environment()`
(called from instrument.py at process start), so Settings only reads
the process environment.

Settings are intentionally re-read on every `get_settings()` call:
construction is cheap and tests rely on monkeypatching env vars at runtime.
"""
from __future__ import annotations

from typing import Optional

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_TRUTHY = {"1", "true", "yes", "y", "on"}

DEFAULT_ADMIN_SECRET = "change-me-in-production"
DEFAULT_MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore", case_sensitive=False)

    # Runtime
    environment: str = "development"
    log_level: str = "INFO"
    app_version: str = "1.0.0"
    port: int = 8000
    db_path: str = "mathbot.db"

    # CORS / CSRF
    allowed_origins: str = ""
    cors_allow_all: bool = False
    csrf_enabled: bool = False

    # Auth / admin
    internal_proxy_shared_secret: str = ""
    admin_secret: str = DEFAULT_ADMIN_SECRET
    admin_email: Optional[str] = None
    allow_legacy_admin_bootstrap: bool = False
    import_preview_token_secret: Optional[str] = None

    # Content
    bank_trash_retention_days: int = 30
    image_upload_max_bytes: Optional[int] = None

    # Observability
    sentry_dsn: str = ""
    sentry_environment: Optional[str] = None
    sentry_release: Optional[str] = None
    sentry_traces_sample_rate: float = 0.1

    # Alerts / notifications
    alerts_enabled: bool = False
    alert_telegram_enabled: bool = False
    alert_telegram_bot_token: str = ""
    alert_telegram_chat_id: str = ""
    email_notifications_enabled: bool = False
    push_notifications_enabled: bool = False

    # Ops monitor retention
    ops_health_sample_retention_days: int = 30
    ops_incident_retention_days: int = 365

    @field_validator("environment", mode="before")
    @classmethod
    def _normalize_environment(cls, value: object) -> str:
        normalized = str(value or "").strip().lower()
        return normalized or "development"

    @field_validator(
        "cors_allow_all",
        "csrf_enabled",
        "allow_legacy_admin_bootstrap",
        "alerts_enabled",
        "alert_telegram_enabled",
        "email_notifications_enabled",
        "push_notifications_enabled",
        mode="before",
    )
    @classmethod
    def _lenient_bool(cls, value: object) -> bool:
        # Preserve legacy behaviour: unknown strings mean False, never a crash.
        if isinstance(value, bool):
            return value
        return str(value or "").strip().lower() in _TRUTHY

    @field_validator(
        "port",
        "bank_trash_retention_days",
        "ops_health_sample_retention_days",
        "ops_incident_retention_days",
        mode="before",
    )
    @classmethod
    def _lenient_int(cls, value: object, info) -> int:
        defaults = {
            "port": 8000,
            "bank_trash_retention_days": 30,
            "ops_health_sample_retention_days": 30,
            "ops_incident_retention_days": 365,
        }
        try:
            return int(str(value).strip())
        except (TypeError, ValueError):
            return defaults[info.field_name]

    @field_validator("image_upload_max_bytes", mode="before")
    @classmethod
    def _lenient_optional_int(cls, value: object) -> Optional[int]:
        if value is None or str(value).strip() == "":
            return None
        try:
            return int(str(value).strip())
        except (TypeError, ValueError):
            return None

    @field_validator("sentry_traces_sample_rate", mode="before")
    @classmethod
    def _lenient_float(cls, value: object) -> float:
        try:
            return float(str(value).strip())
        except (TypeError, ValueError):
            return 0.1

    @field_validator(
        "internal_proxy_shared_secret",
        "sentry_dsn",
        "alert_telegram_bot_token",
        "alert_telegram_chat_id",
        mode="before",
    )
    @classmethod
    def _strip_str(cls, value: object) -> str:
        return str(value or "").strip()

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def image_upload_limit_bytes(self) -> int:
        if self.image_upload_max_bytes is None:
            return DEFAULT_MAX_IMAGE_UPLOAD_BYTES
        return max(1, self.image_upload_max_bytes)

    def cors_origins(self) -> list[str]:
        origins = [o.strip() for o in self.allowed_origins.split(",") if o.strip()]
        if self.environment == "development" and self.cors_allow_all:
            return ["*"]
        if not origins:
            return ["http://localhost:3000", "http://127.0.0.1:3000"]
        return origins


def get_settings() -> Settings:
    """Build settings from the current process environment."""
    return Settings()
