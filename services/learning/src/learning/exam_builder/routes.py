"""POST /admin/exam-builder/research + /admin/exam-builder/save.

Research takes a free-form exam name (e.g. "UPSC CSE Mains") and a
level hint, calls OpenAI for a structured draft of subjects + topics
+ optional pools, and returns the proposal. No DB writes — admin
reviews and edits before the second call.

Save takes an admin-reviewed proposal and writes it transactionally
to catalog_schema.

Auth: PLATFORM_ADMIN only. Other roles get 403.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Annotated, Any, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

# AI generation routes through the admin-managed provider chain
# (AI Providers screen → content_schema.ai_provider_config: Ollama /
# OpenAI / Anthropic in priority order, keys encrypted server-side) —
# never a bare OPENAI_API_KEY env var. _list_enabled tells us whether
# any provider is switched on so we can 503 with an actionable message.
from learning.ai_providers import call_structured
from learning.ai_providers.fallback import _list_enabled
from learning.catalog.db import get_session
from learning.content.db import sessionmaker as content_sessionmaker
from learning.content.repositories import insert_question
from learning.content.security import JwtPrincipal, current_principal
from learning.exam_builder.job_repo import (
    complete_research_job,
    create_research_job,
    fail_research_job,
    get_research_job,
    list_research_jobs,
)

log = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/exam-builder", tags=["admin", "exam-builder"])

PrincipalDep = Annotated[JwtPrincipal, Depends(current_principal)]
SessionDep = Annotated[AsyncSession, Depends(get_session)]


def _require_admin(principal: JwtPrincipal) -> None:
    if principal.role not in ("PLATFORM_ADMIN", "INSTITUTION_ADMIN"):
        raise HTTPException(
            status_code=403,
            detail={"code": "forbidden", "message": "exam builder requires admin role"},
        )


# ─────────────────────────────────────────────────────────────────────
# Schemas — shared by research output + save input
# ─────────────────────────────────────────────────────────────────────


class TopicDraft(BaseModel):
    code: str = Field(min_length=1, max_length=80)
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=500)


class SubjectDraft(BaseModel):
    code: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    is_mandatory: bool = True
    pool_code: str | None = Field(default=None, max_length=40)
    topics: list[TopicDraft] = Field(default_factory=list)


class PoolDraft(BaseModel):
    code: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    pick_min: int = Field(ge=0, default=1)
    pick_max: int = Field(ge=1, default=1)


class ExamProposal(BaseModel):
    code: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=120)
    subtitle: str | None = Field(default=None, max_length=300)
    pools: list[PoolDraft] = Field(default_factory=list)
    subjects: list[SubjectDraft] = Field(min_length=1, max_length=80)
    notes: str | None = Field(default=None, max_length=2000)


# ── Async research job envelopes ─────────────────────────────────────


class ResearchJobRef(BaseModel):
    """Returned by POST /research — the handle to poll."""

    jobId: str
    status: str


class ResearchJobResult(BaseModel):
    """Returned by GET /research/{job_id} — status + the proposal once ready."""

    jobId: str
    status: str
    result: dict[str, Any] | None = None
    error: str | None = None


class ResearchJobSummary(BaseModel):
    """One row in the poller's job list."""

    jobId: str
    status: str
    examCode: str | None = None
    examName: str | None = None
    createdAt: str | None = None
    completedAt: str | None = None


class ResearchJobList(BaseModel):
    jobs: list[ResearchJobSummary]


# ─────────────────────────────────────────────────────────────────────
# Research endpoint — calls OpenAI
# ─────────────────────────────────────────────────────────────────────


# Current structure passed on a "re-analyze" so the AI proposes a delta
# (keep existing codes, add new, drop outdated) instead of researching fresh.
class ExistingTopic(BaseModel):
    code: str
    title: str | None = None


class ExistingSubject(BaseModel):
    code: str
    name: str | None = None
    topics: list[ExistingTopic] = Field(default_factory=list)


class ExistingStructure(BaseModel):
    subjects: list[ExistingSubject] = Field(default_factory=list)


class ResearchRequest(BaseModel):
    code: str = Field(min_length=2, max_length=40)
    name: str = Field(min_length=2, max_length=120)
    level: Literal[
        "school", "competitive_undergrad", "competitive_postgrad", "civil_services", "language", "professional", "other"
    ] = "other"
    target_year: int | None = Field(default=None, ge=2020, le=2050)
    notes: str | None = Field(
        default=None,
        max_length=1000,
        description="Free-form admin hints, e.g. 'UPSC Mains 2027 — qualifying papers + 4 GS + 1 optional'",
    )
    # Present on a re-analyze of an existing exam — triggers delta mode.
    existing: ExistingStructure | None = None


SYSTEM_PROMPT = """You are an expert academic content architect helping a learning
platform model the canonical structure of competitive exams and
school syllabi for the Indian education ecosystem.

For each exam you produce a STRICT JSON object describing:
  - subjects: the canonical list (e.g. for JEE Main: Physics, Chemistry, Mathematics).
  - pools: optional groupings where students choose N of M subjects
    (e.g. UPSC Mains "Optional Subject" pool with 26 candidates and pick_min=pick_max=1).
  - topics per subject: 8-20 chapter-grain topics drawn from the official
    syllabus or NCERT/NCERT-equivalent. Topic titles are short
    (≤80 chars) and use proper-case English.
  - is_mandatory: true if every student takes the subject, false if
    the subject is in a pool (then `pool_code` references the pool).

Hard rules:
  - Subject codes are ALL_CAPS_SNAKE (e.g. UPSC_GS_PAPER_1).
  - Topic codes are AT MOST 80 chars, ALL_CAPS_SNAKE.
  - Topic titles avoid trailing punctuation.
  - When the exam has *no* optional choice (JEE / NEET / CBSE), pools is [].
  - When there IS a pool, every member subject MUST set is_mandatory=false
    and pool_code MUST match an entry in pools[].
  - 8-20 topics per subject. Don't pad or repeat.
  - Cover the official syllabus when known; if unknown, set notes
    explaining the assumption.
"""

# JSON schema we ask OpenAI to satisfy. Mirrors ExamProposal.
PROPOSAL_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["code", "name", "subtitle", "pools", "subjects", "notes"],
    "properties": {
        "code": {"type": "string"},
        "name": {"type": "string"},
        "subtitle": {"type": ["string", "null"]},
        "pools": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["code", "name", "description", "pick_min", "pick_max"],
                "properties": {
                    "code": {"type": "string"},
                    "name": {"type": "string"},
                    "description": {"type": ["string", "null"]},
                    "pick_min": {"type": "integer"},
                    "pick_max": {"type": "integer"},
                },
            },
        },
        "subjects": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": [
                    "code", "name", "description", "is_mandatory", "pool_code", "topics",
                ],
                "properties": {
                    "code": {"type": "string"},
                    "name": {"type": "string"},
                    "description": {"type": ["string", "null"]},
                    "is_mandatory": {"type": "boolean"},
                    "pool_code": {"type": ["string", "null"]},
                    "topics": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": ["code", "title", "description"],
                            "properties": {
                                "code": {"type": "string"},
                                "title": {"type": "string"},
                                "description": {"type": ["string", "null"]},
                            },
                        },
                    },
                },
            },
        },
        "notes": {"type": ["string", "null"]},
    },
}

