from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI

from search import __version__
from search.config import settings
from search.index import close as close_os, ensure_index
from search.logging import configure_logging
from search.routes import router as search_router


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    await ensure_index()
    try:
        yield
    finally:
        await close_os()


app = FastAPI(
    title=f"{settings.service_name} service",
    version=__version__,
    lifespan=lifespan,
)

app.include_router(search_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.service_name, "version": __version__}


@app.get("/ready")
async def ready() -> dict[str, str]:
    return {"status": "ready", "service": settings.service_name}
