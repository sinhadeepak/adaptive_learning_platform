"""Admin AI Gateway routes.

GET  /admin/ai-cost              → rolling rollup + budget alerts
POST /admin/ai-audit-log/purge   → drop ai_generation_jobs > N days old

Per ADR-0019 §"Cost dashboard" + §"Audit log". Surfaced under /admin/
rather than /content/ so the upstream API gateway can gate on admin-
only auth without touching the authoring path.

Auth gating wires up alongside the moderator queue UI; for v1 the
routes are open in dev and gated by the upstream API gateway in prod.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from learning.ai_gateway.audit_log import purge_older_than_days
from learning.ai_gateway.cost_dashboard import (
    BudgetAlert,
    CostRollup,
    get_tracker,
)
from learning.content.db import sessionmaker as content_sessionmaker

router = APIRouter(prefix="/admin", tags=["admin"])


class RollupOut(BaseModel):
    period: str
    totalUsd: float
    callCount: int
    byTouchpoint: dict[str, float]
    byProvider: dict[str, float]
    topCreators: list[dict]   # [{creatorId, costUsd}, ...] top 10


class BudgetAlertOut(BaseModel):
    period: str
    thresholdPct: int
    currentUsd: float
    budgetUsd: float


class CostDashboardResponse(BaseModel):
    day: RollupOut
    week: RollupOut
    month: RollupOut
    alerts: list[BudgetAlertOut]


@router.get("/ai-cost", response_model=CostDashboardResponse)
async def get_ai_cost() -> CostDashboardResponse:
    """Rolling AI spend per touchpoint × provider × creator over
    day / week / month windows + budget alerts."""
    tracker = get_tracker()
    return CostDashboardResponse(
        day=_to_out(tracker.rollup("day")),
        week=_to_out(tracker.rollup("week")),
        month=_to_out(tracker.rollup("month")),
        alerts=[_to_alert(a) for a in tracker.budget_alerts()],
    )


def _to_out(rollup: CostRollup) -> RollupOut:
    # Top 10 creators by spend.
    top_creators = sorted(
        rollup.by_creator.items(), key=lambda kv: -kv[1],
    )[:10]
    return RollupOut(
        period=rollup.period,
        totalUsd=rollup.total_usd,
        callCount=rollup.call_count,
        byTouchpoint=rollup.by_touchpoint,
        byProvider=rollup.by_provider,
        topCreators=[{"creatorId": cid, "costUsd": cost} for cid, cost in top_creators],
    )


def _to_alert(alert: BudgetAlert) -> BudgetAlertOut:
    return BudgetAlertOut(
        period=alert.period,
        thresholdPct=alert.threshold_pct,
        currentUsd=alert.current_usd,
        budgetUsd=alert.budget_usd,
    )


# ── /admin/ai-audit-log/purge — 90-day retention primitive ────────────────────


async def _audit_session() -> AsyncSession:
    async with content_sessionmaker()() as s:
        yield s


class PurgeRequest(BaseModel):
    days: int = Field(default=90, ge=1, le=365)


class PurgeResponse(BaseModel):
    rowsDeleted: int
    days: int


@router.post("/ai-audit-log/purge", response_model=PurgeResponse)
async def post_audit_log_purge(
    req: PurgeRequest,
    session: AsyncSession = Depends(_audit_session),
) -> PurgeResponse:
    """Drop `ai_generation_jobs` rows older than `days`.

    Default 90 days per ADR-0019 audit-retention policy. Cron task
    POSTs once a week with no body (defaults apply); admin UI can
    POST with `{"days": <override>}` for ad-hoc cleanup.
    """
    try:
        deleted = await purge_older_than_days(session, days=req.days)
        await session.commit()
    except Exception as e:  # noqa: BLE001
        raise HTTPException(
            status_code=500,
            detail={"code": "purge_failed", "message": str(e)},
        ) from e
    return PurgeResponse(rowsDeleted=deleted, days=req.days)
