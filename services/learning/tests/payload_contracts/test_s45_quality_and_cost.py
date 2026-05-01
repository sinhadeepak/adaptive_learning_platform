"""Phase 5 (P5-S45) — 3 remaining quality checks + cost dashboard rollup.

Pure-function + Gateway-stub tests for syllabus_tagging /
difficulty_estimation / tone_language. Cost-dashboard rollup tests
exercise window expiry + budget-alert thresholds.
"""

from __future__ import annotations

import asyncio
import time

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from learning.ai_authoring.quality_checks import (
    DifficultyEstimationReport,
    SyllabusTaggingReport,
    ToneLanguageReport,
    check_difficulty_estimation,
    check_syllabus_tagging,
    check_tone_language,
    run_quality_checks,
)
from learning.ai_gateway import AIGateway, PromptRegistry
from learning.ai_gateway.cost_dashboard import (
    CostTracker,
    get_tracker,
    record_cost,
    reset_for_tests,
)
from learning.ai_gateway.prompt_registry import PromptTemplate
from learning.ai_gateway.providers.stub_provider import StubProvider
from learning.ai_gateway.routes import router as ai_admin_router
from learning.ai_gateway.routing import default_stub_config


def _run(coro):
    return asyncio.run(coro)


@pytest.fixture(autouse=True)
def _reset_gateway_cache():
    """P5-S52 cache is process-wide; each quality-check test injects
    its own canned responses. Reset between tests so stub responses
    don't leak through the cache."""
    from learning.ai_gateway.cache import reset_for_tests as _cache_reset
    _cache_reset()
    yield
    _cache_reset()


def _make_qc_gateway(canned: dict[str, dict]) -> AIGateway:
    reg = PromptRegistry()
    template_specs = {
        "mcq_ambiguity": "stem={stem} options_block={options_block} correct_id={correct_id}",
        "distractor_plausibility": "stem={stem} correct_id={correct_id} distractor_block={distractor_block}",
        "syllabus_tagging": "stem={stem} options_block={options_block} "
                            "author_concept_tags={author_concept_tags} subject={subject}",
        "difficulty_estimation": "stem={stem} options_block={options_block} author_claimed={author_claimed}",
        "tone_language": "stem={stem} options_block={options_block} "
                         "target_age_band={target_age_band} language={language}",
    }
    for tid, system in template_specs.items():
        reg._templates[(tid, "1.0.0")] = PromptTemplate(
            id=tid, version="1.0.0", touchpoint="quality_check",
            system=system, output_schema=tid,
        )
    stub = StubProvider()
    for k, v in canned.items():
        stub.register_stub_response(k, v)
    return AIGateway(routing=default_stub_config(), prompts=reg, providers={"stub": stub})


# ── syllabus_tagging ─────────────────────────────────────────────────────────


def test_syllabus_tagging_alignment_high_no_flag() -> None:
    gw = _make_qc_gateway(
        {
            "SyllabusTaggingReport": {
                "ai_suggested": ["Newton's laws"],
                "author_alignment_confidence": 0.92,
                "reasoning": "tags match",
            }
        }
    )
    out = _run(check_syllabus_tagging(
        gw,
        stem="Apply F=ma to find net force.",
        options_block="A: 5N\nB: 10N",
        author_concept_tags=["Newton's laws"],
        subject="physics",
    ))
    assert out is None


def test_syllabus_tagging_alignment_low_flags() -> None:
    gw = _make_qc_gateway(
        {
            "SyllabusTaggingReport": {
                "ai_suggested": ["Vector algebra"],
                "author_alignment_confidence": 0.4,
                "reasoning": "drift",
            }
        }
    )
    out = _run(check_syllabus_tagging(
        gw,
        stem="x" * 50,
        options_block="A: 5\nB: 10",
        author_concept_tags=["Newton's laws"],
        subject="physics",
    ))
    assert out is not None
    assert out.code == "syllabus_tagging"
    assert out.metadata["alignment_confidence"] == 0.4


def test_syllabus_tagging_threshold_overridable() -> None:
    gw = _make_qc_gateway(
        {
            "SyllabusTaggingReport": {
                "ai_suggested": ["x"],
                "author_alignment_confidence": 0.85,
                "reasoning": "",
            }
        }
    )
    # Default floor 0.7 → no flag.
    none_out = _run(check_syllabus_tagging(
        gw, stem="s", options_block="o", author_concept_tags=["t"], subject="s",
    ))
    assert none_out is None
    # Higher floor → flag.
    flagged = _run(check_syllabus_tagging(
        gw, stem="s", options_block="o", author_concept_tags=["t"],
        subject="s", alignment_floor=0.9,
    ))
    assert flagged is not None


