"""Outbound HTTP helpers — forward the current trace-id so service-to-service
calls keep the trace continuous."""

from __future__ import annotations

from typing import Any

from alp_telemetry.context import current_trace_id


def traced_request_kwargs(
    base: dict[str, Any] | None = None, *, span_id: str = "0" * 16
) -> dict[str, Any]:
    """Return kwargs suitable for httpx/requests calls with a `traceparent`
    header attached when a trace-id is bound. Merges into any caller-provided
    `headers` dict so existing keys aren't lost.

    No-op (returns `base` unchanged) when no trace-id is bound — keeps
    background-task callers honest without forcing them through the
    middleware."""
    out: dict[str, Any] = dict(base or {})
    tid = current_trace_id()
    if tid is None:
        return out
    headers = dict(out.get("headers") or {})
    headers.setdefault("traceparent", f"00-{tid}-{span_id}-01")
    out["headers"] = headers
    return out
