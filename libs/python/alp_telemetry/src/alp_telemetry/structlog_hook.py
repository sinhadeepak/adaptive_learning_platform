"""Structlog processor that injects the current trace-id into every record."""

from __future__ import annotations

from typing import Any

from alp_telemetry.context import current_trace_id


def inject_trace_id(_logger: Any, _method_name: str, event_dict: dict[str, Any]) -> dict[str, Any]:
    """Add `trace_id` to the log record when one is bound for the current
    scope. No-op outside request scope (background tasks, startup, tests).

    Idempotent — if a caller has already bound a `trace_id` via
    structlog.contextvars (the middleware does this) the existing value
    wins; we never clobber an explicit bind."""
    if "trace_id" in event_dict:
        return event_dict
    tid = current_trace_id()
    if tid is not None:
        event_dict["trace_id"] = tid
    return event_dict
