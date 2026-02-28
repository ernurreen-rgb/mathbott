"""
Structured logging configuration.
"""
import json
import logging
import re
import sys
from datetime import datetime
from typing import Any, Dict

from utils.request_context import get_request_id


EMAIL_PATTERN = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b")
AUTH_BEARER_PATTERN = re.compile(r"(?i)bearer\s+[a-z0-9._\-~+/]+=*")
AUTH_HEADER_PATTERN = re.compile(r"(?i)(authorization\s*[:=]\s*)([^,\s]+)")
COOKIE_HEADER_PATTERN = re.compile(r"(?i)(cookie\s*[:=]\s*)([^,\n\r]+)")
SET_COOKIE_HEADER_PATTERN = re.compile(r"(?i)(set-cookie\s*[:=]\s*)([^,\n\r]+)")


def mask_email(email: str) -> str:
    """Mask email address for logging (e.g., user@example.com -> u***@e***.com)."""
    if not email or "@" not in email:
        return email

    try:
        local, domain = email.split("@", 1)
        if len(local) > 1:
            masked_local = local[0] + "*" * (len(local) - 1)
        else:
            masked_local = "*"

        if "." in domain:
            domain_parts = domain.split(".")
            if len(domain_parts) > 1:
                masked_domain = domain_parts[0][0] + "*" * (len(domain_parts[0]) - 1) + "." + ".".join(domain_parts[1:])
            else:
                masked_domain = domain[0] + "*" * (len(domain) - 1)
        else:
            masked_domain = domain[0] + "*" * (len(domain) - 1) if len(domain) > 1 else "*"

        return f"{masked_local}@{masked_domain}"
    except Exception:
        return "***@***.***"


def _mask_sensitive_tokens(message: str) -> str:
    if not message:
        return message

    value = AUTH_BEARER_PATTERN.sub("Bearer [REDACTED]", message)
    value = AUTH_HEADER_PATTERN.sub(r"\1[REDACTED]", value)
    value = COOKIE_HEADER_PATTERN.sub(r"\1[REDACTED]", value)
    value = SET_COOKIE_HEADER_PATTERN.sub(r"\1[REDACTED]", value)
    return value


def sanitize_log_message(message: str) -> str:
    """Sanitize log message by masking emails and credentials."""
    if not message:
        return message

    def replace_email(match: re.Match) -> str:
        return mask_email(match.group(0))

    sanitized = EMAIL_PATTERN.sub(replace_email, message)
    return _mask_sensitive_tokens(sanitized)


class RequestContextFilter(logging.Filter):
    """Inject request_id into each log record from contextvars."""

    def filter(self, record: logging.LogRecord) -> bool:
        request_id = get_request_id()
        if request_id:
            setattr(record, "request_id", request_id)
        else:
            setattr(record, "request_id", None)
        return True


class StructuredFormatter(logging.Formatter):
    """JSON formatter for structured logging with sanitization."""

    def format(self, record: logging.LogRecord) -> str:
        sanitized_message = sanitize_log_message(record.getMessage())

        log_data: Dict[str, Any] = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "message": sanitized_message,
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
            "request_id": getattr(record, "request_id", None),
        }

        if record.exc_info:
            exc_text = self.formatException(record.exc_info)
            log_data["exception"] = sanitize_log_message(exc_text)

        if hasattr(record, "extra_fields"):
            sanitized_extra: Dict[str, Any] = {}
            for key, value in record.extra_fields.items():
                if isinstance(value, str):
                    sanitized_extra[key] = sanitize_log_message(value)
                else:
                    sanitized_extra[key] = value
            log_data.update(sanitized_extra)

        return json.dumps(log_data, ensure_ascii=False)


class SafeFormatter(logging.Formatter):
    """Standard formatter with sanitization for development."""

    def format(self, record: logging.LogRecord) -> str:
        original = super().format(record)
        return sanitize_log_message(original)


def setup_logging(environment: str = "development", log_level: str = "INFO"):
    """Setup structured logging."""
    level = getattr(logging, log_level.upper(), logging.INFO)

    if environment == "production":
        formatter: logging.Formatter = StructuredFormatter()
    else:
        formatter = SafeFormatter("%(asctime)s - %(name)s - %(levelname)s - [%(request_id)s] %(message)s")

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    console_handler.setLevel(level)
    console_handler.addFilter(RequestContextFilter())

    root_logger = logging.getLogger()
    root_logger.setLevel(level)
    root_logger.handlers = [console_handler]

    return root_logger

