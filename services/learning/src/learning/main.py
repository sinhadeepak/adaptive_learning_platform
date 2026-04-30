"""alp-learning — catalog + content + doubts + search + adaptive consolidated entrypoint.

Per ADR-0005, this service merges five Python deployables into one:

  catalog        — exam/subject/topic taxonomy + educator authorize
  content        — question authoring lifecycle + assignments
  doubts         — student Q&A
  search         — OpenSearch index + reindex
  adaptive       — IRT, AI tutor, study plan, rate limit, photo doubt

Lifespan order matters because:

  - search.ensure_index must run before any reindex_all kick-in
  - content.events + content.quiz_session_subscriber both wire NATS
  - adaptive.flags + adaptive.rate_limit (Redis) both connect at boot

Each module's connect/close pair is independent — failure in one does
not block the others. URL prefixes (/catalog, /content, /doubts,
/search, /adaptive, plus the migrated /strategy/select) are unchanged
so callers (alp-quiz, alp-engagement, alp-identity, web apps) see no
contract change.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from alp_telemetry import TraceContextMiddleware
from fastapi import FastAPI

from learning import __version__

# catalog
from learning.catalog.flags import close_flags as close_catalog_flags
from learning.catalog.flags import connect_flags as connect_catalog_flags
from learning.catalog.routes import router as catalog_router

# Phase 5 (P5-S38) — Type Handler registry + grading endpoint
from learning.grading.routes import router as grading_router
from learning.types.bootstrap import register_all_v1_handlers

# Phase 5 (P5-S40) — AI Authoring (depends on AI Gateway)
from learning.ai_authoring.routes import router as ai_authoring_router
from learning.ai_gateway import AIGateway, PromptRegistry, load_routing
from learning.ai_gateway.routing import default_stub_config

# exam blueprints (P4-S23)
from learning.exam_blueprints.routes import router as exam_blueprints_router

# PYQ catalog (P4-S24)
from learning.pyq.routes import router as pyq_router

# Concept prereq graph (P4-S26)
from learning.prereqs.routes import router as prereqs_router

# Syllabus tree (P4-S28) + topic references (P4-S34)
from learning.syllabus.routes import (
    references_router as syllabus_references_router,
    router as syllabus_router,
)

# content
from learning.content import events as content_events
from learning.content import quiz_session_subscriber as content_quiz_sub
from learning.content.assignments_routes import router as assignments_router
from learning.content.db import dispose as dispose_content_db
from learning.content.routes import router as content_router

# doubts
from learning.doubts.db import dispose as dispose_doubts_db
from learning.doubts.routes import router as doubts_router

# search
from learning.search.index import close as close_os_client
from learning.search.index import client as os_client
from learning.search.index import ensure_index
from learning.search.reindex import reindex_all
from learning.search.routes import router as search_router
from learning.search.config import settings as search_settings

# adaptive
from learning.adaptive.flags import close_flags as close_adaptive_flags
from learning.adaptive.flags import connect_flags as connect_adaptive_flags
from learning.adaptive.rate_limit import PhotoDoubtRateLimiter
from learning.adaptive.routes import router as adaptive_router

# Shared logging — every absorbed module had its own configure_logging
# function but the implementation is identical (structlog setup);
# call one of them once.
from learning.catalog.logging import configure_logging


log = logging.getLogger(__name__)


async def _try(name: str, coro_factory) -> None:
    """Run a startup hook, log + continue on failure. Each absorbed
    module connects to its own infra (NATS, OpenSearch, Redis) and
    a flap in one shouldn't take down the whole service."""
    try:
        await coro_factory()
    except Exception as exc:  # noqa: BLE001
        log.warning("learning startup: %s skipped: %s", name, exc)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    configure_logging()

    # Phase 5 (P5-S38): register all Type Handlers + freeze registry.
    # Done before any traffic-serving connect. Sync call (not via
    # _try) — Protocol-conformance failures must abort startup loudly,
    # never be silently skipped. The registry's _FROZEN flag also makes
    # this idempotent across uvicorn worker restarts since the module-
    # global state persists per process.
    register_all_v1_handlers()

    # Phase 5 (P5-S40): construct the AI Gateway singleton + load
    # prompt templates. Failure here only disables AI features — the
    # rest of the service continues serving (degraded). Routes use the
    # `get_gateway` dependency which 503s when state is missing.
    try:
        from pathlib import Path
        repo_root = Path(__file__).resolve().parents[4]
        routing_path = repo_root / "config" / "ai_routing.yaml"
        prompts_dir = repo_root / "prompts"
        routing = (
            load_routing(routing_path) if routing_path.exists() else default_stub_config()
        )
        registry = PromptRegistry()
        if prompts_dir.exists():
            registry.load_directory(prompts_dir)
        app.state.ai_gateway = AIGateway(routing=routing, prompts=registry)
        # P5-S42: register the singleton with the subjective handlers
        # so type-handler evaluate() paths can grade via the same
        # gateway without dependency-injection plumbing through Quiz.
        from learning.types.subjective.handlers import set_singleton_gateway

        set_singleton_gateway(app.state.ai_gateway)
    except Exception as exc:  # noqa: BLE001
        log.warning("learning startup: ai_gateway not available: %s", exc)
        app.state.ai_gateway = None

    await _try("catalog.flags", connect_catalog_flags)
    await _try("content.events", content_events.connect)
    await _try("content.quiz_subscriber", content_quiz_sub.connect)
    await _try("search.ensure_index", ensure_index)

    async def _maybe_reindex() -> None:
        count_result = await os_client().count(index=search_settings.topics_index)
        if int(count_result.get("count", 0)) == 0:
            await reindex_all()

    await _try("search.reindex_on_startup", _maybe_reindex)
    await _try("adaptive.flags", connect_adaptive_flags)

    from learning.adaptive.config import settings as adaptive_settings

    app.state.photo_doubt_limiter = PhotoDoubtRateLimiter(adaptive_settings.redis_url)
    await _try("adaptive.photo_doubt_limiter", app.state.photo_doubt_limiter.connect)

    try:
        yield
    finally:
        await _try("photo_doubt_limiter.close", app.state.photo_doubt_limiter.close)
        await _try("adaptive.flags.close", close_adaptive_flags)
        await _try("search.os_client.close", close_os_client)
        await _try("content.quiz_subscriber.close", content_quiz_sub.close)
        await _try("content.events.close", content_events.close)
        await _try("catalog.flags.close", close_catalog_flags)
        await _try("doubts.db.dispose", dispose_doubts_db)
        await _try("content.db.dispose", dispose_content_db)


app = FastAPI(
    title="alp-learning",
    version=__version__,
    lifespan=lifespan,
)
app.add_middleware(TraceContextMiddleware)

# Mount every old service's router at its original URL prefix.
app.include_router(catalog_router)
app.include_router(grading_router)  # Phase 5 (P5-S38)
app.include_router(ai_authoring_router)  # Phase 5 (P5-S40)
app.include_router(exam_blueprints_router)
app.include_router(pyq_router)
app.include_router(prereqs_router)
app.include_router(syllabus_router)
app.include_router(syllabus_references_router)
app.include_router(content_router)
app.include_router(assignments_router)
app.include_router(doubts_router)
app.include_router(search_router)
app.include_router(adaptive_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "learning", "version": __version__}


@app.get("/ready")
async def ready() -> dict[str, str]:
    return {"status": "ready", "service": "learning"}
