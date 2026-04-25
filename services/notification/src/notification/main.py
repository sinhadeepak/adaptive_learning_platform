import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Literal

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
from notification.repositories import list_for_user


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


@app.get("/notifications/inbox/{user_id}")
async def list_inbox(user_id: str) -> dict:
    """Read-side over the Postgres-backed notifications table.

    Returns the latest 50 notifications for `user_id`, newest first.
    """
    async with sessionmaker()() as session:
        items = await list_for_user(session, user_id)
    return {
        "userId": user_id,
        "items": [
            {
                "id": n.id,
                "type": n.type,
                "channel": n.channel,
                "payload": n.payload,
                "createdAt": n.created_at.isoformat(),
            }
            for n in items
        ],
    }
