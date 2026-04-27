from contextlib import asynccontextmanager
from typing import AsyncIterator

from alp_telemetry import TraceContextMiddleware
from fastapi import FastAPI

from doubts import __version__
from doubts.config import settings
from doubts.db import dispose
from doubts.routes import router


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    try:
        yield
    finally:
        await dispose()


app = FastAPI(
    title=f"{settings.service_name} service",
    version=__version__,
    lifespan=lifespan,
)
app.add_middleware(TraceContextMiddleware)
app.include_router(router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.service_name, "version": __version__}


@app.get("/ready")
async def ready() -> dict[str, str]:
    return {"status": "ready", "service": settings.service_name}
