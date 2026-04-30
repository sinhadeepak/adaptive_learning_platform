"""Phase 5 (P5-S40) — AI Authoring + 3 quality checks.

Pure-function tests + AIGateway-stub-driven happy paths for the three
authoring operations and the three v1 quality checks.

The Gateway is exercised end-to-end via StubProvider with canned
responses; no real OpenAI traffic. Routes themselves are tested via
TestClient with a stub gateway hung off `app.state.ai_gateway`.
"""

from __future__ import annotations

import asyncio

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from learning.ai_authoring import (
    AIDraftMarker,
    DraftQuestionRequest,
    QualityWarning,
    draft_question,
    expand_explanation,
    run_quality_checks,
    suggest_distractors,
)
from learning.ai_authoring.draft import (
    DistractorsOutput,
    DraftMCQ,
    ExplanationOutput,
    _levenshtein,
    compute_edit_distance,
)
from learning.ai_authoring.quality_checks import (
    AmbiguityReport,
    DistractorPlausibilityReport,
    check_duplicate_via_similarity,
)
from learning.ai_authoring.routes import router as ai_authoring_router
from learning.ai_gateway import AIGateway, PromptRegistry
from learning.ai_gateway.prompt_registry import PromptTemplate
from learning.ai_gateway.providers.stub_provider import StubProvider
from learning.ai_gateway.routing import default_stub_config


def _run(coro):
    return asyncio.run(coro)


# ── Levenshtein ──────────────────────────────────────────────────────────────


def test_levenshtein_identical_is_zero() -> None:
    assert _levenshtein("hello", "hello") == 0


def test_levenshtein_empty_strings() -> None:
    assert _levenshtein("", "") == 0
    assert _levenshtein("", "abc") == 3
    assert _levenshtein("xyz", "") == 3


def test_levenshtein_single_substitution() -> None:
    assert _levenshtein("kitten", "sitten") == 1


def test_levenshtein_classic_example() -> None:
    # kitten -> sitting: substitute k->s, e->i, insert g.
    assert _levenshtein("kitten", "sitting") == 3


def test_levenshtein_unicode_aware() -> None:
    # Operates byte-wise via Python str iteration; UTF-8 codepoints
    # count as single characters.
    assert _levenshtein("मीटर", "किलो") == 4


# ── compute_edit_distance ─────────────────────────────────────────────────────


def test_edit_distance_unchanged_payload_returns_zeros() -> None:
    p = {"stem": "What is 2+2?", "correct_id": "A"}
    out = compute_edit_distance(p, p)
    assert out["stem"] == 0
    assert out["correct_id"] == 0


def test_edit_distance_walks_nested_options() -> None:
    orig = {
        "stem": "Newton's first law states that...",
        "options": [
            {"id": "A", "text": "objects in motion stay in motion"},
            {"id": "B", "text": "force equals mass times acceleration"},
        ],
    }
    cur = {
        "stem": "Newton's first law states that...!",  # +1 char
        "options": [
            {"id": "A", "text": "objects in motion stay in motion"},
            {"id": "B", "text": "force = mass × acceleration"},
        ],
    }
    distances = compute_edit_distance(orig, cur)
    assert distances["stem"] == 1
    assert distances["options[0].id"] == 0
    assert distances["options[0].text"] == 0
    assert distances["options[1].text"] > 0


def test_edit_distance_handles_added_options() -> None:
    orig = {"options": [{"id": "A", "text": "first"}]}
    cur = {"options": [{"id": "A", "text": "first"}, {"id": "B", "text": "second"}]}
    distances = compute_edit_distance(orig, cur)
    # Newly-added option pads with None on orig side; walk descends but
    # the leaf comparison falls through (None vs str).
    assert distances["options[0].text"] == 0


# ── AIDraftMarker round-trip ─────────────────────────────────────────────────


def test_aidraftmarker_serialises_round_trip() -> None:
    from datetime import UTC, datetime

    m = AIDraftMarker(
        original_payload={"stem": "x"},
        prompt_template_id="mcq_single_draft",
        prompt_template_version="1.0.0",
        model="openai:gpt-4o",
        created_at=datetime.now(tz=UTC),
        author_edited=False,
        edit_distance={},
    )
    raw = m.model_dump()
    assert raw["prompt_template_id"] == "mcq_single_draft"
    re = AIDraftMarker.model_validate(raw)
    assert re == m


# ── duplicate_detection (pure) ────────────────────────────────────────────────


