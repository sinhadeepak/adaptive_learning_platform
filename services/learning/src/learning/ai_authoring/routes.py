"""POST /content/ai/draft + POST /content/ai/quality-check endpoints.

Per ADR-0019 §"AI Authoring". Both endpoints are admin-or-creator-only
(auth gating wires up alongside the moderator queue UI in S45 — for v1
the route is open in dev and gated by upstream API gateway in prod).

The Gateway is dependency-injected via FastAPI's Depends(); production
swaps the stub for the real OpenAI-backed gateway via the lifespan
hook in main.py.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Annotated, Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from learning.ai_authoring.draft import (
    AIDraftMarker,
    DistractorsOutput,
    DraftQuestionRequest,
    ExplanationOutput,
    compute_edit_distance,
    draft_question,
    expand_explanation,
    suggest_distractors,
)
from learning.ai_authoring.guardrail import GuardrailEngine
from learning.ai_authoring.job_repo import (
    complete_bulk_job,
    create_bulk_job,
    fail_bulk_job,
    get_bulk_job,
    list_bulk_jobs,
    list_resumable_bulk_jobs,
    update_bulk_progress,
)
from learning.ai_authoring.quality_checks import QualityWarning, run_quality_checks
from learning.ai_gateway import AIGateway, AIGatewayError
from learning.ai_gateway.quotas import QuotaExceededError
from learning.content.db import sessionmaker as content_sessionmaker
from learning.content.security import JwtPrincipal, current_principal

log = logging.getLogger(__name__)

PrincipalDep = Annotated[JwtPrincipal, Depends(current_principal)]

router = APIRouter(prefix="/content/ai", tags=["ai_authoring"])


def _problem(code: str, message: str, http_status: int, **extra: Any) -> HTTPException:
    detail: dict[str, Any] = {"code": code, "message": message}
    detail.update(extra)
    return HTTPException(status_code=http_status, detail=detail)


def get_gateway(request: Request) -> AIGateway:
    """FastAPI dependency — pulls the singleton AIGateway off app.state.

    Raises 503 if startup wasn't able to construct one (no routing config,
    no API key etc). Caller's frontend degrades the AI assist panel.
    """
    gw = getattr(request.app.state, "ai_gateway", None)
    if gw is None:
        raise _problem(
            "ai_gateway_unavailable",
            "AI Gateway is not available in this deployment.",
            http_status=503,
        )
    return gw


def build_guardrail_engine(gateway: AIGateway) -> GuardrailEngine:
    """Construct the AI Content Guardrail engine from env-configured
    thresholds. Draft-time runs L1 (preamble) + L2 (self-audit); the full
    L3 vector scan + Redis bank commit happen at the DRAFT-write boundary
    (create_question) on the final, possibly-edited stem. A Redis hash
    store is wired here when reachable so exact-duplicate stems are caught
    at draft time too; failures degrade to L1+L2 only."""
    from learning.ai_authoring.guardrail.similarity import RedisHashStore
    from learning.ai_authoring.guardrail.trace_sink import AiGenerationJobsTraceSink
    from learning.content.config import guardrail_config, settings

    hash_store = None
    try:
        import redis.asyncio as aioredis

        hash_store = RedisHashStore(aioredis.from_url(settings.redis_url))
    except Exception:
        hash_store = None

    return GuardrailEngine(
        gateway,
        config=guardrail_config(),
        hash_store=hash_store,
        trace_sink=AiGenerationJobsTraceSink(),
    )


def get_guardrail_engine(request: Request) -> GuardrailEngine | None:
    """Dependency — returns a guardrail engine, or None when the gateway
    is unavailable (the route already 503s via get_gateway in that case)."""
    gw = getattr(request.app.state, "ai_gateway", None)
    if gw is None:
        return None
    return build_guardrail_engine(gw)


# ── /draft ───────────────────────────────────────────────────────────────────


class DraftResponse(BaseModel):
    # Any of the 25 Draft* schemas — dict so we don't need a giant
    # Union literal. The actual class is determined by request.type_id
    # via _DRAFT_TYPE_MAP and validated before serialisation.
    draft: dict[str, Any]
    marker: AIDraftMarker


@router.post("/draft", response_model=DraftResponse)
async def post_draft(
    req: DraftQuestionRequest,
    gateway: AIGateway = Depends(get_gateway),
    engine: GuardrailEngine | None = Depends(get_guardrail_engine),
) -> DraftResponse:
    """Generate an AI_DRAFT MCQ payload.

    The artifact is NOT persisted by this endpoint. The author UI shows
    the draft + marker; the author edits and submits via the standard
    `POST /content/questions` flow, where the marker lands on
    `questions.ai_origin` and edit_distance is computed at submit time.
    The marker carries the AI Content Guardrail verdict (re-enforced at
    the DRAFT-write boundary).
    """
    try:
        draft, marker = await draft_question(
            gateway,
            request=req,
            creator_id=None,  # auth wires in S45; for now anonymous quota
            engine=engine,
        )
    except NotImplementedError as e:
        raise _problem(
            "type_not_supported",
            str(e),
            http_status=400,
        ) from e
    except QuotaExceededError as e:
        raise _problem(
            "quota_exceeded",
            str(e),
            http_status=429,
            scope=e.scope,
            reset_at=e.reset_at,
        ) from e
    except AIGatewayError as e:
        raise _problem(
            "ai_gateway_error",
            str(e),
            http_status=502,
        ) from e
    return DraftResponse(
        draft=draft.model_dump() if hasattr(draft, "model_dump") else dict(draft),  # type: ignore[arg-type]
        marker=marker,
    )


# ── /bulk-draft — generate N drafts at once for the same topic+type ─────────


class BulkDraftRequest(BaseModel):
    type_id: str = Field(min_length=2, max_length=64)
    topic: str = Field(min_length=2, max_length=400)
    # Cap raised P7 — admins want to seed real banks not 10-question
    # samples. A semaphore in the handler caps concurrent OpenAI calls
    # so a 100-count request doesn't fan out into 100 parallel
    # round-trips and trip rate limits / burn quota.
    count: int = Field(default=3, ge=1, le=100)
    difficulty: str = Field(default="MEDIUM", pattern="^(EASY|MEDIUM|HARD)$")
    exam: str = Field(default="JEE-MAIN", min_length=1, max_length=64)
    syllabus_chapter: str | None = None
    source_material: str | None = Field(default=None, max_length=4000)
    # Save-context — not used for generation, but persisted so a job opened
    # later (via the completion toast, without the form's exam/topic selected)
    # can still Save all: the canonical topic id, its title, and language.
    topic_id: str | None = None
    topic_title: str | None = None
    language: str | None = None


# Bound on parallel OpenAI calls per /bulk-draft request. Picked to
# match the lower end of OpenAI's per-org concurrent-request limit
# while still finishing 100 items in roughly 100/MAX_PARALLEL × ~3s
# ≈ 30s — under the nginx 600s read timeout with plenty of headroom.
MAX_PARALLEL_DRAFTS = 10


class BulkDraftItem(BaseModel):
    index: int
    draft: dict[str, Any] | None = None
    marker: AIDraftMarker | None = None
    error: str | None = None


class BulkDraftResponse(BaseModel):
    items: list[BulkDraftItem]
    requested: int
    succeeded: int


@router.post("/bulk-draft", response_model=BulkDraftResponse)
async def post_bulk_draft(
    req: BulkDraftRequest,
    gateway: AIGateway = Depends(get_gateway),
    engine: GuardrailEngine | None = Depends(get_guardrail_engine),
) -> BulkDraftResponse:
    """Generate `count` AI drafts in parallel for the same (type, topic).

    Each item is independent — partial failures don't block the others.
    The author UI lists the results; per-item "Use" loads it into the
    main form, "Save as draft" persists via the standard
    POST /content/questions flow (same auth / quality-check path).
    """
    import asyncio

    base_req = DraftQuestionRequest(
        type_id=req.type_id,  # type: ignore[arg-type]
        topic=req.topic,
        difficulty=req.difficulty,  # type: ignore[arg-type]
        exam=req.exam,
        syllabus_chapter=req.syllabus_chapter,
        source_material=req.source_material,
    )

    sem = asyncio.Semaphore(MAX_PARALLEL_DRAFTS)

    async def _one(idx: int) -> BulkDraftItem:
        # Throttle: never more than MAX_PARALLEL_DRAFTS in-flight at
        # once. asyncio.gather still launches all tasks; the semaphore
        # gates the actual OpenAI call inside each.
        async with sem:
            try:
                draft, marker = await draft_question(
                    gateway,
                    request=base_req,
                    creator_id=None,
                    engine=engine,
                )
                return BulkDraftItem(
                    index=idx,
                    draft=draft.model_dump() if hasattr(draft, "model_dump") else dict(draft),  # type: ignore[arg-type]
                    marker=marker,
                )
            except QuotaExceededError as e:
                return BulkDraftItem(index=idx, error=f"quota_exceeded: {e}")
            except NotImplementedError as e:
                return BulkDraftItem(index=idx, error=f"type_not_supported: {e}")
            except AIGatewayError as e:
                return BulkDraftItem(index=idx, error=f"ai_gateway_error: {e}")
            except Exception as e:
                return BulkDraftItem(index=idx, error=f"unexpected: {type(e).__name__}: {e}")

    results = await asyncio.gather(*(_one(i) for i in range(req.count)))
    succeeded = sum(1 for r in results if r.draft is not None)
    return BulkDraftResponse(
        items=results,
        requested=req.count,
        succeeded=succeeded,
    )


# ── /bulk-draft-job — async + chunked bulk generation ──────────────────────────
#
# The synchronous /bulk-draft above can't scale past ~10 before the proxy
# times out. This runs the same per-item generation as a background job,
# chunked, so an author can request 100-300 questions and review them once
# the whole batch is done. Bulk jobs pass creator_id=None, so they're exempt
# from the per-creator daily quota (only the platform per-minute rate applies,
# which the chunked bounded concurrency stays under).

# Questions per chunk. Each chunk's items run in parallel (bounded by
# MAX_PARALLEL_DRAFTS); chunks run in sequence so a 300-count job paces itself
# and persists progress after every chunk.
BULK_CHUNK_SIZE = 12
# Per-item attempts before an item is recorded as a (retryable) error.
BULK_ITEM_ATTEMPTS = 3


def _now_iso() -> str:
    import datetime as _dt

    return _dt.datetime.now(tz=_dt.UTC).isoformat()


class BulkDraftJobRequest(BulkDraftRequest):
    # Async path lifts the cap from 100 to 300 — the job paces itself.
    count: int = Field(default=30, ge=1, le=300)


class BulkDraftJobRef(BaseModel):
    jobId: str
    status: str


class BulkProgress(BaseModel):
    done: int
    total: int


class BulkJobContext(BaseModel):
    """Authoring context persisted with the job so it can be saved later even
    when opened without the form's exam/topic selected (via the toast)."""

    topicId: str | None = None
    topicTitle: str | None = None
    typeId: str | None = None
    exam: str | None = None
    language: str | None = None
    difficulty: str | None = None


