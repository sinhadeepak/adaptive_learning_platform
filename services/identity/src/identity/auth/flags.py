"""Feature-flag client for Auth — wires alp-flags into the service lifespan.

Hardcoded fallbacks per ADR-0001 + Sprint 1 backlog GAP-16. Each flag the service
consumes MUST be declared here so the SDK can fall back when Institution is down.
"""

from __future__ import annotations

import logging

from alp_flags import FlagClient, structlog_decision_hook

from identity.auth.config import settings

log = logging.getLogger(__name__)

# GAP-16 — flags consumed by Auth.
FALLBACKS: dict[str, bool] = {
    "email_channel_enabled": True,  # OTP + password-reset email sending
}

_client: FlagClient | None = None


def client() -> FlagClient:
    if _client is None:
        raise RuntimeError("FlagClient not initialised — connect_flags() must run in app lifespan")
    return _client


async def connect_flags() -> None:
    global _client
    _client = FlagClient(
        on_decision=structlog_decision_hook("auth"),
        institution_url=settings.institution_base_url,
        nats_url=settings.nats_url,
        fallbacks=FALLBACKS,
        cache_ttl=30.0,
    )
    await _client.connect()
    log.info("auth flag client connected")


async def close_flags() -> None:
    global _client
    if _client is not None:
        await _client.close()
        _client = None
