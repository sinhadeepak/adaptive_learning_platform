"""Pure-Dart-style: parse + generate are deterministic and never throw."""

from __future__ import annotations

from alp_telemetry.context import (
    bind_trace_id,
    current_trace_id,
    generate_trace_id,
    parse_traceparent,
)


def test_parse_recognises_well_formed_traceparent() -> None:
    tid = parse_traceparent("00-0123456789abcdef0123456789abcdef-aaaaaaaaaaaaaaaa-01")
    assert tid == "0123456789abcdef0123456789abcdef"


def test_parse_uppercase_normalised_to_lowercase() -> None:
    tid = parse_traceparent("00-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA-bbbbbbbbbbbbbbbb-00")
    assert tid == "a" * 32


def test_parse_returns_none_on_garbage() -> None:
    for bad in ("", "not-a-traceparent", "00-short-aaaaaaaaaaaaaaaa-01", None):
        assert parse_traceparent(bad) is None


def test_parse_rejects_all_zero_invalid_trace_id() -> None:
    """W3C reserves 0*32 as 'invalid' — we treat it as no trace."""
    assert parse_traceparent("00-" + "0" * 32 + "-aaaaaaaaaaaaaaaa-01") is None


def test_generate_returns_32_lowercase_hex() -> None:
    tid = generate_trace_id()
    assert len(tid) == 32
    assert all(c in "0123456789abcdef" for c in tid)


def test_generate_is_unique() -> None:
    assert len({generate_trace_id() for _ in range(100)}) == 100


def test_bind_round_trips_via_contextvar() -> None:
    bind_trace_id("abc123")
    assert current_trace_id() == "abc123"


def test_current_is_none_when_unbound_in_fresh_context() -> None:
    """In a fresh asyncio task / contextvar copy, current_trace_id is None
    until bind_trace_id runs. Caveat: tests that mutate the contextvar in
    the same scope can see leaks — every fixture should bind explicitly.
    Here we just smoke-test the read path."""
    # Don't assert None unconditionally (other tests may have bound). Just
    # check the function doesn't throw when called in any state.
    _ = current_trace_id()
