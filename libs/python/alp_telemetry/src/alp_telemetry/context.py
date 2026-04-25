"""W3C Trace Context primitives + a contextvar to thread the trace-id through
the request without polluting every function signature."""

from __future__ import annotations

import re
import secrets
from contextvars import ContextVar

# Trace-ID is exactly 32 lowercase hex chars, all-zero is reserved as "invalid".
_TRACEPARENT_RE = re.compile(r"^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$")
_INVALID_TRACE_ID = "0" * 32

_trace_id_var: ContextVar[str | None] = ContextVar("alp_trace_id", default=None)


def parse_traceparent(header: str | None) -> str | None:
    """Return the 32-hex trace-id from a `traceparent` header, or None when
    the header is missing/malformed/all-zero. Permissive on case for safety."""
    if header is None:
        return None
    m = _TRACEPARENT_RE.match(header.strip().lower())
    if m is None:
        return None
    trace_id = m.group(2)
    if trace_id == _INVALID_TRACE_ID:
        return None
    return trace_id


def generate_trace_id() -> str:
    """Generate a fresh W3C-compliant trace-id (16 random bytes, hex-lowercase)."""
    return secrets.token_hex(16)


def bind_trace_id(trace_id: str) -> None:
    """Bind a trace-id to the current request scope. The middleware calls this
    after deriving the value from the inbound header (or generating one)."""
    _trace_id_var.set(trace_id)


def current_trace_id() -> str | None:
    """Return the trace-id bound for the current scope, or None if outside a
    request (background tasks, startup hooks, tests without the middleware)."""
    return _trace_id_var.get()
