from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI

from user_profile import __version__
from user_profile.config import settings
from user_profile.events import close as close_events
from user_profile.events import connect as connect_events
from user_profile.logging import configure_logging
from user_profile.routes import internal_router, router as profile_router


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    await connect_events()
    try:
        yield
    finally:
        await close_events()


app = FastAPI(
    title=f"{settings.service_name} service",
    version=__version__,
    lifespan=lifespan,
)

app.include_router(profile_router)
app.include_router(internal_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.service_name, "version": __version__}


@app.get("/ready")
async def ready() -> dict[str, str]:
    return {"status": "ready", "service": settings.service_name}