class BulkDraftJobResult(BaseModel):
    jobId: str
    status: str
    result: BulkDraftResponse | None = None
    progress: BulkProgress | None = None
    context: BulkJobContext | None = None
    error: str | None = None


class BulkDraftJobSummary(BaseModel):
    jobId: str
    status: str
    topic: str | None = None
    count: int | None = None
    progress: BulkProgress | None = None
    createdAt: str | None = None
    completedAt: str | None = None


class BulkDraftJobList(BaseModel):
    jobs: list[BulkDraftJobSummary]


async def run_bulk_draft_job(
    job_id: str,
    req: BulkDraftJobRequest,
    gateway: AIGateway,
    engine: GuardrailEngine | None,
    done_items: list[dict[str, Any]] | None = None,
) -> None:
    """Background worker — generate `req.count` drafts in chunks, persisting
    progress after every chunk so the job (a) shows live progress, (b) is
    never falsely timed out while progressing, and (c) can resume after a
    restart from `done_items`. Never raises; per-item failures are captured
    after BULK_ITEM_ATTEMPTS retries.
    """
    base_req = DraftQuestionRequest(
        type_id=req.type_id,  # type: ignore[arg-type]
        topic=req.topic,
        difficulty=req.difficulty,  # type: ignore[arg-type]
        exam=req.exam,
        syllabus_chapter=req.syllabus_chapter,
        source_material=req.source_material,
    )
    sem = asyncio.Semaphore(MAX_PARALLEL_DRAFTS)

    async def _one(idx: int) -> BulkDraftItem:
        async with sem:
            last_err = "unknown"
            for attempt in range(BULK_ITEM_ATTEMPTS):
                try:
                    draft, marker = await draft_question(
                        gateway,
                        request=base_req,
                        creator_id=None,
                        engine=engine,
                    )
                    return BulkDraftItem(
                        index=idx,
                        draft=draft.model_dump() if hasattr(draft, "model_dump") else dict(draft),  # type: ignore[arg-type]
                        marker=marker,
                    )
                except QuotaExceededError as e:
                    return BulkDraftItem(index=idx, error=f"quota_exceeded: {e}")
                except NotImplementedError as e:
                    return BulkDraftItem(index=idx, error=f"type_not_supported: {e}")
                except (AIGatewayError, Exception) as e:
                    # Transient (provider blip, timeout) — back off and retry.
                    last_err = f"{type(e).__name__}: {e}"
                    if attempt < BULK_ITEM_ATTEMPTS - 1:
                        await asyncio.sleep(1.5 * (attempt + 1))
            return BulkDraftItem(index=idx, error=f"failed_after_retries: {last_err}")

    # Resume: items already generated before a restart are kept; only the
    # remaining indices are produced.
    items: list[BulkDraftItem] = [BulkDraftItem(**it) for it in (done_items or [])]
    start_at = len(items)

    def _output(done: int) -> dict[str, Any]:
        return {
            # mode="json" so the marker's datetime serializes to a string.
            "items": [it.model_dump(mode="json") for it in items],
            "requested": req.count,
            "succeeded": sum(1 for r in items if r.draft is not None),
            "progress": {"done": done, "total": req.count},
            "heartbeat": _now_iso(),
        }

    try:
        for start in range(start_at, req.count, BULK_CHUNK_SIZE):
            idxs = range(start, min(start + BULK_CHUNK_SIZE, req.count))
            items.extend(await asyncio.gather(*(_one(i) for i in idxs)))
            # Persist progress + heartbeat after each chunk (keeps status pending).
            async with content_sessionmaker()() as s:
                await update_bulk_progress(s, job_id=job_id, output=_output(len(items)))
                await s.commit()
        final = _output(len(items))
        final.pop("heartbeat", None)
        async with content_sessionmaker()() as s:
            await complete_bulk_job(s, job_id=job_id, output=final)
            await s.commit()
    except Exception as e:
        log.warning("bulk_draft.job_failed", extra={"job_id": job_id, "err": str(e)[:300]})
        async with content_sessionmaker()() as s:
            await fail_bulk_job(s, job_id=job_id, error=str(e) or e.__class__.__name__)
            await s.commit()


