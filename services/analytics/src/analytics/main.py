from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from analytics import __version__
from analytics.config import settings
from analytics.db import dispose
from analytics.events import close as close_events
from analytics.events import connect as connect_events
from analytics.logging import configure_logging
from analytics.routes import router as analytics_router


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    await connect_events()
    try:
        yield
    finally:
        await close_events()
        await dispose()


app = FastAPI(
    title=f"{settings.service_name} service",
    version=__version__,
    lifespan=lifespan,
)
app.include_router(analytics_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.service_name, "version": __version__}


@app.get("/ready")
async def ready() -> dict[str, str]:
    return {"status": "ready", "service": settings.service_name}
