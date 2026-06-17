"""Phase 5 (P5-S42) — Subjective family + SHORT_TEXT + AI evaluation.

Pure-function tests for routing thresholds + aggregator + handler
plumbing via Gateway-stub. No real OpenAI traffic.
"""

from __future__ import annotations

import asyncio
import hashlib

import pytest

from learning.ai_gateway import AIGateway, PromptRegistry
from learning.ai_gateway.prompt_registry import PromptTemplate
from learning.ai_gateway.providers.stub_provider import StubProvider
from learning.ai_gateway.routing import default_stub_config
from learning.evaluation.routing import (
    AUTO_FINALISE_THRESHOLD,
    HUMAN_REQUIRED_THRESHOLD,
    decide_routing,
    sample_for_calibration,
)
from learning.evaluation.subjective import (
    CriterionVerdict,
    SubjectiveEvaluationReport,
    aggregate_resolution,
    grade_subjective,
)
from learning.types.subjective.handlers import (
    CaseStudyHandler,
    ComprehensionLongHandler,
    DescriptiveLongHandler,
    EssayHandler,
    ShortTextHandler,
    set_singleton_gateway,
)


def _run(coro):
    return asyncio.run(coro)


# ── routing.decide_routing ───────────────────────────────────────────────────


def test_routing_high_confidence_auto_finalise() -> None:
    out = decide_routing(confidence=0.97, response_id="r1")
    assert out.action == "AUTO_FINALISE"
    assert out.sampled_for_calibration is False


def test_routing_low_confidence_human_required() -> None:
    out = decide_routing(confidence=0.5, response_id="r1")
    assert out.action == "HUMAN_REQUIRED"
    assert out.sampled_for_calibration is False


def test_routing_none_confidence_human_required() -> None:
    out = decide_routing(confidence=None, response_id="r1")
    assert out.action == "HUMAN_REQUIRED"
    assert "ai_unavailable" in out.rationale


def test_routing_calibration_band_sometimes_samples() -> None:
    """Across 100 distinct response_ids, ~5% should be sampled."""
    sampled = sum(
        1 for i in range(100)
        if decide_routing(
            confidence=0.85,
            response_id=f"resp-{i:04d}",
        ).sampled_for_calibration
    )
    # 5% expected; allow +/- 6 for stochasticity.
    assert 0 <= sampled <= 12


def test_calibration_sampling_deterministic() -> None:
    """Same response_id → same decision, every call."""
    rid = "stable-id-42"
    first = sample_for_calibration(rid)
    for _ in range(10):
        assert sample_for_calibration(rid) == first


def test_routing_thresholds_at_boundary() -> None:
    """Boundary values: 0.95 → auto-finalise; 0.75 → calibration band."""
    high = decide_routing(confidence=AUTO_FINALISE_THRESHOLD, response_id="r1")
    assert high.action == "AUTO_FINALISE"
    low = decide_routing(
        confidence=HUMAN_REQUIRED_THRESHOLD, response_id="r1",
    )
    # 0.75 is the boundary; must NOT route to human (band starts here).
    assert low.action != "HUMAN_REQUIRED"


# ── aggregate_resolution ─────────────────────────────────────────────────────


def _criteria(*ids: str) -> list[dict]:
    return [{"id": i, "text": f"crit {i}", "weight": 100 / len(ids)} for i in ids]


def test_aggregate_all_satisfied_is_correct() -> None:
    rubric = _criteria("c1", "c2")
    report = SubjectiveEvaluationReport(
        overall_confidence=0.97,
        criteria=[
            CriterionVerdict(criterion_id="c1", satisfied=1.0),
            CriterionVerdict(criterion_id="c2", satisfied=1.0),
        ],
    )
    decision = decide_routing(confidence=0.97, response_id="r1")
    res = aggregate_resolution(
        question_id="q1", type_id="ESSAY",
        rubric_criteria=rubric, report=report, decision=decision,
        rubric_version=1, prompt_version="essay@1.0.0", model="m",
    )
    assert res.status == "CORRECT"
    assert res.matched_count == 2
    assert res.total_count == 2


