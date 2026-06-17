"""Provider orchestrator — walks priority chain via the AIProvider abstraction.

All per-provider quirks live in `providers/{ollama,openai,anthropic}.py`;
this file only knows about the unified interface (call_structured /
stream_chat / health_check). Adding a new provider doesn't touch this
file — only providers/base.py:from_config grows one entry.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from learning.ai_providers.providers import AIProvider, from_config

log = logging.getLogger(__name__)


# ── DB lookup ────────────────────────────────────────────────────────


async def _list_enabled(session: AsyncSession) -> list[dict[str, Any]]:
    """Fetch enabled provider rows in priority order. Single indexed
    query; cheap to call on every request so admin edits apply
    immediately without a process restart."""
    res = await session.execute(
        text(
            "SELECT id, kind, display_name, priority, base_url, model, "
            "       api_key_encrypted "
            "  FROM content_schema.ai_provider_config "
            " WHERE enabled = TRUE "
            " ORDER BY priority, created_at"
        )
    )
    return [dict(r) for r in res.mappings().all()]


async def _build_chain(session: AsyncSession) -> list[AIProvider]:
    """Materialise the chain: rows -> AIProvider instances. Drops rows
    that fail to construct (bad key, unknown kind)."""
    rows = await _list_enabled(session)
    chain: list[AIProvider] = []
    for row in rows:
        provider = from_config(row)
        if provider is not None:
            chain.append(provider)
    return chain


# ── Structured (JSON-schema) call ────────────────────────────────────


async def call_structured(
    session: AsyncSession,
    *,
    system: str,
    user: str,
    schema_name: str,
    schema: dict[str, Any],
) -> dict[str, Any] | None:
    """Walk enabled providers in priority order; return the first
    successful structured response, or None if every provider fails."""
    chain = await _build_chain(session)
    if not chain:
        log.info("ai_providers.no_enabled_providers")
        return None

    for provider in chain:
        result = await provider.call_structured(
            system=system, user=user, schema_name=schema_name, schema=schema,
        )
        if result is not None:
            log.info(
                "ai_providers.served",
                extra={"kind": provider.kind, "model": provider.model},
            )
            return result
        log.info(
            "ai_providers.fallback",
            extra={"kind": provider.kind, "model": provider.model},
        )
    return None


# ── Streaming chat ───────────────────────────────────────────────────


async def stream_chat(
    session: AsyncSession,
    *,
    system: str,
    messages: list[dict[str, str]],
    max_tokens: int | None = None,
) -> AsyncIterator[str]:
    """Token-stream a chat completion through the provider chain.
    First provider that yields anything wins; chain stops there."""
    chain = await _build_chain(session)
    if not chain:
        log.info("ai_providers.stream.no_enabled_providers")
        return

    for provider in chain:
        any_yielded = False
        async for delta in provider.stream_chat(
            system=system, messages=messages, max_tokens=max_tokens,
        ):
            any_yielded = True
            yield delta
        if any_yielded:
            log.info(
                "ai_providers.stream.served",
                extra={"kind": provider.kind, "model": provider.model},
            )
            return
        log.info(
            "ai_providers.stream.fallback",
            extra={"kind": provider.kind, "model": provider.model},
        )


# ── Health probe (admin Test button) ─────────────────────────────────


async def test_provider(row: dict[str, Any]) -> tuple[bool, str]:
    """Quick reachability + key/model probe. Used by the admin UI's
    Test button; doesn't require a DB session because the row is
    already known."""
    provider = from_config(row)
    if provider is None:
        return False, f"Unknown provider kind: {row.get('kind')!r}"
    status = await provider.health_check()
    suffix = f" ({status.latency_ms} ms)" if status.latency_ms else ""
    return status.ok, f"{status.message}{suffix}"