@router.post("/bulk-draft-job", status_code=202, response_model=BulkDraftJobRef)
async def post_bulk_draft_job(
    req: BulkDraftJobRequest,
    background: BackgroundTasks,
    principal: PrincipalDep,
    gateway: AIGateway = Depends(get_gateway),
    engine: GuardrailEngine | None = Depends(get_guardrail_engine),
) -> BulkDraftJobRef:
    """Enqueue a chunked bulk-generation job; returns its id immediately. The
    author is free to navigate away; a poller surfaces completion."""
    async with content_sessionmaker()() as s:
        job_id = await create_bulk_job(
            s, request_input=req.model_dump(), requested_by=principal.user_id
        )
        await s.commit()
    background.add_task(run_bulk_draft_job, job_id, req, gateway, engine)
    return BulkDraftJobRef(jobId=job_id, status="pending")


@router.get("/bulk-draft-jobs", response_model=BulkDraftJobList)
async def list_bulk_draft_jobs(principal: PrincipalDep) -> BulkDraftJobList:
    """The requesting author's active + recently-completed bulk jobs."""
    async with content_sessionmaker()() as s:
        jobs = await list_bulk_jobs(s, requested_by=principal.user_id)
    return BulkDraftJobList(jobs=[BulkDraftJobSummary(**j) for j in jobs])


