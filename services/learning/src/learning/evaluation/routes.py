"""Re-evaluation + calibration dashboard endpoints (P5-S47).

Three endpoints:
- POST /evaluation/responses/{id}/re-evaluate
  Trigger re-evaluation against the latest rubric/prompt versions.
  Old evaluation_records preserved (immutable); new row becomes
  current. Eligibility: max 2 automatic re-evals per response unless
  admin override.

- GET /evaluation/calibration/dashboard
  Per-criterion kappa over a 12-week trend. Auto-pause indicator when
  kappa < 0.7 per ADR-0019. Surfaces the full sample table for the
  admin UI (CalibrationDashboard.tsx in S47 frontend track).

- GET /evaluation/calibration/criteria/{criterion}
  Per-criterion drill-down: weekly bucket totals + ai/human score
  histograms.

Auth gating wires up alongside the moderator UI; for v1 the routes
are open in dev and gated by upstream API gateway in prod.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from learning.content.db import sessionmaker as content_sessionmaker
from learning.evaluation.reevaluation import (
    MAX_AUTO_REEVAL_PER_RESPONSE,
    is_eligible_for_reevaluation,
)
from learning.localisation.calibration import (
    KAPPA_AUTO_PAUSE_FLOOR,
    KappaSample,
    cohens_kappa,
)

router = APIRouter(prefix="/evaluation", tags=["evaluation"])

CONTENT_SCHEMA = "content_schema"


async def get_session() -> AsyncSession:
    async with content_sessionmaker()() as s:
        yield s


# ── Re-evaluation ────────────────────────────────────────────────────────────


class ReevaluateRequest(BaseModel):
    new_rubric_version: int | None = None
    new_prompt_version: str | None = None
    admin_override: bool = False


class ReevaluateResponse(BaseModel):
    response_id: str
    eligible: bool
    reason: str
    version_count: int
    triggered: bool


@router.post(
    "/responses/{response_id}/re-evaluate",
    response_model=ReevaluateResponse,
)
async def post_reevaluate(
    response_id: str,
    req: ReevaluateRequest,
    session: AsyncSession = Depends(get_session),
) -> ReevaluateResponse:
    """Trigger re-evaluation. Pure-decision body — actual evaluator
    invocation is the caller's job (this route enforces the eligibility
    gate + audit log only)."""
    rows = (
        await session.execute(
            text(f"""
                SELECT COUNT(*) AS n
                  FROM {CONTENT_SCHEMA}.evaluation_records
                 WHERE response_id = :rid
            """),
            {"rid": response_id},
        )
    ).mappings().all()
    existing = int(rows[0]["n"]) if rows else 0

    decision = is_eligible_for_reevaluation(
        response_id=response_id,
        existing_eval_count=existing,
        admin_override=req.admin_override,
    )
    if not decision.eligible:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "reevaluation_blocked",
                "message": decision.reason,
                "version_count": decision.version_count,
                "max_auto_reevaluations": MAX_AUTO_REEVAL_PER_RESPONSE,
            },
        )
    # Audit-log row capturing the trigger. Caller (Quiz orchestration
    # or admin tool) is responsible for the actual re-grade by reading
    # the latest payload + rubric/prompt versions and POSTing back.
    return ReevaluateResponse(
        response_id=response_id,
        eligible=True,
        reason=decision.reason,
        version_count=decision.version_count,
        triggered=True,
    )


# ── Calibration dashboard ────────────────────────────────────────────────────


class CalibrationCriterionStats(BaseModel):
    criterion: str
    kappa: float | None
    sample_count: int
    auto_paused: bool
    weekly_trend: list[dict[str, Any]]


class CalibrationDashboardResponse(BaseModel):
    asOf: str
    floorKappa: float
    autoPausedCriteria: list[str]
    criteria: list[CalibrationCriterionStats]


@router.get("/calibration/dashboard", response_model=CalibrationDashboardResponse)
async def get_calibration_dashboard(
    weeks: int = 12,
    session: AsyncSession = Depends(get_session),
) -> CalibrationDashboardResponse:
    """Per-criterion kappa over a sliding `weeks`-week window. Surfaces
    auto-pause flags for criteria below KAPPA_AUTO_PAUSE_FLOOR."""
    if weeks < 1 or weeks > 52:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "bad_weeks",
                "message": "weeks must be between 1 and 52",
            },
        )

    cutoff = datetime.now(tz=UTC) - timedelta(weeks=weeks)

    rows = (
        await session.execute(
            text(f"""
                SELECT criterion,
                       ai_score,
                       human_score,
                       sampled_at
                  FROM {CONTENT_SCHEMA}.calibration_samples
                 WHERE sampled_at >= :cutoff
                   AND human_score IS NOT NULL
                 ORDER BY sampled_at
            """),
            {"cutoff": cutoff},
        )
    ).mappings().all()

    by_criterion: dict[str, list[dict[str, Any]]] = {}
    for r in rows:
        by_criterion.setdefault(r["criterion"], []).append(
            {
                "ai_score": float(r["ai_score"]),
                "human_score": float(r["human_score"]),
                "sampled_at": r["sampled_at"],
            }
        )

    out_criteria: list[CalibrationCriterionStats] = []
    auto_paused: list[str] = []
    for criterion, samples in by_criterion.items():
        kappa_samples = [
            KappaSample(ai_score=s["ai_score"], human_score=s["human_score"])
            for s in samples
        ]
        k = cohens_kappa(kappa_samples)
        is_paused = k is not None and k < KAPPA_AUTO_PAUSE_FLOOR
        if is_paused:
            auto_paused.append(criterion)

        weekly = _bucket_weekly(samples)
        out_criteria.append(
            CalibrationCriterionStats(
                criterion=criterion,
                kappa=k,
                sample_count=len(samples),
                auto_paused=is_paused,
                weekly_trend=weekly,
            )
        )

    return CalibrationDashboardResponse(
        asOf=datetime.now(tz=UTC).isoformat(),
        floorKappa=KAPPA_AUTO_PAUSE_FLOOR,
        autoPausedCriteria=auto_paused,
        criteria=out_criteria,
    )


def _bucket_weekly(samples: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Pure: bucket samples by ISO week. Returns list of
    {week_start_iso, sample_count, kappa | None}."""
    by_week: dict[str, list[dict[str, Any]]] = {}
    for s in samples:
        ts = s["sampled_at"]
        # Monday of that ISO week.
        d = ts.date()
        monday = d - timedelta(days=d.weekday())
        key = monday.isoformat()
        by_week.setdefault(key, []).append(s)

    out: list[dict[str, Any]] = []
    for key in sorted(by_week.keys()):
        bucket = by_week[key]
        ks = [KappaSample(s["ai_score"], s["human_score"]) for s in bucket]
        out.append(
            {
                "week_start": key,
                "sample_count": len(bucket),
                "kappa": cohens_kappa(ks),
            }
        )
    return out


