"""
Live user presence routes.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any, Dict, Optional
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from slowapi import Limiter

from database import Database
from dependencies import get_db, require_internal_identity
from utils.internal_proxy_auth import (
    PRESENCE_WEBSOCKET_TOKEN_TTL_SECONDS,
    build_presence_ws_token,
    verify_presence_ws_token,
)

logger = logging.getLogger(__name__)
PRESENCE_CLIENT_TIMEOUT_SECONDS = 70


class PresenceConnectionManager:
    MAX_WS_PER_USER = 5
    MAX_TOTAL_WS = 2000
    WS_SEND_TIMEOUT_SECONDS = 2.0

    def __init__(self):
        self.active_connections: Dict[int, Dict[str, WebSocket]] = {}
        self.users: Dict[int, Dict[str, Any]] = {}

    def total_connections(self) -> int:
        return sum(len(conns) for conns in self.active_connections.values())

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

    async def connect(self, user: Dict[str, Any], websocket: WebSocket) -> Optional[tuple[str, bool, Dict[str, Any]]]:
        user_id = int(user["id"])
        user_conns = self.active_connections.get(user_id)
        if (user_conns is not None and len(user_conns) >= self.MAX_WS_PER_USER) or (
            self.total_connections() >= self.MAX_TOTAL_WS
        ):
            await websocket.close(code=1013)
            return None
        await websocket.accept()
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
        await asyncio.wait_for(
            websocket.send_text(
                json.dumps(
                    {
                        "type": "presence_snapshot",
                        "users": self.online_users(),
                    },
                    ensure_ascii=False,
                )
            ),
            timeout=self.WS_SEND_TIMEOUT_SECONDS,
        )

    async def _send_to_all(
        self,
        message: Dict[str, Any],
        exclude_connection_id: Optional[str] = None,
    ) -> list[Dict[str, Any]]:
        data = json.dumps(message, ensure_ascii=False)
        targets: list[tuple[int, str, WebSocket]] = [
            (user_id, connection_id, ws)
            for user_id, connections in list(self.active_connections.items())
            for connection_id, ws in list(connections.items())
            if not (exclude_connection_id and connection_id == exclude_connection_id)
        ]
        if not targets:
            return []

        async def _send_one(user_id: int, connection_id: str, ws: WebSocket) -> Optional[tuple[int, str]]:
            try:
                await asyncio.wait_for(ws.send_text(data), timeout=self.WS_SEND_TIMEOUT_SECONDS)
                return None
            except Exception:
                return (user_id, connection_id)

        results = await asyncio.gather(*(_send_one(uid, cid, ws) for uid, cid, ws in targets), return_exceptions=True)
        offline_users: list[Dict[str, Any]] = []
        for item in results:
            if isinstance(item, tuple):
                offline_user = self.disconnect(item[0], item[1])
                if offline_user is not None:
                    offline_users.append(offline_user)
        return offline_users

    async def broadcast(self, message: Dict[str, Any], exclude_connection_id: Optional[str] = None) -> None:
        pending_offline = await self._send_to_all(message, exclude_connection_id=exclude_connection_id)
        # Notify surviving sockets whenever dead connections pruned during send take a user offline (H-25).
        while pending_offline:
            batch = pending_offline
            pending_offline = []
            for offline_user in batch:
                newly_offline = await self._send_to_all(
                    {
                        "type": "presence_update",
                        "status": "offline",
                        "user": offline_user,
                    }
                )
                pending_offline.extend(newly_offline)


def setup_presence_routes(app: FastAPI, db: Database, limiter: Limiter):
    manager = PresenceConnectionManager()

    @app.post("/api/presence/heartbeat")
    @limiter.limit("30/minute")
    async def heartbeat(
        request: Request,
        path: Optional[str] = Query(None, max_length=200),
        user: dict = Depends(require_internal_identity),
        database: Database = Depends(get_db),
    ):
        return {
            "type": "presence_snapshot",
            "users": await database.users.heartbeat_presence(user["id"], path=path),
        }

    @app.get("/api/presence/ws-token")
    @limiter.limit("20/minute")
    async def get_presence_ws_token(
        request: Request,
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

        user = await db.users.get_user_by_email(email)
        if not user:
            await websocket.close(code=1008)
            return

        connected = await manager.connect(user, websocket)
        if connected is None:
            return
        connection_id, was_offline, public_user = connected
        user_id = int(user["id"])
        initial_path = (websocket.query_params.get("path") or "").strip()[:200] or None
        last_recorded_path: Optional[str] = None
        last_recorded_at = 0.0

        async def _record_ws_activity(raw_path: Optional[str], *, force_on_change: bool = True) -> None:
            nonlocal last_recorded_path, last_recorded_at
            clean = raw_path.strip()[:200] if isinstance(raw_path, str) and raw_path.strip() else None
            now_mono = time.monotonic()
            path_changed = clean is not None and clean != last_recorded_path
            min_gap = 1.0 if (force_on_change and path_changed) else 15.0
            if last_recorded_at > 0.0 and (now_mono - last_recorded_at) < min_gap:
                return
            try:
                recorder = getattr(db.users, "record_presence_activity", None)
                if callable(recorder):
                    await recorder(user_id, path=clean)
                else:
                    await db.users.heartbeat_presence(user_id, path=clean)
                if clean is not None:
                    last_recorded_path = clean
                last_recorded_at = now_mono
            except Exception as telemetry_exc:
                logger.debug("Presence WS telemetry write failed: %s", telemetry_exc)

        try:
            await manager.send_snapshot(websocket)
            await _record_ws_activity(initial_path)
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
                data = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=PRESENCE_CLIENT_TIMEOUT_SECONDS,
                )
                if len(data) > 1024:
                    await websocket.close(code=1009)
                    break
                try:
                    payload = json.loads(data)
                except Exception:
                    continue

                if not isinstance(payload, dict):
                    continue
                msg_type = payload.get("type")
                msg_path = payload.get("path") if isinstance(payload.get("path"), str) else None
                if msg_type == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
                    await _record_ws_activity(msg_path)
                elif msg_type == "visit":
                    await _record_ws_activity(msg_path, force_on_change=True)
                elif msg_type == "snapshot":
                    await manager.send_snapshot(websocket)
        except asyncio.TimeoutError:
            try:
                await websocket.close(code=1001)
            except Exception:
                pass
        except WebSocketDisconnect:
            pass
        except Exception as e:
            logger.error("Presence websocket error: %s", e, exc_info=True)
        finally:
            # Always detach even on asyncio.CancelledError so connections never leak (H-25).
            offline_user = manager.disconnect(user_id, connection_id)
            if offline_user:
                try:
                    await manager.broadcast(
                        {
                            "type": "presence_update",
                            "status": "offline",
                            "user": offline_user,
                        }
                    )
                except BaseException:
                    pass
