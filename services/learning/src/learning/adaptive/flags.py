"""Feature-flag client for Adaptive Engine. GAP-16 wire-up #4.

Consumes:
- `irt_model_enabled` (fallback FALSE) — when ON, the 3PL IRT cold-start path runs;
  when OFF, fall back to binary-search cold-start (Sprint 1 default; SPIKE-01 informs Sprint 2).
"""

from __future__ import annotations

import logging

from alp_flags import FlagClient, structlog_decision_hook

from learning.adaptive.config import settings

log = logging.getLogger(__name__)

FALLBACKS: dict[str, bool] = {
    "irt_model_enabled": False,
}

_client: FlagClient | None = None


def client() -> FlagClient:
    if _client is None:
        raise RuntimeError("FlagClient not initialised — connect_flags() must run in app lifespan")
    return _client


async def connect_flags() -> None:
    global _client
    _client = FlagClient(
        on_decision=structlog_decision_hook("adaptive-engine"),
        institution_url=settings.institution_base_url,
        nats_url=settings.nats_url,
        fallbacks=FALLBACKS,
        cache_ttl=30.0,
    )
    await _client.connect()
    log.info("adaptive_engine flag client connected")


async def close_flags() -> None:
    global _client
    if _client is not None:
        await _client.close()
        _client = None


async def use_irt(tenant_id: str | None = None) -> bool:
    try:
        return await client().evaluate("irt_model_enabled", tenant_id=tenant_id)
    except Exception:  # noqa: BLE001
        return False
