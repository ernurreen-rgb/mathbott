"""
Request-scoped context helpers (request_id propagation via contextvars).
"""
from __future__ import annotations

import contextvars
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import Request


_request_id_var: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "request_id",
    default=None,
)
_request_var: contextvars.ContextVar[Optional["Request"]] = contextvars.ContextVar(
    "request",
    default=None,
)


def set_request_id(request_id: str) -> contextvars.Token:
    return _request_id_var.set(request_id)


def reset_request_id(token: contextvars.Token) -> None:
    _request_id_var.reset(token)


def get_request_id() -> Optional[str]:
    return _request_id_var.get()


def set_current_request(request: "Request") -> contextvars.Token:
    return _request_var.set(request)


def reset_current_request(token: contextvars.Token) -> None:
    _request_var.reset(token)


def get_current_request() -> Optional["Request"]:
    return _request_var.get()
