from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from alp_telemetry import TraceContextMiddleware
from fastapi import FastAPI

from search import __version__
from search.config import settings
from search.index import close as close_os
from search.index import client as os_client
from search.index import ensure_index
from search.logging import configure_logging
from search.reindex import reindex_all
from search.routes import router as search_router


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    await ensure_index()
    # Auto-reindex when the topics index is empty — covers the
    # `dev-reset` flow where catalog ships fresh topics but
    # OpenSearch volume comes up empty. In staging/prod the index
    # is populated by the Sprint-4 catalog→search NATS event
    # consumer, and the count check skips the reindex.
    try:
        count_result = await os_client().count(index=settings.topics_index)
        if int(count_result.get("count") or 0) == 0:
            await reindex_all()
    except Exception:  # noqa: BLE001 — startup-time best-effort
        # If the reindex pipeline can't reach catalog (cold-start
        # ordering), fall through. The /admin/reindex endpoint is
        # still available for manual repair.
        pass
    try:
        yield
    finally:
        await close_os()


app = FastAPI(
    title=f"{settings.service_name} service",
    version=__version__,
    lifespan=lifespan,
)

# Trace-id propagation must be the OUTERMOST middleware so every request scope
# carries a trace_id available to structlog (Sprint 4).
app.add_middleware(TraceContextMiddleware)

app.include_router(search_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.service_name, "version": __version__}


@app.get("/ready")
async def ready() -> dict[str, str]:
    return {"status": "ready", "service": settings.service_name}