# ── Chunked research schemas ─────────────────────────────────────────
#
# A full exam tree (every subject x 8-20 topics) is too large for the
# claude_code CLI to emit in one synchronous call — it runs past any
# sane web timeout. So research runs in two passes:
#   1. SKELETON_SCHEMA — code/name/pools + the subject LIST (no topics).
#   2. TOPICS_SCHEMA — one small call per subject, run bounded-parallel.
# Each call is "authoring-sized", so none can time out, and the assembled
# result is the same ExamProposal the UI already expects.

# Skeleton = PROPOSAL_SCHEMA minus the per-subject `topics` array.
SKELETON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["code", "name", "subtitle", "pools", "subjects", "notes"],
    "properties": {
        "code": {"type": "string"},
        "name": {"type": "string"},
        "subtitle": {"type": ["string", "null"]},
        "pools": PROPOSAL_SCHEMA["properties"]["pools"],
        "subjects": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": [
                    "code", "name", "description", "is_mandatory", "pool_code",
                ],
                "properties": {
                    "code": {"type": "string"},
                    "name": {"type": "string"},
                    "description": {"type": ["string", "null"]},
                    "is_mandatory": {"type": "boolean"},
                    "pool_code": {"type": ["string", "null"]},
                },
            },
        },
        "notes": {"type": ["string", "null"]},
    },
}

# Per-subject topics — a small object wrapping the topic list.
TOPICS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["topics"],
    "properties": {
        "topics": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["code", "title", "description"],
                "properties": {
                    "code": {"type": "string"},
                    "title": {"type": "string"},
                    "description": {"type": ["string", "null"]},
                },
            },
        },
    },
}

TOPIC_SYSTEM_PROMPT = """You are an expert academic content architect. Given an exam
and ONE of its subjects, list that subject's canonical chapter-grain topics.

Hard rules:
  - 8-20 topics, drawn from the official syllabus or NCERT/NCERT-equivalent.
  - Topic codes are ALL_CAPS_SNAKE and AT MOST 80 chars.
  - Topic titles are short (proper-case English), no trailing punctuation.
  - Cover the real syllabus for this subject. Don't pad or repeat.
"""

# Bound concurrent per-subject topic calls. Matches the claude_code CLI
# concurrency cap so we saturate it without opening a DB session per
# subject all at once on large exams.
_TOPIC_CONCURRENCY = 4


class ResearchError(Exception):
    """A handled generation failure. The worker records the message on the
    job row; never escapes as an HTTP error (research runs in the
    background after the response is already sent)."""


async def generate_topics_for_subject(
    *,
    exam_name: str,
    exam_code: str,
    level: str,
    subject_code: str,
    subject_name: str,
    existing_topics: list[ExistingTopic],
    notes: str | None = None,
    target_year: int | None = None,
) -> list[TopicDraft]:
    """Generate the canonical topic list for ONE subject. Delta-seeds the
    prompt with existing topic codes so re-runs preserve codes (clean diff).
    Raises ResearchError on empty/invalid output. Shared by the full-exam
    research flow, the sync per-subject endpoint, and the bulk fill worker.
    """
    base_ctx = (
        f"Exam name: {exam_name}\n"
        f"Exam code (admin-supplied): {exam_code}\n"
        f"Level: {level}\n"
        + (f"Target year: {target_year}\n" if target_year else "")
        + (f"Admin notes: {notes}\n" if notes else "")
    )
    user = (
        base_ctx
        + f"\nSubject: {subject_name} (code {subject_code})\n"
        + "List 8-20 canonical chapter-grain topics for THIS subject only."
    )
    if existing_topics:
        current = "; ".join(f"{t.code} ({t.title or t.code})" for t in existing_topics)
        user += (
            f"\n\nThis subject already has these topics: {current}. "
            "KEEP the same `code` for topics that still belong, ADD new "
            "ones, and OMIT only genuinely outdated ones."
        )
    async with content_sessionmaker()() as s:
        raw = await call_structured(
            s, system=TOPIC_SYSTEM_PROMPT, user=user,
            schema_name="subject_topics", schema=TOPICS_SCHEMA,
        )
    if raw is None:
        raise ResearchError(f"AI returned no topics for subject {subject_code}.")
    try:
        return [TopicDraft.model_validate(t) for t in raw.get("topics", [])]
    except Exception as e:  # noqa: BLE001
        raise ResearchError(f"AI returned invalid topics for {subject_code}: {e}") from e


