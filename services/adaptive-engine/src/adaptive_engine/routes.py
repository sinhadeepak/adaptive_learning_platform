"""Adaptive Engine HTTP surface.

IRT plumbing:
  POST /irt/ability      — re-estimate θ given the response history
  POST /irt/select-next  — pick the next item via MFI

AI layer (Phase 1 deepening):
  GET  /adaptive/study-plan/{user_id}        — full 7-day plan + topic priorities
  GET  /adaptive/guided-next-steps/{user_id} — 3 immediate actions for the home dashboard
  GET  /adaptive/ai-status                   — whether the LLM client is wired up

Both return a `theta_used` so callers (Quiz) can persist the value the engine
actually consumed for selection — useful for audit + reproducibility.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from typing import Annotated

import httpx
from fastapi import APIRouter, Header, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from adaptive_engine import llm
from adaptive_engine.config import settings

log = logging.getLogger(__name__)
from adaptive_engine.authoring import generate_questions
from adaptive_engine.doubt import solve_doubt
from adaptive_engine.explain import explain_question
from adaptive_engine.mock import get_active_mock, plan_mock, score_mock
from adaptive_engine.rank import project_rank
from adaptive_engine.weakness import diagnose_weakness
from adaptive_engine.irt import (
    CandidateItem,
    Item,
    Response,
    eap_estimate,
    fisher_information,
    select_mfi,
)
from adaptive_engine.tutor import stream_tutor_response
from adaptive_engine.study_plan import build_guided_next_steps, build_study_plan

router = APIRouter()


class IRTItemDTO(BaseModel):
    a: float = Field(gt=0, description="Discrimination")
    b: float = Field(description="Difficulty")
    c: float = Field(ge=0, lt=1, description="Guessing parameter")


class ResponseDTO(IRTItemDTO):
    is_correct: bool


class CandidateDTO(IRTItemDTO):
    id: str


class AbilityRequest(BaseModel):
    responses: list[ResponseDTO] = Field(default_factory=list)
    prior_mean: float = 0.0
    prior_sd: float = 1.0


class AbilityResponse(BaseModel):
    theta: float
    se: float
    n: int


class SelectNextRequest(BaseModel):
    theta: float
    candidates: list[CandidateDTO]
    exclude: list[str] = Field(default_factory=list)
    exposure_count: dict[str, int] = Field(default_factory=dict)
    exposure_cap: int = 5


class SelectNextResponse(BaseModel):
    item_id: str | None
    fisher_info: float
    theta_used: float


@router.post("/irt/ability", response_model=AbilityResponse)
async def post_ability(req: AbilityRequest) -> AbilityResponse:
    responses = [
        Response(item=Item(a=r.a, b=r.b, c=r.c), is_correct=r.is_correct) for r in req.responses
    ]
    theta, se = eap_estimate(responses, prior_mean=req.prior_mean, prior_sd=req.prior_sd)
    return AbilityResponse(theta=theta, se=se, n=len(responses))


@router.post("/irt/select-next", response_model=SelectNextResponse)
async def post_select_next(req: SelectNextRequest) -> SelectNextResponse:
    candidates = [CandidateItem(id=c.id, item=Item(a=c.a, b=c.b, c=c.c)) for c in req.candidates]
    chosen = select_mfi(
        theta=req.theta,
        candidates=candidates,
        exclude=set(req.exclude),
        exposure_count=req.exposure_count,
        exposure_cap=req.exposure_cap,
    )
    if chosen is None:
        return SelectNextResponse(item_id=None, fisher_info=0.0, theta_used=req.theta)
    info = fisher_information(req.theta, chosen.item)
    return SelectNextResponse(item_id=chosen.id, fisher_info=info, theta_used=req.theta)


# ---- AI layer ----------------------------------------------------------------------


@router.get("/adaptive/ai-status")
async def ai_status() -> dict[str, bool | str]:
    """Tells the UI whether to show 'AI-powered' chrome or fall back to heuristic copy."""
    return {"enabled": llm.is_enabled(), "provider": "openai"}


@router.get("/adaptive/study-plan/{user_id}")
async def get_study_plan(
    user_id: str,
    exam: str | None = Query(default=None, description="Exam code (e.g. NEET, JEE) to scope to."),
) -> dict:
    return await build_study_plan(user_id=user_id, exam_code=exam)


@router.get("/adaptive/guided-next-steps/{user_id}")
async def get_guided_next_steps(
    user_id: str,
    exam: str | None = Query(default=None),
) -> dict:
    return await build_guided_next_steps(user_id=user_id, exam_code=exam)


@router.get("/adaptive/rank-projection/{user_id}")
async def get_rank_projection(
    user_id: str,
    exam: str = Query(default="NEET", description="Exam code: NEET, JEE, UPSC, CBSE."),
) -> dict:
    """Predicted All India Rank from current readiness, with confidence band +
    one-line AI commentary. Returns the same shape regardless of LLM state."""
    return await project_rank(user_id=user_id, exam_code=exam)


@router.get("/adaptive/weakness-diagnosis/{user_id}")
async def get_weakness_diagnosis(user_id: str) -> dict:
    """Cross-topic weakness patterns. Pulls recent answered items + per-topic
    EWA, asks the LLM to find sub-skill clusters that span multiple topics
    (the kind per-topic mastery hides). Heuristic fallback when LLM is off
    or evidence is too thin."""
    return await diagnose_weakness(user_id=user_id)


# ---- Mock tests ----------------------------------------------------------

class MockPlanRequest(BaseModel):
    userId: str
    examCode: str = Field(default="NEET", pattern="^[A-Z]{3,8}$")


@router.post("/adaptive/mock/plan")
async def post_mock_plan(req: MockPlanRequest) -> dict:
    """Compose a mock paper. Returns the ordered question list + section
    metadata + timer + scoring rules + a server-side mockId. The client
    drives the player; correct answers are NEVER sent to the client — they
    live in adaptive-engine memory keyed by mockId until score is called."""
    return await plan_mock(user_id=req.userId, exam_code=req.examCode)


class MockScoreRequest(BaseModel):
    mockId: str = Field(min_length=8)
    answers: dict[str, int] = Field(default_factory=dict)


@router.post("/adaptive/mock/score")
async def post_mock_score(req: MockScoreRequest) -> dict:
    """Score a submitted mock. Looks up the plan in adaptive-engine's mock
    cache by mockId, computes raw + percentile + projected AIR + section
    breakdown.

    Side-effect: persists the result to user-profile so the student can
    revisit the mock from /profile/mock-attempts. Best-effort — a failed
    POST never blocks the inline score response."""
    plan = get_active_mock(req.mockId)
    if plan is None:
        return {
            "error": "mock_not_found",
            "message": (
                "Mock session expired or unknown. Mocks live for 90 minutes "
                "after planning; re-plan to start fresh."
            ),
        }
    result = score_mock(plan=plan, answers=req.answers)
    user_id = plan.get("userId")
    if user_id and not result.get("error"):
        try:
            attempt_id = await _persist_mock_attempt(
                user_id=user_id, mock_id=req.mockId, plan=plan, result=result
            )
        except Exception:
            log.exception("mock attempt persist failed")
            attempt_id = None
        # Inbox ping — closes the loop so the student sees the score in
        # their bell. Best-effort: a notification failure must never make
        # the inline score response error.
        if attempt_id:
            try:
                await _post_mock_completed_notification(
                    user_id=user_id, attempt_id=attempt_id, result=result
                )
            except Exception:
                log.exception("mock.completed notification failed")
            # First-ever mock badge — idempotent on (user, kind), so this
            # always fires after a score and the second+ time is a no-op.
            try:
                await _grant_achievement(
                    user_id=user_id,
                    kind="mock_first",
                    payload={
                        "examCode": result.get("examCode"),
                        "rawScore": int(result.get("rawScore", 0)),
                    },
                )
            except Exception:
                log.exception("mock_first achievement grant failed")
            # Cumulative-mocks badges. Re-counts user-profile attempts each
            # time, so we don't have to track our own counter; UNIQUE on
            # (user, kind) keeps the grant idempotent across replays.
            try:
                total = await _count_user_mock_attempts(user_id)
                for m in (5, 10, 25):
                    if total >= m:
                        await _grant_achievement(
                            user_id=user_id,
                            kind=f"mocks_{m}",
                            payload={"mocks": total},
                        )
            except Exception:
                log.exception("mocks milestone achievement check failed")
    return result


async def _count_user_mock_attempts(user_id: str) -> int:
    """Re-fetch the persisted attempt count from user-profile so we don't
    need a local counter. /profile/mock-attempts requires JWT, so we use
    the slim internal listing path instead — but user-profile only exposes
    that JWT-gated. For a local count we list and len(); the response is
    capped server-side so this is bounded."""
    base = (settings.user_profile_base_url or "").rstrip("/")
    if not base:
        return 0
    # No internal list endpoint — user-profile keeps the JWT-gated /profile
    # surface as the read path. For service-to-service counting we hit a
    # tiny dedicated path. Falls back to 0 on any failure.
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{base}/internal/profile/{user_id}/mock-attempts/count")
            if r.status_code != 200:
                return 0
            body = r.json() or {}
            return int(body.get("count", 0))
    except Exception:
        return 0


async def _grant_achievement(*, user_id: str, kind: str, payload: dict) -> None:
    base = (settings.user_profile_base_url or "").rstrip("/")
    if not base:
        return
    async with httpx.AsyncClient(timeout=5.0) as client:
        await client.post(
            f"{base}/internal/profile/achievements",
            json={"userId": user_id, "kind": kind, "payload": payload},
        )


async def _persist_mock_attempt(
    *, user_id: str, mock_id: str, plan: dict, result: dict
) -> str | None:
    """Returns the persisted attempt id (so the caller can deep-link it
    from a notification), or None when persistence is disabled or fails."""
    base = (settings.user_profile_base_url or "").rstrip("/")
    if not base:
        return None
    payload = {
        "userId": user_id,
        "mockId": mock_id,
        "examCode": result.get("examCode") or plan.get("examCode") or "",
        "examName": result.get("examName") or plan.get("examName"),
        "rawScore": int(result.get("rawScore", 0)),
        "maxMarks": int(result.get("maxMarks", 0)),
        "accuracy": float(result.get("accuracy", 0.0)),
        "totalQuestions": int(result.get("totalQuestions", 0)),
        "nCorrect": int(result.get("nCorrect", 0)),
        "nWrong": int(result.get("nWrong", 0)),
        "nUnanswered": int(result.get("nUnanswered", 0)),
        "percentile": _maybe_float(result.get("percentile")),
        "projectedRank": _maybe_int(result.get("projectedRank")),
        "confidence": result.get("confidence"),
        "sections": result.get("sections") or [],
    }
    async with httpx.AsyncClient(timeout=5.0) as client:
        r = await client.post(f"{base}/internal/profile/mock-attempts", json=payload)
        if r.status_code >= 300:
            return None
        body = r.json() or {}
        return body.get("id")


async def _post_mock_completed_notification(
    *, user_id: str, attempt_id: str, result: dict
) -> None:
    base = (settings.notification_base_url or "").rstrip("/")
    if not base:
        return
    pct = (
        round(float(result.get("rawScore", 0)) / float(result.get("maxMarks", 1)) * 100)
        if int(result.get("maxMarks", 0)) > 0
        else 0
    )
    payload = {
        "userId": user_id,
        "type": "mock.completed",
        "payload": {
            "attemptId": attempt_id,
            "examCode": result.get("examCode"),
            "examName": result.get("examName"),
            "rawScore": int(result.get("rawScore", 0)),
            "maxMarks": int(result.get("maxMarks", 0)),
            "scorePct": pct,
            "percentile": _maybe_float(result.get("percentile")),
            "projectedRank": _maybe_int(result.get("projectedRank")),
        },
    }
    async with httpx.AsyncClient(timeout=5.0) as client:
        await client.post(f"{base}/notifications/inbox", json=payload)


def _maybe_float(v):  # type: ignore[no-untyped-def]
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _maybe_int(v):  # type: ignore[no-untyped-def]
    if v is None:
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


class ExplainRequest(BaseModel):
    stem: str = Field(min_length=4)
    choices: list[str] = Field(min_length=2, max_length=8)
    correctIdx: int = Field(ge=0)
    pickedIdx: int | None = Field(default=None, ge=0)
    topicTitle: str | None = None
    language: str = "en"


@router.post("/adaptive/explain")
async def post_explain(req: ExplainRequest) -> dict:
    """On-demand teaching note. Used by QuizResult when the question's stored
    explanation is null. Returns the same JSON shape whether the LLM is on or off."""
    return await explain_question(
        stem=req.stem,
        choices=req.choices,
        correct_idx=req.correctIdx,
        picked_idx=req.pickedIdx,
        topic_title=req.topicTitle,
        language=req.language,
    )


class AuthoringGenerateRequest(BaseModel):
    topicId: str
    count: int = Field(default=5, ge=1, le=30)
    language: str = Field(default="en", pattern="^(en|hi)$")
    difficulty: str = Field(default="mixed", pattern="^(easy|medium|hard|mixed)$")
    brief: str = Field(default="", max_length=2000)


@router.post("/adaptive/authoring/generate-questions")
async def post_authoring_generate(req: AuthoringGenerateRequest) -> dict:
    """Generate N draft MCQs for a topic. Returns the items + a `source` field
    (ai|stub) so the UI can show appropriate copy when the AI is disabled."""
    return await generate_questions(
        topic_id=req.topicId,
        count=req.count,
        language=req.language,
        difficulty=req.difficulty,
        extra_context=req.brief,
    )


class DoubtPhotoRequest(BaseModel):
    # Accept either a data: URL (data:image/jpeg;base64,…) or an https URL.
    # Capped at ~5 MB worth of base64 to keep request bodies sane.
    imageDataUrl: str = Field(min_length=24, max_length=8_000_000)


def _decode_role_and_user(authorization: str | None) -> tuple[str | None, str | None]:
    """Sprint 8 R-4 — decode the JWT to get (role, user_id) for the rate
    limiter. Returns (None, None) on missing/invalid bearer; the route
    treats anonymous as free-tier (3/day cap)."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None, None
    try:
        import jwt as _jwt

        claims = _jwt.decode(
            authorization[len("bearer "):].strip(),
            settings.jwt_secret,
            algorithms=["HS256"],
        )
    except Exception:  # noqa: BLE001
        return None, None
    return claims.get("role"), claims.get("sub")


