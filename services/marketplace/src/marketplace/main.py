"""alp-marketplace — Phase 3 service slot per ADR-0005.

Sprint 15 (P3-S0): boots a FastAPI app with /health + /ready. No
domain modules yet — those land in P3-S1+ (tutor profiles, bookings,
creator marketplace, revenue-share ledger).

The 6th service in the post-consolidation architecture; this is the
final slot under the service ceiling. Any new Phase 3 domain that
doesn't fit alp-identity / payment / learning / quiz / engagement /
marketplace requires a new ADR per ADR-0005.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from alp_telemetry import TraceContextMiddleware
from fastapi import FastAPI

from marketplace import __version__


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    yield


app = FastAPI(
    title="alp-marketplace",
    version=__version__,
    lifespan=lifespan,
)
app.add_middleware(TraceContextMiddleware)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "marketplace", "version": __version__}


@app.get("/ready")
async def ready() -> dict[str, str]:
    return {"status": "ready", "service": "marketplace"}
