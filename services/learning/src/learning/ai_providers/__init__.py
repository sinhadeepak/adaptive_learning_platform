"""Multi-provider AI gateway with admin-managed priority chain.

`call_structured(...)` here mirrors the contract of
`learning.adaptive.llm.call_structured` (returns dict | None) but
walks the providers in `ai_provider_config` priority order: tries
the highest-priority enabled provider, on failure falls through to
the next. So admins can prefer Ollama (free, local), fall back to
OpenAI on outages, and cap with Anthropic.

API keys live encrypted-at-rest in `ai_provider_config.api_key_encrypted`
(Fernet AES + HMAC). Master key from env `ALP_AI_KEY_SECRET`; a
dev-only fallback prints a loud warning so local dev still works.

Public API:
  - encrypt_key(plaintext)  → Fernet token
  - decrypt_key(token)      → plaintext (raises on tamper)
  - mask_key(plaintext)     → "sk-…ab12" (last-4 only) for display
  - call_structured(...)    → dict | None, with fallback chain
  - test_provider(row)      → quick health probe for the admin UI
"""

from learning.ai_providers.crypto import decrypt_key, encrypt_key, mask_key
from learning.ai_providers.fallback import call_structured, stream_chat, test_provider

__all__ = [
    "call_structured",
    "decrypt_key",
    "encrypt_key",
    "mask_key",
    "stream_chat",
    "test_provider",
]
