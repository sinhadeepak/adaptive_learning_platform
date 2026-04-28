"""traced_request_kwargs builds outbound headers when a trace is bound."""

from __future__ import annotations

from alp_telemetry import bind_trace_id, traced_request_kwargs
from alp_telemetry.context import _trace_id_var


def test_returns_base_unchanged_when_no_trace_bound() -> None:
    _trace_id_var.set(None)
    assert traced_request_kwargs() == {}
    assert traced_request_kwargs({"timeout": 5}) == {"timeout": 5}


def test_attaches_traceparent_header_when_bound() -> None:
    bind_trace_id("a" * 32)
    out = traced_request_kwargs()
    assert "headers" in out
    assert out["headers"]["traceparent"].startswith("00-" + "a" * 32 + "-")


def test_preserves_caller_headers() -> None:
    bind_trace_id("b" * 32)
    out = traced_request_kwargs({"headers": {"authorization": "Bearer x"}})
    assert out["headers"]["authorization"] == "Bearer x"
    assert "traceparent" in out["headers"]


def test_does_not_clobber_caller_traceparent() -> None:
    """Caller-supplied traceparent wins — they may be re-issuing for a child span."""
    bind_trace_id("c" * 32)
    out = traced_request_kwargs({"headers": {"traceparent": "explicit-value"}})
    assert out["headers"]["traceparent"] == "explicit-value"