@router.get("/bulk-draft-job/{job_id}", response_model=BulkDraftJobResult)
async def get_bulk_draft_job(job_id: str, principal: PrincipalDep) -> BulkDraftJobResult:
    """Status + accumulated drafts for one bulk job, scoped to the requester."""
    async with content_sessionmaker()() as s:
        job = await get_bulk_job(s, job_id=job_id, requested_by=principal.user_id)
    if job is None:
        raise _problem("not_found", "No such bulk job.", http_status=404)
    return BulkDraftJobResult(
        jobId=job["jobId"],
        status=job["status"],
        result=BulkDraftResponse(**job["result"]) if job["result"] else None,
        progress=BulkProgress(**job["progress"]) if job.get("progress") else None,
        context=BulkJobContext(**job["context"]) if job.get("context") else None,
        error=job["error"],
    )


async def resume_pending_bulk_jobs(gateway: AIGateway, engine: GuardrailEngine | None) -> int:
    """Startup recovery — re-launch any bulk job left 'pending' by a previous
    process (restart / crash). Resumes from persisted partial output, so no
    work is redone and nothing is lost. Returns the count resumed."""
    async with content_sessionmaker()() as s:
        jobs = await list_resumable_bulk_jobs(s)
    resumed = 0
    for j in jobs:
        try:
            req = BulkDraftJobRequest(**j["request"])
        except Exception as e:
            log.warning(
                "bulk_draft.resume_bad_request", extra={"job_id": j["jobId"], "err": str(e)[:200]}
            )
            continue
        done_items = (
            (j.get("output") or {}).get("items") if isinstance(j.get("output"), dict) else None
        )
        import asyncio as _asyncio

        _asyncio.create_task(
            run_bulk_draft_job(j["jobId"], req, gateway, engine, done_items=done_items)
        )
        resumed += 1
    if resumed:
        log.info("bulk_draft.resumed_pending_jobs", extra={"count": resumed})
    return resumed


