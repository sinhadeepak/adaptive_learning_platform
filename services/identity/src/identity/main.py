"""alp-identity — skeleton entrypoint.

Sprint A: boots an empty FastAPI app with /health.
Sprint D will move:

  services/auth/src/auth/*                 → identity.auth.*           (/auth/*)
  services/user-profile/src/user_profile/* → identity.profile.*        (/profile/*)
  services/institution/src/institution/*   → identity.institution.*    (/institution/*, /flags/*)

The auth↔institution feature-flag HTTP edge becomes an in-process call;
the auth↔payment premium-fallback HTTP edge stays open because Payment
remains a separate service per ADR-0005.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from alp_telemetry import TraceContextMiddleware
from fastapi import FastAPI

from identity import __version__


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    yield


app = FastAPI(
    title="alp-identity",
    version=__version__,
    lifespan=lifespan,
)
app.add_middleware(TraceContextMiddleware)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "identity", "version": __version__}
