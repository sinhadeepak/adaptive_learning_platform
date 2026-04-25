"""Feature-flag client for Catalog. Pattern mirrors services/auth/src/auth/flags.py.

GAP-16 — Catalog consumes:
- `premium_tier_enforcement` (fallback FALSE) — Sprint 1 closed beta: paywall OFF; topics
  marked PREMIUM render as FREE in API responses. Sprint 3 flips this ON via Institution
  per-tenant override at the right launch moment.
"""

from __future__ import annotations

import logging

from alp_flags import FlagClient

from catalog.config import settings

log = logging.getLogger(__name__)

FALLBACKS: dict[str, bool] = {
    "premium_tier_enforcement": False,
}

_client: FlagClient | None = None


def client() -> FlagClient:
    if _client is None:
        raise RuntimeError("FlagClient not initialised — connect_flags() must run in app lifespan")
    return _client


async def connect_flags() -> None:
    global _client
    _client = FlagClient(
        institution_url=settings.institution_base_url,
        nats_url=settings.nats_url,
        fallbacks=FALLBACKS,
        cache_ttl=30.0,
    )
    await _client.connect()
    log.info("catalog flag client connected")


async def close_flags() -> None:
    global _client
    if _client is not None:
        await _client.close()
        _client = None


async def premium_enforced(tenant_id: str | None = None) -> bool:
    """Single-source-of-truth helper. Returns the safe-default (False) on any failure."""
    try:
        return await client().evaluate("premium_tier_enforcement", tenant_id=tenant_id)
    except Exception:  # noqa: BLE001 — never block the catalog read path
        return False
