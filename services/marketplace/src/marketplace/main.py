"""alp-marketplace — Phase 3 service slot per ADR-0005.

Sprint 16 (P3-S1): tutor application + listing endpoints. Booking +
Stripe Connect + Daily.co A/V land in P3-S2.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from alp_auth import assert_secret_configured
from alp_telemetry import TraceContextMiddleware
from fastapi import FastAPI

from marketplace import __version__
from marketplace.booking_routes import admin_router, booking_router
from marketplace.config import settings
from marketplace.creator_routes import (
    course_router,
    creator_router,
    rating_router,
)
from marketplace.db import dispose
from marketplace.lesson_routes import (
    earnings_router,
    lesson_router,
    mod_router,
)
from marketplace.routes import router as tutor_router
from marketplace.security import JWT_SECRET


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    assert_secret_configured(JWT_SECRET, settings.environment)
    try:
        yield
    finally:
        await dispose()


app = FastAPI(
    title="alp-marketplace",
    version=__version__,
    lifespan=lifespan,
)
app.add_middleware(TraceContextMiddleware)
app.include_router(tutor_router)
app.include_router(booking_router)
app.include_router(admin_router)
app.include_router(creator_router)
app.include_router(course_router)
app.include_router(rating_router)
app.include_router(lesson_router)
app.include_router(earnings_router)
app.include_router(mod_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "marketplace", "version": __version__}


@app.get("/ready")
async def ready() -> dict[str, str]:
    return {"status": "ready", "service": "marketplace"}
