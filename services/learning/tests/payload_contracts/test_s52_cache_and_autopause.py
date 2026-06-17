"""Phase 5 (P5-S52) — Gateway cache + runtime auto-pause.

Pure-function tests for the cache (LRU + TTL + cacheable touchpoints)
and the auto-pause runtime gate hooked into subjective grading.
"""

from __future__ import annotations

import asyncio
import time

import pytest

from learning.ai_gateway import AIGateway, PromptRegistry
from learning.ai_gateway.cache import (
    CACHEABLE_TOUCHPOINTS,
    GatewayCache,
    get_cache,
    reset_for_tests,
)
from learning.ai_gateway.prompt_registry import PromptTemplate
from learning.ai_gateway.providers.stub_provider import StubProvider
from learning.ai_gateway.routing import default_stub_config
from learning.evaluation.auto_pause import (
    get_paused_set,
    is_paused,
    set_paused,
)
from learning.evaluation.subjective import grade_subjective


def _run(coro):
    return asyncio.run(coro)


# ── GatewayCache: LRU + TTL + touchpoint gating ──────────────────────────────


def test_cache_get_returns_none_when_empty() -> None:
    c = GatewayCache()
    assert c.get(touchpoint="translation", key="k") is None


def test_cache_put_get_round_trip() -> None:
    c = GatewayCache()
    c.put(touchpoint="translation", key="k", value={"x": 1})
    assert c.get(touchpoint="translation", key="k") == {"x": 1}


def test_cache_skips_non_cacheable_touchpoints() -> None:
    c = GatewayCache()
    c.put(touchpoint="authoring", key="k", value={"x": 1})
    # No-op put → no entry stored.
    assert len(c) == 0
    assert c.get(touchpoint="authoring", key="k") is None


def test_cache_only_cacheable_touchpoints_set() -> None:
    assert "translation" in CACHEABLE_TOUCHPOINTS
    assert "quality_check" in CACHEABLE_TOUCHPOINTS
    assert "vision" in CACHEABLE_TOUCHPOINTS
    assert "authoring" not in CACHEABLE_TOUCHPOINTS
    assert "evaluation" not in CACHEABLE_TOUCHPOINTS


def test_cache_lru_evicts_oldest_when_over_capacity() -> None:
    c = GatewayCache(max_entries=3)
    for i in range(5):
        c.put(touchpoint="translation", key=f"k{i}", value={"i": i})
    # k0, k1 evicted; k2, k3, k4 remain.
    assert c.get(touchpoint="translation", key="k0") is None
    assert c.get(touchpoint="translation", key="k1") is None
    assert c.get(touchpoint="translation", key="k2") == {"i": 2}
    assert c.get(touchpoint="translation", key="k4") == {"i": 4}


def test_cache_lru_touch_on_get_keeps_entry_warm() -> None:
    c = GatewayCache(max_entries=3)
    c.put(touchpoint="translation", key="k0", value={"i": 0})
    c.put(touchpoint="translation", key="k1", value={"i": 1})
    c.put(touchpoint="translation", key="k2", value={"i": 2})
    # Touch k0 — should now be most-recently-used.
    _ = c.get(touchpoint="translation", key="k0")
    # Insert k3 — should evict k1 (now LRU), not k0.
    c.put(touchpoint="translation", key="k3", value={"i": 3})
    assert c.get(touchpoint="translation", key="k0") == {"i": 0}
    assert c.get(touchpoint="translation", key="k1") is None


def test_cache_ttl_expiry_returns_none() -> None:
    c = GatewayCache(ttl_seconds=0)  # immediate expiry
    c.put(touchpoint="translation", key="k", value={"x": 1})
    # Sleep a hair to ensure now() > expires_at.
    time.sleep(0.001)
    assert c.get(touchpoint="translation", key="k") is None


def test_cache_clear() -> None:
    c = GatewayCache()
    c.put(touchpoint="translation", key="k", value={"x": 1})
    c.clear()
    assert len(c) == 0


# ── Cache integrated with AIGateway.call ─────────────────────────────────────


class _CountingStub(StubProvider):
    """Stub that counts how many times .complete() is called."""
    def __init__(self):
        super().__init__()
        self.complete_calls = 0

    async def complete(self, **kw):  # type: ignore[override]
        self.complete_calls += 1
        return await super().complete(**kw)


from pydantic import BaseModel


class _StubReport(BaseModel):
    flagged_cultural: bool = False
    confidence: float = 0.5


def _make_translate_gateway() -> tuple[AIGateway, _CountingStub]:
    reg = PromptRegistry()
    reg._templates[("t", "1.0.0")] = PromptTemplate(
        id="t", version="1.0.0", touchpoint="translation",
        system="x={x}", output_schema="_StubReport",
    )
    stub = _CountingStub()
    stub.register_stub_response("_StubReport", {"flagged_cultural": False, "confidence": 0.9})
    return (
        AIGateway(routing=default_stub_config(), prompts=reg, providers={"stub": stub}),
        stub,
    )


