"""FastAPI middleware that ensures every request runs with a trace-id bound."""

from __future__ import annotations

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from alp_telemetry.context import bind_trace_id, generate_trace_id, parse_traceparent

_HEADER_TRACEPARENT = "traceparent"


class TraceContextMiddleware(BaseHTTPMiddleware):
    """Binds W3C trace-id (from inbound header or freshly generated) to the
    contextvar + structlog contextvars binding for the duration of the request.

    Also echoes the trace-id back in the response under `traceparent` so a
    client (or the next service in the chain) can stitch logs together.
    """

    async def dispatch(self, request: Request, call_next):
        inbound = request.headers.get(_HEADER_TRACEPARENT)
        trace_id = parse_traceparent(inbound) or generate_trace_id()

        bind_trace_id(trace_id)
        # structlog.contextvars binds key/values onto every log record produced
        # while the request executes — no per-call .bind() needed.
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(trace_id=trace_id)
        try:
            response: Response = await call_next(request)
        finally:
            structlog.contextvars.clear_contextvars()

        # Use the same span-id placeholder ("0" * 16) on the way out — we're
        # not running spans yet, just trace-id propagation. Real span-ids
        # land when an OTEL SDK is wired in Sprint 5.
        response.headers[_HEADER_TRACEPARENT] = f"00-{trace_id}-{'0' * 16}-01"
        return response
