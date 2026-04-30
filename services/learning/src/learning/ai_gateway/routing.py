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

# 5 touchpoints. New touchpoints require an ADR amendment.
Touchpoint = Literal[
    "authoring",
    "quality_check",
    "evaluation",
    "translation",
    "vision",
]

ProviderName = Literal["openai", "stub"]
# Per user direction 2026-04-30: OpenAI is the sole real LLM provider
# in v1. The Literal stays narrow so a config typo fails Pydantic
# validation instead of silently routing to an absent provider.
# Future vendor additions (anthropic / google / llama) require both:
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
    """Fallback when no config file exists — every touchpoint routes
    to the in-process stub provider. Used for tests and for the dev
    stack while DPDP / API keys (ENG-OAQ-1, ENG-OAQ-2) are pending."""
    stub_provider = ProviderConfig(provider="stub", model="stub-v1", max_tokens=2000)
    return RoutingConfig(
        routing={
            tp: TouchpointRouting(primary=stub_provider, timeout_ms=5000)
            for tp in (
                "authoring",
                "quality_check",
                "evaluation",
                "translation",
                "vision",
            )
        },
        rate_limits=RateLimits(),
    )
