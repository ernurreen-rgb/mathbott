"""
Give a signed-in student an account on their first API request.

Students sign in with Google in the web app, and the backend used to create their row only
when the profile page loaded (GET /api/user/web/{email}). Anyone who went straight to a
lesson after signing up got "User not found" on every answer until they opened the profile.
The trusted proxy signs every request of a signed-in user, so the first such request now
creates the account, whichever route it reaches.
"""
from __future__ import annotations

import logging

from starlette.requests import Request
from starlette.types import ASGIApp, Receive, Scope, Send

from settings import get_settings

logger = logging.getLogger(__name__)

# Emails seen with an account in this process; the cap keeps a long-lived worker bounded.
_MAX_KNOWN_EMAILS = 10000


class EnsureSignedInUserMiddleware:
    """Runs inside TrustedProxyIdentityMiddleware, which leaves the verified email on the request."""

    def __init__(self, app: ASGIApp):
        self.app = app
        self._known: set[str] = set()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            email = getattr(Request(scope).state, "trusted_proxy_email", None)
            if email and email not in self._known:
                await self._ensure_account(scope, email)
        await self.app(scope, receive, send)

    async def _ensure_account(self, scope: Scope, email: str) -> None:
        app = scope.get("app")
        db = getattr(getattr(app, "state", None), "db", None)
        if db is None:
            return
        try:
            if not await db.users.get_user_by_email(email):
                # Get-or-create under the write lock, so two first requests at once make one row.
                await db.users.create_user_by_email(email, check_admin_email=get_settings().admin_email)
                logger.info("Created the account of a signed-in user on their first request")
        except Exception:
            # The route still answers; at worst it reports the missing user as it used to.
            logger.exception("Could not make sure the signed-in user has an account")
            return
        if len(self._known) >= _MAX_KNOWN_EMAILS:
            self._known.clear()
        self._known.add(email)
