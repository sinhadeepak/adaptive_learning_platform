from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from alp_telemetry import TraceContextMiddleware
from fastapi import FastAPI

from content import __version__, events
from content.config import settings
from content.db import dispose
from content.logging import configure_logging
from content.assignments_routes import router as assignments_router
from content.routes import router as content_router


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    await events.connect()
    try:
        yield
    finally:
        await events.close()
        await dispose()


app = FastAPI(
    title=f"{settings.service_name} service",
    version=__version__,
    lifespan=lifespan,
)

# Trace-id propagation must be the OUTERMOST middleware so every request scope
# carries a trace_id available to structlog (Sprint 4).
app.add_middleware(TraceContextMiddleware)
app.include_router(content_router)
app.include_router(assignments_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.service_name, "version": __version__}


@app.get("/ready")
async def ready() -> dict[str, str]:
    return {"status": "ready", "service": settings.service_name}
