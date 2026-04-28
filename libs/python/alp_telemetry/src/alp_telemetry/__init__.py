"""ALP telemetry SDK — W3C trace-context propagation for Python services.

Three pieces:
  - parse_traceparent / generate_trace_id: pure W3C Trace Context helpers
  - TraceContextMiddleware: FastAPI middleware that binds trace_id to a contextvar
    and the structlog contextvars binding so every log record on the request
    carries it. Falls back to generating a fresh ID when no header is present.
  - traced_request_kwargs: build outbound HTTP headers that forward the current
    trace-id, so service-to-service calls keep the trace continuous.

Pairs with the Go alptelemetry lib in libs/go/alptelemetry — same field name
(`trace_id`), same fallback shape, so a single Loki/Jaeger query stitches a
request across Python + Go hops.
"""

from alp_telemetry.context import (
    bind_trace_id,
    current_trace_id,
    generate_trace_id,
    parse_traceparent,
)
from alp_telemetry.middleware import TraceContextMiddleware
from alp_telemetry.outbound import traced_request_kwargs
from alp_telemetry.structlog_hook import inject_trace_id

__all__ = [
    "TraceContextMiddleware",
    "bind_trace_id",
    "current_trace_id",
    "generate_trace_id",
    "inject_trace_id",
    "parse_traceparent",
    "traced_request_kwargs",
]
