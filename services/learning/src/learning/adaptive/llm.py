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
    return bool(settings.openai_api_key)


async def call_structured(
    *,
    system: str,
    user: str,
    schema_name: str,
    schema: dict[str, Any],
) -> dict[str, Any] | None:
    """Single-turn structured call. Forces the response to validate against `schema`.

    Returns the parsed dict on success, or None if the AI layer is disabled / errored.
    Callers should treat None as "use heuristic fallback" rather than a hard failure.
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

    Used by the AI tutor surface where streaming dramatically improves perceived
    latency. When the LLM is disabled, yields a single deterministic stub message
    so the UI flow is identical (caller can't tell heuristic from AI by stream shape).
    """
    client = _get_client()
    if client is None:
        yield (
            "AI tutor is currently unavailable on this stack. "
            "Set OPENAI_API_KEY in the adaptive-engine container to enable conversational tutoring."
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
