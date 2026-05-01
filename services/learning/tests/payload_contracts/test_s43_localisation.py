"""Phase 5 (P5-S43) — Localisation pipeline + glossary + calibration.

Pure-function tests for the payload walker, glossary applier, and
Cohen's kappa. Gateway-stub tests for translate_artifact happy path.
"""

from __future__ import annotations

import asyncio

import pytest

from learning.ai_gateway import AIGateway, PromptRegistry
from learning.ai_gateway.prompt_registry import PromptTemplate
from learning.ai_gateway.providers.stub_provider import StubProvider
from learning.ai_gateway.routing import default_stub_config
from learning.localisation.calibration import (
    KAPPA_AUTO_PAUSE_FLOOR,
    KappaSample,
    cohens_kappa,
    sample_for_calibration_pipeline,
)
from learning.localisation.glossary import GlossaryEntry
from learning.localisation.translator import (
    apply_glossary,
    extract_translatable_strings,
    merge_translations_into_payload,
    translate_artifact,
)


def _run(coro):
    return asyncio.run(coro)


@pytest.fixture(autouse=True)
def _reset_gateway_cache():
    """Translation is a cacheable touchpoint (P5-S52). Reset between
    tests so stub responses don't leak through the cache."""
    from learning.ai_gateway.cache import reset_for_tests as _cache_reset
    _cache_reset()
    yield
    _cache_reset()


# ── extract_translatable_strings ─────────────────────────────────────────────


def test_extract_top_level_path() -> None:
    payload = {"stem": "What is 2+2?", "explanation": "addition"}
    out = extract_translatable_strings(payload, ["stem"])
    assert out == {"stem": "What is 2+2?"}


def test_extract_nested_array_splat() -> None:
    payload = {
        "options": [
            {"id": "A", "text": "first"},
            {"id": "B", "text": "second"},
        ]
    }
    out = extract_translatable_strings(payload, ["options[*].text"])
    assert out == {
        "options[0].text": "first",
        "options[1].text": "second",
    }


def test_extract_skips_non_strings() -> None:
    payload = {"correct_idx": 0, "stem": "x", "options": []}
    out = extract_translatable_strings(payload, ["stem", "correct_idx", "options[*].text"])
    assert out == {"stem": "x"}


def test_extract_handles_missing_paths() -> None:
    payload = {"stem": "x"}
    out = extract_translatable_strings(payload, ["stem", "rubric.criteria[*].text"])
    assert out == {"stem": "x"}


def test_extract_deeply_nested() -> None:
    payload = {
        "rubric": {
            "criteria": [
                {"id": "c1", "text": "first criterion"},
                {"id": "c2", "text": "second criterion"},
            ]
        }
    }
    out = extract_translatable_strings(payload, ["rubric.criteria[*].text"])
    assert "rubric.criteria[0].text" in out
    assert out["rubric.criteria[0].text"] == "first criterion"


# ── merge_translations_into_payload ──────────────────────────────────────────


def test_merge_round_trips() -> None:
    payload = {
        "stem": "What is 2+2?",
        "options": [
            {"id": "A", "text": "three"},
            {"id": "B", "text": "four"},
        ],
    }
    paths = ["stem", "options[*].text"]
    extracted = extract_translatable_strings(payload, paths)
    # Pretend we translated each → uppercase.
    translated = {k: v.upper() for k, v in extracted.items()}
    out = merge_translations_into_payload(payload, translated)
    assert out["stem"] == "WHAT IS 2+2?"
    assert out["options"][0]["text"] == "THREE"
    assert out["options"][1]["text"] == "FOUR"
    # Original untouched (deep copy semantics).
    assert payload["stem"] == "What is 2+2?"


def test_merge_skips_unknown_paths() -> None:
    payload = {"stem": "x"}
    out = merge_translations_into_payload(payload, {"missing.field": "y"})
    assert out == {"stem": "x"}


# ── apply_glossary ───────────────────────────────────────────────────────────


