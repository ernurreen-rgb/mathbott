"""
Live user presence routes.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, Optional
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from slowapi import Limiter

from database import Database
from dependencies import get_db, require_internal_identity
from utils.internal_proxy_auth import (
    PRESENCE_WEBSOCKET_TOKEN_TTL_SECONDS,
    build_presence_ws_token,
    verify_presence_ws_token,
)

logger = logging.getLogger(__name__)


class PresenceConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, Dict[str, WebSocket]] = {}
        self.users: Dict[int, Dict[str, Any]] = {}

    def _public_user(self, user: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": int(user["id"]),
            "nickname": user.get("nickname"),
        }

    def online_users(self) -> list[Dict[str, Any]]:
        return [
            self.users[user_id]
            for user_id in sorted(self.users.keys())
            if self.active_connections.get(user_id)
        ]

    async def connect(self, user: Dict[str, Any], websocket: WebSocket) -> tuple[str, bool, Dict[str, Any]]:
        await websocket.accept()
        user_id = int(user["id"])
        was_offline = user_id not in self.active_connections
        connection_id = str(uuid4())
        self.active_connections.setdefault(user_id, {})[connection_id] = websocket
        public_user = self._public_user(user)
        self.users[user_id] = public_user
        return connection_id, was_offline, public_user

    def disconnect(self, user_id: int, connection_id: str) -> Optional[Dict[str, Any]]:
        connections = self.active_connections.get(user_id)
        if not connections:
            return None

        connections.pop(connection_id, None)
        if connections:
            return None

        self.active_connections.pop(user_id, None)
        return self.users.pop(user_id, None)

    async def send_snapshot(self, websocket: WebSocket) -> None:
        await websocket.send_text(
            json.dumps(
                {
                    "type": "presence_snapshot",
                    "users": self.online_users(),
                },
                ensure_ascii=False,
            )
        )

    async def broadcast(self, message: Dict[str, Any], exclude_connection_id: Optional[str] = None) -> None:
        data = json.dumps(message, ensure_ascii=False)
        stale_connections: list[tuple[int, str]] = []

        for user_id, connections in list(self.active_connections.items()):
            for connection_id, ws in list(connections.items()):
                if exclude_connection_id and connection_id == exclude_connection_id:
                    continue
                try:
                    await ws.send_text(data)
                except Exception:
                    stale_connections.append((user_id, connection_id))

        for user_id, connection_id in stale_connections:
            self.disconnect(user_id, connection_id)


def setup_presence_routes(app: FastAPI, db: Database, limiter: Limiter):
    manager = PresenceConnectionManager()

    @app.get("/api/presence/ws-token")
    async def get_presence_ws_token(
        user: dict = Depends(require_internal_identity),
    ):
        try:
            token = build_presence_ws_token(user_email=user["email"])
        except ValueError:
            raise HTTPException(status_code=503, detail="WebSocket token signing is not configured")

        return {
            "token": token,
            "expires_in": PRESENCE_WEBSOCKET_TOKEN_TTL_SECONDS,
        }

    @app.websocket("/ws/presence")
    async def presence_ws(websocket: WebSocket):
        email = (websocket.query_params.get("email") or "").strip().lower()
        token = websocket.query_params.get("token") or ""
        if not email:
            await websocket.close(code=1008)
            return

        is_valid_token, error_code = verify_presence_ws_token(
            user_email=email,
            token=token,
        )
        if not is_valid_token:
            logger.warning("Rejected presence websocket token: error=%s", error_code)
            await websocket.close(code=1008)
            return

        user = await db.get_user_by_email(email)
        if not user:
            await websocket.close(code=1008)
            return

        connection_id, was_offline, public_user = await manager.connect(user, websocket)
        user_id = int(user["id"])
        try:
            await manager.send_snapshot(websocket)
            if was_offline:
                await manager.broadcast(
                    {
                        "type": "presence_update",
                        "status": "online",
                        "user": public_user,
                    },
                    exclude_connection_id=connection_id,
                )

            while True:
                data = await websocket.receive_text()
                try:
                    payload = json.loads(data)
                except Exception:
                    continue

                if payload.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
                elif payload.get("type") == "snapshot":
                    await manager.send_snapshot(websocket)
        except WebSocketDisconnect:
            offline_user = manager.disconnect(user_id, connection_id)
            if offline_user:
                await manager.broadcast(
                    {
                        "type": "presence_update",
                        "status": "offline",
                        "user": offline_user,
                    }
                )
        except Exception as e:
            offline_user = manager.disconnect(user_id, connection_id)
            if offline_user:
                await manager.broadcast(
                    {
                        "type": "presence_update",
                        "status": "offline",
                        "user": offline_user,
                    }
                )
            logger.error("Presence websocket error: %s", e, exc_info=True)
