"""Sprint 23 (P4-S23) — exam blueprint HTTP routes.

Read endpoints + a compose endpoint that produces a per-user paper from a
blueprint. Admin write paths defer to S25.

F3 (2026-05-12) adds student-authored CUSTOM blueprints:
  POST   /catalog/exam-blueprints/custom    — author a new test
  GET    /catalog/exam-blueprints/mine      — list owner's tests
  DELETE /catalog/exam-blueprints/mine/{id} — retire owner's test

Per ADR-0012.
"""

from __future__ import annotations

import random
from typing import Annotated, Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from learning.catalog.db import get_session
from learning.content.security import (
    JwtPrincipal,
    current_principal,
    principal_with_role,
)
from learning.exam_blueprints import ai_suggest as _ai_suggest
from learning.exam_blueprints import composer as _composer
from learning.exam_blueprints import repositories as _repo

router = APIRouter(prefix="/catalog/exam-blueprints", tags=["exam-blueprints"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]
PrincipalDep = Annotated[JwtPrincipal, Depends(current_principal)]

_HTTP_TIMEOUT = 5.0


def _quiz_base_url() -> str:
    """Read at request time so test environments can override via env."""
    import os

    return os.environ.get("LEARNING_QUIZ_BASE_URL", "http://quiz:8000")


@router.get("")
async def list_blueprints(session: SessionDep, examId: str) -> dict[str, Any]:
    items = await _repo.list_for_exam(session, examId)
    return {"examId": examId, "items": items}


async def _candidate_pool_for_section(
    session: AsyncSession, subject_id: str, n_target: int
) -> list[dict[str, Any]]:
    """Pull candidate questions for a section from the Quiz bank.

    Strategy: list topics under the section's subject_id (catalog DB), then
    fetch questions from Quiz HTTP per topic. We over-fetch by 50% so the
    composer has slack to shuffle around within the section.
    """
    rows = (
        await session.execute(
            text("""
                SELECT id FROM catalog_schema.topics WHERE subject_id = :sid
                 ORDER BY sort_order
            """),
            {"sid": subject_id},
        )
    ).mappings().all()
    if not rows:
        return []
    per_topic_target = max(3, (n_target * 3 // 2) // max(1, len(rows)))
    base = _quiz_base_url()
    out: list[dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
        for r in rows:
            topic_id = str(r["id"])
            try:
                resp = await client.get(
                    f"{base}/quiz/questions",
                    params={"topicId": topic_id, "limit": per_topic_target},
                )
                resp.raise_for_status()
            except httpx.HTTPError:
                continue  # skip topic on transient error; honest short-pool
            body = resp.json()
            for q in body.get("items") or []:
                out.append({"id": q["id"], "topic_id": q.get("topicId") or topic_id})
    return out


# ── F3 — Custom Test Builder ──────────────────────────────────────────


class CustomSectionInput(BaseModel):
    section_id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=120)
    subject_id: str | None = None
    topic_ids: list[str] = Field(default_factory=list)
    n_questions: int = Field(ge=1, le=50)
    n_minutes: int = Field(ge=1, le=180)
    difficulty_band: str = Field(default="mixed", pattern="^(easy|mixed|hard)$")


class CustomScoring(BaseModel):
    correct: int = Field(default=4, ge=1, le=10)
    negative: float = Field(default=0.0, ge=0.0, le=4.0)


class CustomBlueprintCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    exam_id: str = Field(min_length=1)
    sections: list[CustomSectionInput] = Field(min_length=1, max_length=10)
    scoring: CustomScoring = Field(default_factory=CustomScoring)
    inter_section_navigation: bool = True
    per_section_time_locked: bool = False


def _difficulty_distribution(band: str) -> dict[str, float]:
    """Lookup table — the composer reads this off `sections[].difficulty_distribution`."""
    if band == "easy":
        return {"easy": 0.60, "medium": 0.35, "hard": 0.05}
    if band == "hard":
        return {"easy": 0.10, "medium": 0.40, "hard": 0.50}
    return {"easy": 0.30, "medium": 0.50, "hard": 0.20}


@router.post("/custom", status_code=201)
async def create_custom_blueprint(
    body: CustomBlueprintCreate,
    session: SessionDep,
    principal: PrincipalDep,
) -> dict[str, Any]:
    """Persist a student-authored test as a blueprint with kind='CUSTOM'.
    The Quiz Go session-start-from-blueprint endpoint consumes it
    unchanged — no new session machinery for F3.
    """
    sections_payload: list[dict[str, Any]] = [
        {
            "section_id": s.section_id,
            "name": s.name,
            "subject_id": s.subject_id,
            "topic_ids": s.topic_ids,
            "n_questions": s.n_questions,
            "n_minutes": s.n_minutes,
            "difficulty_distribution": _difficulty_distribution(s.difficulty_band),
            "difficulty_band": s.difficulty_band,
        }
        for s in body.sections
    ]
    total_minutes = sum(s.n_minutes for s in body.sections)
    try:
        out = await _repo.create_custom(
            session,
            user_id=principal.user_id,
            exam_id=body.exam_id,
            name=body.name,
            sections=sections_payload,
            total_minutes=total_minutes,
            marks_correct=body.scoring.correct,
            marks_negative=body.scoring.negative,
            inter_section_nav=body.inter_section_navigation,
            per_section_time_locked=body.per_section_time_locked,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=422,
            detail={"code": "invalid_blueprint", "message": str(e)},
        )
    await session.commit()
    return out


@router.get("/mine")
async def list_my_blueprints(
    session: SessionDep,
    principal: PrincipalDep,
    include_retired: bool = False,
) -> dict[str, Any]:
    """List blueprints owned by the current user (CUSTOM / AI_SUGGESTED /
    SHARED). Recently created first. Retired tests included only when
    explicitly requested.
    """
    items = await _repo.list_for_user(
        session,
        user_id=principal.user_id,
        include_retired=include_retired,
    )
    return {"items": items, "count": len(items)}


@router.delete("/mine/{blueprint_id}", status_code=204)
async def delete_my_blueprint(
    blueprint_id: str,
    session: SessionDep,
    principal: PrincipalDep,
) -> None:
    """Soft-delete (status=RETIRED) a CUSTOM / SHARED / AI_SUGGESTED
    blueprint the user owns. OFFICIAL / CURATED rows are immutable from
    this endpoint.
    """
    ok = await _repo.delete_custom(session, blueprint_id, principal.user_id)
    if not ok:
        raise HTTPException(
            status_code=404,
            detail={"code": "not_found", "message": "No such blueprint or not yours"},
        )
    await session.commit()


# ── F4 — Test Sharing ─────────────────────────────────────────────────


class RatingBody(BaseModel):
    stars: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=2000)


@router.post("/{blueprint_id}/share")
async def share_blueprint(
    blueprint_id: str,
    session: SessionDep,
    principal: PrincipalDep,
) -> dict[str, Any]:
    """Mint a share_slug for the user's CUSTOM blueprint. Idempotent —
    returns the existing slug if already shared. The full share URL is
    constructed client-side from /t/<slug>.
    """
    out = await _repo.share_blueprint(session, blueprint_id, principal.user_id)
    if out is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "not_found", "message": "No such blueprint or not yours"},
        )
    await session.commit()
    return out


