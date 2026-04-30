"""OpenAI provider — uses Structured Outputs for schema enforcement.

Per ADR-0019 §"Structured-output discipline". Every call passes a JSON
schema; validation enforced before the result returns to caller.

Uses OpenAI Python SDK >= 1.50 with `response_format` parsing.
"""

from __future__ import annotations

import json
import os
import time
from typing import Any

from learning.ai_gateway.providers.base import Provider, ProviderError, ProviderResult


class OpenAIProvider(Provider):
    name = "openai"

    def __init__(self, api_key: str | None = None) -> None:
        # Defer SDK import so the module loads even when openai isn't
        # installed (e.g. minimal dev environments).
        try:
            from openai import AsyncOpenAI
        except ImportError as e:
            raise ProviderError(
                self.name,
                "openai package not installed; add openai>=1.50 to deps",
                retryable=False,
            ) from e

        key = api_key or os.environ.get("OPENAI_API_KEY")
        if not key:
            # Surface as a clearly-marked error; AIGateway will fall
            # through to fallback / stub. Don't fabricate a fake key.
            raise ProviderError(
                self.name,
                "OPENAI_API_KEY not set",
                retryable=False,
            )
        self._client = AsyncOpenAI(api_key=key)

    async def complete(
        self,
        *,
        model: str,
        system: str,
        user: str | dict[str, Any],
        schema: type,
        max_tokens: int,
        timeout_ms: int,
    ) -> ProviderResult:
        user_text = (
            user if isinstance(user, str) else json.dumps(user, ensure_ascii=False)
        )
        timeout_s = timeout_ms / 1000.0
        started = time.monotonic()

        try:
            # OpenAI's structured-output mechanism: pass `response_format`
            # with the schema's JSON shape. The SDK parses + validates.
            response = await self._client.beta.chat.completions.parse(
                model=model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user_text},
                ],
                response_format=schema,
                max_completion_tokens=max_tokens,
                timeout=timeout_s,
            )
        except Exception as e:
            raise ProviderError(
                self.name,
                f"{type(e).__name__}: {e}",
                retryable=True,
            ) from e

        latency_ms = int((time.monotonic() - started) * 1000)

        # SDK guarantees the parsed message is the schema instance OR
        # `refusal` is set. Both branches are provider errors at the
        # Gateway level.
        choice = response.choices[0] if response.choices else None
        if choice is None or choice.message is None:
            raise ProviderError(self.name, "no choices in response", retryable=True)
        if getattr(choice.message, "refusal", None):
            raise ProviderError(
                self.name,
                f"model refused: {choice.message.refusal}",
                retryable=False,
            )

        parsed = choice.message.parsed
        if parsed is None:
            raise ProviderError(
                self.name, "structured-output parse returned None", retryable=True
            )

        usage = response.usage
        return ProviderResult(
            data=parsed.model_dump() if hasattr(parsed, "model_dump") else dict(parsed),
            tokens_in=int(getattr(usage, "prompt_tokens", 0) or 0),
            tokens_out=int(getattr(usage, "completion_tokens", 0) or 0),
            latency_ms=latency_ms,
            model=model,
        )
