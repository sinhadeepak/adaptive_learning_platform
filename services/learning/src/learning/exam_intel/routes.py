"""HTTP routes for the Exam Intelligence System.

Admin endpoints (require PLATFORM_ADMIN / MODERATOR):
  POST /admin/exams/{exam_id}/ingest-paper
  POST /admin/exams/{exam_id}/recompute-intel
  GET  /admin/exams/{exam_id}/papers                (paper inventory)

Student-facing endpoints (auth required, no role gate):
  GET /exam-intel/{exam_id}/topic-yield
  GET /exam-intel/{exam_id}/question-pattern
  GET /exam-intel/{exam_id}/never-asked
  GET /exam-intel/{exam_id}/trends

The single Pydantic schemas module is the source of truth for the
response shapes.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from learning.catalog.db import get_session
from learning.content.security import (
    JwtPrincipal,
    current_principal,
    principal_with_role,
)
from learning.exam_intel import aggregator as _agg
from learning.exam_intel import forecaster as _fc
from learning.exam_intel import ingest as _ingest
from learning.exam_intel import tagger as _tagger
from learning.exam_intel.schemas import (
    PastPaperIn,
    TopicYieldResponse,
    TopicYieldRow,
)

router = APIRouter(prefix="/exam-intel", tags=["exam-intel"])
admin_router = APIRouter(prefix="/admin/exams", tags=["exam-intel-admin"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]
PrincipalDep = Annotated[JwtPrincipal, Depends(current_principal)]

SCHEMA = "exam_intelligence_schema"

# Roles allowed to manage EIS (ingestion + recompute). Same set we
# use for curated test moderation per F6.
_ADMIN_ROLES = ("ADMIN", "MODERATOR", "PLATFORM_ADMIN")


# ── Admin: ingest + recompute ───────────────────────────────────────


@admin_router.post("/{exam_id}/ingest-paper", status_code=201)
async def ingest_paper(
    exam_id: str,
    body: PastPaperIn,
    session: SessionDep,
    principal: PrincipalDep,
) -> dict[str, Any]:
    """Ingest a structured past paper. PDF parsing is a follow-up;
    this endpoint accepts the already-structured `PastPaperIn` shape."""
    principal_with_role(*_ADMIN_ROLES, principal=principal)
    if body.exam_id != exam_id:
        raise HTTPException(
            status_code=422,
            detail={"code": "exam_mismatch", "message": "body.exam_id must match path exam_id"},
        )
    out = await _ingest.ingest_paper(session, body)
    await session.commit()
    return out


@admin_router.post("/{exam_id}/recompute-intel")
async def recompute_intel(
    exam_id: str,
    session: SessionDep,
    principal: PrincipalDep,
    forecast_year: int = 0,
) -> dict[str, Any]:
    """Run the aggregator + forecaster end-to-end for this exam.
    Returns a summary of how many rows landed."""
    principal_with_role(*_ADMIN_ROLES, principal=principal)
    if forecast_year == 0:
        # Default: forecast the next calendar year.
        from datetime import datetime
        forecast_year = datetime.now().year + 1

    agg_summary = await _agg.rollup_appearance_stats(session, exam_id)
    fc_summary = await _fc.forecast_topics(
        session, exam_id=exam_id, forecast_year=forecast_year
    )
    await session.commit()
    return {
        "examId": exam_id,
        "aggregator": agg_summary,
        "forecaster": fc_summary,
    }


@admin_router.post("/{exam_id}/papers/{paper_id}/tag")
async def tag_paper(
    exam_id: str,
    paper_id: str,
    request: Request,
    session: SessionDep,
    principal: PrincipalDep,
) -> dict[str, Any]:
    """LLM-tag every untagged question in a single paper. Idempotent —
    re-running on a TAGGED paper skips questions that already have
    `curated_tags` set. Use sparingly: each call burns LLM tokens."""
    principal_with_role(*_ADMIN_ROLES, principal=principal)
    gateway = getattr(request.app.state, "ai_gateway", None)
    if gateway is None:
        raise HTTPException(
            status_code=503,
            detail={"code": "ai_gateway_unavailable",
                    "message": "AI Gateway not configured on this deployment."},
        )
    summary = await _tagger.tag_paper(session, gateway, paper_id)
    await session.commit()
    return summary


@admin_router.post("/{exam_id}/tag-all-drafts")
async def tag_all_drafts(
    exam_id: str,
    request: Request,
    session: SessionDep,
    principal: PrincipalDep,
) -> dict[str, Any]:
    """Tag every DRAFT paper for this exam. The onboarding sweep
    when a new exam ships."""
    principal_with_role(*_ADMIN_ROLES, principal=principal)
    gateway = getattr(request.app.state, "ai_gateway", None)
    if gateway is None:
        raise HTTPException(
            status_code=503,
            detail={"code": "ai_gateway_unavailable",
                    "message": "AI Gateway not configured on this deployment."},
        )
    out = await _tagger.tag_all_drafts(session, gateway, exam_id)
    await session.commit()
    return out


@admin_router.get("/{exam_id}/papers")
async def list_papers(
    exam_id: str,
    session: SessionDep,
    principal: PrincipalDep,
) -> dict[str, Any]:
    """Admin paper inventory — newest first."""
    principal_with_role(*_ADMIN_ROLES, principal=principal)
    items = await _ingest.list_papers_for_exam(session, exam_id)
    return {"examId": exam_id, "items": items, "count": len(items)}


# ── Student / general read endpoints ────────────────────────────────


@router.get("/{exam_id}/topic-yield")
async def get_topic_yield(
    exam_id: str,
    session: SessionDep,
    forecast_year: int = 0,
) -> TopicYieldResponse:
    """Per-topic yield (P(appears) × expected_marks). Sorted by
    expected_marks descending so the high-yield items are first."""
    if forecast_year == 0:
        from datetime import datetime
        forecast_year = datetime.now().year + 1

    rows = (
        await session.execute(
            text(f"""
                SELECT topic_id, forecast_year,
                       p_appears, p_appears_ci_low, p_appears_ci_high,
                       expected_questions, expected_marks,
                       confidence, trend, last_computed_at
                  FROM {SCHEMA}.topic_forecast
                 WHERE exam_id = CAST(:eid AS uuid)
                   AND forecast_year = :y
                 ORDER BY expected_marks DESC
            """),
            {"eid": exam_id, "y": forecast_year},
        )
    ).mappings().all()

    items = [
        TopicYieldRow(
            topic_id=str(r["topic_id"]),
            forecast_year=int(r["forecast_year"]),
            p_appears=float(r["p_appears"]),
            p_appears_ci_low=float(r["p_appears_ci_low"]),
            p_appears_ci_high=float(r["p_appears_ci_high"]),
            expected_questions=float(r["expected_questions"]),
            expected_marks=float(r["expected_marks"]),
            confidence=float(r["confidence"]),
            trend=r["trend"],
            last_computed_at=r["last_computed_at"],
        )
        for r in rows
    ]
    return TopicYieldResponse(
        exam_id=exam_id, forecast_year=forecast_year, items=items
    )


@router.get("/{exam_id}/question-pattern")
async def get_question_pattern(
    exam_id: str, session: SessionDep
) -> dict[str, Any]:
    """Per-(topic, question_type) frequency. Drives ADP candidate
    selection — favour the question types that actually appear."""
    rows = (
        await session.execute(
            text(f"""
                SELECT topic_id, question_type, n_observed, avg_difficulty, last_seen_year
                  FROM {SCHEMA}.question_pattern_stats
                 WHERE exam_id = CAST(:eid AS uuid)
                 ORDER BY topic_id, n_observed DESC
            """),
            {"eid": exam_id},
        )
    ).mappings().all()
    out: dict[str, list[dict[str, Any]]] = {}
    for r in rows:
        tid = str(r["topic_id"])
        out.setdefault(tid, []).append({
            "questionType": r["question_type"],
            "nObserved": int(r["n_observed"]),
            "avgDifficulty": float(r["avg_difficulty"]) if r["avg_difficulty"] is not None else None,
            "lastSeenYear": r["last_seen_year"],
        })
    return {"examId": exam_id, "byTopic": out}


@router.get("/{exam_id}/never-asked")
async def get_never_asked(
    exam_id: str, session: SessionDep
) -> dict[str, Any]:
    """Topics that are in the current syllabus but have never been
    observed in past papers. These are the platform's risk list —
    low probability but non-zero, surface as a watchlist."""
    # Step 1: pull every topic id observed in past papers.
    rows = (
        await session.execute(
            text(f"""
                SELECT DISTINCT topic_id
                  FROM {SCHEMA}.topic_appearance_stats
                 WHERE exam_id = CAST(:eid AS uuid)
            """),
            {"eid": exam_id},
        )
    ).mappings().all()
    seen = {str(r["topic_id"]) for r in rows}

    # Step 2: pull every topic_id under this exam's subjects (catalog).
    syllabus_rows = (
        await session.execute(
            text("""
                SELECT t.id, t.title
                  FROM catalog_schema.topics t
                  JOIN catalog_schema.subjects s ON s.id = t.subject_id
                 WHERE s.exam_id = CAST(:eid AS uuid)
                   AND t.is_published = TRUE
            """),
            {"eid": exam_id},
        )
    ).mappings().all()

    never_asked = [
        {"topicId": str(r["id"]), "title": r["title"]}
        for r in syllabus_rows
        if str(r["id"]) not in seen
    ]
    return {
        "examId": exam_id,
        "neverAsked": never_asked,
        "count": len(never_asked),
    }


@router.get("/{exam_id}/trends")
async def get_trends(
    exam_id: str, session: SessionDep
) -> dict[str, Any]:
    """10-year time series per topic. Powers the content-team
    'is this topic rising or falling' diagnostic."""
    rows = (
        await session.execute(
            text(f"""
                SELECT topic_id, year, n_questions, total_marks
                  FROM {SCHEMA}.topic_appearance_stats
                 WHERE exam_id = CAST(:eid AS uuid)
                 ORDER BY topic_id, year
            """),
            {"eid": exam_id},
        )
    ).mappings().all()
    by_topic: dict[str, list[dict[str, Any]]] = {}
    for r in rows:
        tid = str(r["topic_id"])
        by_topic.setdefault(tid, []).append({
            "year": int(r["year"]),
            "nQuestions": int(r["n_questions"]),
            "totalMarks": int(r["total_marks"]),
        })
    return {"examId": exam_id, "byTopic": by_topic}