def test_gateway_caches_translation_calls() -> None:
    """Same translation input → second call must skip the provider."""
    reset_for_tests()
    gw, stub = _make_translate_gateway()

    # First call: provider hit.
    out1 = _run(gw.call(
        touchpoint="translation",
        prompt_template_id="t",
        prompt_template_version="1.0.0",
        prompt_inputs={"x": "hello"},
        schema=_StubReport,
    ))
    # Second call with identical inputs: cache hit, no provider call.
    out2 = _run(gw.call(
        touchpoint="translation",
        prompt_template_id="t",
        prompt_template_version="1.0.0",
        prompt_inputs={"x": "hello"},
        schema=_StubReport,
    ))
    assert stub.complete_calls == 1, "second call should hit cache"
    assert out1.confidence == out2.confidence


def test_gateway_does_not_cache_authoring_calls() -> None:
    """Authoring is context-sensitive — every call must hit the provider."""
    reset_for_tests()
    reg = PromptRegistry()
    reg._templates[("t", "1.0.0")] = PromptTemplate(
        id="t", version="1.0.0", touchpoint="authoring",
        system="x={x}", output_schema="_StubReport",
    )
    stub = _CountingStub()
    stub.register_stub_response("_StubReport", {"flagged_cultural": False, "confidence": 0.9})
    gw = AIGateway(routing=default_stub_config(), prompts=reg, providers={"stub": stub})

    for _ in range(3):
        _run(gw.call(
            touchpoint="authoring",
            prompt_template_id="t",
            prompt_template_version="1.0.0",
            prompt_inputs={"x": "same"},
            schema=_StubReport,
        ))
    assert stub.complete_calls == 3


def test_gateway_cache_segregates_by_input_hash() -> None:
    """Different inputs → distinct cache keys → both hit the provider once."""
    reset_for_tests()
    gw, stub = _make_translate_gateway()

    _run(gw.call(
        touchpoint="translation", prompt_template_id="t",
        prompt_template_version="1.0.0",
        prompt_inputs={"x": "hello"}, schema=_StubReport,
    ))
    _run(gw.call(
        touchpoint="translation", prompt_template_id="t",
        prompt_template_version="1.0.0",
        prompt_inputs={"x": "world"}, schema=_StubReport,
    ))
    assert stub.complete_calls == 2


# ── Auto-pause runtime gate ──────────────────────────────────────────────────


def test_is_paused_returns_false_for_unset() -> None:
    set_paused([])
    assert is_paused("c1") is False


def test_set_paused_then_is_paused() -> None:
    set_paused(["c1", "c2"])
    assert is_paused("c1") is True
    assert is_paused("c2") is True
    assert is_paused("c3") is False
    set_paused([])  # cleanup


def test_get_paused_set_is_immutable() -> None:
    set_paused(["x"])
    s = get_paused_set()
    assert isinstance(s, frozenset)
    assert "x" in s
    set_paused([])  # cleanup


# ── grade_subjective respects auto-pause ─────────────────────────────────────


def _eval_gateway(canned: dict) -> AIGateway:
    reg = PromptRegistry()
    reg._templates[("subjective_essay_grade", "1.0.0")] = PromptTemplate(
        id="subjective_essay_grade", version="1.0.0", touchpoint="evaluation",
        system="stem={stem} model_answer={model_answer} "
               "student_text={student_text} rubric_block={rubric_block}",
        output_schema="SubjectiveEvaluationReport",
    )
    stub = StubProvider()
    stub.register_stub_response("SubjectiveEvaluationReport", canned)
    return AIGateway(routing=default_stub_config(), prompts=reg, providers={"stub": stub})


def test_grade_subjective_routes_to_human_when_criterion_paused() -> None:
    """Even with high AI confidence (0.97), overlap with a paused
    criterion forces PENDING_HUMAN_REVIEW."""
    set_paused(["c1"])
    try:
        gw = _eval_gateway({
            "overall_confidence": 0.97,
            "criteria": [
                {"criterion_id": "c1", "satisfied": 1.0, "feedback": ""},
            ],
        })
        res = _run(grade_subjective(
            gw,
            question_id="q1",
            type_id="ESSAY",
            response_id="r1",
            stem="test stem here",
            model_answer="model answer with sufficient length",
            student_text="student wrote this",
            rubric_criteria=[{"id": "c1", "text": "criterion 1", "weight": 100}],
            rubric_version=1,
            persist=False,
        ))
        assert res.status == "PENDING_HUMAN_REVIEW"
        assert res.evaluator_metadata.human_review_required is True
    finally:
        set_paused([])


def test_grade_subjective_unaffected_when_no_overlap() -> None:
    """Paused criterion 'cX' doesn't overlap rubric → high-conf
    auto-finalise still applies."""
    set_paused(["cX"])
    try:
        gw = _eval_gateway({
            "overall_confidence": 0.97,
            "criteria": [
                {"criterion_id": "c1", "satisfied": 1.0, "feedback": ""},
            ],
        })
        res = _run(grade_subjective(
            gw,
            question_id="q1",
            type_id="ESSAY",
            response_id="r1",
            stem="test stem here",
            model_answer="model answer with sufficient length",
            student_text="student wrote this",
            rubric_criteria=[{"id": "c1", "text": "criterion 1", "weight": 100}],
            rubric_version=1,
            persist=False,
        ))
        assert res.status == "CORRECT"
    finally:
        set_paused([])


def test_module_singleton_get_cache_returns_same_instance() -> None:
    a = get_cache()
    b = get_cache()
    assert a is b
