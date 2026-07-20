"""Phase 5 (P5-S38) — AI Gateway pure-component tests.

PII scrubber, prompt registry, routing config loader, and the Gateway
orchestration with the StubProvider. No real provider calls.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest
from pydantic import BaseModel, ValidationError

from learning.ai_gateway import AIGateway, AIGatewayError, PromptRegistry
from learning.ai_gateway.pii_scrubber import scrub_payload
from learning.ai_gateway.prompt_registry import PromptTemplate
from learning.ai_gateway.providers.stub_provider import StubProvider
from learning.ai_gateway.routing import (
    ProviderConfig,
    RoutingConfig,
    TouchpointRouting,
    default_stub_config,
    load_routing,
)


def _run(coro):
    return asyncio.run(coro)


# ── PII scrubber ─────────────────────────────────────────────────────────────


def test_scrub_email() -> None:
    out = scrub_payload({"text": "Contact me at john@example.com please"})
    assert "john@example.com" not in out.payload["text"]
    assert "[EMAIL_1]" in out.payload["text"]
    assert out.token_map["[EMAIL_1]"] == "john@example.com"


def test_scrub_phone() -> None:
    out = scrub_payload({"text": "Call +91-9876543210 anytime"})
    assert "9876543210" not in out.payload["text"]
    assert "[PHONE_" in out.payload["text"]


def test_scrub_short_digits_not_phone() -> None:
    # "March 21, 2024" should NOT be treated as a phone (< 7 digits).
    out = scrub_payload({"text": "Born on March 21, 2024"})
    # 2024 alone (4 digits) is below the 7-digit threshold, so no scrub.
    assert "2024" in out.payload["text"]


def test_scrub_name() -> None:
    out = scrub_payload({"text": "Mahatma Gandhi led the movement"})
    assert "Mahatma Gandhi" not in out.payload["text"]
    assert "[NAME_1]" in out.payload["text"]


def test_scrub_recursive_dict() -> None:
    out = scrub_payload(
        {
            "stem": "Email john@x.com for help",
            "options": [
                {"id": "A", "text": "alice@y.com is correct"},
                {"id": "B", "text": "no email here"},
            ],
        }
    )
    assert "john@x.com" not in out.payload["stem"]
    assert "alice@y.com" not in out.payload["options"][0]["text"]
    # Two distinct emails → 2 placeholders
    assert len([k for k in out.token_map if k.startswith("[EMAIL_")]) == 2


def test_scrub_repeated_email_reuses_placeholder() -> None:
    out = scrub_payload(
        {"text": "Email john@x.com or john@x.com again"}
    )
    # Same email → same placeholder (token_map dedupes)
    matches = [k for k in out.token_map if out.token_map[k] == "john@x.com"]
    assert len(matches) == 1
    # And the placeholder appears twice in output
    assert out.payload["text"].count(matches[0]) == 2


def test_scrub_reverse_map() -> None:
    out = scrub_payload({"text": "john@example.com is the contact"})
    placeholder = next(iter(out.token_map.keys()))
    feedback = f"Hello, {placeholder}, your essay was graded."
    restored = out.reverse_map(feedback)
    assert "john@example.com" in restored


def test_scrub_passes_through_non_strings() -> None:
    out = scrub_payload({"count": 42, "active": True, "ratio": 3.14, "none": None})
    assert out.payload == {"count": 42, "active": True, "ratio": 3.14, "none": None}


# ── Routing config ───────────────────────────────────────────────────────────


def test_default_stub_config_routes_to_admin_chain_with_stub_fallback() -> None:
    # Phase 7: the default config routes every touchpoint primary to the
    # admin-managed chain (Ollama/OpenAI/Anthropic by priority), with the
    # in-process stub as fallback so the dev stack works without config.
    cfg = default_stub_config()
    for tp in ("authoring", "quality_check", "evaluation", "translation", "vision", "embedding"):
        assert tp in cfg.routing
        assert cfg.routing[tp].primary.provider == "admin_chain"
        assert cfg.routing[tp].fallback is not None
        assert cfg.routing[tp].fallback.provider == "stub"


def test_load_routing_yaml_real_config() -> None:
    repo_root = Path(__file__).resolve().parents[4]
    yaml_path = repo_root / "config" / "ai_routing.yaml"
    cfg = load_routing(yaml_path)
    # Phase 7: admin-managed chain is primary across the text touchpoints.
    for tp in ("authoring", "quality_check", "evaluation", "translation", "vision"):
        assert cfg.routing[tp].primary.provider == "admin_chain"
    # The embedding touchpoint (AI Content Guardrail L3) routes to OpenAI —
    # the admin chain has no embeddings endpoint.
    assert cfg.routing["embedding"].primary.provider == "openai"


def test_routing_rejects_unknown_provider() -> None:
    # Pydantic Literal narrows providers to {openai, stub}; "anthropic"
    # should now be rejected at validation time.
    with pytest.raises(ValidationError):
        RoutingConfig.model_validate(
            {
                "routing": {
                    "authoring": {
                        "primary": {
                            "provider": "anthropic",  # not in Literal
                            "model": "claude-foo",
                            "max_tokens": 1000,
                        },
                    }
                }
            }
        )


def test_provider_config_max_tokens_bounded() -> None:
    with pytest.raises(ValidationError):
        ProviderConfig(provider="openai", model="gpt-4o", max_tokens=0)
    with pytest.raises(ValidationError):
        ProviderConfig(provider="openai", model="gpt-4o", max_tokens=300_000)


# ── Prompt registry ──────────────────────────────────────────────────────────


def test_prompt_template_version_must_be_semver() -> None:
    PromptTemplate(
        id="x",
        version="1.2.3",
        touchpoint="quality_check",
        system="hello",
        output_schema="X",
    )
    with pytest.raises(ValidationError):
        PromptTemplate(
            id="x",
            version="latest",  # not semver
            touchpoint="quality_check",
            system="hello",
            output_schema="X",
        )


def test_prompt_registry_load_from_directory() -> None:
    repo_root = Path(__file__).resolve().parents[4]
    prompts_dir = repo_root / "prompts"
    reg = PromptRegistry()
    n = reg.load_directory(prompts_dir)
    assert n >= 1
    # Sample template lands in S38
    t = reg.get("mcq_ambiguity", "1.0.0")
    assert t.touchpoint == "quality_check"


def test_prompt_registry_explicit_version_required() -> None:
    reg = PromptRegistry()
    with pytest.raises(KeyError):
        reg.get("mcq_ambiguity", "9.9.9")


def test_prompt_template_render_system_substitutes() -> None:
    t = PromptTemplate(
        id="t",
        version="1.0.0",
        touchpoint="authoring",
        system="Topic: {topic}, difficulty {level}",
        output_schema="X",
    )
    rendered = t.render_system({"topic": "Mechanics", "level": "EASY"})
    assert rendered == "Topic: Mechanics, difficulty EASY"


def test_prompt_template_missing_input_raises() -> None:
    t = PromptTemplate(
        id="t",
        version="1.0.0",
        touchpoint="authoring",
        system="Topic: {topic}",
        output_schema="X",
    )
    with pytest.raises(KeyError):
        t.render_system({})


# ── AIGateway orchestration with stub provider ───────────────────────────────


class _StubReport(BaseModel):
    """Schema used by tests."""

    is_ambiguous: bool = False
    reason: str = ""


def _make_test_gateway() -> AIGateway:
    reg = PromptRegistry()
    # Register a template directly (bypass YAML for test isolation)
    reg._templates[("test_ambiguity", "1.0.0")] = PromptTemplate(
        id="test_ambiguity",
        version="1.0.0",
        touchpoint="quality_check",
        system="Check ambiguity for stem={stem}",
        output_schema="_StubReport",
    )
    routing = default_stub_config()
    stub = StubProvider()
    stub.register_stub_response("_StubReport", {"is_ambiguous": True, "reason": "two defensible options"})
    return AIGateway(routing=routing, prompts=reg, providers={"stub": stub})


def test_gateway_call_happy_path() -> None:
    gw = _make_test_gateway()
    result = _run(
        gw.call(
            touchpoint="quality_check",
            prompt_template_id="test_ambiguity",
            prompt_template_version="1.0.0",
            prompt_inputs={"stem": "What is 2 + 2?"},
            schema=_StubReport,
        )
    )
    assert isinstance(result, _StubReport)
    assert result.is_ambiguous is True
    assert "defensible" in result.reason


def test_gateway_unknown_touchpoint_raises() -> None:
    gw = _make_test_gateway()
    with pytest.raises(AIGatewayError):
        _run(
            gw.call(
                touchpoint="not_a_real_touchpoint",
                prompt_template_id="test_ambiguity",
                prompt_template_version="1.0.0",
                prompt_inputs={"stem": "x"},
                schema=_StubReport,
            )
        )


def test_gateway_unknown_template_raises() -> None:
    gw = _make_test_gateway()
    with pytest.raises(KeyError):
        _run(
            gw.call(
                touchpoint="quality_check",
                prompt_template_id="nope",
                prompt_template_version="1.0.0",
                prompt_inputs={"stem": "x"},
                schema=_StubReport,
            )
        )


def test_gateway_template_touchpoint_must_match() -> None:
    """The template's declared touchpoint must equal the call's touchpoint."""
    gw = _make_test_gateway()
    with pytest.raises(AIGatewayError):
        _run(
            gw.call(
                # Template is registered for quality_check
                touchpoint="evaluation",  # wrong!
                prompt_template_id="test_ambiguity",
                prompt_template_version="1.0.0",
                prompt_inputs={"stem": "x"},
                schema=_StubReport,
            )
        )


class _CapturingStub(StubProvider):
    """Stub that records the `user` payload the gateway forwards."""

    def __init__(self):
        super().__init__()
        self.last_user: object = None
        self.register_stub_response("_StubReport", {"is_ambiguous": False, "reason": ""})

    async def complete(self, *, model, system, user, schema, max_tokens, timeout_ms):
        self.last_user = user
        return await super().complete(
            model=model, system=system, user=user, schema=schema,
            max_tokens=max_tokens, timeout_ms=timeout_ms,
        )


def _capturing_gateway(cap: _CapturingStub, touchpoint: str) -> AIGateway:
    reg = PromptRegistry()
    reg._templates[("test_tpl", "1.0.0")] = PromptTemplate(
        id="test_tpl",
        version="1.0.0",
        touchpoint=touchpoint,
        system="ctx {stem}{topic}",
        output_schema="_StubReport",
    )
    return AIGateway(routing=default_stub_config(), prompts=reg, providers={"stub": cap})


def test_gateway_scrubs_pii_for_student_facing_touchpoint() -> None:
    """PII in evaluation inputs (student answers) must be scrubbed pre-call."""
    cap = _CapturingStub()
    gw = _capturing_gateway(cap, touchpoint="evaluation")
    _run(
        gw.call(
            touchpoint="evaluation",
            prompt_template_id="test_tpl",
            prompt_template_version="1.0.0",
            prompt_inputs={"stem": "Email alice@example.com for help", "topic": ""},
            schema=_StubReport,
        )
    )
    user_str = str(cap.last_user)
    assert "alice@example.com" not in user_str
    assert "[EMAIL" in user_str


def test_gateway_does_not_scrub_authoring_topic_titles() -> None:
    """Regression: authoring inputs are curriculum taxonomy, not student PII.
    Multi-word topic titles ("Chemical Bonding and Molecular Structure") must
    reach the model INTACT — scrubbing them to "[NAME_1] and [NAME_2]" produced
    non-contextual, placeholder-ridden questions."""
    cap = _CapturingStub()
    gw = _capturing_gateway(cap, touchpoint="authoring")
    _run(
        gw.call(
            touchpoint="authoring",
            prompt_template_id="test_tpl",
            prompt_template_version="1.0.0",
            prompt_inputs={"stem": "", "topic": "Chemical Bonding and Molecular Structure"},
            schema=_StubReport,
        )
    )
    user = cap.last_user
    assert isinstance(user, dict)
    assert user["topic"] == "Chemical Bonding and Molecular Structure"
    assert "[NAME_" not in str(user)