def test_aggregate_zero_satisfied_is_incorrect() -> None:
    rubric = _criteria("c1", "c2")
    report = SubjectiveEvaluationReport(
        overall_confidence=0.96,
        criteria=[
            CriterionVerdict(criterion_id="c1", satisfied=0.0),
            CriterionVerdict(criterion_id="c2", satisfied=0.0),
        ],
    )
    res = aggregate_resolution(
        question_id="q1", type_id="ESSAY",
        rubric_criteria=rubric, report=report,
        decision=decide_routing(confidence=0.96, response_id="r"),
        rubric_version=1, prompt_version="essay@1.0.0", model="m",
    )
    assert res.status == "INCORRECT"
    assert res.matched_count == 0


def test_aggregate_mixed_is_partial() -> None:
    rubric = _criteria("c1", "c2", "c3")
    report = SubjectiveEvaluationReport(
        overall_confidence=0.96,
        criteria=[
            CriterionVerdict(criterion_id="c1", satisfied=1.0),
            CriterionVerdict(criterion_id="c2", satisfied=0.5),
            CriterionVerdict(criterion_id="c3", satisfied=0.0),
        ],
    )
    res = aggregate_resolution(
        question_id="q1", type_id="ESSAY",
        rubric_criteria=rubric, report=report,
        decision=decide_routing(confidence=0.96, response_id="r"),
        rubric_version=1, prompt_version="essay@1.0.0", model="m",
    )
    assert res.status == "PARTIAL_CORRECT"
    # Match threshold is satisfied >= 0.5, so c1 + c2 match; c3 doesn't.
    assert res.matched_count == 2


def test_aggregate_low_confidence_pending_human() -> None:
    rubric = _criteria("c1")
    report = SubjectiveEvaluationReport(
        overall_confidence=0.5,
        criteria=[CriterionVerdict(criterion_id="c1", satisfied=1.0)],
    )
    res = aggregate_resolution(
        question_id="q1", type_id="ESSAY",
        rubric_criteria=rubric, report=report,
        decision=decide_routing(confidence=0.5, response_id="r"),
        rubric_version=1, prompt_version="essay@1.0.0", model="m",
    )
    assert res.status == "PENDING_HUMAN_REVIEW"
    assert res.matched_count == 0  # human is the source of truth


def test_aggregate_missing_criterion_in_report() -> None:
    """AI returns 1 verdict; rubric has 2 criteria. Missing one → unmatched."""
    rubric = _criteria("c1", "c2")
    report = SubjectiveEvaluationReport(
        overall_confidence=0.97,
        criteria=[CriterionVerdict(criterion_id="c1", satisfied=1.0)],
    )
    res = aggregate_resolution(
        question_id="q1", type_id="ESSAY",
        rubric_criteria=rubric, report=report,
        decision=decide_routing(confidence=0.97, response_id="r"),
        rubric_version=1, prompt_version="essay@1.0.0", model="m",
    )
    assert res.matched_count == 1
    assert res.total_count == 2


# ── Gateway-driven grade_subjective ──────────────────────────────────────────


def _make_eval_gateway(canned_report: dict) -> AIGateway:
    reg = PromptRegistry()
    for tid in ("subjective_essay_grade", "subjective_descriptive_grade", "short_text_grade"):
        reg._templates[(tid, "1.0.0")] = PromptTemplate(
            id=tid, version="1.0.0", touchpoint="evaluation",
            system="stem={stem} model_answer={model_answer} "
                   "student_text={student_text} rubric_block={rubric_block}",
            output_schema="SubjectiveEvaluationReport",
        )
    stub = StubProvider()
    stub.register_stub_response("SubjectiveEvaluationReport", canned_report)
    return AIGateway(routing=default_stub_config(), prompts=reg, providers={"stub": stub})


def test_grade_subjective_high_confidence_returns_correct() -> None:
    gw = _make_eval_gateway(
        {
            "overall_confidence": 0.97,
            "criteria": [
                {"criterion_id": "c1", "satisfied": 1.0, "feedback": "ok"},
            ],
            "summary_feedback": "good",
        }
    )
    res = _run(grade_subjective(
        gw,
        question_id="q1",
        type_id="ESSAY",
        response_id="r1",
        stem="Discuss federalism.",
        model_answer="Federalism distributes power between levels of government...",
        student_text="Federalism is the distribution of power between centre and states.",
        rubric_criteria=_criteria("c1"),
        rubric_version=1,
    ))
    assert res.status == "CORRECT"
    assert res.evaluation_mode == "HYBRID"


