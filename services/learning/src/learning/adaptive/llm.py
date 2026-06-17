"""OpenAI client wrapper.

Single entry point: call_structured(system, user, schema, ...) → dict.

Design choices:
- Async OpenAI SDK throughout (FastAPI handlers are async).
- Structured outputs via response_format=json_schema with strict=True. Guarantees the response
  parses against the supplied schema; saves us from string-parsing JSON out of free-form text.
- OpenAI does automatic prompt caching for prompts ≥1024 tokens — we keep the system prompt
  stable and put per-request volatility in the user turn.
- Graceful degrade: when OPENAI_API_KEY is unset (default in local dev), `call_structured`
  returns None. Callers must fall back to a deterministic heuristic. This keeps the service
  bootable without an API key — the AI layer simply isn't engaged.
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from typing import Any

import openai
import structlog

from learning.adaptive.config import settings

log = structlog.get_logger(__name__)

_client: openai.AsyncOpenAI | None = None


def _get_client() -> openai.AsyncOpenAI | None:
    global _client
    if not settings.openai_api_key:
        return None
    if _client is None:
        _client = openai.AsyncOpenAI(api_key=settings.openai_api_key)
    return _client


def is_enabled() -> bool:
    """Legacy synchronous gate — true if env-key OpenAI is configured.

    Prefer `is_enabled_async()` in new code: it also returns True when
    an admin-managed provider (Ollama / OpenAI / Anthropic) is enabled
    in `content_schema.ai_provider_config`, even if no env key is set.
    """
    return bool(settings.openai_api_key)


async def is_enabled_async() -> bool:
    """True if any LLM path is available — env-key OpenAI OR an enabled
    row in the admin provider chain. Used by surfaces that want to
    short-circuit with a stub message when no AI is reachable.
    """
    if settings.openai_api_key:
        return True
    try:
        from sqlalchemy import text as _t

        from learning.content.db import sessionmaker as _sm

        async with _sm()() as sess:
            row = (
                await sess.execute(
                    _t(
                        "SELECT 1 FROM content_schema.ai_provider_config "
                        " WHERE enabled = TRUE LIMIT 1"
                    )
                )
            ).first()
            return row is not None
    except Exception:  # noqa: BLE001
        return False


async def active_provider() -> str | None:
    """Best-effort label of the AI path that would actually serve a call.

    Returns the highest-priority *enabled* row's display_name from the
    admin provider chain; else "OpenAI" when a legacy env key is set;
    else None (no AI reachable). Used by `/adaptive/ai-status` and the
    resource-suggestion response so the UI reports the real provider
    instead of a hardcoded "openai". It reflects the configured top
    provider, not a guaranteed served-by (the chain may fall through on
    failure), which is accurate enough for status/labelling.
    """
    try:
        from sqlalchemy import text as _t

        from learning.content.db import sessionmaker as _sm

        async with _sm()() as sess:
            row = (
                await sess.execute(
                    _t(
                        "SELECT display_name FROM content_schema.ai_provider_config "
                        " WHERE enabled = TRUE ORDER BY priority, created_at LIMIT 1"
                    )
                )
            ).first()
            if row is not None:
                return str(row[0])
    except Exception:  # noqa: BLE001 — DB unreachable → fall back to env key
        pass
    if settings.openai_api_key:
        return "OpenAI"
    return None


async def call_structured(
    *,
    system: str,
    user: str,
    schema_name: str,
    schema: dict[str, Any],
) -> dict[str, Any] | None:
    """Single-turn structured call. Forces the response to validate against `schema`.

    Phase 7 — try the admin-configured provider chain first
    (Ollama → OpenAI → Anthropic, in admin priority order). Fall
    back to the legacy env-key OpenAI client only when no enabled
    rows exist in `ai_provider_config`. So existing deployments that
    haven't seeded the table keep working unchanged; admins who turn
    on Ollama in the UI immediately get free local generation with
    OpenAI as a paid backstop.

    Returns the parsed dict on success, or None if every provider
    fails. Callers should treat None as "use heuristic fallback"
    rather than a hard failure.
    """
    # Phase 7 — try DB-driven multi-provider chain first.
    try:
        from learning.ai_providers import call_structured as _multi_call
        from learning.content.db import sessionmaker as _content_sm

        async with _content_sm()() as _sess:
            db_result = await _multi_call(
                _sess,
                system=system,
                user=user,
                schema_name=schema_name,
                schema=schema,
            )
        if db_result is not None:
            return db_result
        # If we got here either no rows are enabled OR every enabled
        # row failed; fall through to the legacy env-key OpenAI path
        # so a misconfigured provider table doesn't take down AI.
    except Exception as e:  # noqa: BLE001
        # Multi-provider layer crashed (DB unavailable, etc.) — log
        # and continue to the legacy path.
        log.warning("multi_provider_layer_error", error=str(e)[:200])

    client = _get_client()
    if client is None:
        return None

    try:
        response = await client.chat.completions.create(
            model=settings.openai_model,
            max_tokens=settings.openai_max_tokens,
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
    except openai.APIError as e:
        log.warning("openai_call_failed", error=str(e), status=getattr(e, "status_code", None))
        return None
    except Exception as e:  # noqa: BLE001
        log.warning("openai_call_unexpected", error=str(e))
        return None

    choice = response.choices[0]
    if choice.finish_reason == "length":
        log.warning("openai_truncated", model=response.model)
        return None
    content = choice.message.content
    if not content:
        log.warning("openai_empty_content", finish=choice.finish_reason)
        return None

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError as e:
        log.warning("openai_invalid_json", error=str(e), content=content[:200])
        return None

    log.info(
        "openai_call_ok",
        model=response.model,
        prompt_tokens=response.usage.prompt_tokens if response.usage else None,
        completion_tokens=response.usage.completion_tokens if response.usage else None,
    )
    return parsed if isinstance(parsed, dict) else None


async def call_vision_structured(
    *,
    system: str,
    user_text: str,
    image_data_url: str,
    schema_name: str,
    schema: dict[str, Any],
) -> dict[str, Any] | None:
    """Single-turn vision call. Sends an image alongside text, forces strict-JSON
    output. Used by the photo-doubt flow to OCR a handwritten/printed question
    and produce a structured solution.

    `image_data_url` must be a data: URL (data:image/jpeg;base64,XXXX) or an https URL.
    Returns None when the LLM is disabled or errors — caller falls back to a stub.
    """
    client = _get_client()
    if client is None:
        return None
    try:
        response = await client.chat.completions.create(
            model=settings.openai_model,
            max_tokens=settings.openai_max_tokens,
            messages=[
                {"role": "system", "content": system},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user_text},
                        {"type": "image_url", "image_url": {"url": image_data_url}},
                    ],
                },
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {"name": schema_name, "schema": schema, "strict": True},
            },
        )
    except openai.APIError as e:
        log.warning("openai_vision_failed", error=str(e), status=getattr(e, "status_code", None))
        return None
    except Exception as e:  # noqa: BLE001
        log.warning("openai_vision_unexpected", error=str(e))
        return None

    choice = response.choices[0]
    if choice.finish_reason == "length":
        log.warning("openai_vision_truncated", model=response.model)
        return None
    content = choice.message.content
    if not content:
        return None
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError as e:
        log.warning("openai_vision_invalid_json", error=str(e))
        return None
    log.info(
        "openai_vision_ok",
        model=response.model,
        prompt_tokens=response.usage.prompt_tokens if response.usage else None,
        completion_tokens=response.usage.completion_tokens if response.usage else None,
    )
    return parsed if isinstance(parsed, dict) else None


async def stream_chat(
    *,
    system: str,
    messages: list[dict[str, str]],
    max_tokens: int | None = None,
) -> AsyncIterator[str]:
    """Multi-turn chat with token-level streaming. Yields content deltas as they arrive.

    Walks the admin-managed AI provider chain first (Ollama → OpenAI → Anthropic
    in priority order); falls back to the legacy env-key OpenAI client if the
    DB layer returns nothing. Used by the AI tutor surface where streaming
    dramatically improves perceived latency.
    """
    # Phase 7 — admin-managed provider chain (matches call_structured path).
    served_any = False
    try:
        from learning.ai_providers import stream_chat as _multi_stream
        from learning.content.db import sessionmaker as _content_sm

        async with _content_sm()() as _sess:
            async for delta in _multi_stream(
                _sess, system=system, messages=messages, max_tokens=max_tokens,
            ):
                served_any = True
                yield delta
    except Exception as e:  # noqa: BLE001
        log.warning("multi_provider_stream_error", error=str(e)[:200])

    if served_any:
        return

    # Legacy env-key OpenAI fallback.
    client = _get_client()
    if client is None:
        yield (
            "AI tutor is currently unavailable on this stack. "
            "Enable a provider in /ai-providers (Ollama / OpenAI / Anthropic) "
            "or set OPENAI_API_KEY in the engine container."
        )
        return

    try:
        stream = await client.chat.completions.create(
            model=settings.openai_model,
            max_tokens=max_tokens or settings.openai_max_tokens,
            messages=[{"role": "system", "content": system}, *messages],
            stream=True,
        )
    except openai.APIError as e:
        log.warning("openai_stream_failed", error=str(e))
        yield "Sorry — the tutor service hit an error. Please retry in a moment."
        return
    except Exception as e:  # noqa: BLE001
        log.warning("openai_stream_unexpected", error=str(e))
        yield "Sorry — the tutor service hit an error. Please retry in a moment."
        return

    async for chunk in stream:
        if not chunk.choices:
            continue
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta


# Suppress noisy httpx INFO logs from the OpenAI SDK in service logs.
logging.getLogger("httpx").setLevel(logging.WARNING)
