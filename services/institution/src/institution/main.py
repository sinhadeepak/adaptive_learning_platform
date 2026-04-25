from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI

from institution import __version__
from institution.config import settings
from institution.events import close as close_nats, connect as connect_nats
from institution.logging import configure_logging
from institution.routes import router as flags_router


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    await connect_nats()
    try:
        yield
    finally:
        await close_nats()


app = FastAPI(
    title=f"{settings.service_name} service",
    version=__version__,
    lifespan=lifespan,
)

app.include_router(flags_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.service_name, "version": __version__}


@app.get("/ready")
async def ready() -> dict[str, str]:
    return {"status": "ready", "service": settings.service_name}
