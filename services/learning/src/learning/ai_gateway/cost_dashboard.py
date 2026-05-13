"""Cost dashboard rollup — in-process sliding window per touchpoint.

Per ADR-0019 §"Cost dashboard". Today / this week / this month spend
per touchpoint × provider. Top creators by usage. Forecast vs monthly
budget; alert thresholds at 80% / 95%.

For v1 this is in-memory only — sufficient for a single-process service
+ admin page. A persistent variant (writes to
content_schema.ai_generation_jobs and rolls up via SQL) lands when the
horizontal-scale story matters.

Pure-stdlib: no Prometheus dependency, no external DB. Tests cover
window expiry + per-touchpoint isolation.
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Literal

from sqlalchemy import text as _text

log = logging.getLogger(__name__)

# Window sizes in seconds.
_DAY = 86_400
_WEEK = _DAY * 7
_MONTH = _DAY * 30  # rolling 30-day window; calendar-month variant lands later

Period = Literal["day", "week", "month"]


@dataclass
class CostEntry:
    """One Gateway-call cost record."""

    timestamp: float
    touchpoint: str
    provider: str
    cost_usd: float
    creator_id: str | None = None
    tokens_in: int = 0
    tokens_out: int = 0


@dataclass
class CostRollup:
    """Aggregated rollup for one period."""

    period: Period
    total_usd: float = 0.0
    by_touchpoint: dict[str, float] = field(default_factory=dict)
    by_provider: dict[str, float] = field(default_factory=dict)
    by_creator: dict[str, float] = field(default_factory=dict)
    call_count: int = 0


@dataclass
class BudgetAlert:
    """Surfaced when the rolling spend exceeds an alert threshold."""

    period: Period
    threshold_pct: int            # 80 or 95
    current_usd: float
    budget_usd: float


class CostTracker:
    """In-process rolling-window cost accumulator. Thread-safe (the
    record function may be called from any FastAPI worker)."""

    def __init__(self) -> None:
        self._entries: list[CostEntry] = []
        self._lock = threading.Lock()
        # Per-period budgets in USD. Defaults are conservative for a
        # closed-beta deployment; admin can override at construction.
        self.day_budget_usd = 50.0
        self.week_budget_usd = 250.0
        self.month_budget_usd = 1000.0

    def record(
        self,
        *,
        touchpoint: str,
        provider: str,
        cost_usd: float,
        creator_id: str | None = None,
        tokens_in: int = 0,
        tokens_out: int = 0,
    ) -> None:
        """Append a cost record. O(1)."""
        with self._lock:
            self._entries.append(CostEntry(
                timestamp=time.time(),
                touchpoint=touchpoint,
                provider=provider,
                cost_usd=cost_usd,
                creator_id=creator_id,
                tokens_in=tokens_in,
                tokens_out=tokens_out,
            ))
            # Garbage-collect entries beyond the longest window. Keeps
            # the list bounded across long-lived processes.
            cutoff = time.time() - _MONTH
            self._entries = [e for e in self._entries if e.timestamp >= cutoff]

    def rollup(self, period: Period) -> CostRollup:
        """Aggregate spend over a window. Returns CostRollup with
        per-touchpoint / per-provider / per-creator breakdowns."""
        window = {"day": _DAY, "week": _WEEK, "month": _MONTH}[period]
        cutoff = time.time() - window
        out = CostRollup(period=period)
        with self._lock:
            relevant = [e for e in self._entries if e.timestamp >= cutoff]
        for e in relevant:
            out.total_usd += e.cost_usd
            out.by_touchpoint[e.touchpoint] = out.by_touchpoint.get(e.touchpoint, 0.0) + e.cost_usd
            out.by_provider[e.provider] = out.by_provider.get(e.provider, 0.0) + e.cost_usd
            if e.creator_id:
                out.by_creator[e.creator_id] = out.by_creator.get(e.creator_id, 0.0) + e.cost_usd
            out.call_count += 1
        # Round to 4 decimals for clean rendering.
        out.total_usd = round(out.total_usd, 4)
        out.by_touchpoint = {k: round(v, 4) for k, v in out.by_touchpoint.items()}
        out.by_provider = {k: round(v, 4) for k, v in out.by_provider.items()}
        out.by_creator = {k: round(v, 4) for k, v in out.by_creator.items()}
        return out

    def budget_alerts(self) -> list[BudgetAlert]:
        """Compute 80%/95% threshold breaches across all 3 windows.
        Returns alerts sorted by severity (95% before 80%)."""
        alerts: list[BudgetAlert] = []
        for period, budget in (
            ("day", self.day_budget_usd),
            ("week", self.week_budget_usd),
            ("month", self.month_budget_usd),
        ):
            rollup = self.rollup(period)  # type: ignore[arg-type]
            if budget <= 0:
                continue
            pct = rollup.total_usd / budget
            for thr in (0.95, 0.80):
                if pct >= thr:
                    alerts.append(BudgetAlert(
                        period=period,  # type: ignore[arg-type]
                        threshold_pct=int(thr * 100),
                        current_usd=round(rollup.total_usd, 4),
                        budget_usd=round(budget, 2),
                    ))
                    break  # only the highest threshold per period
        # 95% before 80%.
        alerts.sort(key=lambda a: (-a.threshold_pct, a.period))
        return alerts


# Singleton — same pattern as `metrics._METRICS`. Tests can construct
# their own CostTracker for isolation, or reset this one.
_TRACKER = CostTracker()


def record_cost(
    *,
    touchpoint: str,
    provider: str,
    cost_usd: float,
    creator_id: str | None = None,
    tokens_in: int = 0,
    tokens_out: int = 0,
) -> None:
    """Module-level recorder — called from `metrics.record_call`."""
    _TRACKER.record(
        touchpoint=touchpoint,
        provider=provider,
        cost_usd=cost_usd,
        creator_id=creator_id,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
    )


def get_tracker() -> CostTracker:
    """Module-level accessor — used by the admin route + tests."""
    return _TRACKER


def reset_for_tests() -> None:
    """Test-only helper: clear the in-memory entries."""
    with _TRACKER._lock:  # noqa: SLF001
        _TRACKER._entries.clear()


async def load_from_db(database_url: str) -> int:
    """Hydrate the in-memory tracker from content_schema.ai_call_logs.

    Called at lifespan-startup so the admin /admin/ai-cost dashboard
    has data after a fresh process boot. Loads the past 30 days of
    rows (matching the longest rollup window). Returns the number of
    rows loaded; absorbs all errors so a missing table or DB issue
    doesn't block service startup.
    """
    try:
        from sqlalchemy.ext.asyncio import create_async_engine
    except ImportError:
        log.info("SQLAlchemy asyncio not available; skipping cost-log hydration")
        return 0

    engine = create_async_engine(database_url, pool_pre_ping=True)
    try:
        async with engine.connect() as conn:
            cutoff_secs = time.time() - _MONTH
            rows = (
                await conn.execute(
                    _text(
                        """
                        SELECT EXTRACT(EPOCH FROM ts)::float AS ts_epoch,
                               touchpoint, provider, cost_usd::float AS cost_usd,
                               creator_id::text AS creator_id,
                               tokens_in, tokens_out
                          FROM content_schema.ai_call_logs
                         WHERE ts >= NOW() - INTERVAL '30 days'
                         ORDER BY ts ASC
                        """
                    )
                )
            ).mappings().all()
        loaded = 0
        with _TRACKER._lock:  # noqa: SLF001
            for r in rows:
                ts = float(r["ts_epoch"])
                if ts < cutoff_secs:
                    continue
                _TRACKER._entries.append(  # noqa: SLF001
                    CostEntry(
                        timestamp=ts,
                        touchpoint=r["touchpoint"],
                        provider=r["provider"],
                        cost_usd=float(r["cost_usd"]),
                        creator_id=r["creator_id"],
                        tokens_in=int(r["tokens_in"]),
                        tokens_out=int(r["tokens_out"]),
                    )
                )
                loaded += 1
        return loaded
    except Exception as exc:  # noqa: BLE001
        log.warning("cost_dashboard: load_from_db skipped: %s", exc)
        return 0
    finally:
        await engine.dispose()
