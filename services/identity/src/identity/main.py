"""alp-identity — auth + user-profile + institution consolidated entrypoint.

Per ADR-0005, this service merges:

  auth         — registration, OTP, JWT issuance, refresh, password reset,
                 + payment.subscription.changed NATS subscriber
  profile      — onboarding, preferences, bookmarks, achievements, mock
                 attempts, notification prefs (renamed from `user_profile`
                 sub-package for the cleaner Python module name)
  institution  — feature flags + tenants + cohorts + invites

The auth↔institution feature-flag HTTP edge becomes an in-process call;
the auth↔payment premium-fallback HTTP edge stays open because Payment
remains a separate service per ADR-0005.

Lifespan is best-effort per module — a failed Redis/NATS at boot logs
and continues so the rest of the service stays up.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from alp_telemetry import TraceContextMiddleware
from fastapi import FastAPI

from identity import __version__

# auth
from identity.auth.admin_routes import router as auth_admin_router
from identity.auth.events import close as close_auth_events
from identity.auth.events import connect as connect_auth_events
from identity.auth.flags import close_flags as close_auth_flags
from identity.auth.flags import connect_flags as connect_auth_flags
from identity.auth.lockout import close as close_lockout
from identity.auth.lockout import connect as connect_lockout
from identity.auth.logging import configure_logging
from identity.auth.middleware import ClientVersionLogMiddleware
from identity.auth.payment_subscriber import close as close_payment_subscriber
from identity.auth.payment_subscriber import connect as connect_payment_subscriber
from identity.auth.routes import router as auth_router

# profile
from identity.profile.events import close as close_profile_events
from identity.profile.events import connect as connect_profile_events
from identity.profile.routes import internal_router as profile_internal_router
from identity.profile.routes import router as profile_router

# institution
from identity.institution.core_routes import router as institution_core_router
from identity.institution.events import close as close_institution_nats
from identity.institution.events import connect as connect_institution_nats
from identity.institution.routes import router as flags_router


log = logging.getLogger(__name__)


async def _try(name: str, coro_factory) -> None:
    """Run a startup hook, log + continue on failure."""
    try:
        await coro_factory()
    except Exception as exc:  # noqa: BLE001
        log.warning("identity startup: %s skipped: %s", name, exc)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    configure_logging()

    # auth
    await _try("auth.flags", connect_auth_flags)
    await _try("auth.lockout", connect_lockout)
    await _try("auth.events", connect_auth_events)
    await _try("auth.payment_subscriber", connect_payment_subscriber)

    # profile
    await _try("profile.events", connect_profile_events)

    # institution
    await _try("institution.nats", connect_institution_nats)

    try:
        yield
    finally:
        await _try("institution.nats.close", close_institution_nats)
        await _try("profile.events.close", close_profile_events)
        await _try("auth.payment_subscriber.close", close_payment_subscriber)
        await _try("auth.events.close", close_auth_events)
        await _try("auth.lockout.close", close_lockout)
        await _try("auth.flags.close", close_auth_flags)


app = FastAPI(
    title="alp-identity",
    version=__version__,
    lifespan=lifespan,
)
app.add_middleware(TraceContextMiddleware)
app.add_middleware(ClientVersionLogMiddleware)

# Mount each module's router at its original prefix.
app.include_router(auth_router)
app.include_router(auth_admin_router)
app.include_router(profile_router)
app.include_router(profile_internal_router)
app.include_router(institution_core_router)
app.include_router(flags_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "identity", "version": __version__}


@app.get("/ready")
async def ready() -> dict[str, str]:
    return {"status": "ready", "service": "identity"}
