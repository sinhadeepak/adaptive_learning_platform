from contextlib import asynccontextmanager
from typing import Annotated, AsyncIterator

from alp_telemetry import TraceContextMiddleware
from fastapi import FastAPI, Query

from adaptive_engine import __version__
from adaptive_engine.config import settings
from adaptive_engine.flags import close_flags, connect_flags, use_irt
from adaptive_engine.logging import configure_logging
from adaptive_engine.routes import router as irt_router


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    await connect_flags()
    try:
        yield
    finally:
        await close_flags()


app = FastAPI(
    title=f"{settings.service_name} service",
    version=__version__,
    lifespan=lifespan,
)

# Trace-id propagation must be the OUTERMOST middleware (Sprint 4).
app.add_middleware(TraceContextMiddleware)
app.include_router(irt_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.service_name, "version": __version__}


@app.get("/ready")
async def ready() -> dict[str, str]:
    return {"status": "ready", "service": settings.service_name}


@app.get("/strategy/select")
async def select_strategy(
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
) -> dict[str, str]:
    """Demonstrates the GAP-16 IRT toggle. Sprint 2 lands the gRPC `SelectNext` RPC
    that uses the same gate but additionally returns a question difficulty estimate."""
    return {"strategy": "irt" if await use_irt(tenant_id=tenant_id) else "binary_search"}
