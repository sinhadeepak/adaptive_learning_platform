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


# ── /admin/ops/infra — local stack health rollup ─────────────────────────────


class InfraComponent(BaseModel):
    name: str
    kind: str  # "service" | "infra"
    status: str  # "ok" | "down" | "degraded"
    detail: str | None = None
    metric: dict | None = None  # extra structured info (latency, counts)


class InfraResponse(BaseModel):
    components: list[InfraComponent]
    checkedAt: str


@router.get("/ops/infra", response_model=InfraResponse)
async def get_ops_infra() -> InfraResponse:
    """Aggregate health snapshot of every container in the local stack.

    Probes each backend service's /health, NATS /varz, OpenSearch
    /_cluster/health, Redis PING, and Postgres SELECT 1. Pure best-
    effort: a downed component returns status='down' with a detail
    string instead of failing the whole call.
    """
    import asyncio
    import time
    from datetime import datetime, timezone

    import httpx

    SERVICES = [
        # In-Docker hostnames; this endpoint runs from the learning container.
        ("identity", "http://identity:8000/health"),
        ("learning", "http://localhost:8000/health"),  # self
        ("engagement", "http://engagement:8000/health"),
        ("quiz", "http://quiz:8000/health"),
        ("marketplace", "http://marketplace:8000/health"),
        ("payment", "http://payment:8000/health"),
    ]

    components: list[InfraComponent] = []

    async def _probe_http(name: str, kind: str, url: str) -> InfraComponent:
        t0 = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                r = await client.get(url)
            ms = round((time.perf_counter() - t0) * 1000)
            if r.status_code == 200:
                return InfraComponent(
                    name=name, kind=kind, status="ok",
                    metric={"latencyMs": ms},
                )
            return InfraComponent(
                name=name, kind=kind, status="degraded",
                detail=f"HTTP {r.status_code}",
                metric={"latencyMs": ms},
            )
        except Exception as exc:  # noqa: BLE001
            return InfraComponent(
                name=name, kind=kind, status="down",
                detail=str(exc)[:200],
            )

    async def _probe_nats() -> InfraComponent:
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                r = await client.get("http://nats:8222/varz")
            data = r.json()
            return InfraComponent(
                name="nats", kind="infra", status="ok",
                metric={
                    "connections": data.get("connections", 0),
                    "inMsgs": data.get("in_msgs", 0),
                    "outMsgs": data.get("out_msgs", 0),
                    "memMb": round(data.get("mem", 0) / 1_048_576, 1),
                },
            )
        except Exception as exc:  # noqa: BLE001
            return InfraComponent(name="nats", kind="infra", status="down", detail=str(exc)[:200])

    async def _probe_opensearch() -> InfraComponent:
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                r = await client.get("http://opensearch:9200/_cluster/health")
            data = r.json()
            cluster_status = data.get("status", "unknown")
            return InfraComponent(
                name="opensearch", kind="infra",
                status="ok" if cluster_status == "green" else "degraded",
                detail=f"cluster={cluster_status}",
                metric={
                    "shards": data.get("active_shards", 0),
                    "nodes": data.get("number_of_nodes", 0),
                },
            )
        except Exception as exc:  # noqa: BLE001
            return InfraComponent(name="opensearch", kind="infra", status="down", detail=str(exc)[:200])

    async def _probe_redis() -> InfraComponent:
        try:
            import redis.asyncio as aioredis
            client = aioredis.from_url("redis://redis:6379/0")
            t0 = time.perf_counter()
            await client.ping()
            ms = round((time.perf_counter() - t0) * 1000)
            await client.close()
            return InfraComponent(
                name="redis", kind="infra", status="ok",
                metric={"latencyMs": ms},
            )
        except Exception as exc:  # noqa: BLE001
            return InfraComponent(name="redis", kind="infra", status="down", detail=str(exc)[:200])

    async def _probe_postgres() -> InfraComponent:
        try:
            from sqlalchemy import text as _t
            async with content_sessionmaker()() as s:
                t0 = time.perf_counter()
                conns = (await s.execute(_t("SELECT count(*) FROM pg_stat_activity WHERE state IS NOT NULL"))).scalar()
                ms = round((time.perf_counter() - t0) * 1000)
            return InfraComponent(
                name="postgres", kind="infra", status="ok",
                metric={"latencyMs": ms, "activeConnections": int(conns or 0)},
            )
        except Exception as exc:  # noqa: BLE001
            return InfraComponent(name="postgres", kind="infra", status="down", detail=str(exc)[:200])

    # Run all probes concurrently.
    service_probes = [_probe_http(name, "service", url) for name, url in SERVICES]
    infra_probes = [_probe_nats(), _probe_opensearch(), _probe_redis(), _probe_postgres()]
    components = await asyncio.gather(*service_probes, *infra_probes)

    return InfraResponse(
        components=components,
        checkedAt=datetime.now(timezone.utc).isoformat(),
    )