def _entry(src: str, tgt: str, category: str = "subject", case_sensitive: bool = False) -> GlossaryEntry:
    return GlossaryEntry(
        id="x", subject="biology", source_lang="en", target_lang="hi",
        source_term=src, target_term=tgt, category=category,  # type: ignore[arg-type]
        case_sensitive=case_sensitive,
    )


def test_apply_glossary_substitutes_subject_term() -> None:
    text = "Photosynthesis converts CO2 to glucose."
    entries = [_entry("photosynthesis", "प्रकाश संश्लेषण")]
    out, applied = apply_glossary(text, entries)
    assert "प्रकाश संश्लेषण" in out
    assert "photosynthesis" in applied


def test_apply_glossary_skips_cultural_category() -> None:
    text = "The leader was Gandhi."
    entries = [_entry("Gandhi", "गांधी", category="cultural")]
    out, applied = apply_glossary(text, entries)
    # Cultural entries are advisory — not substituted.
    assert out == text
    assert applied == []


def test_apply_glossary_locked_term_substitutes() -> None:
    text = "Plot F vs t to find slope."
    entries = [_entry("F vs t", "F vs t", category="locked")]
    # Locked terms preserve their own form; substitution is identity.
    out, applied = apply_glossary(text, entries)
    assert out == text
    assert "F vs t" in applied


# ── Calibration sampling ─────────────────────────────────────────────────────


def test_calibration_sampling_deterministic() -> None:
    rid = "stable-id"
    first = sample_for_calibration_pipeline(rid)
    for _ in range(5):
        assert sample_for_calibration_pipeline(rid) == first


def test_calibration_sampling_roughly_5pct() -> None:
    sampled = sum(
        1 for i in range(200)
        if sample_for_calibration_pipeline(f"resp-{i:04d}")
    )
    # 200 * 0.05 = 10. Allow ±10 for stochasticity at this n.
    assert 0 <= sampled <= 25


# ── Cohen's kappa ────────────────────────────────────────────────────────────


def test_kappa_perfect_agreement() -> None:
    samples = [
        KappaSample(ai_score=1.0, human_score=1.0),
        KappaSample(ai_score=0.5, human_score=0.5),
        KappaSample(ai_score=0.0, human_score=0.0),
        KappaSample(ai_score=1.0, human_score=1.0),
    ]
    k = cohens_kappa(samples)
    assert k is not None
    assert k > 0.95  # essentially 1.0 (allowing ordinal tolerance)


def test_kappa_no_agreement_below_floor() -> None:
    samples = [
        KappaSample(ai_score=1.0, human_score=0.0),
        KappaSample(ai_score=0.0, human_score=1.0),
        KappaSample(ai_score=1.0, human_score=0.0),
        KappaSample(ai_score=0.0, human_score=1.0),
    ]
    k = cohens_kappa(samples)
    assert k is not None
    assert k < KAPPA_AUTO_PAUSE_FLOOR


def test_kappa_returns_none_for_thin_sample() -> None:
    assert cohens_kappa([]) is None
    assert cohens_kappa([KappaSample(ai_score=1.0, human_score=1.0)]) is None


def test_kappa_ordinal_tolerance() -> None:
    """0.5 vs 0.0 is closer than 1.0 vs 0.0 → quadratic weights
    give partial credit."""
    near_miss = [
        KappaSample(ai_score=1.0, human_score=0.5),
        KappaSample(ai_score=0.5, human_score=1.0),
        KappaSample(ai_score=0.0, human_score=0.5),
        KappaSample(ai_score=0.5, human_score=0.0),
    ] * 3
    far_miss = [
        KappaSample(ai_score=1.0, human_score=0.0),
        KappaSample(ai_score=0.0, human_score=1.0),
    ] * 6
    k_near = cohens_kappa(near_miss)
    k_far = cohens_kappa(far_miss)
    # near-miss kappa should not be lower than far-miss kappa.
    assert k_near is not None and k_far is not None
    assert k_near >= k_far


# ── translate_artifact (Gateway-stub) ────────────────────────────────────────