async def _generate_proposal(req: ResearchRequest) -> ExamProposal:
    """The chunked generation: one small skeleton call, then one small
    topics call per subject in bounded parallel — so no single LLM call has
    to emit the whole tree. Raises ResearchError on any handled failure.
    """
    base_ctx = (
        f"Exam name: {req.name}\n"
        f"Exam code (admin-supplied): {req.code}\n"
        f"Level: {req.level}\n"
        + (f"Target year: {req.target_year}\n" if req.target_year else "")
        + (f"Admin notes: {req.notes}\n" if req.notes else "")
    )

    # Delta mode: when re-analyzing an existing exam, seed the current
    # structure so the AI preserves codes (clean diff) rather than churning.
    existing_subjects = req.existing.subjects if req.existing else []
    existing_by_code = {s.code: s for s in existing_subjects}
    skeleton_delta = ""
    if existing_subjects:
        current = "; ".join(
            f"{s.code} ({s.name or s.code})" for s in existing_subjects
        )
        skeleton_delta = (
            "\n\nThis exam ALREADY EXISTS. Its current subjects are: "
            f"{current}. Re-analyse the syllabus: KEEP the same `code` for "
            "subjects that still belong, ADD subjects now relevant, and OMIT "
            "only genuinely outdated ones. Do not rename codes for concepts "
            "that already exist."
        )

    # ── Pass 1: skeleton (subjects + pools, no topics) ──────────────
    async with content_sessionmaker()() as ai_sess:
        skeleton_raw = await call_structured(
            ai_sess,
            system=SYSTEM_PROMPT,
            user=base_ctx
            + "\nProduce ONLY the exam SKELETON: code, name, subtitle, pools, "
            "and the subject list (each with code, name, description, "
            "is_mandatory, pool_code). Do NOT include topics — those are "
            "generated in a separate step."
            + skeleton_delta,
            schema_name="exam_skeleton",
            schema=SKELETON_SCHEMA,
        )
    if skeleton_raw is None:
        raise ResearchError("AI returned no usable skeleton. Try again or use the manual form.")

    try:
        pools = [PoolDraft.model_validate(p) for p in skeleton_raw.get("pools", [])]
        subjects = [
            SubjectDraft.model_validate({**s, "topics": []})
            for s in skeleton_raw.get("subjects", [])
        ]
    except Exception as e:
        log.warning("research.skeleton_invalid", extra={"err": str(e)})
        raise ResearchError(f"AI returned an invalid skeleton: {e}") from e

    if not subjects:
        raise ResearchError("AI returned no subjects.")

    # ── Pass 2: topics per subject, bounded-parallel ────────────────
    sema = asyncio.Semaphore(_TOPIC_CONCURRENCY)

    async def _fill_topics(subject: SubjectDraft) -> None:
        ex = existing_by_code.get(subject.code)
        existing_topics = ex.topics if ex else []
        async with sema:
            subject.topics = await generate_topics_for_subject(
                exam_name=req.name,
                exam_code=req.code,
                level=req.level,
                subject_code=subject.code,
                subject_name=subject.name,
                existing_topics=existing_topics,
                notes=req.notes,
                target_year=req.target_year,
            )

    await asyncio.gather(*(_fill_topics(s) for s in subjects))

    proposal = ExamProposal(
        code=skeleton_raw.get("code") or req.code,
        name=skeleton_raw.get("name") or req.name,
        subtitle=skeleton_raw.get("subtitle"),
        pools=pools,
        subjects=subjects,
        notes=skeleton_raw.get("notes"),
    )

    # Reconcile subject ↔ pool consistency. Rather than failing a multi-minute
    # job over one inconsistent subject, coerce to a sane default — the admin
    # re-pools in review. Mandatory subjects never sit in a pool; an optional
    # subject with a missing/unknown pool falls back to mandatory.
    pool_codes = {p.code for p in proposal.pools}
    for s in proposal.subjects:
        if s.is_mandatory:
            s.pool_code = None
        elif s.pool_code is None or s.pool_code not in pool_codes:
            log.info("research.coerced_orphan_optional", extra={"code": s.code})
            s.is_mandatory = True
            s.pool_code = None
    return proposal


async def run_research_job(job_id: str, req: ResearchRequest) -> None:
    """Background worker: generate the proposal and record it on the job
    row. Never raises — failures land in `error_message`."""
    try:
        proposal = await _generate_proposal(req)
        async with content_sessionmaker()() as s:
            await complete_research_job(s, job_id=job_id, output=proposal.model_dump())
            await s.commit()
    except Exception as e:
        log.warning("research.job_failed", extra={"job_id": job_id, "err": str(e)[:300]})
        async with content_sessionmaker()() as s:
            await fail_research_job(s, job_id=job_id, error=str(e) or e.__class__.__name__)
            await s.commit()


@router.post("/research", status_code=202, response_model=ResearchJobRef)
async def research(
    req: ResearchRequest, principal: PrincipalDep, background: BackgroundTasks
) -> ResearchJobRef:
    """Enqueue a background research job and return its id immediately. The
    admin is free to navigate away; a poller surfaces completion. The
    provider-availability check runs synchronously so an unconfigured stack
    fails fast (503) instead of enqueuing a doomed job.
    """
    _require_admin(principal)

    async with content_sessionmaker()() as s:
        if not await _list_enabled(s):
            raise HTTPException(
                status_code=503,
                detail={
                    "code": "ai_unavailable",
                    "message": (
                        "No AI provider is enabled. Configure one on the "
                        "AI Providers screen, or use the manual exam form."
                    ),
                },
            )
        job_id = await create_research_job(
            s, request_input=req.model_dump(), requested_by=principal.user_id
        )
        await s.commit()

    background.add_task(run_research_job, job_id, req)
    return ResearchJobRef(jobId=job_id, status="pending")


@router.get("/research/jobs", response_model=ResearchJobList)
async def list_jobs(principal: PrincipalDep) -> ResearchJobList:
    """The requesting admin's active + recently-completed research jobs —
    drives the in-app poller/toast."""
    _require_admin(principal)
    async with content_sessionmaker()() as s:
        jobs = await list_research_jobs(s, requested_by=principal.user_id)
    return ResearchJobList(jobs=[ResearchJobSummary(**j) for j in jobs])


@router.get("/research/{job_id}", response_model=ResearchJobResult)
async def get_job(job_id: str, principal: PrincipalDep) -> ResearchJobResult:
    """Status + result for one research job, scoped to the requesting admin."""
    _require_admin(principal)
    async with content_sessionmaker()() as s:
        job = await get_research_job(s, job_id=job_id, requested_by=principal.user_id)
    if job is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "not_found", "message": "No such research job."},
        )
    return ResearchJobResult(
        jobId=job["jobId"],
        status=job["status"],
        result=job["result"],
        error=job["error"],
    )


# ─────────────────────────────────────────────────────────────────────
# Per-subject topic generation — synchronous (one fast LLM call)
# ─────────────────────────────────────────────────────────────────────


class SubjectRef(BaseModel):
    code: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=120)


class SubjectTopicsRequest(BaseModel):
    code: str = Field(min_length=2, max_length=40)
    name: str = Field(min_length=2, max_length=120)
    level: str = "other"
    subject: SubjectRef
    existing: list[ExistingTopic] = Field(default_factory=list)
    notes: str | None = Field(default=None, max_length=1000)
    target_year: int | None = Field(default=None, ge=2020, le=2050)


class SubjectTopicsResponse(BaseModel):
    topics: list[TopicDraft]


@router.post("/subjects/topics", response_model=SubjectTopicsResponse)
async def generate_subject_topics(
    req: SubjectTopicsRequest, principal: PrincipalDep
) -> SubjectTopicsResponse:
    """Generate (or regenerate) the topic list for ONE subject, synchronously.
    A single LLM call — fast enough to await inline. The result is returned to
    the editor; nothing is persisted until the admin saves the exam."""
    _require_admin(principal)
    async with content_sessionmaker()() as s:
        if not await _list_enabled(s):
            raise HTTPException(
                status_code=503,
                detail={"code": "ai_unavailable", "message": (
                    "No AI provider is enabled. Configure one on the AI "
                    "Providers screen, or add topics manually.")},
            )
    try:
        topics = await generate_topics_for_subject(
            exam_name=req.name, exam_code=req.code, level=req.level,
            subject_code=req.subject.code, subject_name=req.subject.name,
            existing_topics=req.existing, notes=req.notes, target_year=req.target_year,
        )
    except ResearchError as e:
        raise HTTPException(
            status_code=502,
            detail={"code": "ai_failed", "message": str(e)},
        ) from e
    return SubjectTopicsResponse(topics=topics)


# ─────────────────────────────────────────────────────────────────────
# Bulk async fill-empty topics — enqueue + worker + poller
# ─────────────────────────────────────────────────────────────────────

TOPICS_FILL_TEMPLATE_ID = "exam_topics_fill"


