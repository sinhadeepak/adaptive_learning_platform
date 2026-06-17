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
        # OpenAI strict json_schema mode requires `additionalProperties: false`
        # on every object — Pydantic's default model_json_schema() does NOT
        # emit it, so unprocessed Pydantic schemas get rejected with a 400.
        # Walk the schema and patch every nested object before sending.
        strict_schema = _to_openai_strict(schema)
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
                        "schema": strict_schema,
                        "strict": True,
                    },
                },
            )
        except Exception as e:  # noqa: BLE001
            # Log at WARNING with the full error text — silent None-return
            # at this layer is convenient for the orchestrator's fallback
            # logic, but invisible failures make ops impossible. The full
            # 400 message ("In context=…, 'additionalProperties' is required")
            # is exactly what an operator needs to diagnose schema drift.
            log.warning(
                "provider.openai.failed: %s",
                str(e)[:500],
                extra={"err": str(e)[:500], "schema_name": schema_name},
            )
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


# ── Schema strict-mode adapter ───────────────────────────────────────


def _to_openai_strict(schema: dict[str, Any]) -> dict[str, Any]:
    """Make a Pydantic-emitted JSON schema compatible with OpenAI's
    strict json_schema response_format.

    OpenAI strict mode (`strict: true`) rejects schemas unless EVERY
    object (root, nested, and inside `$defs`) carries
    `additionalProperties: false`. Pydantic's `model_json_schema()`
    doesn't emit this by default, so an unprocessed schema gets a
    400 BadRequestError ("In context=…, 'additionalProperties' is
    required to be supplied and to be false.").

    This walks the schema tree and stamps `additionalProperties: false`
    on every object node. Idempotent — safe to apply twice. Does not
    re-write user-set `additionalProperties: true` because OpenAI
    strict mode would reject those anyway; callers shouldn't be using
    open-shape objects with strict mode.
    """
    import copy

    out = copy.deepcopy(schema)
    _strict_walk(out)
    return out


def _strict_walk(node: Any) -> None:
    if isinstance(node, dict):
        # Stamp every object schema. `type` may be missing (e.g. `$ref`
        # nodes) — only touch dicts that look like object schemas.
        if node.get("type") == "object" or "properties" in node:
            node["additionalProperties"] = False
            # OpenAI strict mode also demands `required` enumerates every
            # property. Pydantic only lists fields without defaults; we
            # force-include all keys here. `default` keywords on those
            # properties are stripped below because strict mode rejects
            # them too.
            props = node.get("properties") or {}
            if isinstance(props, dict) and props:
                node["required"] = list(props.keys())
        # Strict mode forbids `default` on any subschema.
        node.pop("default", None)
        for v in node.values():
            _strict_walk(v)
    elif isinstance(node, list):
        for item in node:
            _strict_walk(item)
