"""Admin AI cost dashboard route.

GET /admin/ai-cost  → rolling rollup + budget alerts.

Per ADR-0019 §"Cost dashboard". Surfaced under /admin/ rather than
/content/ so the upstream API gateway can gate on admin-only auth
without touching the authoring path.

Auth gating wires up alongside the moderator queue UI in S45 frontend
(separate task); for v1 the route is open in dev and gated by the
upstream API gateway in prod.
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from learning.ai_gateway.cost_dashboard import (
    BudgetAlert,
    CostRollup,
    get_tracker,
)

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
