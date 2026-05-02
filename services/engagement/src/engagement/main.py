"""alp-engagement — analytics + notification consolidated entrypoint.

Per ADR-0005, this service merges the old `analytics` and `notification`
deployables. The two modules retain their separate configs, DBs, and
NATS consumers; only the deployment unit is shared.

Lifespan order (startup):

    configure_logging — once, idempotent
    analytics: connect events (durable consumer analytics-quiz-completed)
    notification: connect flags, events, assignment_subscriber; start dispatcher

Shutdown is the mirror image. Each module's connect/close pair is
independent — failure in one does not block the other.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from alp_telemetry import TraceContextMiddleware
from fastapi import FastAPI

from engagement import __version__

# analytics-side
from engagement.analytics.db import dispose as dispose_analytics_db
from engagement.analytics.events import close as close_analytics_events
from engagement.analytics.events import connect as connect_analytics_events
from engagement.analytics.logging import configure_logging
from engagement.analytics.routes import router as analytics_router

# notification-side
from engagement.notification.assignment_subscriber import (
    close as close_assignment_subscriber,
)
from engagement.notification.assignment_subscriber import (
    connect as connect_assignment_subscriber,
)
from engagement.notification.db import dispose as dispose_notification_db
from engagement.notification.dispatcher import start as start_dispatcher
from engagement.notification.dispatcher import stop as stop_dispatcher
from engagement.notification.events import close as close_notification_events
from engagement.notification.events import connect as connect_notification_events
from engagement.notification.flags import close_flags, connect_flags
from engagement.notification.routes import router as notification_router
from engagement.reflection import reflection_router  # P6-S57 / UX-27


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    # analytics
    await connect_analytics_events()
    # notification
    await connect_flags()
    await connect_notification_events()
    await connect_assignment_subscriber()
    await start_dispatcher()
    try:
        yield
    finally:
        await stop_dispatcher()
        await close_assignment_subscriber()
        await close_notification_events()
        await close_flags()
        await close_analytics_events()
        await dispose_notification_db()
        await dispose_analytics_db()


app = FastAPI(
    title="alp-engagement",
    version=__version__,
    lifespan=lifespan,
)
app.add_middleware(TraceContextMiddleware)

# Mount the two sub-routers at their original prefixes so clients see no change.
app.include_router(analytics_router)
app.include_router(notification_router)
app.include_router(reflection_router)  # P6-S57 — reflections + commitments


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "engagement", "version": __version__}


@app.get("/ready")
async def ready() -> dict[str, str]:
    return {"status": "ready", "service": "engagement"}
