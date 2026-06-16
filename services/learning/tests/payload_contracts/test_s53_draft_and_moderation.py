"""Phase 5 (P5-S53) — draft_question expansion (all objective + numeric)
+ image moderation pipeline.

Gateway-stub paths exercise each new prompt template's mapping; image
moderation tests cover the verdict logic + stub provider + module-
level singleton.
"""

from __future__ import annotations

import asyncio
import hashlib

import pytest

from learning.ai_authoring.draft import (
    SUPPORTED_DRAFT_TYPES,
    DraftAssertionReason,
    DraftFormulaInput,
    DraftMCQ,
    DraftMultiStatement,
    DraftNumericDecimal,
    DraftNumericInteger,
    DraftNumericRange,
    DraftQuestionRequest,
    DraftTrueFalse,
    _DRAFT_TYPE_MAP,
    draft_question,
)
from learning.ai_gateway import AIGateway, PromptRegistry
from learning.ai_gateway.cache import reset_for_tests as cache_reset
from learning.ai_gateway.prompt_registry import PromptTemplate
from learning.ai_gateway.providers.stub_provider import StubProvider
from learning.ai_gateway.routing import default_stub_config
from learning.content.image_moderation import (
    DEFAULT_THRESHOLDS,
    SUSPICIOUS_FLOOR,
    CategoryScore,
    ModerationVerdict,
    StubImageModerator,
    decide_verdict,
    get_moderator,
    moderate_or_skip,
    reset_for_tests as moderator_reset,
    set_moderator,
)


def _run(coro):
    return asyncio.run(coro)


@pytest.fixture(autouse=True)
def _flush_cache():
    cache_reset()
    yield
    cache_reset()


# ── _DRAFT_TYPE_MAP coverage ─────────────────────────────────────────────────


def test_supported_draft_types_match_map() -> None:
    """Every type in SUPPORTED_DRAFT_TYPES has an entry in _DRAFT_TYPE_MAP."""
    assert set(SUPPORTED_DRAFT_TYPES) == set(_DRAFT_TYPE_MAP.keys())


def test_draft_type_map_has_all_objective_and_numeric() -> None:
    expected_objective = {
        "MCQ_SINGLE", "MCQ_MULTI", "TRUE_FALSE",
        "ASSERTION_REASON", "MULTI_STATEMENT",
    }
    expected_numeric = {
        "NUMERIC_INTEGER", "NUMERIC_DECIMAL",
        "NUMERIC_RANGE", "FORMULA_INPUT",
    }
    keys = set(_DRAFT_TYPE_MAP.keys())
    assert expected_objective.issubset(keys)
    assert expected_numeric.issubset(keys)


# ── Per-type draft happy paths ───────────────────────────────────────────────


def _build_authoring_gateway(
    *,
    template_id: str,
    schema_name: str,
    canned: dict,
) -> AIGateway:
    """Build a stub gateway pre-loaded with one authoring template."""
    reg = PromptRegistry()
    reg._templates[(template_id, "1.0.0")] = PromptTemplate(
        id=template_id, version="1.0.0", touchpoint="authoring",
        system="topic={topic} difficulty={difficulty} exam={exam} "
               "syllabus_chapter={syllabus_chapter} source_material={source_material}",
        output_schema=schema_name,
    )
    stub = StubProvider()
    stub.register_stub_response(schema_name, canned)
    return AIGateway(routing=default_stub_config(), prompts=reg, providers={"stub": stub})


def test_draft_mcq_single_routes_to_correct_template() -> None:
    canned = {
        "stem": "What is the unit of force?",
        "options": [
            {"id": "A", "text": "Newton", "is_correct": True},
            {"id": "B", "text": "Joule", "is_correct": False},
            {"id": "C", "text": "Watt", "is_correct": False},
            {"id": "D", "text": "Pascal", "is_correct": False},
        ],
        "correct_id": "A",
    }
    gw = _build_authoring_gateway(
        template_id="mcq_single_draft", schema_name="DraftMCQ", canned=canned,
    )
    req = DraftQuestionRequest(type_id="MCQ_SINGLE", topic="Mechanics")
    draft, marker = _run(draft_question(gw, request=req))
    assert isinstance(draft, DraftMCQ)
    assert marker.prompt_template_id == "mcq_single_draft"


