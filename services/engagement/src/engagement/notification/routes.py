"""Notification HTTP routes.

Extracted from the old `notification/main.py` so the engagement service
can mount these via include_router. The lifespan hooks (connect_flags,
connect_events, connect_assignment_subscriber, start_dispatcher) move
into engagement.main.
"""

from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from engagement.notification.db import sessionmaker
from engagement.notification.flags import channel_enabled
from engagement.notification.repositories import (
    append_notification,
    list_for_user,
    mark_all_read,
    mark_read,
    unread_count_for_user,
)

router = APIRouter()

Channel = Literal["push", "sms", "email"]


class SendRequest(BaseModel):
    userId: str
    channel: Channel
    type: str = Field(min_length=1, max_length=64)
    payload: dict = Field(default_factory=dict)
    tenantId: str | None = None


class SendResponse(BaseModel):
    accepted: bool
    channel: Channel
    notificationId: str


@router.post("/notifications/send", response_model=SendResponse)
async def send(req: SendRequest) -> SendResponse:
    """GAP-16 #5 — gates dispatch on the channel-specific kill-switch flag."""
    if not await channel_enabled(req.channel, tenant_id=req.tenantId):
        raise HTTPException(
            status_code=503,
            detail={
                "code": "channel_disabled",
                "message": f"{req.channel} channel is currently disabled",
                "channel": req.channel,
            },
        )
    return SendResponse(accepted=True, channel=req.channel, notificationId=str(uuid.uuid4()))


class InboxAppendRequest(BaseModel):
    userId: str
    type: str = Field(min_length=1, max_length=64)
    payload: dict = Field(default_factory=dict)
    dedupeKey: str | None = None


@router.post("/notifications/inbox")
async def post_inbox_append(req: InboxAppendRequest) -> dict:
    if await _is_type_muted(req.userId, req.type):
        return {"id": None, "muted": True}
    notification_id = str(uuid.uuid4())
    async with sessionmaker()() as session:
        await append_notification(
            session,
            notification_id=notification_id,
            user_id=req.userId,
            type_=req.type,
            channel="inbox",
            payload=req.payload,
        )
        await session.commit()
    return {"id": notification_id, "muted": False}


async def _is_type_muted(user_id: str, type_: str) -> bool:
    import os

    base = os.environ.get("NOTIFICATION_USER_PROFILE_BASE_URL", "http://user-profile:8000")
    if not base:
        return False
    try:
        import httpx

        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get(f"{base.rstrip('/')}/internal/profile/{user_id}")
            if r.status_code != 200:
                return False
            prefs = (r.json() or {}).get("notificationPrefs") or {}
            value = prefs.get(type_)
            return value is False
    except Exception:
        return False


@router.get("/notifications/inbox/{user_id}")
async def list_inbox(user_id: str) -> dict:
    async with sessionmaker()() as session:
        items = await list_for_user(session, user_id)
        unread = await unread_count_for_user(session, user_id)
    return {
        "userId": user_id,
        "unreadCount": unread,
        "items": [
            {
                "id": n.id,
                "type": n.type,
                "channel": n.channel,
                "payload": n.payload,
                "createdAt": n.created_at.isoformat(),
                "readAt": n.read_at.isoformat() if n.read_at else None,
            }
            for n in items
        ],
    }


@router.get("/notifications/inbox/{user_id}/unread-count")
async def get_unread_count(user_id: str) -> dict:
    async with sessionmaker()() as session:
        unread = await unread_count_for_user(session, user_id)
    return {"userId": user_id, "unreadCount": unread}


@router.post("/notifications/{notification_id}/read")
async def post_mark_read(notification_id: str, user_id: str) -> dict:
    async with sessionmaker()() as session:
        flipped = await mark_read(session, user_id=user_id, notification_id=notification_id)
        await session.commit()
    return {"flipped": flipped}


@router.post("/notifications/inbox/{user_id}/mark-all-read")
async def post_mark_all_read(user_id: str) -> dict:
    async with sessionmaker()() as session:
        n = await mark_all_read(session, user_id)
        await session.commit()
    return {"userId": user_id, "flipped": n}