class FillSubject(BaseModel):
    code: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=120)
    existing: list[ExistingTopic] = Field(default_factory=list)


class TopicsFillRequest(BaseModel):
    code: str = Field(min_length=2, max_length=40)
    name: str = Field(min_length=2, max_length=120)
    level: str = "other"
    subjects: list[FillSubject] = Field(min_length=1, max_length=80)
    notes: str | None = Field(default=None, max_length=1000)
    target_year: int | None = Field(default=None, ge=2020, le=2050)


async def run_topics_fill_job(job_id: str, req: TopicsFillRequest) -> None:
    """Background worker: generate topics for each requested subject in
    bounded parallel. Partial-failure tolerant — a subject whose call fails
    records a per-subject error rather than failing the whole batch."""
    sema = asyncio.Semaphore(_TOPIC_CONCURRENCY)

    async def _one(sub: FillSubject) -> dict[str, Any]:
        async with sema:
            try:
                topics = await generate_topics_for_subject(
                    exam_name=req.name, exam_code=req.code, level=req.level,
                    subject_code=sub.code, subject_name=sub.name,
                    existing_topics=sub.existing, notes=req.notes,
                    target_year=req.target_year,
                )
                return {"code": sub.code, "topics": [t.model_dump() for t in topics]}
            except Exception as e:  # noqa: BLE001
                return {"code": sub.code, "topics": [], "error": str(e)[:300]}

    try:
        results = await asyncio.gather(*(_one(s) for s in req.subjects))
        async with content_sessionmaker()() as s:
            await complete_research_job(s, job_id=job_id, output={"subjects": list(results)})
            await s.commit()
    except Exception as e:  # noqa: BLE001
        async with content_sessionmaker()() as s:
            await fail_research_job(s, job_id=job_id, error=str(e) or e.__class__.__name__)
            await s.commit()


@router.post("/topics/fill-empty", status_code=202, response_model=ResearchJobRef)
async def fill_empty_topics(
    req: TopicsFillRequest, principal: PrincipalDep, background: BackgroundTasks
) -> ResearchJobRef:
    """Enqueue a background job that generates topics for the given subjects
    (typically those with 0 topics). Returns a job id to poll."""
    _require_admin(principal)
    async with content_sessionmaker()() as s:
        if not await _list_enabled(s):
            raise HTTPException(
                status_code=503,
                detail={"code": "ai_unavailable", "message": (
                    "No AI provider is enabled. Configure one on the AI "
                    "Providers screen, or add topics manually.")},
            )
        job_id = await create_research_job(
            s, request_input=req.model_dump(), requested_by=principal.user_id,
            template_id=TOPICS_FILL_TEMPLATE_ID,
        )
        await s.commit()
    background.add_task(run_topics_fill_job, job_id, req)
    return ResearchJobRef(jobId=job_id, status="pending")


@router.get("/topics/fill-empty/{job_id}", response_model=ResearchJobResult)
async def get_fill_job(job_id: str, principal: PrincipalDep) -> ResearchJobResult:
    """Status + per-subject result for one bulk fill job."""
    _require_admin(principal)
    async with content_sessionmaker()() as s:
        job = await get_research_job(
            s, job_id=job_id, requested_by=principal.user_id,
            template_id=TOPICS_FILL_TEMPLATE_ID,
        )
    if job is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "No such job."})
    return ResearchJobResult(
        jobId=job["jobId"], status=job["status"],
        result=job["result"], error=job["error"],
    )


# ─────────────────────────────────────────────────────────────────────
# Save endpoint — transactional create
# ─────────────────────────────────────────────────────────────────────


class SaveResponse(BaseModel):
    exam_id: str
    code: str
    subjects_created: int
    topics_created: int
    pools_created: int
    subjects_retired: int = 0
    topics_retired: int = 0
    pools_retired: int = 0


# ─────────────────────────────────────────────────────────────────────
# Load endpoint — fetch existing exam as a proposal (for edit mode)
# ─────────────────────────────────────────────────────────────────────


class ExamListEntry(BaseModel):
    id: str
    code: str
    name: str
    subtitle: str | None = None
    is_published: bool
    subject_count: int
    pool_count: int
    topic_count: int
    question_count: int
    blueprint_count: int


@router.get("/exams", response_model=list[ExamListEntry])
async def list_exams(
    session: SessionDep, principal: PrincipalDep,
) -> list[ExamListEntry]:
    """Admin-only list of every exam (published + retired) with row
    counts. Powers the dashboard table on /exams/new so admins can
    edit existing exams without remembering UUIDs.
    """
    _require_admin(principal)
    res = await session.execute(
        text(
            """
            SELECT e.id, e.code, e.name, e.subtitle, e.is_published,
                   (SELECT COUNT(*) FROM catalog_schema.subjects s
                      WHERE s.exam_id = e.id AND s.is_published = TRUE) AS subject_count,
                   (SELECT COUNT(*) FROM catalog_schema.subject_pools p
                      WHERE p.exam_id = e.id) AS pool_count,
                   (SELECT COUNT(*) FROM catalog_schema.topics t
                      JOIN catalog_schema.subjects s ON s.id = t.subject_id
                     WHERE s.exam_id = e.id AND t.is_published = TRUE
                       AND s.is_published = TRUE) AS topic_count,
                   (SELECT COUNT(*) FROM content_schema.questions q
                     WHERE q.topic_id IN (
                       SELECT t.id FROM catalog_schema.topics t
                         JOIN catalog_schema.subjects s ON s.id = t.subject_id
                        WHERE s.exam_id = e.id)) AS question_count,
                   (SELECT COUNT(*) FROM catalog_schema.exam_blueprints b
                      WHERE b.exam_id = e.id) AS blueprint_count
              FROM catalog_schema.exams e
             ORDER BY e.is_published DESC, e.sort_order, e.name
            """
        )
    )
    return [
        ExamListEntry(
            id=str(r["id"]),
            code=r["code"],
            name=r["name"],
            subtitle=r.get("subtitle"),
            is_published=bool(r["is_published"]),
            subject_count=int(r["subject_count"]),
            pool_count=int(r["pool_count"]),
            topic_count=int(r["topic_count"]),
            question_count=int(r["question_count"]),
            blueprint_count=int(r["blueprint_count"]),
        )
        for r in res.mappings().all()
    ]


# ─────────────────────────────────────────────────────────────────────
# Lifecycle — retire / restore / delete an exam
# ─────────────────────────────────────────────────────────────────────


class RetireResponse(BaseModel):
    exam_id: str
    code: str
    subjects_retired: int
    topics_retired: int


