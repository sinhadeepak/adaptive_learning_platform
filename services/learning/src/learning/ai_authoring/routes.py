"""POST /content/ai/draft + POST /content/ai/quality-check endpoints.

Per ADR-0019 §"AI Authoring". Both endpoints are admin-or-creator-only
(auth gating wires up alongside the moderator queue UI in S45 — for v1
the route is open in dev and gated by upstream API gateway in prod).

The Gateway is dependency-injected via FastAPI's Depends(); production
swaps the stub for the real OpenAI-backed gateway via the lifespan
hook in main.py.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from learning.ai_authoring.draft import (
    AIDraftMarker,
    DraftMCQ,
    DraftQuestionRequest,
    DistractorsOutput,
    ExplanationOutput,
    compute_edit_distance,
    draft_question,
    expand_explanation,
    suggest_distractors,
)
from learning.ai_authoring.quality_checks import QualityWarning, run_quality_checks
from learning.ai_gateway import AIGateway, AIGatewayError
from learning.ai_gateway.quotas import QuotaExceededError

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


# ── /draft ───────────────────────────────────────────────────────────────────


class DraftResponse(BaseModel):
    draft: DraftMCQ
    marker: AIDraftMarker


@router.post("/draft", response_model=DraftResponse)
async def post_draft(
    req: DraftQuestionRequest,
    gateway: AIGateway = Depends(get_gateway),
) -> DraftResponse:
    """Generate an AI_DRAFT MCQ payload.

    The artifact is NOT persisted by this endpoint. The author UI shows
    the draft + marker; the author edits and submits via the standard
    `POST /content/questions` flow, where the marker lands on
    `questions.ai_origin` and edit_distance is computed at submit time.
    """
    try:
        draft, marker = await draft_question(
            gateway,
            request=req,
            creator_id=None,  # auth wires in S45; for now anonymous quota
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
    return DraftResponse(draft=draft, marker=marker)


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
        return await expand_explanation(
            gateway, stem=req.stem, answer=req.answer
        )
    except QuotaExceededError as e:
        raise _problem(
            "quota_exceeded", str(e), http_status=429,
            scope=e.scope, reset_at=e.reset_at,
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
            gateway, stem=req.stem, correct_answer=req.correct_answer, n=req.n,
        )
    except QuotaExceededError as e:
        raise _problem(
            "quota_exceeded", str(e), http_status=429,
            scope=e.scope, reset_at=e.reset_at,
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
            "quota_exceeded", str(e), http_status=429,
            scope=e.scope, reset_at=e.reset_at,
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
