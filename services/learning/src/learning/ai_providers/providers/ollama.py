"""Ollama provider — direct HTTP via httpx (no SDK).

Uses Ollama's native /api/chat with `format=schema` for strict JSON
output and NDJSON streaming. Compatible with Ollama ≥ 0.5.0.
"""

from __future__ import annotations

import json
import logging
import time
from collections.abc import AsyncIterator
from typing import Any

import httpx

from learning.ai_providers.providers.base import AIProvider, HealthStatus

log = logging.getLogger(__name__)


class OllamaProvider(AIProvider):
    kind = "ollama"
    display_name = "Ollama (local)"

    async def call_structured(
        self,
        *,
        system: str,
        user: str,
        schema_name: str,
        schema: dict[str, Any],
    ) -> dict[str, Any] | None:
        url = (self.base_url or "").rstrip("/") + "/api/chat"
        body = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "format": schema,        # native JSON-schema enforcement
            "stream": False,
        }
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(self.timeout_s)) as c:
                r = await c.post(url, json=body)
                r.raise_for_status()
                payload = r.json()
        except Exception as e:  # noqa: BLE001
            log.warning("provider.ollama.failed", extra={"err": str(e)[:200], "url": url})
            return None
        content = (payload.get("message") or {}).get("content")
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
        url = (self.base_url or "").rstrip("/") + "/api/chat"
        body: dict[str, Any] = {
            "model": self.model,
            "messages": [{"role": "system", "content": system}, *messages],
            "stream": True,
        }
        if max_tokens:
            body["options"] = {"num_predict": int(max_tokens)}
        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(connect=5.0, read=self.timeout_s, write=10.0, pool=10.0),
            ) as c:
                async with c.stream("POST", url, json=body) as r:
                    r.raise_for_status()
                    async for line in r.aiter_lines():
                        if not line.strip():
                            continue
                        try:
                            chunk = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        if chunk.get("done"):
                            break
                        delta = (chunk.get("message") or {}).get("content")
                        if delta:
                            yield delta
        except Exception as e:  # noqa: BLE001
            log.warning(
                "provider.ollama.stream_failed",
                extra={"err": str(e)[:200], "url": url},
            )

    async def health_check(self) -> HealthStatus:
        url = (self.base_url or "").rstrip("/") + "/api/chat"
        body = {
            "model": self.model,
            "messages": [{"role": "user", "content": "ok?"}],
            "stream": False,
            "options": {"num_predict": 4},
        }
        t0 = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(20.0)) as c:
                r = await c.post(url, json=body)
                r.raise_for_status()
                _ = r.json()
        except Exception as e:  # noqa: BLE001
            return HealthStatus(ok=False, message=f"ollama unreachable: {e!s}"[:200])
        return HealthStatus(
            ok=True,
            message="Reachable. Key + model work.",
            latency_ms=int((time.monotonic() - t0) * 1000),
        )