@router.post("/exams/{exam_id}/retire", response_model=RetireResponse)
async def retire_exam(
    exam_id: str, session: SessionDep, principal: PrincipalDep,
) -> RetireResponse:
    """Soft-delete: set is_published=FALSE on the exam + its subjects + topics.
    Idempotent. All rows preserved so FK references stay intact."""
    _require_admin(principal)
    row = (await session.execute(
        text("SELECT code FROM catalog_schema.exams WHERE id = CAST(:eid AS uuid)"),
        {"eid": exam_id},
    )).mappings().first()
    if row is None:
        raise HTTPException(status_code=404,
                            detail={"code": "not_found", "message": "exam not found"})
    subj = await session.execute(
        text("UPDATE catalog_schema.subjects SET is_published = FALSE "
             "WHERE exam_id = CAST(:eid AS uuid) AND is_published = TRUE"),
        {"eid": exam_id})
    top = await session.execute(
        text("UPDATE catalog_schema.topics SET is_published = FALSE "
             "WHERE subject_id IN (SELECT id FROM catalog_schema.subjects "
             "WHERE exam_id = CAST(:eid AS uuid)) AND is_published = TRUE"),
        {"eid": exam_id})
    await session.execute(
        text("UPDATE catalog_schema.exams SET is_published = FALSE "
             "WHERE id = CAST(:eid AS uuid)"),
        {"eid": exam_id})
    await session.commit()
    return RetireResponse(
        exam_id=exam_id, code=row["code"],
        subjects_retired=subj.rowcount or 0, topics_retired=top.rowcount or 0)


class RestoreResponse(BaseModel):
    exam_id: str
    code: str
    subjects_restored: int
    topics_restored: int


@router.post("/exams/{exam_id}/restore", response_model=RestoreResponse)
async def restore_exam(
    exam_id: str, session: SessionDep, principal: PrincipalDep,
) -> RestoreResponse:
    """Re-publish: set is_published=TRUE on the exam + its subjects + topics."""
    _require_admin(principal)
    row = (await session.execute(
        text("SELECT code FROM catalog_schema.exams WHERE id = CAST(:eid AS uuid)"),
        {"eid": exam_id},
    )).mappings().first()
    if row is None:
        raise HTTPException(status_code=404,
                            detail={"code": "not_found", "message": "exam not found"})
    subj = await session.execute(
        text("UPDATE catalog_schema.subjects SET is_published = TRUE "
             "WHERE exam_id = CAST(:eid AS uuid) AND is_published = FALSE"),
        {"eid": exam_id})
    top = await session.execute(
        text("UPDATE catalog_schema.topics SET is_published = TRUE "
             "WHERE subject_id IN (SELECT id FROM catalog_schema.subjects "
             "WHERE exam_id = CAST(:eid AS uuid)) AND is_published = FALSE"),
        {"eid": exam_id})
    await session.execute(
        text("UPDATE catalog_schema.exams SET is_published = TRUE "
             "WHERE id = CAST(:eid AS uuid)"),
        {"eid": exam_id})
    await session.commit()
    return RestoreResponse(
        exam_id=exam_id, code=row["code"],
        subjects_restored=subj.rowcount or 0, topics_restored=top.rowcount or 0)


class DeleteResponse(BaseModel):
    exam_id: str
    code: str
    subjects_deleted: int
    topics_deleted: int
    pools_deleted: int
    blueprints_deleted: int


@router.delete("/exams/{exam_id}", response_model=DeleteResponse)
async def delete_exam(
    exam_id: str, session: SessionDep, principal: PrincipalDep,
) -> DeleteResponse:
    """Permanently delete a content-free exam. Guarded: refuses (409) if the
    exam has any authored questions or blueprints. FK-safe single transaction."""
    _require_admin(principal)
    row = (await session.execute(
        text("SELECT code FROM catalog_schema.exams WHERE id = CAST(:eid AS uuid)"),
        {"eid": exam_id},
    )).mappings().first()
    if row is None:
        raise HTTPException(status_code=404,
                            detail={"code": "not_found", "message": "exam not found"})

    question_count = (await session.execute(
        text("SELECT COUNT(*) FROM content_schema.questions WHERE topic_id IN "
             "(SELECT t.id FROM catalog_schema.topics t "
             " JOIN catalog_schema.subjects s ON s.id = t.subject_id "
             " WHERE s.exam_id = CAST(:eid AS uuid))"),
        {"eid": exam_id})).scalar_one()
    blueprint_count = (await session.execute(
        text("SELECT COUNT(*) FROM catalog_schema.exam_blueprints "
             "WHERE exam_id = CAST(:eid AS uuid)"),
        {"eid": exam_id})).scalar_one()

    if question_count > 0 or blueprint_count > 0:
        raise HTTPException(status_code=409, detail={
            "code": "exam_in_use",
            "questionCount": int(question_count),
            "blueprintCount": int(blueprint_count),
            "message": (f"Exam has {question_count} questions and "
                        f"{blueprint_count} blueprints — retire it instead."),
        })

    eid = {"eid": exam_id}
    # FK-safe order: cross-ref tables → topics → syllabus_chapters → subjects → pools → blueprints → exam.
    try:
        await session.execute(text(
            "DELETE FROM catalog_schema.topic_importance_overrides "
            "WHERE exam_id = CAST(:eid AS uuid)"), eid)
        await session.execute(text(
            "DELETE FROM catalog_schema.educator_assignments "
            "WHERE exam_id = CAST(:eid AS uuid)"), eid)
        top = await session.execute(text(
            "DELETE FROM catalog_schema.topics WHERE subject_id IN "
            "(SELECT id FROM catalog_schema.subjects WHERE exam_id = CAST(:eid AS uuid))"), eid)
        await session.execute(text(
            "DELETE FROM catalog_schema.syllabus_chapters WHERE exam_id = CAST(:eid AS uuid)"), eid)
        subj = await session.execute(text(
            "DELETE FROM catalog_schema.subjects WHERE exam_id = CAST(:eid AS uuid)"), eid)
        pools = await session.execute(text(
            "DELETE FROM catalog_schema.subject_pools WHERE exam_id = CAST(:eid AS uuid)"), eid)
        bps = await session.execute(text(
            "DELETE FROM catalog_schema.exam_blueprints WHERE exam_id = CAST(:eid AS uuid)"), eid)
        await session.execute(text(
            "DELETE FROM catalog_schema.exams WHERE id = CAST(:eid AS uuid)"), eid)
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail={
            "code": "exam_in_use",
            "questionCount": int(question_count),
            "blueprintCount": int(blueprint_count),
            "message": "Exam is still referenced by other catalog records and cannot be deleted.",
        })
    return DeleteResponse(
        exam_id=exam_id, code=row["code"],
        subjects_deleted=subj.rowcount or 0, topics_deleted=top.rowcount or 0,
        pools_deleted=pools.rowcount or 0, blueprints_deleted=bps.rowcount or 0)


