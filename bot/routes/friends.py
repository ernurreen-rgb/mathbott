"""
Routes for friends and invitations
"""
import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request
from slowapi import Limiter

from models.requests import FriendInviteCreateRequest, FriendInviteAcceptRequest, FriendBlockRequest, FriendRequestCreateRequest

logger = logging.getLogger(__name__)


def _parse_timestamp(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(value)
    except Exception:
        try:
            return datetime.strptime(value.split(".")[0], "%Y-%m-%d %H:%M:%S")
        except Exception:
            return None


def setup_friends_routes(app, db, limiter: Limiter):
    """Setup friend routes"""

    @app.post("/api/friends/invites")
    @limiter.limit("3/minute")
    async def create_friend_invite(request: Request, invite_request: FriendInviteCreateRequest):
        user = await db.get_user_by_email(invite_request.email)
        if not user:
            user = await db.create_user_by_email(invite_request.email)

        active_invites = await db.list_friend_invites(user["id"], status="active")
        # Filter out expired invites
        now = datetime.utcnow()
        valid_active_invites = []
        for invite in active_invites:
            expires_at = invite.get("expires_at")
            if expires_at:
                expires_at_dt = _parse_timestamp(expires_at)
                if expires_at_dt and expires_at_dt > now:
                    valid_active_invites.append(invite)
                elif expires_at_dt and expires_at_dt <= now:
                    # Mark as expired
                    await db.expire_friend_invite(invite["token"])
            else:
                # No expiration date - consider as active
                valid_active_invites.append(invite)
        
        if len(valid_active_invites) >= 10:
            raise HTTPException(status_code=400, detail="У вас уже создано 10 приглашений. Вы не сможете создать новое приглашение до завтра.")

        expires_at = (datetime.utcnow() + timedelta(days=invite_request.expires_in_days)).strftime("%Y-%m-%d %H:%M:%S")
        invite = await db.create_friend_invite(user["id"], expires_at)
        return {
            "token": invite["token"],
            "expires_at": invite["expires_at"]
        }

    @app.get("/api/friends/invites")
    async def list_friend_invites(
        email: str = Query(...),
        status: Optional[str] = Query(None)
    ):
        user = await db.get_user_by_email(email)
        if not user:
            user = await db.create_user_by_email(email)

        invites = await db.list_friend_invites(user["id"], status=status)
        return {
            "items": invites
        }

    @app.get("/api/friends/invites/{token}")
    async def get_invite_details(
        token: str,
        email: Optional[str] = Query(None)
    ):
        invite = await db.get_friend_invite(token)
        if not invite:
            raise HTTPException(status_code=404, detail="Invite not found")

        status = invite.get("status", "active")
        expires_at = invite.get("expires_at")
        expires_at_dt = _parse_timestamp(expires_at)
        if status == "active" and expires_at_dt and datetime.utcnow() > expires_at_dt:
            await db.expire_friend_invite(token)
            status = "expired"

        inviter = await db.get_user_by_id(invite["inviter_id"])
        if not inviter:
            raise HTTPException(status_code=404, detail="Inviter not found")

        can_accept = False
        is_friend = False
        if email and status == "active":
            user = await db.get_user_by_email(email)
            if not user:
                user = await db.create_user_by_email(email)
            if user["id"] != inviter["id"]:
                blocked = await db.is_blocked_between(user["id"], inviter["id"])
                is_friend = await db.are_friends(user["id"], inviter["id"])
                can_accept = (not blocked) and (not is_friend)

        return {
            "token": token,
            "status": status,
            "expires_at": expires_at,
            "inviter": {
                "id": inviter["id"],
                "nickname": inviter.get("nickname"),
                "league": inviter.get("league")
            },
            "can_accept": can_accept,
            "is_friend": is_friend
        }

    @app.post("/api/friends/invites/{token}/accept")
    async def accept_invite(token: str, accept_request: FriendInviteAcceptRequest):
        invite = await db.get_friend_invite(token)
        if not invite:
            raise HTTPException(status_code=404, detail="Invite not found")

        status = invite.get("status", "active")
        if status != "active":
            if status == "expired":
                inviter_name = "Пайдаланушы"
                inviter = await db.get_user_by_id(invite["inviter_id"])
                if inviter and inviter.get("nickname"):
                    inviter_name = inviter.get("nickname")
                raise HTTPException(status_code=400, detail=f"Ссылка истекла. Попросите пользователя {inviter_name} отправить вам новую ссылку.")
            raise HTTPException(status_code=400, detail="Приглашение не активно")

        expires_at_dt = _parse_timestamp(invite.get("expires_at"))
        if expires_at_dt and datetime.utcnow() > expires_at_dt:
            await db.expire_friend_invite(token)
            inviter_name = "Пайдаланушы"
            inviter = await db.get_user_by_id(invite["inviter_id"])
            if inviter and inviter.get("nickname"):
                inviter_name = inviter.get("nickname")
            raise HTTPException(status_code=400, detail=f"Ссылка истекла. Попросите пользователя {inviter_name} отправить вам новую ссылку.")

        inviter = await db.get_user_by_id(invite["inviter_id"])
        if not inviter:
            raise HTTPException(status_code=404, detail="Inviter not found")

        user = await db.get_user_by_email(accept_request.email)
        if not user:
            user = await db.create_user_by_email(accept_request.email)

        if user["id"] == inviter["id"]:
            raise HTTPException(status_code=400, detail="Вы не можете принять свое собственное приглашение")

        if await db.is_blocked_between(user["id"], inviter["id"]):
            raise HTTPException(status_code=403, detail="Friendship not allowed")

        if await db.are_friends(user["id"], inviter["id"]):
            await db.mark_friend_invite_accepted(token, user["id"])
            return {"success": True, "already_friends": True}

        await db.create_friendship(user["id"], inviter["id"])
        await db.mark_friend_invite_accepted(token, user["id"])
        await db.create_friend_request(inviter["id"], user["id"], status="accepted")

        return {"success": True}

    @app.post("/api/friends/invites/{token}/revoke")
    async def revoke_invite(token: str, email: str = Query(...)):
        inviter = await db.get_user_by_email(email)
        if not inviter:
            inviter = await db.create_user_by_email(email)

        invite = await db.get_friend_invite(token)
        if not invite:
            raise HTTPException(status_code=404, detail="Invite not found")
        if invite["inviter_id"] != inviter["id"]:
            raise HTTPException(status_code=403, detail="Not allowed")
        if invite.get("status") != "active":
            raise HTTPException(status_code=400, detail="Invite is not active")

        await db.revoke_friend_invite(token, inviter["id"])
        return {"success": True}

    @app.get("/api/friends")
    async def list_friends(email: str = Query(...)):
        user = await db.get_user_by_email(email)
        if not user:
            user = await db.create_user_by_email(email)
        friends = await db.list_friends(user["id"])
        return {"items": friends}

    @app.delete("/api/friends/{friend_id}")
    async def remove_friend(friend_id: int, email: str = Query(...)):
        user = await db.get_user_by_email(email)
        if not user:
            user = await db.create_user_by_email(email)
        await db.delete_friendship(user["id"], friend_id)
        return {"success": True}

    @app.get("/api/friends/requests")
    async def list_friend_requests(
        email: str = Query(...),
        direction: str = Query("incoming")
    ):
        user = await db.get_user_by_email(email)
        if not user:
            user = await db.create_user_by_email(email)

        if direction == "outgoing":
            items = await db.list_outgoing_friend_requests(user["id"])
        else:
            items = await db.list_incoming_friend_requests(user["id"])
        return {"items": items}

    @app.post("/api/friends/requests")
    async def create_friend_request(request: FriendRequestCreateRequest):
        sender = await db.get_user_by_email(request.email)
        if not sender:
            sender = await db.create_user_by_email(request.email)

        if sender["id"] == request.receiver_id:
            raise HTTPException(status_code=400, detail="Cannot add yourself")

        receiver = await db.get_user_by_id(request.receiver_id)
        if not receiver:
            raise HTTPException(status_code=404, detail="User not found")

        if await db.is_blocked_between(sender["id"], receiver["id"]):
            raise HTTPException(status_code=403, detail="Friendship not allowed")

        if await db.are_friends(sender["id"], receiver["id"]):
            raise HTTPException(status_code=400, detail="Already friends")

        pending = await db.get_pending_friend_request_between(sender["id"], receiver["id"])
        if pending:
            raise HTTPException(status_code=400, detail="Request already pending")

        await db.create_friend_request(sender["id"], receiver["id"], status="pending")
        return {"success": True}

    @app.get("/api/friends/status")
    async def get_friend_status(
        email: str = Query(...),
        other_id: int = Query(...)
    ):
        user = await db.get_user_by_email(email)
        if not user:
            user = await db.create_user_by_email(email)

        if user["id"] == other_id:
            return {
                "is_self": True,
                "is_friend": False,
                "is_blocked": False,
                "has_pending_outgoing": False,
                "has_pending_incoming": False,
            }

        blocked = await db.is_blocked_between(user["id"], other_id)
        is_friend = await db.are_friends(user["id"], other_id)
        pending = await db.get_pending_friend_request_between(user["id"], other_id)
        has_outgoing = bool(pending and pending["sender_id"] == user["id"])
        has_incoming = bool(pending and pending["receiver_id"] == user["id"])

        return {
            "is_self": False,
            "is_friend": is_friend,
            "is_blocked": blocked,
            "has_pending_outgoing": has_outgoing,
            "has_pending_incoming": has_incoming,
        }

    @app.post("/api/friends/requests/{request_id}/decline")
    async def decline_friend_request(request_id: int, email: str = Query(...)):
        user = await db.get_user_by_email(email)
        if not user:
            user = await db.create_user_by_email(email)

        request = await db.get_friend_request_by_id(request_id)
        if not request:
            raise HTTPException(status_code=404, detail="Request not found")
        if request["receiver_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Not allowed")

        await db.update_friend_request_status(request_id, status="declined")
        return {"success": True}

    @app.post("/api/friends/requests/{request_id}/accept")
    async def accept_friend_request(request_id: int, email: str = Query(...)):
        user = await db.get_user_by_email(email)
        if not user:
            user = await db.create_user_by_email(email)

        request = await db.get_friend_request_by_id(request_id)
        if not request:
            raise HTTPException(status_code=404, detail="Request not found")
        if request["receiver_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Not allowed")
        if request["status"] != "pending":
            raise HTTPException(status_code=400, detail="Request is not pending")

        sender_id = request["sender_id"]
        if await db.is_blocked_between(user["id"], sender_id):
            raise HTTPException(status_code=403, detail="Friendship not allowed")

        await db.create_friendship(user["id"], sender_id)
        await db.update_friend_request_status(request_id, status="accepted")
        return {"success": True}

    @app.delete("/api/friends/requests/{request_id}")
    async def cancel_friend_request(request_id: int, email: str = Query(...)):
        """Cancel an outgoing friend request (called by sender)"""
        user = await db.get_user_by_email(email)
        if not user:
            user = await db.create_user_by_email(email)

        request = await db.get_friend_request_by_id(request_id)
        if not request:
            raise HTTPException(status_code=404, detail="Request not found")
        if request["sender_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Not allowed. You can only cancel your own outgoing requests")
        if request["status"] != "pending":
            raise HTTPException(status_code=400, detail="Can only cancel pending requests")

        await db.update_friend_request_status(request_id, status="cancelled")
        return {"success": True}

    @app.post("/api/friends/blocks")
    async def block_user(block_request: FriendBlockRequest):
        user = await db.get_user_by_email(block_request.email)
        if not user:
            user = await db.create_user_by_email(block_request.email)

        if user["id"] == block_request.blocked_user_id:
            raise HTTPException(status_code=400, detail="Cannot block yourself")

        await db.block_user(user["id"], block_request.blocked_user_id)
        return {"success": True}

    @app.delete("/api/friends/blocks/{blocked_id}")
    async def unblock_user(blocked_id: int, email: str = Query(...)):
        user = await db.get_user_by_email(email)
        if not user:
            user = await db.create_user_by_email(email)

        await db.unblock_user(user["id"], blocked_id)
        return {"success": True}

    @app.get("/api/friends/blocks")
    async def list_blocked_users(email: str = Query(...)):
        user = await db.get_user_by_email(email)
        if not user:
            user = await db.create_user_by_email(email)

        items = await db.list_blocked_users(user["id"])
        return {"items": items}