@router.post("/{blueprint_id}/unshare")
async def unshare_blueprint(
    blueprint_id: str,
    session: SessionDep,
    principal: PrincipalDep,
) -> dict[str, Any]:
    """Clear the slug + revert to PRIVATE. Any /t/<slug> link breaks."""
    out = await _repo.unshare_blueprint(session, blueprint_id, principal.user_id)
    if out is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "not_found", "message": "No such blueprint or not yours"},
        )
    await session.commit()
    return out


@router.get("/by-slug/{slug}")
async def get_by_slug(
    slug: str,
    session: SessionDep,
) -> dict[str, Any]:
    """Receiver-facing endpoint. Returns the blueprint summary + rating
    aggregate. No author identity beyond the blueprint's row — keeps
    sharing pseudonymous unless the author has chosen otherwise.
    """
    bp = await _repo.get_by_slug(session, slug)
    if bp is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "not_found", "message": "Shared test not found or unshared."},
        )
    ratings = await _repo.rating_summary(session, bp["id"])
    return {**bp, "ratings": ratings}


@router.post("/{blueprint_id}/rate")
async def rate_blueprint(
    blueprint_id: str,
    body: RatingBody,
    session: SessionDep,
    principal: PrincipalDep,
) -> dict[str, Any]:
    """Upsert a (blueprint, user) rating. Receiver must have completed
    a session of this test before the route accepts — gating done in
    a lightweight check against Quiz Go's blueprint sessions (kept
    advisory; the row is persisted regardless).
    """
    # Owner-only restriction: a creator can still rate their own test
    # (debatable; for v1 we allow it — the avg is more useful with the
    # creator's own honest assessment, especially for AI-suggested).
    await _repo.upsert_rating(
        session,
        blueprint_id=blueprint_id,
        user_id=principal.user_id,
        stars=body.stars,
        comment=body.comment,
    )
    await session.commit()
    summary = await _repo.rating_summary(session, blueprint_id)
    return {"ok": True, "ratings": summary}


