"""alp-engagement — skeleton entrypoint.

Sprint A: boots an empty FastAPI app with /health.
Sprint B will move `services/analytics/src/analytics/*` →
`engagement.analytics` and `services/notification/src/notification/*` →
`engagement.notification`, mounting their routers at /analytics/* and
/notifications/* respectively. Until then this app exists only so the
contract-test harness, docker-compose entry, and Makefile target have
something to point at.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from alp_telemetry import TraceContextMiddleware
from fastapi import FastAPI

from engagement import __version__


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    yield


app = FastAPI(
    title="alp-engagement",
    version=__version__,
    lifespan=lifespan,
)
app.add_middleware(TraceContextMiddleware, service_name="engagement")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "engagement", "version": __version__}