def test_duplicate_below_threshold_returns_none() -> None:
    out = check_duplicate_via_similarity(
        candidate_text="What is photosynthesis?",
        nearest_neighbour_text="Define mitosis",
        similarity=0.71,
    )
    assert out is None


def test_duplicate_at_threshold_returns_warning() -> None:
    out = check_duplicate_via_similarity(
        candidate_text="What is photosynthesis?",
        nearest_neighbour_text="What is photosynthesis?",
        similarity=0.95,
    )
    assert out is not None
    assert out.code == "duplicate_detection"
    assert out.metadata is not None
    assert out.metadata["similarity"] == 0.95


def test_duplicate_threshold_overridable() -> None:
    out = check_duplicate_via_similarity(
        candidate_text="x",
        nearest_neighbour_text="y",
        similarity=0.85,
        threshold=0.80,
    )
    assert out is not None


# ── Stub-driven Gateway harness ──────────────────────────────────────────────


def _make_test_gateway(canned: dict[str, dict]) -> AIGateway:
    """Build a stub-only gateway. `canned` maps schema-name → dict
    payload; the StubProvider returns these verbatim.

    Each test exercises one or two prompt templates; we register the
    real S40 template ids but with short test-only system strings that
    accept exactly the inputs each operation passes.
    """
    reg = PromptRegistry()
    template_inputs = {
        "mcq_single_draft": (
            "authoring",
            "topic={topic} difficulty={difficulty} exam={exam} "
            "syllabus_chapter={syllabus_chapter} source_material={source_material}",
        ),
        "explanation_expand": (
            "authoring",
            "stem={stem} answer={answer}",
        ),
        "distractor_suggest": (
            "authoring",
            "stem={stem} correct_answer={correct_answer} n={n}",
        ),
        "mcq_ambiguity": (
            "quality_check",
            "stem={stem} options_block={options_block} correct_id={correct_id}",
        ),
        "distractor_plausibility": (
            "quality_check",
            "stem={stem} correct_id={correct_id} distractor_block={distractor_block}",
        ),
    }
    for tid, (touchpoint, system) in template_inputs.items():
        reg._templates[(tid, "1.0.0")] = PromptTemplate(
            id=tid,
            version="1.0.0",
            touchpoint=touchpoint,
            system=system,
            output_schema=tid,
        )
    stub = StubProvider()
    for k, v in canned.items():
        stub.register_stub_response(k, v)
    return AIGateway(routing=default_stub_config(), prompts=reg, providers={"stub": stub})


# ── draft_question ───────────────────────────────────────────────────────────


def test_draft_question_happy_path() -> None:
    canned = {
        "DraftMCQ": {
            "stem": "What is the unit of force?",
            "options": [
                {"id": "A", "text": "Newton", "is_correct": True},
                {"id": "B", "text": "Joule", "is_correct": False},
                {"id": "C", "text": "Watt", "is_correct": False},
                {"id": "D", "text": "Pascal", "is_correct": False},
            ],
            "correct_id": "A",
            "explanation": "Force is measured in Newtons (kg·m/s²).",
        }
    }
    gw = _make_test_gateway(canned)
    req = DraftQuestionRequest(
        type_id="MCQ_SINGLE",
        topic="Mechanics",
        difficulty="MEDIUM",
        exam="JEE-MAIN",
    )
    draft, marker = _run(draft_question(gw, request=req))
    assert isinstance(draft, DraftMCQ)
    assert draft.correct_id == "A"
    assert isinstance(marker, AIDraftMarker)
    assert marker.author_edited is False
    assert marker.original_payload["correct_id"] == "A"


def test_draft_question_unsupported_type_raises() -> None:
    gw = _make_test_gateway({})
    req = DraftQuestionRequest(type_id="NUMERIC_INTEGER", topic="x")
    with pytest.raises(NotImplementedError):
        _run(draft_question(gw, request=req))


# ── expand_explanation + suggest_distractors ─────────────────────────────────


def test_expand_explanation_happy_path() -> None:
    canned = {
        "ExplanationOutput": {
            "explanation": "Newton's 2nd law: F = ma. Force, mass, acceleration.",
            "steps": [
                "Identify the mass m.",
                "Identify the acceleration a.",
                "Multiply: F = m × a.",
            ],
        }
    }
    gw = _make_test_gateway(canned)
    out = _run(
        expand_explanation(gw, stem="What is Newton's 2nd law?", answer="F = ma"),
    )
    assert isinstance(out, ExplanationOutput)
    assert len(out.steps) == 3


