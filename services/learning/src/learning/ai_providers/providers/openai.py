"""OpenAI provider — official `openai` SDK (AsyncOpenAI).

Uses chat-completions with strict JSON-schema response_format for
structured calls and the native streaming API for chat.
"""

from __future__ import annotations

import json
import logging
import time
from collections.abc import AsyncIterator
from typing import Any

from learning.ai_providers.providers.base import AIProvider, HealthStatus

log = logging.getLogger(__name__)


class OpenAIProvider(AIProvider):
    kind = "openai"
    display_name = "OpenAI"

    def _client(self):
        from openai import AsyncOpenAI

        kwargs: dict[str, Any] = {"api_key": self.api_key}
        if self.base_url:
            kwargs["base_url"] = self.base_url
        return AsyncOpenAI(**kwargs)

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
            resp = await client.chat.completions.create(
                model=self.model,
                max_tokens=4096,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "name": schema_name,
                        "schema": schema,
                        "strict": True,
                    },
                },
            )
        except Exception as e:  # noqa: BLE001
            log.warning("provider.openai.failed", extra={"err": str(e)[:200]})
            return None
        finally:
            try:
                await client.close()
            except Exception:  # noqa: BLE001
                pass

        content = resp.choices[0].message.content if resp.choices else None
        if not content:
            return None
        try:
            return json.loads(content)
        except json.JSONDecodeError:
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
            stream = await client.chat.completions.create(
                model=self.model,
                max_tokens=max_tokens or 1024,
                messages=[{"role": "system", "content": system}, *messages],
                stream=True,
            )
        except Exception as e:  # noqa: BLE001
            log.warning("provider.openai.stream_failed", extra={"err": str(e)[:200]})
            return
        try:
            async for chunk in stream:
                if not chunk.choices:
                    continue
                d = chunk.choices[0].delta.content
                if d:
                    yield d
        except Exception as e:  # noqa: BLE001
            log.warning("provider.openai.stream_iter_failed", extra={"err": str(e)[:200]})
        finally:
            try:
                await client.close()
            except Exception:  # noqa: BLE001
                pass

    async def health_check(self) -> HealthStatus:
        if not self.api_key:
            return HealthStatus(ok=False, message="No API key configured")
        client = self._client()
        t0 = time.monotonic()
        try:
            resp = await client.chat.completions.create(
                model=self.model,
                max_tokens=4,
                messages=[{"role": "user", "content": "ok?"}],
            )
            _ = resp.choices[0].message.content
        except Exception as e:  # noqa: BLE001
            return HealthStatus(ok=False, message=f"openai error: {e!s}"[:200])
        finally:
            try:
                await client.close()
            except Exception:  # noqa: BLE001
                pass
        return HealthStatus(
            ok=True,
            message="Reachable. Key + model work.",
            latency_ms=int((time.monotonic() - t0) * 1000),
        )
