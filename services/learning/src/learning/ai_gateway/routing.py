"""AI Gateway routing config — per-touchpoint primary + fallback provider.

Loads `/config/ai_routing.yaml`. Reload-on-config-change is a future
enhancement; v1 reads at AIGateway construction.

Per ADR-0019 §"Routing config".
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, Field

# 6 touchpoints. New touchpoints require an ADR amendment.
# `embedding` added per the ADR-0019 amendment for the AI Content
# Guardrail (L3 similarity scan) — keeps embedding generation behind the
# single gateway door rather than a direct OpenAI call.
Touchpoint = Literal[
    "authoring",
    "quality_check",
    "evaluation",
    "translation",
    "vision",
    "embedding",
]

ProviderName = Literal["openai", "stub", "admin_chain"]
# `admin_chain` is the Phase-7 multi-provider adapter that walks the
# admin-managed `ai_provider_config` table (Ollama / OpenAI / Anthropic
# in priority order). Adding a real direct-vendor client (anthropic /
# google / llama) requires both:
#   (a) extending this Literal, and
#   (b) adding the provider client under ai_gateway/providers/.


class ProviderConfig(BaseModel):
    """Per-provider config for a touchpoint."""

    provider: ProviderName
    model: str
    max_tokens: int = Field(gt=0, le=200_000)


class TouchpointRouting(BaseModel):
    """Primary + fallback provider for one touchpoint."""

    primary: ProviderConfig
    fallback: ProviderConfig | None = None
    timeout_ms: int = Field(default=15_000, gt=0)
    cost_target_per_call_usd: float | None = None


class RateLimits(BaseModel):
    per_creator_per_day: dict[str, int | str] = Field(default_factory=dict)
    platform_per_minute: dict[str, int] = Field(default_factory=dict)


class RoutingConfig(BaseModel):
    """Full routing config — keyed by touchpoint."""

    routing: dict[str, TouchpointRouting]
    rate_limits: RateLimits = Field(default_factory=RateLimits)


def load_routing(path: str | Path) -> RoutingConfig:
    """Load + validate routing config from a YAML file. Raises on
    schema mismatch (Pydantic ValidationError surfaced)."""
    p = Path(path)
    raw = yaml.safe_load(p.read_text())
    return RoutingConfig.model_validate(raw)


def default_stub_config() -> RoutingConfig:
    """Fallback when no routing YAML exists — every touchpoint routes
    primary to the admin-managed chain (Ollama / OpenAI / Anthropic
    in priority order, configured at /admin/ai-providers). Falls back
    to the in-process stub when no admin row is enabled, so the dev
    stack still works without configuring anything.
    """
    chain_provider = ProviderConfig(
        provider="admin_chain", model="auto", max_tokens=2000,
    )
    stub_provider = ProviderConfig(
        provider="stub", model="stub-v1", max_tokens=2000,
    )
    return RoutingConfig(
        routing={
            tp: TouchpointRouting(
                primary=chain_provider,
                fallback=stub_provider,
                timeout_ms=15000,
            )
            for tp in (
                "authoring",
                "quality_check",
                "evaluation",
                "translation",
                "vision",
                "embedding",
            )
        },
        rate_limits=RateLimits(),
    )
