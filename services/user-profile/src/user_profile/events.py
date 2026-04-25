"""NATS subscriber for upstream domain events.

Currently consumes:
- `user.created` (from Auth) — upserts a row in `profile_schema.profiles` with the
  real first/last name. Without this, Profile lazily creates rows on first
  authenticated request with placeholder names ("User", "Student") taken from the
  JWT, which has no first/last claims.

The handler is idempotent — re-receiving the same event is a no-op via UPSERT.
"""

from __future__ import annotations

import json
import logging
from typing import Any

import nats
from nats.aio.client import Client as NatsClient
from nats.aio.msg import Msg
from sqlalchemy import text

from user_profile.config import settings
from user_profile.db import sessionmaker

log = logging.getLogger(__name__)

_client: NatsClient | None = None
_subscription: Any | None = None


async def connect() -> None:
    global _client, _subscription
    try:
        _client = await nats.connect(settings.nats_url, connect_timeout=2)
    except Exception as err:  # noqa: BLE001
        log.warning("user_profile could not connect to NATS (%s); user.created consumer disabled", err)
        _client = None
        return
    _subscription = await _client.subscribe("user.created", cb=_on_user_created)
    log.info("user_profile subscribed to user.created at %s", settings.nats_url)


async def close() -> None:
    global _client, _subscription
    if _subscription is not None:
        try:
            await _subscription.drain()
        except Exception:  # noqa: BLE001
            pass
        _subscription = None
    if _client is not None:
        try:
            await _client.drain()
        except Exception:  # noqa: BLE001
            pass
        _client = None


async def _on_user_created(msg: Msg) -> None:
    try:
        payload = json.loads(msg.data.decode("utf-8"))
    except Exception as err:  # noqa: BLE001
        log.warning("user_profile bad user.created payload: %s", err)
        return

    user_id = payload.get("user_id")
    if not user_id:
        return

    first = payload.get("first_name") or ""
    last = payload.get("last_name") or ""
    email = payload.get("email") or None

    try:
        async with sessionmaker()() as session:
            await session.execute(
                text(
                    "INSERT INTO profile_schema.profiles (user_id, first_name, last_name, email) "
                    "VALUES (:uid, :fn, :ln, :em) "
                    "ON CONFLICT (user_id) DO UPDATE SET "
                    "first_name = EXCLUDED.first_name, "
                    "last_name = EXCLUDED.last_name, "
                    "email = COALESCE(EXCLUDED.email, profile_schema.profiles.email), "
                    "updated_at = NOW()"
                ),
                {"uid": user_id, "fn": first or "User", "ln": last or "Student", "em": email},
            )
            await session.commit()
        log.info("user_profile.user_created processed user_id=%s", user_id)
    except Exception as err:  # noqa: BLE001 — handler must never crash the subscriber
        log.warning("user_profile.user_created handler failed for %s: %s", user_id, err)