@router.post("/adaptive/doubt/photo")
async def post_doubt_photo(
    req: DoubtPhotoRequest,
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
) -> dict:
    """Photo-OCR doubt resolution. Returns the OCR extract + step-by-step solution
    + 3 similar problems from the matched topic. Same shape regardless of source
    (ai / stub) so the UI can render unconditionally.

    Sprint 8 R-4 — free students get 3 photo-doubts per UTC day; premium and
    staff bypass. 429 with body {code: rate_limited} when the cap is hit."""
    role, user_id = _decode_role_and_user(authorization)
    limiter = getattr(request.app.state, "photo_doubt_limiter", None)
    if limiter is not None:
        # Anonymous/no-sub callers fall back to a stable IP-derived key so
        # they can't trivially bypass via missing-token. The rate-limiter
        # accepts None (treats it as anonymous bucket); we send the IP
        # explicitly here so the daily key is at least scoped to one client.
        bucket = user_id or (request.client.host if request.client else "anonymous")
        allowed, count, cap = await limiter.check_and_increment(
            user_id=bucket, role=role
        )
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail={
                    "code": "rate_limited",
                    "message": (
                        f"Free tier allows {cap} photo-doubt resolutions per day. "
                        f"You've used {count}. Upgrade to PREMIUM for unlimited."
                    ),
                },
            )
    return await solve_doubt(image_data_url=req.imageDataUrl)


class TutorMessage(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(min_length=1, max_length=4000)


class TutorChatRequest(BaseModel):
    topicId: str
    messages: list[TutorMessage] = Field(min_length=1, max_length=20)
    userId: str | None = None


@router.post("/adaptive/tutor/chat")
async def post_tutor_chat(req: TutorChatRequest) -> StreamingResponse:
    """Streaming tutor reply. Response is plain text/event-stream — each `data:`
    frame carries a content delta. Frontend reads with EventSource and appends
    deltas to the assistant bubble as they arrive."""

    async def sse() -> "AsyncIterator[bytes]":  # type: ignore[name-defined]
        history = [{"role": m.role, "content": m.content} for m in req.messages]
        try:
            async for delta in stream_tutor_response(
                topic_id=req.topicId, messages=history, user_id=req.userId
            ):
                # SSE frame: each `data:` line is one delta. JSON-encode so newlines
                # in the model output don't break the protocol's line-delimited shape.
                import json as _json

                yield f"data: {_json.dumps({'delta': delta})}\n\n".encode()
        finally:
            yield b"data: [DONE]\n\n"

    return StreamingResponse(sse(), media_type="text/event-stream")