@router.get("/exams/{exam_id}", response_model=ExamProposal)
async def load_exam(
    exam_id: str, session: SessionDep, principal: PrincipalDep,
) -> ExamProposal:
    """Load an existing exam's structure into the same shape /save accepts.

    The wizard uses this for edit mode: load → user edits the same form
    fields → /save with the new desired state. Only published rows are
    returned; soft-deleted (is_published=FALSE) rows are excluded.
    """
    _require_admin(principal)
    # 1. exam meta
    res = await session.execute(
        text(
            "SELECT id, code, name, subtitle FROM catalog_schema.exams "
            "WHERE id = CAST(:eid AS uuid)"
        ),
        {"eid": exam_id},
    )
    row = res.mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail="exam not found")
    exam_meta = dict(row)

    # 2. pools
    res = await session.execute(
        text(
            "SELECT id, code, name, description, pick_min, pick_max "
            "FROM catalog_schema.subject_pools "
            "WHERE exam_id = CAST(:eid AS uuid) "
            "ORDER BY sort_order, code"
        ),
        {"eid": exam_id},
    )
    pools_rows = [dict(r) for r in res.mappings().all()]
    pool_code_by_id = {str(p["id"]): p["code"] for p in pools_rows}

    # 3. subjects (only published). Read subtitle (the actual column
    #    name) and surface it as `description` on the proposal.
    res = await session.execute(
        text(
            "SELECT id, code, name, subtitle AS description, is_mandatory, pool_id "
            "FROM catalog_schema.subjects "
            "WHERE exam_id = CAST(:eid AS uuid) AND is_published = TRUE "
            "ORDER BY sort_order, code"
        ),
        {"eid": exam_id},
    )
    subjects_rows = [dict(r) for r in res.mappings().all()]

    # 4. topics for each subject (single batched query)
    subject_ids = [str(s["id"]) for s in subjects_rows]
    topics_by_subject: dict[str, list[dict]] = {sid: [] for sid in subject_ids}
    if subject_ids:
        res = await session.execute(
            text(
                "SELECT subject_id, code, title, description "
                "FROM catalog_schema.topics "
                "WHERE subject_id = ANY(CAST(:sids AS uuid[])) AND is_published = TRUE "
                "ORDER BY sort_order, code"
            ),
            {"sids": subject_ids},
        )
        for tr in res.mappings().all():
            topics_by_subject.setdefault(str(tr["subject_id"]), []).append(
                {"code": tr["code"], "title": tr["title"], "description": tr["description"]}
            )

    return ExamProposal(
        code=exam_meta["code"],
        name=exam_meta["name"],
        subtitle=exam_meta.get("subtitle"),
        pools=[
            PoolDraft(
                code=p["code"],
                name=p["name"],
                description=p.get("description"),
                pick_min=p["pick_min"],
                pick_max=p["pick_max"],
            )
            for p in pools_rows
        ],
        subjects=[
            SubjectDraft(
                code=s["code"],
                name=s["name"],
                description=s.get("description"),
                is_mandatory=s["is_mandatory"],
                pool_code=pool_code_by_id.get(str(s["pool_id"])) if s["pool_id"] else None,
                topics=[TopicDraft(**t) for t in topics_by_subject.get(str(s["id"]), [])],
            )
            for s in subjects_rows
        ],
        notes=None,
    )