def test_grade_subjective_low_confidence_pending_human() -> None:
    gw = _make_eval_gateway(
        {
            "overall_confidence": 0.5,
            "criteria": [
                {"criterion_id": "c1", "satisfied": 1.0, "feedback": "?"},
            ],
        }
    )
    res = _run(grade_subjective(
        gw,
        question_id="q1",
        type_id="ESSAY",
        response_id="r1",
        stem="x" * 10,
        model_answer="x" * 30,
        student_text="some response",
        rubric_criteria=_criteria("c1"),
        rubric_version=1,
    ))
    assert res.status == "PENDING_HUMAN_REVIEW"
    assert res.evaluator_metadata.human_review_required is True


def test_grade_subjective_unattempted_short_circuits() -> None:
    """Empty student text should never call the gateway."""
    gw = _make_eval_gateway({"overall_confidence": 0.0, "criteria": []})
    res = _run(grade_subjective(
        gw,
        question_id="q1",
        type_id="ESSAY",
        response_id="r1",
        stem="x" * 10,
        model_answer="x" * 30,
        student_text="",
        rubric_criteria=_criteria("c1"),
        rubric_version=1,
    ))
    assert res.status == "UNATTEMPTED"
    assert res.matched_count == 0


def test_grade_subjective_unsupported_type_raises() -> None:
    gw = _make_eval_gateway({"overall_confidence": 0.5, "criteria": []})
    with pytest.raises(ValueError):
        _run(grade_subjective(
            gw,
            question_id="q1",
            type_id="MCQ_SINGLE",  # unsupported
            response_id="r1",
            stem="x", model_answer="y",
            student_text="z",
            rubric_criteria=[],
            rubric_version=1,
        ))


# ── Handler integration ──────────────────────────────────────────────────────


def test_essay_handler_routes_via_singleton_gateway() -> None:
    gw = _make_eval_gateway(
        {
            "overall_confidence": 0.97,
            "criteria": [
                {"criterion_id": "c1", "satisfied": 1.0, "feedback": ""},
                {"criterion_id": "c2", "satisfied": 1.0, "feedback": ""},
            ],
        }
    )
    set_singleton_gateway(gw)
    try:
        h = EssayHandler()
        payload = {
            "stem": "Discuss federalism.",
            "expected_word_count_range": (50, 200),
            "model_answer": "Federalism is the system of dividing power...",
            "rubric": {
                "version": 1,
                "criteria": [
                    {"id": "c1", "text": "Defines federalism correctly", "weight": 50},
                    {"id": "c2", "text": "Provides at least one example", "weight": 50},
                ],
            },
        }
        response = {"question_id": "q1", "text": "Federalism is X. Example: Y."}
        res = _run(h.evaluate(payload, response, "en"))
        assert res.status == "CORRECT"
        assert res.evaluation_mode == "HYBRID"
    finally:
        set_singleton_gateway(None)


def test_essay_handler_no_gateway_routes_human() -> None:
    set_singleton_gateway(None)
    h = EssayHandler()
    payload = {
        "stem": "Discuss x.",
        "expected_word_count_range": (50, 200),
        "model_answer": "abcdefghij" * 5,
        "rubric": {
            "version": 1,
            "criteria": [
                {"id": "c1", "text": "Some criterion", "weight": 100},
            ],
        },
    }
    response = {"question_id": "q1", "text": "an answer"}
    res = _run(h.evaluate(payload, response, "en"))
    assert res.status == "PENDING_HUMAN_REVIEW"


def test_short_text_handler_synthesises_rubric_from_concepts() -> None:
    gw = _make_eval_gateway(
        {
            "overall_confidence": 0.97,
            "criteria": [
                {"criterion_id": "k1", "satisfied": 1.0, "feedback": ""},
                {"criterion_id": "k2", "satisfied": 0.0, "feedback": ""},
            ],
        }
    )
    set_singleton_gateway(gw)
    try:
        h = ShortTextHandler()
        payload = {
            "stem": "Why does the sky look blue?",
            "model_answer": "Rayleigh scattering of shorter wavelengths.",
            "key_concepts": ["Rayleigh scattering", "shorter wavelengths"],
        }
        response = {"question_id": "q1", "text": "Because of Rayleigh scattering."}
        res = _run(h.evaluate(payload, response, "en"))
        assert res.status == "PARTIAL_CORRECT"
        assert res.matched_count == 1
        assert res.total_count == 2
    finally:
        set_singleton_gateway(None)