def test_suggest_distractors_happy_path() -> None:
    canned = {
        "DistractorsOutput": {
            "distractors": [
                "F = m / a",
                "F = m + a",
                "F = a / m",
            ]
        }
    }
    gw = _make_test_gateway(canned)
    out = _run(
        suggest_distractors(
            gw,
            stem="What is Newton's 2nd law?",
            correct_answer="F = ma",
            n=3,
        )
    )
    assert isinstance(out, DistractorsOutput)
    assert len(out.distractors) == 3


def test_suggest_distractors_n_out_of_range() -> None:
    gw = _make_test_gateway({})
    with pytest.raises(ValueError):
        _run(suggest_distractors(gw, stem="x", correct_answer="y", n=2))
    with pytest.raises(ValueError):
        _run(suggest_distractors(gw, stem="x", correct_answer="y", n=6))


# ── run_quality_checks ───────────────────────────────────────────────────────


def test_run_quality_checks_no_warnings_when_all_clean() -> None:
    canned = {
        "AmbiguityReport": {"is_ambiguous": False, "reasoning": ""},
        "DistractorPlausibilityReport": {
            "scores": {"B": 0.8, "C": 0.7, "D": 0.65}
        },
    }
    gw = _make_test_gateway(canned)
    warnings = _run(
        run_quality_checks(
            gw,
            stem="What is the unit of force?",
            correct_id="A",
            options={"A": "Newton", "B": "Joule", "C": "Watt", "D": "Pascal"},
        )
    )
    assert warnings == []


def test_run_quality_checks_surfaces_ambiguity() -> None:
    canned = {
        "AmbiguityReport": {
            "is_ambiguous": True,
            "reasoning": "Both A and B could be argued.",
            "defensible_alternative_ids": ["B"],
        },
        "DistractorPlausibilityReport": {
            "scores": {"B": 0.9, "C": 0.7, "D": 0.65}
        },
    }
    gw = _make_test_gateway(canned)
    warnings = _run(
        run_quality_checks(
            gw,
            stem="Ambiguous stem here?",
            correct_id="A",
            options={"A": "x", "B": "y", "C": "z", "D": "w"},
        )
    )
    codes = [w.code for w in warnings]
    assert "ambiguity" in codes


def test_run_quality_checks_flags_low_distractors() -> None:
    canned = {
        "AmbiguityReport": {"is_ambiguous": False, "reasoning": ""},
        "DistractorPlausibilityReport": {
            # B + C below 0.3 → flagged; D above → not flagged
            "scores": {"B": 0.1, "C": 0.2, "D": 0.6}
        },
    }
    gw = _make_test_gateway(canned)
    warnings = _run(
        run_quality_checks(
            gw,
            stem="Stem?",
            correct_id="A",
            options={"A": "x", "B": "y", "C": "z", "D": "w"},
        )
    )
    plaus = [w for w in warnings if w.code == "distractor_plausibility"]
    assert len(plaus) == 2
    assert {w.field for w in plaus} == {"options.B", "options.C"}


def test_run_quality_checks_includes_duplicate_when_supplied() -> None:
    canned = {
        "AmbiguityReport": {"is_ambiguous": False, "reasoning": ""},
        "DistractorPlausibilityReport": {"scores": {"B": 0.8}},
    }
    gw = _make_test_gateway(canned)
    warnings = _run(
        run_quality_checks(
            gw,
            stem="What is photosynthesis?",
            correct_id="A",
            options={"A": "x", "B": "y"},
            nearest_neighbour=("Define photosynthesis.", 0.94),
        )
    )
    codes = [w.code for w in warnings]
    assert "duplicate_detection" in codes