@router.post("/save", response_model=SaveResponse)
async def save(
    proposal: ExamProposal,
    session: SessionDep,
    principal: PrincipalDep,
) -> SaveResponse:
    """Persist a (possibly admin-edited) proposal.

    Idempotent on `exam.code` — calling twice with the same code
    returns the existing exam without creating duplicates. Subjects
    and topics within a re-call use ON CONFLICT DO NOTHING so any
    additions land but no row is silently rewritten.
    """
    _require_admin(principal)

    # Re-validate cross-references in case admin hand-edited.
    pool_codes = {p.code for p in proposal.pools}
    for s in proposal.subjects:
        if s.is_mandatory and s.pool_code is not None:
            raise HTTPException(
                status_code=400,
                detail=f"Subject {s.code} is mandatory but has pool_code {s.pool_code}",
            )
        if not s.is_mandatory and s.pool_code is None:
            raise HTTPException(
                status_code=400,
                detail=f"Subject {s.code} is optional but has no pool_code",
            )
        if s.pool_code and s.pool_code not in pool_codes:
            raise HTTPException(
                status_code=400,
                detail=f"Subject {s.code} references unknown pool {s.pool_code}",
            )

    # 1. exam — INSERT … ON CONFLICT (code) DO UPDATE keeps the existing
    #    UUID stable and lets admins re-run save to refresh metadata.
    exam_id = str(uuid.uuid4())
    res = await session.execute(
        text(
            """
            INSERT INTO catalog_schema.exams (id, code, name, subtitle, sort_order, is_published)
            VALUES (CAST(:id AS uuid), :code, :name, :subtitle, COALESCE(
                (SELECT MAX(sort_order) + 1 FROM catalog_schema.exams), 1
            ), TRUE)
            ON CONFLICT (code) DO UPDATE SET
                name = EXCLUDED.name,
                subtitle = EXCLUDED.subtitle
            RETURNING id
            """
        ),
        {
            "id": exam_id,
            "code": proposal.code,
            "name": proposal.name,
            "subtitle": proposal.subtitle,
        },
    )
    exam_id = str(res.scalar_one())

    # 1b. Educator-assignment fanout. The teacher portal's exam picker
    #     is gated on `educator_assignments` — without rows here, the
    #     freshly-created exam is invisible to every TEACHER /
    #     MODERATOR / EXPERT account, and they can't author questions
    #     against it. PLATFORM_ADMINs already bypass that filter.
    #
    #     Default policy: grant exam-wide access to (a) the creating
    #     admin, and (b) every educator who already has any other
    #     assignment in the catalog — they're trusted authors, so a
    #     new exam shouldn't gate them out by default. Tighten this
    #     in prod via the existing /educator-scope admin page.
    await session.execute(
        text(
            """
            INSERT INTO catalog_schema.educator_assignments
                (educator_id, exam_id, subject_id)
            VALUES (CAST(:uid AS uuid), CAST(:eid AS uuid), NULL)
            ON CONFLICT (educator_id, exam_id) WHERE subject_id IS NULL
                DO NOTHING
            """
        ),
        {"uid": principal.user_id, "eid": exam_id},
    )
    await session.execute(
        text(
            """
            INSERT INTO catalog_schema.educator_assignments
                (educator_id, exam_id, subject_id)
            SELECT DISTINCT educator_id, CAST(:eid AS uuid), CAST(NULL AS uuid)
              FROM catalog_schema.educator_assignments
             WHERE exam_id <> CAST(:eid AS uuid)
            ON CONFLICT (educator_id, exam_id) WHERE subject_id IS NULL
                DO NOTHING
            """
        ),
        {"eid": exam_id},
    )

    # 2. pools — code-unique per exam.
    pool_id_by_code: dict[str, str] = {}
    for i, p in enumerate(proposal.pools):
        pool_uuid = str(uuid.uuid4())
        res = await session.execute(
            text(
                """
                INSERT INTO catalog_schema.subject_pools
                    (id, exam_id, code, name, description, pick_min, pick_max, sort_order)
                VALUES (CAST(:id AS uuid), CAST(:eid AS uuid), :code, :name, :description,
                        :pmin, :pmax, :ord)
                ON CONFLICT (exam_id, code) DO UPDATE SET
                    name = EXCLUDED.name,
                    description = EXCLUDED.description,
                    pick_min = EXCLUDED.pick_min,
                    pick_max = EXCLUDED.pick_max,
                    sort_order = EXCLUDED.sort_order
                RETURNING id
                """
            ),
            {
                "id": pool_uuid,
                "eid": exam_id,
                "code": p.code,
                "name": p.name,
                "description": p.description,
                "pmin": p.pick_min,
                "pmax": p.pick_max,
                "ord": i,
            },
        )
        pool_id_by_code[p.code] = str(res.scalar_one())

    # 3. subjects — link to pool when set.
    #    Schema note: catalog_schema.subjects uses `subtitle`, not
    #    `description` (topics use `description`). Map the proposal's
    #    subject.description → subjects.subtitle so the AI's free-form
    #    blurb still lands somewhere visible. Also re-publish on edit
    #    so a previously soft-deleted subject can come back via re-add.
    pool_id_by_code = pool_id_by_code  # for type narrowing in scope
    subjects_created = 0
    topics_created = 0
    for i, s in enumerate(proposal.subjects):
        subject_uuid = str(uuid.uuid4())
        pool_id = pool_id_by_code.get(s.pool_code) if s.pool_code else None
        res = await session.execute(
            text(
                """
                INSERT INTO catalog_schema.subjects
                    (id, exam_id, code, name, subtitle, sort_order, is_mandatory, pool_id, is_published)
                VALUES (CAST(:id AS uuid), CAST(:eid AS uuid), :code, :name, :description,
                        :ord, :mand, CAST(:pool_id AS uuid), TRUE)
                ON CONFLICT (exam_id, code) DO UPDATE SET
                    name = EXCLUDED.name,
                    subtitle = EXCLUDED.subtitle,
                    is_mandatory = EXCLUDED.is_mandatory,
                    pool_id = EXCLUDED.pool_id,
                    sort_order = EXCLUDED.sort_order,
                    is_published = TRUE
                RETURNING id, (xmax = 0) AS inserted
                """
            ),
            {
                "id": subject_uuid,
                "eid": exam_id,
                "code": s.code,
                "name": s.name,
                "description": s.description,
                "ord": i,
                "mand": s.is_mandatory,
                "pool_id": pool_id,
            },
        )
        row = res.first()
        subject_id = str(row[0])  # type: ignore[index]
        if row and row[1]:  # type: ignore[index]
            subjects_created += 1

        # 4. topics under this subject. Re-publish on edit so a
        #    previously retired topic can be restored.
        for j, t in enumerate(s.topics):
            res = await session.execute(
                text(
                    """
                    INSERT INTO catalog_schema.topics
                        (id, subject_id, code, title, description, question_count, sort_order, is_published)
                    VALUES (gen_random_uuid(), CAST(:sid AS uuid), :code, :title, :description,
                            0, :ord, TRUE)
                    ON CONFLICT (subject_id, code) DO UPDATE SET
                        title = EXCLUDED.title,
                        description = EXCLUDED.description,
                        sort_order = EXCLUDED.sort_order,
                        is_published = TRUE
                    RETURNING (xmax = 0) AS inserted
                    """
                ),
                {
                    "sid": subject_id,
                    "code": t.code,
                    "title": t.title,
                    "description": t.description,
                    "ord": j,
                },
            )
            ins = res.scalar_one()
            if ins:
                topics_created += 1

    # 5. Soft-delete (is_published=FALSE) any subject / topic / pool
    #    that exists in the DB for this exam but isn't in the new
    #    proposal. This is what makes /save also work for edit mode:
    #    the proposal is the *desired state*, anything missing is
    #    retired. Soft-delete (vs hard DELETE) keeps the rows around
    #    so existing question / mastery FK references stay intact —
    #    students who answered against a retired topic don't lose
    #    their history.
    proposal_subject_codes = {s.code for s in proposal.subjects}
    proposal_pool_codes = {p.code for p in proposal.pools}

    # Subjects to retire — currently published, not in new proposal.
    res = await session.execute(
        text(
            "UPDATE catalog_schema.subjects "
            "SET is_published = FALSE "
            "WHERE exam_id = CAST(:eid AS uuid) AND is_published = TRUE "
            "AND code <> ALL(CAST(:keep AS text[]))"
        ),
        {"eid": exam_id, "keep": list(proposal_subject_codes)},
    )
    subjects_retired = res.rowcount or 0

    # Topics to retire — for each subject in the proposal, retire
    # topics whose code isn't in the proposal's topic list.
    topics_retired = 0
    for s in proposal.subjects:
        keep_codes = [t.code for t in s.topics]
        res = await session.execute(
            text(
                "UPDATE catalog_schema.topics t "
                "SET is_published = FALSE "
                "FROM catalog_schema.subjects sub "
                "WHERE t.subject_id = sub.id "
                "  AND sub.exam_id = CAST(:eid AS uuid) "
                "  AND sub.code = :scode "
                "  AND t.is_published = TRUE "
                "  AND t.code <> ALL(CAST(:keep AS text[]))"
            ),
            {"eid": exam_id, "scode": s.code, "keep": keep_codes},
        )
        topics_retired += res.rowcount or 0

    # Pools to drop — pools have no is_published; safe to hard delete
    # because subjects.pool_id is ON DELETE SET NULL.
    res = await session.execute(
        text(
            "DELETE FROM catalog_schema.subject_pools "
            "WHERE exam_id = CAST(:eid AS uuid) "
            "AND code <> ALL(CAST(:keep AS text[]))"
        ),
        {"eid": exam_id, "keep": list(proposal_pool_codes)},
    )
    pools_retired = res.rowcount or 0

    await session.commit()

    return SaveResponse(
        exam_id=exam_id,
        code=proposal.code,
        subjects_created=subjects_created,
        topics_created=topics_created,
        pools_created=len(proposal.pools),
        subjects_retired=subjects_retired,
        topics_retired=topics_retired,
        pools_retired=pools_retired,
    )


# ─────────────────────────────────────────────────────────────────────
# Question seeding — admin asks AI to draft N questions per topic
# ─────────────────────────────────────────────────────────────────────


class SeedQuestionsRequest(BaseModel):
    exam_id: str
    questions_per_topic: int = Field(default=5, ge=1, le=10)
    # Restrict to a subset of topic IDs (optional). When empty, every
    # published topic in the exam is seeded — capped at 20 topics per
    # call so we don't run an OpenAI marathon synchronously.
    topic_ids: list[str] = Field(default_factory=list, max_length=20)
    # Difficulty `b` band: questions are drawn evenly across the band.
    difficulty_min: float = Field(default=-1.0, ge=-3.0, le=3.0)
    difficulty_max: float = Field(default=1.5, ge=-3.0, le=3.0)


