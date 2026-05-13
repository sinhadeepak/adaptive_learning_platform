"""Pluggable AI provider classes.

Each concrete provider (Ollama, OpenAI, Anthropic, future Mistral/Gemini/…)
inherits `AIProvider` and implements `call_structured` + `stream_chat` +
`health_check`. The orchestrator in fallback.py iterates a list of
provider instances built from the admin-managed ai_provider_config rows
and tries them in priority order.

Adding a new provider is one new module + one entry in `from_config`.
"""

from learning.ai_providers.providers.base import (
    AIProvider,
    HealthStatus,
    ProviderError,
    from_config,
)

__all__ = ["AIProvider", "HealthStatus", "ProviderError", "from_config"]