# ── /explanation ─────────────────────────────────────────────────────────────


class ExplanationRequest(BaseModel):
    stem: str = Field(min_length=4, max_length=4000)
    answer: str = Field(min_length=1, max_length=4000)


@router.post("/explanation", response_model=ExplanationOutput)
async def post_explanation(
    req: ExplanationRequest,
    gateway: AIGateway = Depends(get_gateway),
) -> ExplanationOutput:
    """Expand a stem + answer into a step-by-step explanation."""
    try:
        return await expand_explanation(gateway, stem=req.stem, answer=req.answer)
    except QuotaExceededError as e:
        raise _problem(
            "quota_exceeded",
            str(e),
            http_status=429,
            scope=e.scope,
            reset_at=e.reset_at,
        ) from e
    except AIGatewayError as e:
        raise _problem("ai_gateway_error", str(e), http_status=502) from e


# ── /distractors ─────────────────────────────────────────────────────────────


class DistractorsRequest(BaseModel):
    stem: str = Field(min_length=4, max_length=4000)
    correct_answer: str = Field(min_length=1, max_length=4000)
    n: int = Field(default=3, ge=3, le=5)


@router.post("/distractors", response_model=DistractorsOutput)
async def post_distractors(
    req: DistractorsRequest,
    gateway: AIGateway = Depends(get_gateway),
) -> DistractorsOutput:
    """Suggest plausible distractors for an MCQ stem + correct answer."""
    try:
        return await suggest_distractors(
            gateway,
            stem=req.stem,
            correct_answer=req.correct_answer,
            n=req.n,
        )
    except QuotaExceededError as e:
        raise _problem(
            "quota_exceeded",
            str(e),
            http_status=429,
            scope=e.scope,
            reset_at=e.reset_at,
        ) from e
    except AIGatewayError as e:
        raise _problem("ai_gateway_error", str(e), http_status=502) from e