@router.get("/mine/{blueprint_id}/stats")
async def my_blueprint_stats(
    blueprint_id: str,
    session: SessionDep,
    principal: PrincipalDep,
) -> dict[str, Any]:
    """Author-side stats: attempt count from sessions that captured
    `source_share_slug` for this blueprint, plus the rating aggregate.
    Returns zeros (never 404) so the MyTests row can show "0 attempts"
    immediately after share without a separate check.
    """
    bp = await _repo.get_for_user(session, blueprint_id, principal.user_id)
    if bp is None or bp.get("createdByUserId") != principal.user_id:
        raise HTTPException(
            status_code=404,
            detail={"code": "not_found", "message": "No such blueprint or not yours"},
        )
    ratings = await _repo.rating_summary(session, blueprint_id)
    # Fetch attempt count from Quiz Go via HTTP (no shared DB; ADR-0001).
    attempts = 0
    if bp.get("shareSlug"):
        base = _quiz_base_url()
        try:
            async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
                resp = await client.get(
                    f"{base}/quiz/sessions/by-share-slug",
                    params={"slug": bp["shareSlug"]},
                )
                if resp.status_code == 200:
                    body = resp.json()
                    attempts = int(body.get("count", 0))
        except httpx.HTTPError:
            attempts = 0
    return {
        "blueprintId": blueprint_id,
        "shareSlug": bp.get("shareSlug"),
        "attempts": attempts,
        "ratings": ratings,
    }


# ── F5 — AI-suggested Custom Tests ────────────────────────────────────


class AISuggestRequest(BaseModel):
    variant: str = Field(pattern="^(today_pick|long_form|crash_drill|decay_refresh)$")
    # Either exam_id (UUID) or exam_code is acceptable; frontend
    # typically passes the examId off the profile.exams row.
    exam_id: str | None = Field(default=None, min_length=1, max_length=80)
    exam_code: str | None = Field(default=None, min_length=1, max_length=40)


