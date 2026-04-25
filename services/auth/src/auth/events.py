"""NATS publisher for Auth domain events.

Subjects:
- `user.created` — emitted on successful OTP verification (PENDING_VERIFICATION → ACTIVE
  transition). Payload `{user_id, email, first_name, last_name, role, ts}`.

Best-effort: connection failure logs WARN but never blocks the request — the DB row
is the durable record. Profile service eventually re-syncs via its own consumer; until
then it falls back to lazy-create with placeholder names.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

import nats
from nats.aio.client import Client as NatsClient

from auth.config import settings

log = logging.getLogger(__name__)

_client: NatsClient | None = None


async def connect() -> None:
    global _client
    try:
        _client = await nats.connect(settings.nats_url, connect_timeout=2)
        log.info("auth connected to NATS at %s", settings.nats_url)
    except Exception as err:  # noqa: BLE001
        log.warning("auth could not connect to NATS (%s); domain events disabled", err)
        _client = None


async def close() -> None:
    global _client
    if _client is not None:
        try:
            await _client.drain()
        finally:
            _client = None


async def publish_user_created(
    *,
    user_id: str,
    email: str,
    first_name: str,
    last_name: str,
    role: str,
) -> None:
    if _client is None:
        return  # best-effort; users can still verify on the durable DB row
    payload: dict[str, Any] = {
        "user_id": user_id,
        "email": email,
        "first_name": first_name,
        "last_name": last_name,
        "role": role,
        "ts": datetime.now(tz=timezone.utc).isoformat(),
    }
    try:
        await _client.publish("user.created", json.dumps(payload).encode("utf-8"))
    except Exception as err:  # noqa: BLE001
        log.warning("user.created publish failed for %s: %s", user_id, err)