# ── /quality-check ───────────────────────────────────────────────────────────


class QualityCheckRequest(BaseModel):
    """Minimal MCQ shape for the 3 v1 quality checks. Caller passes the
    payload as it stands today (pre-publish or already-published); the
    Gateway-fronted checks are read-only."""

    stem: str = Field(min_length=4, max_length=4000)
    correct_id: str = Field(min_length=1, max_length=8)
    options: dict[str, str] = Field(min_length=2, max_length=8)
    nearest_neighbour: tuple[str, float] | None = None
    # When the caller has run a precomputed embedding-similarity search
    # against the existing question bank, supply (text, cosine). Absent
    # → duplicate-detection check is skipped.


class QualityCheckResponse(BaseModel):
    warnings: list[QualityWarning]


@router.post("/quality-check", response_model=QualityCheckResponse)
async def post_quality_check(
    req: QualityCheckRequest,
    gateway: AIGateway = Depends(get_gateway),
) -> QualityCheckResponse:
    """Run the 3 v1 AI quality checks. Surfaces warnings; never blocks
    submit — the moderation queue renders these to reviewers per ADR-0019.

    Each check fails open: a Gateway error on one check does not block
    the others. AIGatewayError on construction (no providers wired) is
    handled at the dependency layer and returns 503.
    """
    if req.correct_id not in req.options:
        raise _problem(
            "correct_id_not_in_options",
            f"correct_id={req.correct_id!r} not present in options",
            http_status=400,
        )
    try:
        warnings = await run_quality_checks(
            gateway,
            stem=req.stem,
            correct_id=req.correct_id,
            options=req.options,
            nearest_neighbour=req.nearest_neighbour,
        )
    except QuotaExceededError as e:
        raise _problem(
            "quota_exceeded",
            str(e),
            http_status=429,
            scope=e.scope,
            reset_at=e.reset_at,
        ) from e
    return QualityCheckResponse(warnings=warnings)


# ── /edit-distance ───────────────────────────────────────────────────────────


class EditDistanceRequest(BaseModel):
    """Pure-function helper exposed as a route so the author UI can
    preview "your edits changed: stem (47 chars), options[1].text
    (12 chars), correct_id (unchanged)" without the moderation queue
    needing to compute it.

    Server-side because the canonical Levenshtein implementation lives
    in `ai_authoring.draft._levenshtein` and we don't want a second
    JS implementation drifting out of sync.
    """

    original: dict[str, Any]
    current: dict[str, Any]


class EditDistanceResponse(BaseModel):
    distances: dict[str, int]


@router.post("/edit-distance", response_model=EditDistanceResponse)
async def post_edit_distance(req: EditDistanceRequest) -> EditDistanceResponse:
    """Compute per-field Levenshtein. Pure — no Gateway dependency."""
    return EditDistanceResponse(distances=compute_edit_distance(req.original, req.current))
