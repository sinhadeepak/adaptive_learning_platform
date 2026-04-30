"""Phase 5 (P5-S38) — quota + metrics tests for the AI Gateway."""

from __future__ import annotations

import asyncio

import pytest
from pydantic import BaseModel

from learning.ai_gateway import (
    AIGateway,
    QuotaChecker,
    QuotaConfig,
    QuotaExceededError,
)
from learning.ai_gateway.metrics import record_call, record_cache_hit
from learning.ai_gateway.prompt_registry import PromptTemplate, PromptRegistry
from learning.ai_gateway.providers.stub_provider import StubProvider
from learning.ai_gateway.routing import default_stub_config


def _run(coro):
    return asyncio.run(coro)


# ── Quota checker ────────────────────────────────────────────────────────────


def test_quota_checker_no_redis_fail_open() -> None:
    """incr_fn=None means no Redis configured → quota check is a no-op."""
    qc = QuotaChecker(QuotaConfig(), incr_fn=None)
    _run(qc.check(touchpoint="authoring", creator_id="u1"))  # must not raise


def test_quota_checker_under_limit_passes() -> None:
    counters: dict[str, int] = {}

    async def fake_incr(key: str, ttl: int) -> int:
        counters[key] = counters.get(key, 0) + 1
        return counters[key]

    qc = QuotaChecker(
        QuotaConfig(
            per_creator_per_day={"authoring": 5},
            platform_per_minute={},  # no platform-wide cap
        ),
        incr_fn=fake_incr,
    )
    for _ in range(5):
        _run(qc.check(touchpoint="authoring", creator_id="u1"))


def test_quota_checker_over_limit_raises() -> None:
    counters: dict[str, int] = {}

    async def fake_incr(key: str, ttl: int) -> int:
        counters[key] = counters.get(key, 0) + 1
        return counters[key]

    qc = QuotaChecker(
        QuotaConfig(
            per_creator_per_day={"authoring": 2},
            platform_per_minute={},
        ),
        incr_fn=fake_incr,
    )
    _run(qc.check(touchpoint="authoring", creator_id="u1"))
    _run(qc.check(touchpoint="authoring", creator_id="u1"))
    with pytest.raises(QuotaExceededError) as exc:
        _run(qc.check(touchpoint="authoring", creator_id="u1"))
    assert "authoring" in str(exc.value)
    assert exc.value.scope.startswith("creator=u1")


def test_quota_checker_unlimited_touchpoint_skips() -> None:
    """`None` cap means unlimited — no incr_fn call needed."""
    calls = 0

    async def fake_incr(key: str, ttl: int) -> int:
        nonlocal calls
        calls += 1
        return calls

    qc = QuotaChecker(
        QuotaConfig(
            per_creator_per_day={"authoring": None},  # unlimited
            platform_per_minute={},
        ),
        incr_fn=fake_incr,
    )
    for _ in range(50):
        _run(qc.check(touchpoint="authoring", creator_id="u1"))
    assert calls == 0  # never called for unlimited touchpoint


def test_quota_checker_redis_failure_fails_open() -> None:
    """Any exception from incr_fn is logged + treated as 'no count'."""

    async def broken_incr(key: str, ttl: int) -> int:
        raise RuntimeError("redis is down")

    qc = QuotaChecker(
        QuotaConfig(per_creator_per_day={"authoring": 1}, platform_per_minute={}),
        incr_fn=broken_incr,
    )
    # Even at 100 calls, no QuotaExceededError because incr fails open.
    for _ in range(100):
        _run(qc.check(touchpoint="authoring", creator_id="u1"))


def test_quota_checker_platform_per_minute() -> None:
    counters: dict[str, int] = {}

    async def fake_incr(key: str, ttl: int) -> int:
        counters[key] = counters.get(key, 0) + 1
        return counters[key]

    qc = QuotaChecker(
        QuotaConfig(
            per_creator_per_day={},
            platform_per_minute={"evaluation": 3},
        ),
        incr_fn=fake_incr,
    )
    for _ in range(3):
        _run(qc.check(touchpoint="evaluation"))
    with pytest.raises(QuotaExceededError) as exc:
        _run(qc.check(touchpoint="evaluation"))
    assert exc.value.scope.startswith("platform")


def test_quota_checker_creator_and_platform_both_enforced() -> None:
    """Per-creator limit hits before platform limit."""
    counters: dict[str, int] = {}

    async def fake_incr(key: str, ttl: int) -> int:
        counters[key] = counters.get(key, 0) + 1
        return counters[key]

    qc = QuotaChecker(
        QuotaConfig(
            per_creator_per_day={"authoring": 2},
            platform_per_minute={"authoring": 100},
        ),
        incr_fn=fake_incr,
    )
    _run(qc.check(touchpoint="authoring", creator_id="u1"))
    _run(qc.check(touchpoint="authoring", creator_id="u1"))
    with pytest.raises(QuotaExceededError) as exc:
        _run(qc.check(touchpoint="authoring", creator_id="u1"))
    assert "creator=u1" in exc.value.scope


# ── Gateway integration with quotas ──────────────────────────────────────────


class _Out(BaseModel):
    ok: bool = True


def _make_gw_with_quota(cap: int = 2) -> AIGateway:
    counters: dict[str, int] = {}

    async def fake_incr(key: str, ttl: int) -> int:
        counters[key] = counters.get(key, 0) + 1
        return counters[key]

    qc = QuotaChecker(
        QuotaConfig(
            per_creator_per_day={"authoring": cap},
            platform_per_minute={},
        ),
        incr_fn=fake_incr,
    )
    reg = PromptRegistry()
    reg._templates[("t", "1.0.0")] = PromptTemplate(
        id="t",
        version="1.0.0",
        touchpoint="authoring",
        system="hello",
        output_schema="_Out",
    )
    stub = StubProvider()
    stub.register_stub_response("_Out", {"ok": True})
    return AIGateway(
        routing=default_stub_config(),
        prompts=reg,
        providers={"stub": stub},
        quotas=qc,
    )


def test_gateway_call_under_quota() -> None:
    gw = _make_gw_with_quota(cap=2)
    _run(gw.call(touchpoint="authoring", prompt_template_id="t",
                 prompt_template_version="1.0.0", prompt_inputs={},
                 schema=_Out, creator_id="u1"))


def test_gateway_call_over_quota_raises() -> None:
    gw = _make_gw_with_quota(cap=1)
    _run(gw.call(touchpoint="authoring", prompt_template_id="t",
                 prompt_template_version="1.0.0", prompt_inputs={},
                 schema=_Out, creator_id="u1"))
    with pytest.raises(QuotaExceededError):
        _run(gw.call(touchpoint="authoring", prompt_template_id="t",
                     prompt_template_version="1.0.0", prompt_inputs={},
                     schema=_Out, creator_id="u1"))


# ── Metrics — smoke that the calls don't crash ───────────────────────────────


def test_record_call_smoke() -> None:
    """record_call must accept all keyword combinations without raising."""
    record_call(
        touchpoint="authoring",
        provider="openai",
        status="success",
        latency_ms=1234,
        tokens_in=100,
        tokens_out=200,
        cost_usd=0.05,
    )
    record_call(
        touchpoint="authoring",
        provider="openai",
        status="error:primary",
        latency_ms=500,
    )


def test_record_cache_hit_smoke() -> None:
    record_cache_hit("authoring")
