"""Anthropic provider — official `anthropic` SDK (AsyncAnthropic).

Anthropic doesn't have native JSON-schema strict mode for messages,
so we use the **tool-use trick**: declare a tool whose input_schema is
the requested schema and force `tool_choice` to that tool. The model
then has to fill the tool inputs, which arrive on the response as a
`tool_use` block whose `.input` is the parsed dict.
"""

from __future__ import annotations

import logging
import time
from collections.abc import AsyncIterator
from typing import Any

from learning.ai_providers.providers.base import AIProvider, HealthStatus

log = logging.getLogger(__name__)


class AnthropicProvider(AIProvider):
    kind = "anthropic"
    display_name = "Anthropic Claude"

    def _client(self):
        import anthropic

        kwargs: dict[str, Any] = {"api_key": self.api_key}
        if self.base_url:
            kwargs["base_url"] = self.base_url
        return anthropic.AsyncAnthropic(**kwargs)

    async def call_structured(
        self,
        *,
        system: str,
        user: str,
        schema_name: str,
        schema: dict[str, Any],
    ) -> dict[str, Any] | None:
        if not self.api_key:
            return None
        client = self._client()
        try:
            resp = await client.messages.create(
                model=self.model,
                max_tokens=4096,
                system=system,
                messages=[{"role": "user", "content": user}],
                tools=[
                    {
                        "name": schema_name,
                        "description": f"Return a {schema_name} object.",
                        "input_schema": schema,
                    }
                ],
                tool_choice={"type": "tool", "name": schema_name},
            )
        except Exception as e:  # noqa: BLE001
            log.warning("provider.anthropic.failed", extra={"err": str(e)[:200]})
            return None

        for block in resp.content:
            if getattr(block, "type", None) == "tool_use" and block.name == schema_name:
                return dict(block.input) if block.input else None
        return None

    async def stream_chat(
        self,
        *,
        system: str,
        messages: list[dict[str, str]],
        max_tokens: int | None = None,
    ) -> AsyncIterator[str]:
        if not self.api_key:
            return
        client = self._client()
        try:
            async with client.messages.stream(
                model=self.model,
                max_tokens=max_tokens or 1024,
                system=system,
                messages=messages,
            ) as stream:
                async for text in stream.text_stream:
                    if text:
                        yield text
        except Exception as e:  # noqa: BLE001
            log.warning("provider.anthropic.stream_failed", extra={"err": str(e)[:200]})

    async def health_check(self) -> HealthStatus:
        if not self.api_key:
            return HealthStatus(ok=False, message="No API key configured")
        client = self._client()
        t0 = time.monotonic()
        try:
            resp = await client.messages.create(
                model=self.model,
                max_tokens=4,
                messages=[{"role": "user", "content": "ok?"}],
            )
            _ = resp.content
        except Exception as e:  # noqa: BLE001
            return HealthStatus(ok=False, message=f"anthropic error: {e!s}"[:200])
        return HealthStatus(
            ok=True,
            message="Reachable. Key + model work.",
            latency_ms=int((time.monotonic() - t0) * 1000),
        )
