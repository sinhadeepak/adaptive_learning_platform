"""Prometheus metrics for the AI Gateway.

Per ADR-0019 §"Observability". Counters + histograms for every Gateway
call. Uses prometheus_client when available; falls back to a no-op
shim when the package isn't installed (defensive — alp-learning runs
fine without metrics, just without Prometheus scrape data).

Metrics (all labelled by touchpoint + provider):
- ai_gateway_call_total{touchpoint, provider, status}
- ai_gateway_latency_seconds{touchpoint, provider}
- ai_gateway_cost_usd_total{touchpoint, provider}
- ai_gateway_tokens_total{touchpoint, provider, kind}  (kind: input | output)
- ai_gateway_cache_hit_total{touchpoint}
"""

from __future__ import annotations

import logging
from typing import Any

log = logging.getLogger(__name__)


class _NoopMetric:
    """Metric stub when prometheus_client isn't installed."""

    def labels(self, *args: Any, **kwargs: Any) -> "_NoopMetric":
        return self

    def inc(self, amount: float = 1.0) -> None:
        pass

    def observe(self, amount: float) -> None:
        pass


def _build_metrics() -> dict[str, Any]:
    try:
        from prometheus_client import Counter, Histogram
    except ImportError:
        log.info("prometheus_client not installed; AI Gateway metrics are no-ops")
        return {
            "calls": _NoopMetric(),
            "latency": _NoopMetric(),
            "cost": _NoopMetric(),
            "tokens": _NoopMetric(),
            "cache_hits": _NoopMetric(),
        }

    return {
        "calls": Counter(
            "ai_gateway_call_total",
            "AI Gateway calls per touchpoint + provider + status",
            ["touchpoint", "provider", "status"],
        ),
        "latency": Histogram(
            "ai_gateway_latency_seconds",
            "AI Gateway provider call latency",
            ["touchpoint", "provider"],
            buckets=(0.1, 0.5, 1.0, 2.5, 5.0, 8.0, 15.0, 30.0, 60.0),
        ),
        "cost": Counter(
            "ai_gateway_cost_usd_total",
            "Estimated AI Gateway cost (USD) per touchpoint + provider",
            ["touchpoint", "provider"],
        ),
        "tokens": Counter(
            "ai_gateway_tokens_total",
            "AI Gateway tokens per touchpoint + provider + kind",
            ["touchpoint", "provider", "kind"],
        ),
        "cache_hits": Counter(
            "ai_gateway_cache_hit_total",
            "AI Gateway cache hits per touchpoint",
            ["touchpoint"],
        ),
    }


# Singleton — registered with the default Prometheus registry on import.
_METRICS = _build_metrics()


def record_call(
    *,
    touchpoint: str,
    provider: str,
    status: str,
    latency_ms: int,
    tokens_in: int = 0,
    tokens_out: int = 0,
    cost_usd: float = 0.0,
    creator_id: str | None = None,
) -> None:
    """Emit metrics for one Gateway call. Cheap; safe to call on every
    call site without conditional guards.

    Also dispatches to the in-process cost dashboard tracker (P5-S45)
    so the admin /admin/ai-cost route has a rolling-window view."""
    _METRICS["calls"].labels(touchpoint=touchpoint, provider=provider, status=status).inc()
    _METRICS["latency"].labels(touchpoint=touchpoint, provider=provider).observe(latency_ms / 1000.0)
    if cost_usd > 0:
        _METRICS["cost"].labels(touchpoint=touchpoint, provider=provider).inc(cost_usd)
    if tokens_in > 0:
        _METRICS["tokens"].labels(touchpoint=touchpoint, provider=provider, kind="input").inc(tokens_in)
    if tokens_out > 0:
        _METRICS["tokens"].labels(touchpoint=touchpoint, provider=provider, kind="output").inc(tokens_out)

    # Dispatch to dashboard tracker. Local import avoids module-load
    # cycle (cost_dashboard does not import metrics).
    if status == "success":
        from learning.ai_gateway.cost_dashboard import record_cost
        record_cost(
            touchpoint=touchpoint, provider=provider,
            cost_usd=cost_usd, creator_id=creator_id,
            tokens_in=tokens_in, tokens_out=tokens_out,
        )


def record_cache_hit(touchpoint: str) -> None:
    _METRICS["cache_hits"].labels(touchpoint=touchpoint).inc()