# ── difficulty_estimation ────────────────────────────────────────────────────


def test_difficulty_estimation_match_no_flag() -> None:
    gw = _make_qc_gateway(
        {
            "DifficultyEstimationReport": {
                "predicted": "MEDIUM",
                "confidence": 0.85,
                "reasoning": "",
            }
        }
    )
    out = _run(check_difficulty_estimation(
        gw, stem="x" * 20, options_block="A: 5\nB: 10",
        author_claimed="MEDIUM",
    ))
    assert out is None


def test_difficulty_estimation_mismatch_flags_when_confident() -> None:
    gw = _make_qc_gateway(
        {
            "DifficultyEstimationReport": {
                "predicted": "HARD",
                "confidence": 0.85,
                "reasoning": "long reasoning chain",
            }
        }
    )
    out = _run(check_difficulty_estimation(
        gw, stem="x" * 20, options_block="A: 5",
        author_claimed="EASY",
    ))
    assert out is not None
    assert out.metadata["predicted"] == "HARD"
    assert out.severity == "info"


def test_difficulty_estimation_mismatch_low_confidence_no_flag() -> None:
    gw = _make_qc_gateway(
        {
            "DifficultyEstimationReport": {
                "predicted": "HARD",
                "confidence": 0.5,  # below 0.7 floor
                "reasoning": "",
            }
        }
    )
    out = _run(check_difficulty_estimation(
        gw, stem="x" * 20, options_block="A: 5",
        author_claimed="EASY",
    ))
    assert out is None


# ── tone_language ────────────────────────────────────────────────────────────


def test_tone_language_clean_returns_empty() -> None:
    gw = _make_qc_gateway(
        {
            "ToneLanguageReport": {
                "grammar_issues": [],
                "clarity_issues": [],
                "age_appropriateness_issue": None,
                "overall_quality": "good",
            }
        }
    )
    out = _run(check_tone_language(
        gw, stem="x" * 20, options_block="A: 5",
    ))
    assert out == []


def test_tone_language_grammar_and_clarity_split() -> None:
    gw = _make_qc_gateway(
        {
            "ToneLanguageReport": {
                "grammar_issues": ["subject-verb mismatch"],
                "clarity_issues": ["pronoun unclear"],
                "age_appropriateness_issue": None,
                "overall_quality": "needs_work",
            }
        }
    )
    out = _run(check_tone_language(
        gw, stem="x" * 20, options_block="A: 5",
    ))
    codes = [w.code for w in out]
    assert codes == ["tone_language", "tone_language"]
    kinds = [w.metadata["kind"] for w in out]
    assert "grammar" in kinds
    assert "clarity" in kinds


def test_tone_language_age_appropriateness_warning() -> None:
    gw = _make_qc_gateway(
        {
            "ToneLanguageReport": {
                "grammar_issues": [],
                "clarity_issues": [],
                "age_appropriateness_issue": "vocab too advanced for grade 6",
                "overall_quality": "needs_work",
            }
        }
    )
    out = _run(check_tone_language(
        gw, stem="x" * 20, options_block="A: 5",
    ))
    assert len(out) == 1
    assert out[0].severity == "warning"
    assert out[0].metadata["kind"] == "age_appropriateness"


# ── run_quality_checks composite (S40 + S45) ─────────────────────────────────


def test_run_quality_checks_skips_s45_when_inputs_missing() -> None:
    """S40 callers (no author_concept_tags / claimed difficulty) should
    still get the 3 original checks plus tone_language."""
    gw = _make_qc_gateway({
        "AmbiguityReport": {"is_ambiguous": False, "reasoning": ""},
        "DistractorPlausibilityReport": {"scores": {"B": 0.6}},
        "ToneLanguageReport": {
            "grammar_issues": [], "clarity_issues": [],
            "age_appropriateness_issue": None, "overall_quality": "good",
        },
    })
    warnings = _run(run_quality_checks(
        gw, stem="x" * 20, correct_id="A",
        options={"A": "a", "B": "b"},
    ))
    codes = [w.code for w in warnings]
    # No syllabus_tagging or difficulty_estimation when inputs absent.
    assert "syllabus_tagging" not in codes
    assert "difficulty_estimation" not in codes


