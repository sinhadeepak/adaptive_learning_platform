"""Provider Protocol + shared types."""

from __future__ import annotations

from typing import Any, Protocol


class ProviderError(Exception):
    """Raised on any provider failure (timeout, 5xx, schema mismatch).
    Caught by AIGateway.call() to trigger fallback."""

    def __init__(self, provider: str, message: str, retryable: bool = True):
        super().__init__(f"{provider}: {message}")
        self.provider = provider
        self.retryable = retryable


class ProviderResult:
    """Validated provider output + telemetry."""

    __slots__ = ("data", "tokens_in", "tokens_out", "latency_ms", "model")

    def __init__(
        self,
        data: dict[str, Any],
        *,
        tokens_in: int,
        tokens_out: int,
        latency_ms: int,
        model: str,
    ):
        self.data = data
        self.tokens_in = tokens_in
        self.tokens_out = tokens_out
        self.latency_ms = latency_ms
        self.model = model


class EmbeddingResult:
    """Embedding vectors + telemetry (parallels ProviderResult).

    Not part of the core `Provider` Protocol — embedding support is
    feature-detected by the Gateway via `hasattr(provider, "embed")` so
    text-only providers (e.g. the admin chain) stay conformant.
    """

    __slots__ = ("vectors", "tokens_in", "latency_ms", "model")

    def __init__(
        self,
        vectors: list[list[float]],
        *,
        tokens_in: int,
        latency_ms: int,
        model: str,
    ):
        self.vectors = vectors
        self.tokens_in = tokens_in
        self.latency_ms = latency_ms
        self.model = model


class Provider(Protocol):
    """Provider interface. Async — every real provider does network I/O.

    `complete()` MUST validate the model output against `schema` (a
    Pydantic model class) before returning. ProviderError on parse
    failure / schema mismatch / network timeout / 5xx.
    """

    name: str  # "openai" | "stub"

    async def complete(
        self,
        *,
        model: str,
        system: str,
        user: str | dict[str, Any],
        schema: type,  # Pydantic model class
        max_tokens: int,
        timeout_ms: int,
    ) -> ProviderResult: ...
