"""
Request path helpers.
"""
from fastapi import Request


def get_scope_path(request: Request) -> str:
    """Return the raw ASGI path instead of the URL reconstructed from Host."""
    path = request.scope.get("path")
    if isinstance(path, str) and path.startswith("/"):
        return path
    return request.url.path