def test_run_quality_checks_runs_all_six_when_inputs_supplied() -> None:
    gw = _make_qc_gateway({
        "AmbiguityReport": {"is_ambiguous": False, "reasoning": ""},
        "DistractorPlausibilityReport": {"scores": {"B": 0.6}},
        "SyllabusTaggingReport": {
            "ai_suggested": ["Vectors"],
            "author_alignment_confidence": 0.4,
            "reasoning": "drift",
        },
        "DifficultyEstimationReport": {
            "predicted": "HARD",
            "confidence": 0.85,
            "reasoning": "",
        },
        "ToneLanguageReport": {
            "grammar_issues": ["s-v mismatch"],
            "clarity_issues": [],
            "age_appropriateness_issue": None,
            "overall_quality": "acceptable",
        },
    })
    warnings = _run(run_quality_checks(
        gw,
        stem="x" * 20, correct_id="A",
        options={"A": "a", "B": "b"},
        author_concept_tags=["Newton's laws"],
        author_claimed_difficulty="EASY",
        subject="physics",
    ))
    codes = [w.code for w in warnings]
    assert "syllabus_tagging" in codes
    assert "difficulty_estimation" in codes
    assert "tone_language" in codes


# ── Cost dashboard rollup ─────────────────────────────────────────────────────


def test_cost_tracker_records_and_aggregates() -> None:
    t = CostTracker()
    t.record(touchpoint="authoring", provider="openai", cost_usd=0.05)
    t.record(touchpoint="authoring", provider="openai", cost_usd=0.03, creator_id="alice")
    t.record(touchpoint="quality_check", provider="openai", cost_usd=0.01)
    day = t.rollup("day")
    assert day.total_usd == pytest.approx(0.09)
    assert day.by_touchpoint["authoring"] == pytest.approx(0.08)
    assert day.by_creator.get("alice") == pytest.approx(0.03)


def test_cost_tracker_window_expiry() -> None:
    t = CostTracker()
    # Manually inject an old entry beyond the day window.
    from learning.ai_gateway.cost_dashboard import CostEntry, _DAY
    with t._lock:  # noqa: SLF001
        t._entries.append(CostEntry(
            timestamp=time.time() - _DAY - 100,
            touchpoint="authoring",
            provider="openai",
            cost_usd=10.00,
        ))
    t.record(touchpoint="authoring", provider="openai", cost_usd=0.05)
    day = t.rollup("day")
    week = t.rollup("week")
    # Old entry outside day window but inside week window.
    assert day.total_usd == pytest.approx(0.05)
    assert week.total_usd == pytest.approx(10.05)


def test_cost_tracker_budget_alerts_80pct() -> None:
    t = CostTracker()
    t.day_budget_usd = 1.0
    t.record(touchpoint="authoring", provider="openai", cost_usd=0.85)
    alerts = t.budget_alerts()
    assert any(a.threshold_pct == 80 and a.period == "day" for a in alerts)


def test_cost_tracker_budget_alerts_95pct_supersedes_80() -> None:
    t = CostTracker()
    t.day_budget_usd = 1.0
    t.record(touchpoint="authoring", provider="openai", cost_usd=0.97)
    alerts = t.budget_alerts()
    day_alerts = [a for a in alerts if a.period == "day"]
    # Only the higher threshold reported.
    assert len(day_alerts) == 1
    assert day_alerts[0].threshold_pct == 95


def test_cost_tracker_no_alerts_when_under_budget() -> None:
    t = CostTracker()
    t.day_budget_usd = 1.0
    t.record(touchpoint="authoring", provider="openai", cost_usd=0.10)
    assert t.budget_alerts() == []


# ── Admin route ───────────────────────────────────────────────────────────────


def test_admin_ai_cost_route_returns_rollup() -> None:
    reset_for_tests()
    record_cost(touchpoint="authoring", provider="openai", cost_usd=0.10, creator_id="alice")
    record_cost(touchpoint="evaluation", provider="openai", cost_usd=0.05)

    app = FastAPI()
    app.include_router(ai_admin_router)
    client = TestClient(app)

    resp = client.get("/admin/ai-cost")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["day"]["totalUsd"] == pytest.approx(0.15)
    assert body["day"]["byTouchpoint"]["authoring"] == pytest.approx(0.10)
    creators = {c["creatorId"] for c in body["day"]["topCreators"]}
    assert "alice" in creators
    reset_for_tests()


def test_admin_ai_cost_route_surfaces_alerts() -> None:
    reset_for_tests()
    tracker = get_tracker()
    tracker.day_budget_usd = 1.0
    record_cost(touchpoint="authoring", provider="openai", cost_usd=0.99)

    app = FastAPI()
    app.include_router(ai_admin_router)
    client = TestClient(app)
    resp = client.get("/admin/ai-cost")
    body = resp.json()
    assert any(a["thresholdPct"] == 95 for a in body["alerts"])
    reset_for_tests()
    tracker.day_budget_usd = 50.0  # restore default
