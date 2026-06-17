"""Provider clients for the AI Gateway.

Per user direction 2026-04-30: OpenAI is the sole real LLM provider in
v1. Stub provider supplies offline behaviour for tests + dev stack
when no API key is configured.
"""

from __future__ import annotations

from learning.ai_gateway.providers.base import (
    EmbeddingResult,
    Provider,
    ProviderError,
    ProviderResult,
)
from learning.ai_gateway.providers.openai_provider import OpenAIProvider
from learning.ai_gateway.providers.stub_provider import StubProvider

__all__ = [
    "Provider",
    "ProviderError",
    "ProviderResult",
    "EmbeddingResult",
    "OpenAIProvider",
    "StubProvider",
]