def test_case_study_handler_partial_when_some_children_attempted() -> None:
    h = CaseStudyHandler()
    payload = {
        "scenario": "x" * 30,
        "child_questions": [
            {"question_id": "child-1", "ordinal": 1},
            {"question_id": "child-2", "ordinal": 2},
            {"question_id": "child-3", "ordinal": 3},
        ],
    }
    response = {
        "question_id": "parent-1",
        "children": [
            {"question_id": "child-1", "response_payload": {"answer": "A"}},
            {"question_id": "child-2", "response_payload": {"answer": "B"}},
        ],
    }
    res = _run(h.evaluate(payload, response, "en"))
    assert res.status == "PARTIAL_CORRECT"
    assert res.matched_count == 2
    assert res.total_count == 3


def test_case_study_handler_unattempted_when_no_children() -> None:
    h = CaseStudyHandler()
    payload = {
        "scenario": "x" * 30,
        "child_questions": [
            {"question_id": "child-1", "ordinal": 1},
            {"question_id": "child-2", "ordinal": 2},
        ],
    }
    response = {"question_id": "parent-1", "children": []}
    res = _run(h.evaluate(payload, response, "en"))
    assert res.status == "UNATTEMPTED"


def test_comprehension_long_handler_pending_human_when_all_attempted() -> None:
    h = ComprehensionLongHandler()
    payload = {
        "passage": "x" * 250,
        "child_questions": [
            {"question_id": "ch-1", "ordinal": 1},
            {"question_id": "ch-2", "ordinal": 2},
            {"question_id": "ch-3", "ordinal": 3},
        ],
    }
    response = {
        "question_id": "parent-1",
        "children": [
            {"question_id": "ch-1", "response_payload": {"answer": "A"}},
            {"question_id": "ch-2", "response_payload": {"answer": "B"}},
            {"question_id": "ch-3", "response_payload": {"answer": "C"}},
        ],
    }
    res = _run(h.evaluate(payload, response, "en"))
    # All children attempted → kicks to human review (children grade
    # individually; parent rolls up).
    assert res.status == "PENDING_HUMAN_REVIEW"
    assert res.evaluator_metadata.human_review_required is True


def test_descriptive_long_handler_returns_unattempted_when_blank() -> None:
    set_singleton_gateway(None)
    h = DescriptiveLongHandler()
    payload = {
        "stem": "Derive Newton's second law.",
        "expected_word_count_range": (50, 200),
        "model_answer": "F = dp/dt; for constant mass, F = ma...",
        "rubric": {
            "version": 1,
            "criteria": [
                {"id": "c1", "text": "States F=ma", "weight": 100},
            ],
        },
    }
    response = {"question_id": "q1", "text": ""}
    res = _run(h.evaluate(payload, response, "en"))
    assert res.status == "UNATTEMPTED"


# ── Registration/conformance ─────────────────────────────────────────────────


def test_subjective_handlers_protocol_attrs() -> None:
    """Verify each new handler exposes the required Protocol attrs +
    methods. Full registry conformance lives in conftest-driven smoke;
    here we just check the class-level shape of the new handlers."""
    from learning.types.base import PROTOCOL_ATTRS, PROTOCOL_METHODS

    for cls in (
        EssayHandler, DescriptiveLongHandler, CaseStudyHandler,
        ComprehensionLongHandler, ShortTextHandler,
    ):
        h = cls()
        for attr in PROTOCOL_ATTRS:
            assert hasattr(h, attr), f"{cls.__name__} missing attr {attr}"
        for method in PROTOCOL_METHODS:
            assert callable(getattr(h, method)), \
                f"{cls.__name__} missing method {method}"

    assert EssayHandler.evaluation_mode == "HYBRID"
    assert ShortTextHandler.evaluation_mode == "AI_ASSISTED"
    assert CaseStudyHandler.evaluation_mode == "HYBRID"