def test_draft_true_false() -> None:
    gw = _build_authoring_gateway(
        template_id="true_false_draft", schema_name="DraftTrueFalse",
        canned={"stem": "Newton's first law states inertia.", "correct": True},
    )
    req = DraftQuestionRequest(type_id="TRUE_FALSE", topic="Mechanics")
    draft, marker = _run(draft_question(gw, request=req))
    assert isinstance(draft, DraftTrueFalse)
    assert draft.correct is True
    assert marker.prompt_template_id == "true_false_draft"


def test_draft_assertion_reason() -> None:
    gw = _build_authoring_gateway(
        template_id="assertion_reason_draft", schema_name="DraftAssertionReason",
        canned={
            "assertion": "Mass is conserved.",
            "reason": "Newton's third law.",
            "assertion_true": True,
            "reason_true": True,
            "reason_explains_assertion": False,
        },
    )
    req = DraftQuestionRequest(type_id="ASSERTION_REASON", topic="Mechanics")
    draft, marker = _run(draft_question(gw, request=req))
    assert isinstance(draft, DraftAssertionReason)
    assert marker.prompt_template_id == "assertion_reason_draft"


def test_draft_numeric_integer() -> None:
    gw = _build_authoring_gateway(
        template_id="numeric_integer_draft", schema_name="DraftNumericInteger",
        canned={
            "stem": "Find v after 5s with a = 6 m/s²",
            "correct": 30,
            "unit": "m/s",
        },
    )
    req = DraftQuestionRequest(type_id="NUMERIC_INTEGER", topic="Kinematics")
    draft, marker = _run(draft_question(gw, request=req))
    assert isinstance(draft, DraftNumericInteger)
    assert draft.correct == 30
    assert marker.prompt_template_id == "numeric_integer_draft"


def test_draft_numeric_decimal() -> None:
    gw = _build_authoring_gateway(
        template_id="numeric_decimal_draft", schema_name="DraftNumericDecimal",
        canned={
            "stem": "Compute pi to 2 decimals.",
            "correct": 3.14, "tolerance": 0.005,
        },
    )
    req = DraftQuestionRequest(type_id="NUMERIC_DECIMAL", topic="Math")
    draft, _ = _run(draft_question(gw, request=req))
    assert isinstance(draft, DraftNumericDecimal)
    assert draft.tolerance == 0.005


def test_draft_numeric_range() -> None:
    gw = _build_authoring_gateway(
        template_id="numeric_range_draft", schema_name="DraftNumericRange",
        canned={
            "stem": "Estimate g.",
            "low": 9.7, "high": 9.85,
        },
    )
    req = DraftQuestionRequest(type_id="NUMERIC_RANGE", topic="Mechanics")
    draft, _ = _run(draft_question(gw, request=req))
    assert isinstance(draft, DraftNumericRange)
    assert draft.low <= draft.high


def test_draft_formula_input() -> None:
    gw = _build_authoring_gateway(
        template_id="formula_input_draft", schema_name="DraftFormulaInput",
        canned={
            "stem": "Solve x² - 5x + 6 = 0",
            "target_expression": "x = 2 or x = 3",
            "accepted_alternatives": ["{2, 3}", "x in {2, 3}"],
        },
    )
    req = DraftQuestionRequest(type_id="FORMULA_INPUT", topic="Algebra")
    draft, _ = _run(draft_question(gw, request=req))
    assert isinstance(draft, DraftFormulaInput)
    assert "2" in draft.target_expression


def test_draft_unsupported_type_raises() -> None:
    gw = _build_authoring_gateway(
        template_id="mcq_single_draft", schema_name="DraftMCQ", canned={},
    )
    with pytest.raises(Exception):  # Pydantic ValidationError on Literal
        DraftQuestionRequest(type_id="NOT_A_REAL_TYPE", topic="x")


# ── Image moderation: decide_verdict ─────────────────────────────────────────