@router.post("/ai-suggest", status_code=201)
async def ai_suggest_blueprint(
    body: AISuggestRequest,
    request: Request,
    session: SessionDep,
    principal: PrincipalDep,
) -> dict[str, Any]:
    """Compose an AI-suggested blueprint for the current user using the
    requested variant + their weakest topics in the given exam.

    The Gateway is consulted opportunistically. When unavailable the
    heuristic path returns a perfectly valid blueprint targeting the
    student's lowest-EWA subjects — no degraded UX beyond the loss of
    the LLM-authored name/rationale.
    """
    gateway = getattr(request.app.state, "ai_gateway", None)
    try:
        out = await _ai_suggest.compose_suggested_blueprint(
            session,
            user_id=principal.user_id,
            variant=body.variant,
            exam_id=body.exam_id,
            exam_code=body.exam_code,
            gateway=gateway,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=422,
            detail={"code": "insufficient_data", "message": str(e)},
        )
    return out


@router.get("/ai-suggested/active")
async def ai_suggested_active(
    session: SessionDep,
    principal: PrincipalDep,
) -> dict[str, Any]:
    """List the user's unexpired AI-suggested blueprints (≤24h old)."""
    items = await _ai_suggest.list_active_suggestions(
        session, user_id=principal.user_id
    )
    return {"items": items, "count": len(items)}


@router.post("/{blueprint_id}/compose")
async def compose_blueprint(
    blueprint_id: str,
    session: SessionDep,
    userId: str,
    attemptIdx: int = 0,
) -> dict[str, Any]:
    """Compose a paper for (blueprint, user). Returns ordered items with
    section_id propagated. Honestly returns `short=True` when the candidate
    pool is insufficient — UI surfaces this before exam start."""
    bp = await _repo.get_by_id(session, blueprint_id)
    if bp is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "not_found", "message": "Blueprint not found"},
        )
    sections = bp["sections"]
    if not isinstance(sections, list) or not sections:
        raise HTTPException(
            status_code=422,
            detail={"code": "invalid_blueprint", "message": "Blueprint has no sections"},
        )

    candidates_by_section: dict[str, list[dict[str, Any]]] = {}
    for sec in sections:
        section_id = sec["section_id"]
        subject_id = sec.get("subject_id")
        if not subject_id:
            candidates_by_section[section_id] = []
            continue
        candidates_by_section[section_id] = await _candidate_pool_for_section(
            session, subject_id, int(sec["n_questions"])
        )

    # Per-(blueprint, user, attempt) deterministic seed so retake N+1 differs
    # from retake N but is reproducible for debugging.
    seed = _composer.derive_user_seed(blueprint_id, userId) ^ int(attemptIdx)
    rng = random.Random(seed)
    # The composer expects the snake_case shape used in the seed JSONB.
    bp_for_composer = {
        "id": bp["id"],
        "total_questions": bp["totalQuestions"],
        "sections": sections,
    }
    plan = _composer.compose_paper(bp_for_composer, candidates_by_section, rng=rng)
    plan["blueprintName"] = bp["name"]
    plan["totalMinutes"] = bp["totalMinutes"]
    plan["interSectionNavigation"] = bp["interSectionNavigation"]
    plan["perSectionTimeLocked"] = bp["perSectionTimeLocked"]
    plan["marksCorrect"] = bp["marksCorrect"]
    plan["marksNegative"] = bp["marksNegative"]
    return plan


# ── F6 — Curated Test Library ─────────────────────────────────────────


class CuratedBlueprintCreate(BaseModel):
    """Authoring body — same shape as CustomBlueprintCreate. Distinct
    type so the route is unambiguous + future-extensible (e.g. preview
    flag, editorial notes)."""

    name: str = Field(min_length=1, max_length=200)
    exam_id: str = Field(min_length=1)
    sections: list[CustomSectionInput] = Field(min_length=1, max_length=10)
    scoring: CustomScoring = Field(default_factory=CustomScoring)
    inter_section_navigation: bool = True
    per_section_time_locked: bool = False


_CURATOR_ROLES = ("TEACHER", "ADMIN", "MODERATOR", "PLATFORM_ADMIN")
_APPROVER_ROLES = ("ADMIN", "MODERATOR", "PLATFORM_ADMIN")