class SeedQuestionsResponse(BaseModel):
    exam_id: str
    topics_processed: int
    questions_created: int
    failures: list[dict[str, Any]] = Field(default_factory=list)


SEED_SYSTEM_PROMPT = """You are a senior question writer for an Indian
education platform. For a given topic, you generate strict-JSON MCQ
questions suitable for the level implied by the exam (school /
competitive). Each MCQ has exactly 4 choices and one correct answer.

Hard rules:
  - Each question's stem is self-contained — no "in the previous
    question" cross-references.
  - All four choices are plausible; distractors target real student
    misconceptions, not absurdities.
  - Stems and choices use plain English. Mathematical notation can
    use unicode (e.g. ≤ √ π ≠) — no LaTeX, no markdown.
  - Keep stems ≤300 chars and choices ≤120 chars each.
  - explanation: 1-3 sentences, plain English, references the correct
    choice by its text (not by letter).
"""


SEED_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["questions"],
    "properties": {
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["stem", "choices", "correct_idx", "explanation"],
                "properties": {
                    "stem": {"type": "string"},
                    "choices": {
                        "type": "array",
                        "items": {"type": "string"},
                        "minItems": 4,
                        "maxItems": 4,
                    },
                    "correct_idx": {"type": "integer", "minimum": 0, "maximum": 3},
                    "explanation": {"type": "string"},
                },
            },
        },
    },
}


@router.post("/seed-questions", response_model=SeedQuestionsResponse)
async def seed_questions(
    body: SeedQuestionsRequest,
    session: SessionDep,
    principal: PrincipalDep,
) -> SeedQuestionsResponse:
    """Generate AI-drafted MCQ_SINGLE questions for an exam's topics.

    Synchronous + small-batched. Each topic gets one OpenAI call
    requesting `questions_per_topic` items at random difficulties
    spread across the requested band. Drafts land as `status='DRAFT'`
    in content_schema; admins promote them via the existing
    /content/questions/{id}/submit + /review flow.
    """
    _require_admin(principal)
    async with content_sessionmaker()() as _probe_sess:
        if not await _list_enabled(_probe_sess):
            raise HTTPException(
                status_code=503,
                detail={
                    "code": "ai_unavailable",
                    "message": "No AI provider is enabled. Configure one on the AI Providers screen.",
                },
            )
    if body.difficulty_max < body.difficulty_min:
        raise HTTPException(status_code=400, detail="difficulty_max must be ≥ difficulty_min")

    # 1. Resolve target topics. If topic_ids is empty, take up to 20
    #    published topics belonging to the exam (any subject).
    if body.topic_ids:
        res = await session.execute(
            text(
                "SELECT t.id, t.title, sub.name AS subject_name "
                "FROM catalog_schema.topics t "
                "JOIN catalog_schema.subjects sub ON t.subject_id = sub.id "
                "WHERE sub.exam_id = CAST(:eid AS uuid) AND t.is_published = TRUE "
                "AND t.id = ANY(CAST(:tids AS uuid[]))"
            ),
            {"eid": body.exam_id, "tids": body.topic_ids},
        )
    else:
        res = await session.execute(
            text(
                "SELECT t.id, t.title, sub.name AS subject_name "
                "FROM catalog_schema.topics t "
                "JOIN catalog_schema.subjects sub ON t.subject_id = sub.id "
                "WHERE sub.exam_id = CAST(:eid AS uuid) AND t.is_published = TRUE "
                "AND sub.is_published = TRUE "
                "ORDER BY sub.sort_order, t.sort_order LIMIT 20"
            ),
            {"eid": body.exam_id},
        )
    topics = [dict(r) for r in res.mappings().all()]
    if not topics:
        raise HTTPException(status_code=400, detail="no published topics matched")

    # 2. Resolve exam name for prompt context.
    res = await session.execute(
        text("SELECT name FROM catalog_schema.exams WHERE id = CAST(:eid AS uuid)"),
        {"eid": body.exam_id},
    )
    exam_row = res.mappings().first()
    exam_name = exam_row["name"] if exam_row else "the exam"

    # 3. For each topic, call OpenAI then insert the drafts. We use the
    #    content schema's session for the writes (separate DB connection
    #    factory; both schemas live in the same Postgres logical DB but
    #    distinct SQLAlchemy sessions). Failures on one topic don't
    #    halt the rest — the failure is recorded in `failures` and we
    #    move on.
    questions_created = 0
    failures: list[dict[str, Any]] = []
    span = body.difficulty_max - body.difficulty_min

    async with content_sessionmaker()() as content_sess:
        for t in topics:
            user_prompt = (
                f"Exam: {exam_name}\n"
                f"Subject: {t['subject_name']}\n"
                f"Topic: {t['title']}\n"
                f"Generate exactly {body.questions_per_topic} MCQ_SINGLE questions for this topic."
            )
            try:
                draft = await call_structured(
                    content_sess,
                    system=SEED_SYSTEM_PROMPT,
                    user=user_prompt,
                    schema_name="seed_questions",
                    schema=SEED_SCHEMA,
                )
            except Exception as e:
                failures.append({"topic_id": str(t["id"]), "error": str(e)[:200]})
                continue
            if draft is None or not draft.get("questions"):
                failures.append({"topic_id": str(t["id"]), "error": "ai_returned_empty"})
                continue

            n = len(draft["questions"])
            for i, q in enumerate(draft["questions"]):
                # Spread difficulties evenly across the band.
                if n == 1:
                    diff = (body.difficulty_min + body.difficulty_max) / 2
                else:
                    diff = body.difficulty_min + (span * i / (n - 1))
                try:
                    await insert_question(
                        content_sess,
                        question_id=str(uuid.uuid4()),
                        topic_id=str(t["id"]),
                        stem=q["stem"],
                        choices=q["choices"],
                        correct_idx=int(q["correct_idx"]),
                        difficulty_b=float(diff),
                        discrimination_a=1.0,
                        guessing_c=0.25,  # 1/4 for 4-choice MCQ
                        language="en",
                        created_by=principal.user_id,
                        explanation=q.get("explanation"),
                        question_type="MCQ_SINGLE",
                        ai_origin={
                            "source": "exam_builder.seed_questions",
                            "model": "openai",
                            "exam_id": body.exam_id,
                        },
                    )
                    questions_created += 1
                except Exception as e:
                    failures.append(
                        {
                            "topic_id": str(t["id"]),
                            "stem_prefix": q.get("stem", "")[:40],
                            "error": str(e)[:200],
                        }
                    )
        await content_sess.commit()

    return SeedQuestionsResponse(
        exam_id=body.exam_id,
        topics_processed=len(topics),
        questions_created=questions_created,
        failures=failures,
    )
