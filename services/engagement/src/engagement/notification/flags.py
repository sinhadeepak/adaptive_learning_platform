"""Feature-flag client for Notification. GAP-16 wire-up #5.

Three channel kill-switches — when OFF the matching dispatch path returns 503 with
a structured `code: channel_disabled` response so callers can either retry against
another channel or surface a degraded-mode banner.
"""

from __future__ import annotations

import logging

from alp_flags import FlagClient, structlog_decision_hook

from engagement.notification.config import settings

log = logging.getLogger(__name__)

FALLBACKS: dict[str, bool] = {
    "push_channel_enabled": True,
    "sms_channel_enabled": True,
    "email_channel_enabled": True,
}

CHANNEL_FLAG: dict[str, str] = {
    "push": "push_channel_enabled",
    "sms": "sms_channel_enabled",
    "email": "email_channel_enabled",
}

_client: FlagClient | None = None


def client() -> FlagClient:
    if _client is None:
        raise RuntimeError("FlagClient not initialised — connect_flags() must run in app lifespan")
    return _client


async def connect_flags() -> None:
    global _client
    _client = FlagClient(
        on_decision=structlog_decision_hook("notification"),
        institution_url=settings.institution_base_url,
        nats_url=settings.nats_url,
        fallbacks=FALLBACKS,
        cache_ttl=30.0,
    )
    await _client.connect()
    log.info("notification flag client connected")


async def close_flags() -> None:
    global _client
    if _client is not None:
        await _client.close()
        _client = None


async def channel_enabled(channel: str, tenant_id: str | None = None) -> bool:
    flag = CHANNEL_FLAG.get(channel)
    if flag is None:
        return False
    try:
        return await client().evaluate(flag, tenant_id=tenant_id)
    except Exception:
        return FALLBACKS[flag]