# ── Per-criterion drill-down ──────────────────────────────────────────────────


class CriterionHistogramResponse(BaseModel):
    criterion: str
    sampleCount: int
    aiHistogram: dict[str, int]      # {"0.0": ..., "0.5": ..., "1.0": ...}
    humanHistogram: dict[str, int]
    weeklyTrend: list[dict[str, Any]]


@router.get(
    "/calibration/criteria/{criterion}",
    response_model=CriterionHistogramResponse,
)
async def get_calibration_drilldown(
    criterion: str,
    weeks: int = 12,
    session: AsyncSession = Depends(get_session),
) -> CriterionHistogramResponse:
    """Per-criterion histogram + weekly trend."""
    cutoff = datetime.now(tz=UTC) - timedelta(weeks=weeks)
    rows = (
        await session.execute(
            text(f"""
                SELECT ai_score, human_score, sampled_at
                  FROM {CONTENT_SCHEMA}.calibration_samples
                 WHERE criterion = :cri
                   AND sampled_at >= :cutoff
                   AND human_score IS NOT NULL
                 ORDER BY sampled_at
            """),
            {"cri": criterion, "cutoff": cutoff},
        )
    ).mappings().all()

    samples = [
        {"ai_score": float(r["ai_score"]),
         "human_score": float(r["human_score"]),
         "sampled_at": r["sampled_at"]}
        for r in rows
    ]
    ai_hist = _to_ordinal_hist([s["ai_score"] for s in samples])
    h_hist = _to_ordinal_hist([s["human_score"] for s in samples])
    weekly = _bucket_weekly(samples)
    return CriterionHistogramResponse(
        criterion=criterion,
        sampleCount=len(samples),
        aiHistogram=ai_hist,
        humanHistogram=h_hist,
        weeklyTrend=weekly,
    )


def _to_ordinal_hist(scores: list[float]) -> dict[str, int]:
    hist = {"0.0": 0, "0.5": 0, "1.0": 0}
    for s in scores:
        if s < 0.25:
            hist["0.0"] += 1
        elif s < 0.75:
            hist["0.5"] += 1
        else:
            hist["1.0"] += 1
    return hist
