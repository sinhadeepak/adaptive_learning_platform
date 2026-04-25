"""Feature-flag client for Payment. GAP-16 wire-up #6.

`checkout_enabled` is the master switch — until Sprint 3, /checkout/start returns 503
so the client renders the Pass-3 wireframe's "checkout coming soon" state. Flipping the
flag in Sprint 3 launch turns the real Stripe + IAP path on for paying users.
"""

from __future__ import annotations

import logging

from alp_flags import FlagClient, structlog_decision_hook

from payment.config import settings

log = logging.getLogger(__name__)

FALLBACKS: dict[str, bool] = {
    "checkout_enabled": False,
}

_client: FlagClient | None = None


def client() -> FlagClient:
    if _client is None:
        raise RuntimeError("FlagClient not initialised — connect_flags() must run in app lifespan")
    return _client


async def connect_flags() -> None:
    global _client
    _client = FlagClient(
        on_decision=structlog_decision_hook("payment"),
        institution_url=settings.institution_base_url,
        nats_url=settings.nats_url,
        fallbacks=FALLBACKS,
        cache_ttl=30.0,
    )
    await _client.connect()
    log.info("payment flag client connected")


async def close_flags() -> None:
    global _client
    if _client is not None:
        await _client.close()
        _client = None


async def checkout_enabled(tenant_id: str | None = None) -> bool:
    try:
        return await client().evaluate("checkout_enabled", tenant_id=tenant_id)
    except Exception:  # noqa: BLE001
        return False
