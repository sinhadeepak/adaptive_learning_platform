"""Stub provider — offline behaviour for tests + no-API-key dev stack.

Returns a minimal valid instance of the requested schema so AIGateway
calls succeed even when no real LLM is available. Used during
S38–S43 development before DPDP gating closes (ENG-OAQ-2). Real
authoring / evaluation calls land when OpenAI is wired in.

Behaviour:
- Returns the result of `schema.model_construct()` if Pydantic supports it,
  else `schema()` with empty args. Caller is responsible for handling
  schemas with required fields gracefully (or registering a stub
  handler via `register_stub_response`).
"""

from __future__ import annotations

import time
from typing import Any, Callable

from learning.ai_gateway.providers.base import Provider, ProviderError, ProviderResult


class StubProvider(Provider):
    name = "stub"

    def __init__(self) -> None:
        # Optional per-schema canned responses keyed by schema class
        # name. Tests register these via `register_stub_response`.
        self._canned: dict[str, dict[str, Any]] = {}

    def register_stub_response(self, schema_name: str, payload: dict[str, Any]) -> None:
        """Register a canned response for a schema. Used only by tests."""
        self._canned[schema_name] = payload

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
        started = time.monotonic()
        schema_name = getattr(schema, "__name__", str(schema))

        # If a canned response is registered, use it.
        if schema_name in self._canned:
            data = self._canned[schema_name]
        else:
            # Build a minimal instance via model_construct (skips
            # validation; callers asking for a stub already accept this).
            try:
                instance = schema.model_construct() if hasattr(schema, "model_construct") else schema()
                data = instance.model_dump() if hasattr(instance, "model_dump") else {}
            except Exception as e:
                raise ProviderError(
                    self.name,
                    f"stub cannot construct {schema_name}: {e}; "
                    f"register a canned response via register_stub_response()",
                    retryable=False,
                ) from e

        latency_ms = max(1, int((time.monotonic() - started) * 1000))
        return ProviderResult(
            data=data,
            tokens_in=len(str(user)),
            tokens_out=len(str(data)),
            latency_ms=latency_ms,
            model=model,
        )
