"""Admin-chain provider — bridges Phase-5 ai_gateway → Phase-7 admin chain.

The Phase-5 ai_gateway has its own per-touchpoint routing config that
defaults to a stub or OpenAI-direct provider. This adapter wraps the
admin-managed `ai_provider_config` chain (Ollama / OpenAI / Anthropic
in priority order) so Phase-5 surfaces (AI authoring assist, quality
checks, evaluation, translation, vision) flow through the same admin
controls as Phase-7 surfaces (study plan, lesson recommender, tutor).

When this provider is registered and routed for a touchpoint, the
gateway's `complete()` call walks the admin chain and returns the
first successful structured response, validated against the Pydantic
schema the caller passed.
"""

from __future__ import annotations

import logging
import time
from typing import Any

from learning.ai_gateway.providers.base import (
    Provider,
    ProviderError,
    ProviderResult,
)

log = logging.getLogger(__name__)


class AdminChainProvider(Provider):
    """Phase-5 Provider façade over the admin-managed chain."""

    name = "admin_chain"

    async def complete(
        self,
        *,
        model: str,                    # ignored — chain rows carry model
        system: str,
        user: str | dict[str, Any],
        schema: type,                  # Pydantic model class
        max_tokens: int,
        timeout_ms: int,
    ) -> ProviderResult:
        # Translate user payload to a string. Most touchpoints already
        # render to a string upstream; gateway tests pass dicts though.
        if isinstance(user, dict):
            import json as _json
            user_str = _json.dumps(user, ensure_ascii=False)
        else:
            user_str = user

        # Build a JSON schema dict from the Pydantic model. Pydantic
        # produces an OpenAPI-compatible schema; OpenAI / Ollama
        # consume the same shape.
        try:
            schema_dict: dict[str, Any] = schema.model_json_schema()
        except Exception as e:  # noqa: BLE001
            raise ProviderError(self.name, f"schema_json_failed: {e}") from e

        # Schema name = the Pydantic model's class name. ai_providers
        # use this to label tool calls (Anthropic) and json_schema
        # responses (OpenAI strict mode).
        schema_name = schema.__name__

        from learning.ai_providers import call_structured as _chain_call
        from learning.content.db import sessionmaker as _sm

        t0 = time.monotonic()
        try:
            async with _sm()() as sess:
                result = await _chain_call(
                    sess,
                    system=system,
                    user=user_str,
                    schema_name=schema_name,
                    schema=schema_dict,
                )
        except Exception as e:  # noqa: BLE001
            raise ProviderError(self.name, f"chain_error: {e}") from e

        if result is None:
            raise ProviderError(
                self.name,
                "no admin provider returned a usable response",
                retryable=False,
            )

        latency_ms = int((time.monotonic() - t0) * 1000)
        # Telemetry — we don't have token counts from Ollama. Estimate
        # from string lengths so dashboards don't show 0.
        tokens_in = max(1, len(system) // 4 + len(user_str) // 4)
        tokens_out = max(1, len(str(result)) // 4)

        return ProviderResult(
            data=result,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            latency_ms=latency_ms,
            model=f"chain:{schema_name}",   # opaque label for cost log
        )
