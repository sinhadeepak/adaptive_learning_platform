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

# Phase 5 (P5-S43) — Localisation (depends on AI Gateway)
from learning.localisation.routes import router as localisation_router

# Phase 5 (P5-S51) — Type registry HTTP surface (CE-104)
from learning.types.routes import router as types_router

# Phase 5 (P5-S51) — Per-artifact translation routes (Cat §8.1, CE-401/402)
from learning.content.translation_routes import router as content_translations_router

# Phase 5 (P5-S57) — Human grader queue + cultural review queue
from learning.grading.queue_routes import router as grader_queue_router
from learning.localisation.cultural_routes import router as cultural_router

# Phase 5 (P5-S62) — Whisper transcription pipeline
from learning.transcription.routes import router as transcription_router

# Phase 5 (P5-S63) — Reviewer staffing tracker
from learning.localisation.staffing_routes import router as staffing_router

# Phase 5 (P5-S45) — Admin cost dashboard
from learning.ai_gateway.routes import router as ai_admin_router

# Phase 5 (P5-S47) — Re-evaluation + calibration dashboard
from learning.evaluation.routes import router as evaluation_router

# exam blueprints (P4-S23)
from learning.exam_blueprints.routes import router as exam_blueprints_router
# Pillar A — Exam Intelligence System (Stream B Phase B1).
from learning.exam_intel.routes import (
    admin_router as exam_intel_admin_router,
    router as exam_intel_router,
)
# Pillar B — Probabilistic Curriculum Engine (Stream B Phase B2).
from learning.pce.routes import router as pce_router
# Pillar D — Internal Guidance System (Stream B Phase B3).
from learning.igs.routes import router as igs_router
from learning.igs.stream import gateway as igs_gateway, ws_router as igs_ws_router
from learning.igs import nats_subscriber as igs_nats_sub

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
from learning.content.notes_routes import router as content_notes_router
from learning.content.resources.routes import router as content_resources_router
from learning.storage.routes import router as uploads_router  # P7 — uploads
from learning.exam_builder.routes import router as exam_builder_router  # P7 — admin AI-assisted exam builder
from learning.ai_providers.routes import router as ai_providers_router  # P7 — admin-managed multi-provider AI chain
from learning.screening.routes import router as screening_router  # P6-S49
from learning.mission.routes import router as mission_router        # P6-S50
from learning.plans.routes import router as plans_router            # P6-S55
from learning.recovery import router as recovery_router            # P6-S57

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

    # P5-S45: hydrate the in-memory cost tracker from the persistent
    # ai_call_logs table so /admin/ai-cost shows historical data after
    # a fresh process boot. Best-effort — absorbed errors don't block.
    async def _hydrate_cost_tracker() -> None:
        import os
        from learning.ai_gateway.cost_dashboard import load_from_db

        db_url = os.environ.get("LEARNING_DATABASE_URL") or os.environ.get("DATABASE_URL") or ""
        if not db_url:
            return
        loaded = await load_from_db(db_url)
        log.info("cost_dashboard: hydrated %d entries from ai_call_logs", loaded)

    await _try("ai_gateway.cost_hydrate", _hydrate_cost_tracker)

    # P5-S62: register the Whisper transcription provider when an
    # OpenAI API key is set; fall back to the stub otherwise so the
    # /content/ai/transcribe route stays exercisable in dev. Failure
    # to construct the OpenAI client surfaces as a warning + the
    # route returns 503.
    try:
        import os
        from learning.transcription.provider import (
            OpenAIWhisperProvider,
            StubTranscriptionProvider,
            set_provider,
        )

        if os.environ.get("OPENAI_API_KEY"):
            set_provider(OpenAIWhisperProvider())
            log.info("transcription provider: openai-whisper")
        else:
            set_provider(StubTranscriptionProvider())
            log.info("transcription provider: stub (no OPENAI_API_KEY)")
    except Exception as exc:  # noqa: BLE001
        log.warning("learning startup: transcription not available: %s", exc)

    # P5-S63: register the AWS Rekognition image moderator when AWS
    # creds are present; fall back to StubImageModerator (S53) so the
    # upload pipeline always functions. Stub routes everything to
    # pre-moderation rather than blocking.
    try:
        import os
        from learning.content.image_moderation import (
            StubImageModerator,
            set_moderator,
        )

        if os.environ.get("AWS_REGION") and os.environ.get("AWS_ACCESS_KEY_ID"):
            from learning.content.rekognition_moderator import (
                RekognitionModerator,
            )

            set_moderator(RekognitionModerator())
            log.info("image moderator: aws-rekognition")
        else:
            set_moderator(StubImageModerator())
            log.info("image moderator: stub (no AWS creds)")
    except Exception as exc:  # noqa: BLE001
        log.warning("learning startup: image moderator not available: %s", exc)

    # P5-S63: spawn the audit-log retention task. Weekly purge of
    # ai_generation_jobs rows older than 90 days per ADR-0019.
    async def _start_retention() -> None:
        from learning.ai_gateway.audit_retention_task import (
            start_retention_task,
        )

        app.state.audit_retention_task = await start_retention_task()

    await _try("ai_gateway.audit_retention", _start_retention)

    await _try("catalog.flags", connect_catalog_flags)
    await _try("content.events", content_events.connect)
    await _try("content.quiz_subscriber", content_quiz_sub.connect)
    # Phase B3 — IGS reactive WebSocket push trigger.
    await _try("igs.nats_subscriber", igs_nats_sub.connect)
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

    # P5-S52 — start auto-pause refresh task. Polls calibration_samples
    # every 5 minutes and rebuilds the paused-criteria set so subjective
    # grader's runtime gate sees fresh kappa data.
    async def _start_auto_pause() -> None:
        from learning.evaluation.auto_pause import start_refresh_task

        app.state.auto_pause_task = await start_refresh_task()

    await _try("evaluation.auto_pause", _start_auto_pause)

    try:
        yield
    finally:
        # Cancel background tasks before disposing DB connections so
        # their in-flight queries don't see a closing pool.
        for task_attr in ("auto_pause_task", "audit_retention_task"):
            task = getattr(app.state, task_attr, None)
            if task is not None:
                task.cancel()
                try:
                    await task
                except Exception:  # noqa: BLE001
                    pass
        await _try("photo_doubt_limiter.close", app.state.photo_doubt_limiter.close)
        await _try("adaptive.flags.close", close_adaptive_flags)
        await _try("search.os_client.close", close_os_client)
        await _try("igs.nats_subscriber.close", igs_nats_sub.close)
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
app.include_router(localisation_router)  # Phase 5 (P5-S43)
app.include_router(ai_admin_router)      # Phase 5 (P5-S45)
app.include_router(evaluation_router)    # Phase 5 (P5-S47)
app.include_router(types_router)         # Phase 5 (P5-S51 — CE-104)
app.include_router(content_translations_router)  # Phase 5 (P5-S51 — Cat §8.1)
app.include_router(grader_queue_router)          # Phase 5 (P5-S57 — CE-308)
app.include_router(cultural_router)              # Phase 5 (P5-S57 — CE-404)
app.include_router(transcription_router)         # Phase 5 (P5-S62 — Whisper)
app.include_router(staffing_router)              # Phase 5 (P5-S63 — staffing)
app.include_router(exam_blueprints_router)
app.include_router(exam_intel_router)         # Pillar A read endpoints
app.include_router(exam_intel_admin_router)   # Pillar A admin endpoints
app.include_router(pce_router)                # Pillar B — PCE
app.include_router(igs_router)                # Pillar D — IGS HTTP
app.include_router(igs_ws_router)             # Pillar D — IGS WebSocket
# Make the gateway reachable to NATS subscriber paths that want to
# trigger reactive pushes (quiz.session.completed, mastery.delta, …).
app.state.igs_gateway = igs_gateway
app.include_router(pyq_router)
app.include_router(prereqs_router)
app.include_router(syllabus_router)
app.include_router(syllabus_references_router)
app.include_router(content_router)
app.include_router(content_notes_router)  # Phase 7 (P7-A1) — per-topic notes
app.include_router(content_resources_router)  # R-S1 — YouTube curation
# Phase 1D-8 — flashcard SRS
from learning.flashcards.routes import router as flashcards_router  # noqa: E402
app.include_router(flashcards_router)
app.include_router(uploads_router)              # P7 — MinIO presigned uploads
app.include_router(exam_builder_router)          # P7 — admin AI-assisted exam builder
app.include_router(ai_providers_router)          # P7 — admin AI provider config + failover chain
app.include_router(screening_router)            # P6-S49 — guest screening
app.include_router(mission_router)              # P6-S50 — Today's Mission
app.include_router(plans_router)                # P6-S55 — Constrained plan editor
app.include_router(recovery_router)             # P6-S57 — Recovery mode
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