def test_moderation_clean_image_allows() -> None:
    scores = [
        CategoryScore(category="nsfw", confidence=0.05),
        CategoryScore(category="violence", confidence=0.10),
        CategoryScore(category="copyright", confidence=0.20),
    ]
    v = decide_verdict(scores)
    assert v.allow is True
    assert v.requires_pre_moderation is False
    assert v.blocked_reason is None


def test_moderation_nsfw_above_threshold_blocks() -> None:
    scores = [
        CategoryScore(category="nsfw", confidence=0.95, label="explicit"),
        CategoryScore(category="violence", confidence=0.0),
    ]
    v = decide_verdict(scores)
    assert v.allow is False
    assert "nsfw" in v.blocked_reason
    assert "explicit" in v.blocked_reason


def test_moderation_copyright_uses_lower_threshold() -> None:
    """Copyright has a 0.70 floor — lower than NSFW/violence (0.85)."""
    scores = [
        CategoryScore(category="copyright", confidence=0.75, label="Mickey Mouse"),
    ]
    v = decide_verdict(scores)
    assert v.allow is False
    assert "copyright" in v.blocked_reason


def test_moderation_suspicious_routes_to_pre_moderation() -> None:
    """0.50 ≤ confidence < threshold → allow but flag for review."""
    scores = [
        CategoryScore(category="violence", confidence=0.65),
    ]
    v = decide_verdict(scores)
    assert v.allow is True
    assert v.requires_pre_moderation is True
    assert v.blocked_reason is None


def test_moderation_below_suspicious_floor_clean() -> None:
    scores = [
        CategoryScore(category="nsfw", confidence=0.30),
    ]
    v = decide_verdict(scores)
    assert v.allow is True
    assert v.requires_pre_moderation is False


def test_moderation_threshold_constants() -> None:
    """Sanity check on the locked thresholds — changing requires ADR."""
    assert DEFAULT_THRESHOLDS["nsfw"] == 0.85
    assert DEFAULT_THRESHOLDS["violence"] == 0.85
    assert DEFAULT_THRESHOLDS["copyright"] == 0.70
    assert SUSPICIOUS_FLOOR == 0.50


# ── StubImageModerator ──────────────────────────────────────────────────────


def test_stub_moderator_returns_default_verdict() -> None:
    moderator_reset()
    m = StubImageModerator()
    v = _run(m.moderate(image_bytes=b"clean image", content_type="image/png"))
    assert v.allow is True


def test_stub_moderator_canned_response_by_hash_prefix() -> None:
    m = StubImageModerator()
    blob = b"copyrighted character image"
    digest = hashlib.sha256(blob).hexdigest()
    m.register_canned(
        digest[:16],
        [CategoryScore(category="copyright", confidence=0.95, label="Mickey")],
    )
    v = _run(m.moderate(image_bytes=blob, content_type="image/png"))
    assert v.allow is False
    assert "copyright" in v.blocked_reason


# ── Module-level singleton ──────────────────────────────────────────────────


def test_set_moderator_round_trip() -> None:
    moderator_reset()
    assert get_moderator() is None
    m = StubImageModerator()
    set_moderator(m)
    assert get_moderator() is m
    moderator_reset()
    assert get_moderator() is None


def test_moderate_or_skip_allows_with_warning_when_unconfigured() -> None:
    """Dev without AWS Rekognition: pipeline still functions."""
    moderator_reset()
    v = _run(moderate_or_skip(image_bytes=b"x", content_type="image/png"))
    assert v.allow is True
    assert v.requires_pre_moderation is True


def test_moderate_or_skip_uses_registered_moderator() -> None:
    moderator_reset()
    m = StubImageModerator()
    blob = b"explicit content fake"
    digest = hashlib.sha256(blob).hexdigest()
    m.register_canned(
        digest[:16],
        [CategoryScore(category="nsfw", confidence=0.99, label="explicit")],
    )
    set_moderator(m)
    try:
        v = _run(moderate_or_skip(image_bytes=blob, content_type="image/png"))
        assert v.allow is False
    finally:
        moderator_reset()
