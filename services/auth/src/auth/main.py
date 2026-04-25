from contextlib import asynccontextmanager
from typing import AsyncIterator

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
from auth.routes import router as auth_router


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    await connect_flags()
    await connect_lockout()
    await connect_events()
    try:
        yield
    finally:
        await close_events()
        await close_lockout()
        await close_flags()


app = FastAPI(
    title=f"{settings.service_name} service",
    version=__version__,
    lifespan=lifespan,
)

# GAP-27 — log X-Client-Version on every request. Pattern documented; other services
# adopt as they consume client traffic.
app.add_middleware(ClientVersionLogMiddleware)

app.include_router(auth_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.service_name, "version": __version__}


@app.get("/ready")
async def ready() -> dict[str, str]:
    return {"status": "ready", "service": settings.service_name}
