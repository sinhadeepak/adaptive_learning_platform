import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Literal

from alp_telemetry import TraceContextMiddleware
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from notification import __version__
from notification.config import settings
from notification.db import dispose, sessionmaker
from notification.dispatcher import start as start_dispatcher
from notification.dispatcher import stop as stop_dispatcher
from notification.events import close as close_events
from notification.events import connect as connect_events
from notification.flags import channel_enabled, close_flags, connect_flags
from notification.logging import configure_logging
from notification.repositories import (
    append_notification,
    list_for_user,
    mark_all_read,
    mark_read,
    unread_count_for_user,
)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    await connect_flags()
    await connect_events()
    await start_dispatcher()
    try:
        yield
    finally:
        await stop_dispatcher()
        await close_events()
        await close_flags()
        await dispose()


app = FastAPI(
    title=f"{settings.service_name} service",
    version=__version__,
    lifespan=lifespan,
)

# Trace-id propagation must be the OUTERMOST middleware (Sprint 4).
app.add_middleware(TraceContextMiddleware)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.service_name, "version": __version__}


@app.get("/ready")
async def ready() -> dict[str, str]:
    return {"status": "ready", "service": settings.service_name}


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


@app.post("/notifications/send", response_model=SendResponse)
async def send(req: SendRequest) -> SendResponse:
    """GAP-16 #5 — gates dispatch on the channel-specific kill-switch flag.

    Sprint 1 returns a synthesized notificationId; Sprint 2 wires real FCM/APNs +
    Twilio SMS + SendGrid email behind the same gate. The contract stays stable.
    """
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
    """Service-to-service: persist an in-app inbox notification.
    Distinct from /notifications/send which routes to outbound channels
    (push/sms/email). This one only writes to the in-app inbox table —
    no dispatcher gating, no channel flag check.

    Producers today: analytics (streak milestones, goal-reached).
    Network reachability is the only gate locally; mTLS in Sprint 4."""

    userId: str
    type: str = Field(min_length=1, max_length=64)
    payload: dict = Field(default_factory=dict)
    dedupeKey: str | None = None


@app.post("/notifications/inbox")
async def post_inbox_append(req: InboxAppendRequest) -> dict:
    # Honour the user's per-type mute prefs. Best-effort: if user-profile is
    # unreachable, we default to "not muted" so a transient outage doesn't
    # silently swallow notifications.
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
    """Returns True only when the user's prefs explicitly set this type to
    false. Missing key, fetch failure, and explicit `true` all mean not muted."""
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
            return value is False  # explicit False = muted; True / missing = enabled
    except Exception:
        return False


@app.get("/notifications/inbox/{user_id}")
async def list_inbox(user_id: str) -> dict:
    """Read-side over the Postgres-backed notifications table.

    Returns the latest 50 notifications for `user_id`, newest first, plus an
    `unreadCount` so the client can render a bell badge in one round-trip.
    """
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


@app.get("/notifications/inbox/{user_id}/unread-count")
async def get_unread_count(user_id: str) -> dict:
    """Lightweight bell-badge endpoint — short-poll friendly."""
    async with sessionmaker()() as session:
        unread = await unread_count_for_user(session, user_id)
    return {"userId": user_id, "unreadCount": unread}


@app.post("/notifications/{notification_id}/read")
async def post_mark_read(notification_id: str, user_id: str) -> dict:
    """Mark a single notification read. `user_id` is on the query string —
    this route is service-to-service today and JWT-fronted in Sprint 4."""
    async with sessionmaker()() as session:
        flipped = await mark_read(session, user_id=user_id, notification_id=notification_id)
        await session.commit()
    return {"flipped": flipped}


@app.post("/notifications/inbox/{user_id}/mark-all-read")
async def post_mark_all_read(user_id: str) -> dict:
    async with sessionmaker()() as session:
        n = await mark_all_read(session, user_id)
        await session.commit()
    return {"userId": user_id, "flipped": n}