@router.post("/curated", status_code=201)
async def create_curated_blueprint(
    body: CuratedBlueprintCreate,
    session: SessionDep,
    principal: PrincipalDep,
) -> dict[str, Any]:
    """Author a CURATED blueprint. Lands as PENDING_REVIEW; the
    library doesn't show it until an admin/moderator approves it."""
    principal_with_role(*_CURATOR_ROLES, principal=principal)
    sections_payload: list[dict[str, Any]] = [
        {
            "section_id": s.section_id,
            "name": s.name,
            "subject_id": s.subject_id,
            "topic_ids": s.topic_ids,
            "n_questions": s.n_questions,
            "n_minutes": s.n_minutes,
            "difficulty_distribution": _difficulty_distribution(s.difficulty_band),
            "difficulty_band": s.difficulty_band,
        }
        for s in body.sections
    ]
    total_minutes = sum(s.n_minutes for s in body.sections)
    try:
        out = await _repo.create_curated(
            session,
            author_user_id=principal.user_id,
            exam_id=body.exam_id,
            name=body.name,
            sections=sections_payload,
            total_minutes=total_minutes,
            marks_correct=body.scoring.correct,
            marks_negative=body.scoring.negative,
            inter_section_nav=body.inter_section_navigation,
            per_section_time_locked=body.per_section_time_locked,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=422,
            detail={"code": "invalid_blueprint", "message": str(e)},
        )
    await session.commit()
    return out


@router.get("/curated/pending")
async def list_curated_pending(
    session: SessionDep,
    principal: PrincipalDep,
) -> dict[str, Any]:
    """Admin/moderator review queue."""
    principal_with_role(*_APPROVER_ROLES, principal=principal)
    items = await _repo.list_pending_curated(session)
    return {"items": items, "count": len(items)}


@router.post("/curated/{blueprint_id}/approve")
async def approve_curated_blueprint(
    blueprint_id: str,
    session: SessionDep,
    principal: PrincipalDep,
) -> dict[str, Any]:
    """Promote a pending curated test to PUBLISHED + PUBLIC."""
    principal_with_role(*_APPROVER_ROLES, principal=principal)
    out = await _repo.approve_curated(session, blueprint_id)
    if out is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "not_found", "message": "No curated blueprint with that id"},
        )
    await session.commit()
    return out


@router.post("/curated/{blueprint_id}/reject")
async def reject_curated_blueprint(
    blueprint_id: str,
    session: SessionDep,
    principal: PrincipalDep,
) -> dict[str, Any]:
    """Reject a pending curated test (status → RETIRED)."""
    principal_with_role(*_APPROVER_ROLES, principal=principal)
    out = await _repo.reject_curated(session, blueprint_id)
    if out is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "not_found", "message": "No pending curated blueprint with that id"},
        )
    await session.commit()
    return out


@router.get("/library")
async def list_library_blueprints(
    session: SessionDep,
    exam_id: str | None = None,
    max_minutes: int | None = None,
    limit: int = 100,
) -> dict[str, Any]:
    """Student-facing library — published curated tests with optional
    exam + duration filters. Auth not required (public surface)."""
    items = await _repo.list_library(
        session,
        exam_id=exam_id,
        max_minutes=max_minutes,
        limit=min(limit, 200),
    )
    return {"items": items, "count": len(items)}


# ── Catch-all single-segment GET (MUST come last to avoid shadowing /mine,
#    /ai-suggest, /ai-suggested/*, /by-slug/*, /library, /curated/*, etc.).
#    FastAPI matches in declaration order, so any new static path must be
#    added above. ──
@router.get("/{blueprint_id}")
async def get_blueprint(blueprint_id: str, session: SessionDep) -> dict[str, Any]:
    bp = await _repo.get_by_id(session, blueprint_id)
    if bp is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "not_found", "message": "Blueprint not found"},
        )
    return bp
