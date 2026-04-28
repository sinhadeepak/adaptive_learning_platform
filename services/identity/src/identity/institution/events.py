"""NATS publisher for flag mutations — FS-03 / ADR-0001.

Singleton connection initialised at app startup. Publish failures are logged
but do not block the HTTP response (the audit row is the durable record).
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

import nats
from nats.aio.client import Client as NatsClient

from identity.institution.config import settings

log = logging.getLogger(__name__)

_client: NatsClient | None = None


async def connect() -> None:
    global _client
    try:
        _client = await nats.connect(settings.nats_url, connect_timeout=2)
        log.info("institution connected to NATS at %s", settings.nats_url)
    except Exception as err:  # noqa: BLE001 — NATS unavailable must not crash startup
        log.warning("institution could not connect to NATS (%s); flag.changed events disabled", err)
        _client = None


async def close() -> None:
    global _client
    if _client is not None:
        try:
            await _client.drain()
        finally:
            _client = None


async def publish_flag_changed(
    *,
    flag_name: str,
    scope: str,
    tenant_id: str | None,
    old_value: bool | None,
    new_value: bool,
    actor_user_id: str | None,
    rationale: str | None,
) -> None:
    if _client is None:
        return  # Best-effort; audit row is durable.
    payload: dict[str, Any] = {
        "flag_name": flag_name,
        "scope": scope,
        "tenant_id": tenant_id,
        "old_value": old_value,
        "new_value": new_value,
        "actor": actor_user_id,
        "rationale": rationale,
        "ts": datetime.now(tz=timezone.utc).isoformat(),
    }
    try:
        await _client.publish("flag.changed", json.dumps(payload).encode("utf-8"))
    except Exception as err:  # noqa: BLE001
        log.warning("flag.changed publish failed for %s: %s", flag_name, err)