def test_run_quality_checks_one_check_failure_does_not_block_others() -> None:
    """If the ambiguity gateway call raises, distractor + duplicate
    still complete. Mirrors the S22/S27/S29 best-effort fan-out pattern."""

    class _FlakyStub(StubProvider):
        async def complete(self, *, schema, **kw):  # type: ignore[override]
            if schema is AmbiguityReport:
                from learning.ai_gateway.providers.base import ProviderError
                raise ProviderError(self.name, "boom", retryable=False)
            return await super().complete(schema=schema, **kw)

    flaky = _FlakyStub()
    flaky.register_stub_response(
        "DistractorPlausibilityReport", {"scores": {"B": 0.05}},
    )
    reg = PromptRegistry()
    reg._templates[("mcq_ambiguity", "1.0.0")] = PromptTemplate(
        id="mcq_ambiguity", version="1.0.0", touchpoint="quality_check",
        system="stem={stem} options_block={options_block} correct_id={correct_id}",
        output_schema="AmbiguityReport",
    )
    reg._templates[("distractor_plausibility", "1.0.0")] = PromptTemplate(
        id="distractor_plausibility", version="1.0.0", touchpoint="quality_check",
        system="stem={stem} correct_id={correct_id} distractor_block={distractor_block}",
        output_schema="DistractorPlausibilityReport",
    )
    gw = AIGateway(routing=default_stub_config(), prompts=reg, providers={"stub": flaky})
    warnings = _run(
        run_quality_checks(
            gw,
            stem="x",
            correct_id="A",
            options={"A": "a", "B": "b"},
        )
    )
    # Ambiguity raised → swallowed → distractor still ran and flagged B.
    codes = [w.code for w in warnings]
    assert "ambiguity" not in codes
    assert "distractor_plausibility" in codes


# ── Routes (TestClient) ──────────────────────────────────────────────────────


def _make_app_with_gateway(canned: dict[str, dict]) -> FastAPI:
    app = FastAPI()
    app.include_router(ai_authoring_router)
    app.state.ai_gateway = _make_test_gateway(canned)
    return app


def test_route_draft_returns_payload_and_marker() -> None:
    canned = {
        "DraftMCQ": {
            "stem": "What is the unit of energy?",
            "options": [
                {"id": "A", "text": "Joule", "is_correct": True},
                {"id": "B", "text": "Newton", "is_correct": False},
                {"id": "C", "text": "Watt", "is_correct": False},
                {"id": "D", "text": "Pascal", "is_correct": False},
            ],
            "correct_id": "A",
            "explanation": "1 J = 1 N·m.",
        }
    }
    client = TestClient(_make_app_with_gateway(canned))
    resp = client.post(
        "/content/ai/draft",
        json={
            "type_id": "MCQ_SINGLE",
            "topic": "Energy",
            "difficulty": "EASY",
            "exam": "JEE-MAIN",
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["draft"]["correct_id"] == "A"
    assert body["marker"]["prompt_template_id"] == "mcq_single_draft"


def test_route_draft_unsupported_type_400() -> None:
    client = TestClient(_make_app_with_gateway({}))
    resp = client.post(
        "/content/ai/draft",
        json={"type_id": "NUMERIC_INTEGER", "topic": "x"},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "type_not_supported"


def test_route_draft_503_when_gateway_missing() -> None:
    app = FastAPI()
    app.include_router(ai_authoring_router)
    app.state.ai_gateway = None
    client = TestClient(app)
    resp = client.post(
        "/content/ai/draft",
        json={"type_id": "MCQ_SINGLE", "topic": "x"},
    )
    assert resp.status_code == 503


def test_route_quality_check_returns_warnings() -> None:
    canned = {
        "AmbiguityReport": {"is_ambiguous": False, "reasoning": ""},
        "DistractorPlausibilityReport": {"scores": {"B": 0.05}},
    }
    client = TestClient(_make_app_with_gateway(canned))
    resp = client.post(
        "/content/ai/quality-check",
        json={
            "stem": "Sample stem",
            "correct_id": "A",
            "options": {"A": "a", "B": "b"},
        },
    )
    assert resp.status_code == 200, resp.text
    codes = [w["code"] for w in resp.json()["warnings"]]
    assert "distractor_plausibility" in codes


def test_route_quality_check_rejects_correct_id_not_in_options() -> None:
    client = TestClient(_make_app_with_gateway({}))
    resp = client.post(
        "/content/ai/quality-check",
        json={
            "stem": "Sample stem",
            "correct_id": "Z",
            "options": {"A": "a", "B": "b"},
        },
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "correct_id_not_in_options"


def test_route_edit_distance_pure() -> None:
    client = TestClient(_make_app_with_gateway({}))
    resp = client.post(
        "/content/ai/edit-distance",
        json={
            "original": {"stem": "What is the unit of force?", "correct_id": "A"},
            "current": {"stem": "What is the unit of energy?", "correct_id": "A"},
        },
    )
    assert resp.status_code == 200, resp.text
    distances = resp.json()["distances"]
    assert distances["stem"] > 0
    assert distances["correct_id"] == 0