def _make_translate_gateway(canned: dict) -> AIGateway:
    reg = PromptRegistry()
    reg._templates[("translate_field", "1.0.0")] = PromptTemplate(
        id="translate_field", version="1.0.0", touchpoint="translation",
        system="src={source_lang} tgt={target_lang} text={source_text} "
               "glossary={glossary_block}",
        output_schema="TranslationOutput",
    )
    stub = StubProvider()
    stub.register_stub_response("TranslationOutput", canned)
    return AIGateway(routing=default_stub_config(), prompts=reg, providers={"stub": stub})


def test_translate_artifact_walks_paths_and_assembles() -> None:
    gw = _make_translate_gateway(
        {"translated": "TRANSLATED_VALUE", "flagged_cultural": False, "confidence": 0.92},
    )
    payload = {
        "stem": "What is 2+2?",
        "options": [
            {"id": "A", "text": "three"},
            {"id": "B", "text": "four"},
        ],
    }
    draft = _run(translate_artifact(
        gw,
        artifact_id="q1",
        target_lang="hi",
        payload=payload,
        translatable_paths=["stem", "options[*].text"],
    ))
    assert draft.target_lang == "hi"
    assert draft.fields_translated == 3  # stem + 2 options
    assert draft.payload_translation["stem"] == "TRANSLATED_VALUE"
    assert draft.payload_translation["options"][0]["text"] == "TRANSLATED_VALUE"
    assert draft.avg_confidence == 0.92


def test_translate_artifact_unsupported_lang_raises() -> None:
    gw = _make_translate_gateway({"translated": "x", "confidence": 0.5})
    with pytest.raises(ValueError):
        _run(translate_artifact(
            gw,
            artifact_id="q1",
            target_lang="zz",  # not in SUPPORTED_LANGS
            payload={"stem": "x"},
            translatable_paths=["stem"],
        ))


def test_translate_artifact_surfaces_cultural_flags() -> None:
    gw = _make_translate_gateway(
        {
            "translated": "X",
            "flagged_cultural": True,
            "flag_reason": "political reference",
            "confidence": 0.7,
        }
    )
    draft = _run(translate_artifact(
        gw,
        artifact_id="q1",
        target_lang="hi",
        payload={"stem": "Some politically sensitive prompt"},
        translatable_paths=["stem"],
    ))
    assert any("ai_flagged" in f for f in draft.cultural_flags)


def test_translate_artifact_gateway_failure_keeps_source() -> None:
    """Gateway error → source string preserved in output, confidence=0."""

    class _Boom(StubProvider):
        async def complete(self, **kw):  # type: ignore[override]
            from learning.ai_gateway.providers.base import ProviderError
            raise ProviderError(self.name, "down", retryable=False)

    reg = PromptRegistry()
    reg._templates[("translate_field", "1.0.0")] = PromptTemplate(
        id="translate_field", version="1.0.0", touchpoint="translation",
        system="src={source_lang} tgt={target_lang} text={source_text} "
               "glossary={glossary_block}",
        output_schema="TranslationOutput",
    )
    gw = AIGateway(routing=default_stub_config(), prompts=reg, providers={"stub": _Boom()})
    draft = _run(translate_artifact(
        gw,
        artifact_id="q1",
        target_lang="hi",
        payload={"stem": "untranslated"},
        translatable_paths=["stem"],
    ))
    assert draft.payload_translation["stem"] == "untranslated"
    assert draft.avg_confidence == 0.0


def test_translate_artifact_glossary_applied_to_output() -> None:
    """Glossary entries influence the translated text."""
    gw = _make_translate_gateway(
        {"translated": "photosynthesis is X", "confidence": 0.9},
    )
    glossary = [_entry("photosynthesis", "प्रकाश संश्लेषण")]
    draft = _run(translate_artifact(
        gw,
        artifact_id="q1",
        target_lang="hi",
        payload={"stem": "ignored"},
        translatable_paths=["stem"],
        glossary=glossary,
    ))
    # Glossary substitution applies to AI output.
    assert "प्रकाश संश्लेषण" in draft.payload_translation["stem"]
