"""Provider-agnostic protocol + factory.

Every provider implements the same surface:

  - call_structured(system, user, schema_name, schema) -> dict | None
  - stream_chat(system, messages, max_tokens) -> AsyncIterator[str]
  - health_check() -> HealthStatus

Failures are signalled by returning None (structured) / yielding
nothing (streaming). The orchestrator never raises out of these
methods so one provider going down can't take down the chain.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

log = logging.getLogger(__name__)


class ProviderError(Exception):
    """Raised only by health_check on configuration errors."""


@dataclass
class HealthStatus:
    ok: bool
    message: str
    latency_ms: int | None = None


class AIProvider(ABC):
    """Common provider interface.

    Subclasses store their own config (api_key, base_url, model) and
    bound timeouts. Construct via `from_config(row)` so callers don't
    have to know which class to instantiate.
    """

    kind: str = ""           # "ollama" | "openai" | "anthropic" | …
    display_name: str = ""

    def __init__(self, *, model: str, base_url: str | None = None,
                 api_key: str = "", timeout_s: float = 120.0) -> None:
        self.model = model
        self.base_url = base_url
        self.api_key = api_key
        self.timeout_s = timeout_s

    # ── Required surface ─────────────────────────────────────────

    @abstractmethod
    async def call_structured(
        self,
        *,
        system: str,
        user: str,
        schema_name: str,
        schema: dict[str, Any],
    ) -> dict[str, Any] | None:
        """One-shot structured-output call. Return parsed JSON or None on failure."""

    @abstractmethod
    def stream_chat(
        self,
        *,
        system: str,
        messages: list[dict[str, str]],
        max_tokens: int | None = None,
    ) -> AsyncIterator[str]:
        """Yield content deltas. Empty generator on failure."""

    @abstractmethod
    async def health_check(self) -> HealthStatus:
        """Reachability + key/model validity probe for the admin Test button."""

    # ── Convenience for logging / debugging ──────────────────────

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__} model={self.model!r} base_url={self.base_url!r}>"


# ── Factory ──────────────────────────────────────────────────────────


def from_config(row: dict[str, Any]) -> AIProvider | None:
    """Build the right provider instance from an ai_provider_config row.

    `row` shape (from `_list_enabled` in fallback.py):
      {
        "id": uuid, "kind": "ollama"|"openai"|"anthropic",
        "display_name": str, "priority": int,
        "base_url": str | None, "model": str,
        "api_key_encrypted": bytes | None,
      }

    Returns None if the kind is unknown (warned, never raised).
    """
    # Lazy imports keep the base module small and SDK-agnostic.
    from learning.ai_providers.crypto import decrypt_key

    kind = (row.get("kind") or "").lower()
    model = row.get("model") or ""
    base_url = row.get("base_url") or None
    api_key = ""
    enc = row.get("api_key_encrypted")
    if enc:
        try:
            api_key = decrypt_key(enc)
        except Exception:  # noqa: BLE001
            log.warning("provider.from_config.bad_key", extra={"kind": kind})
            return None

    if kind == "ollama":
        from learning.ai_providers.providers.ollama import OllamaProvider
        return OllamaProvider(
            model=model,
            base_url=base_url or "http://host.docker.internal:11434",
        )
    if kind == "openai":
        from learning.ai_providers.providers.openai import OpenAIProvider
        return OpenAIProvider(model=model, api_key=api_key, base_url=base_url)
    if kind == "anthropic":
        from learning.ai_providers.providers.anthropic import AnthropicProvider
        return AnthropicProvider(model=model, api_key=api_key, base_url=base_url)
    if kind == "claude_code":
        from learning.ai_providers.providers.claude_code import ClaudeCodeProvider
        return ClaudeCodeProvider(model=model)

    log.warning("provider.from_config.unknown_kind", extra={"kind": kind})
    return None
