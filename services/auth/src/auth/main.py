from contextlib import asynccontextmanager
from typing import AsyncIterator

from alp_telemetry import TraceContextMiddleware
from fastapi import FastAPI

from auth import __version__
from auth.config import settings
from auth.events import close as close_events
from auth.events import connect as connect_events
from auth.flags import close_flags, connect_flags
from auth.lockout import close as close_lockout
from auth.lockout import connect as connect_lockout
from auth.logging import configure_logging
from auth.middleware import ClientVersionLogMiddleware
from auth.payment_subscriber import close as close_payment_subscriber
from auth.payment_subscriber import connect as connect_payment_subscriber
from auth.admin_routes import router as auth_admin_router
from auth.routes import router as auth_router


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    await connect_flags()
    await connect_lockout()
    await connect_events()
    await connect_payment_subscriber()
    try:
        yield
    finally:
        await close_payment_subscriber()
        await close_events()
        await close_lockout()
        await close_flags()


app = FastAPI(
    title=f"{settings.service_name} service",
    version=__version__,
    lifespan=lifespan,
)

# Trace-id propagation must be the OUTERMOST middleware so every other
# middleware + handler runs inside its scope (its log records get the
# trace_id attribute via structlog.contextvars). Sprint 4 carry-over from
# Sprint 3's flag.decision telemetry.
app.add_middleware(TraceContextMiddleware)

# GAP-27 — log X-Client-Version on every request. Pattern documented; other services
# adopt as they consume client traffic.
app.add_middleware(ClientVersionLogMiddleware)

app.include_router(auth_router)
app.include_router(auth_admin_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.service_name, "version": __version__}


@app.get("/ready")
async def ready() -> dict[str, str]:
    return {"status": "ready", "service": settings.service_name}
