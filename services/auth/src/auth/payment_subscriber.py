"""Sprint 8 R-2 — subscribes to `payment.subscription.changed` and flips
`auth_schema.users.premium_until`.

Wire model: simple core NATS subscribe (no JetStream durable consumer).
Auth's only job here is to keep its row mirror fresh; if a message is
missed, /payment/internal/users/{id}/premium remains the source of truth
and Auth's next JWT issuance can fall back to it (future task — for now
the loop runs uninterrupted in compose).

Payload shape (from payment/routes.py::_publish_subscription_changed):
  {
    "user_id": str,
    "state": "ACTIVE" | "PAST_DUE" | "CANCELED" | "REACTIVATED" | "INACTIVE" | ...,
    "period_end": "2026-05-28T..." | null
  }

Premium-until contract:
  - state in {ACTIVE, REACTIVATED, PAST_DUE} → premium_until = period_end
    (PAST_DUE keeps premium during Stripe's retry window)
  - state == CANCELED with future period_end → premium_until = period_end
    (paid through end of cycle)
  - state == CANCELED with past period_end → premium_until = NULL
  - state == INACTIVE → premium_until = NULL
  - unknown state → ignore (forward-compat with new states from Payment)

Best-effort: connection failure logs WARN and disables the subscriber —
the rest of Auth keeps working. The /payment/internal/* HTTP fallback
exists for environments where NATS isn't healthy.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any

import nats
from nats.aio.client import Client as NatsClient

from auth.config import settings
from auth.db import sessionmaker
from auth.repositories import UserRepo

log = logging.getLogger(__name__)

_client: NatsClient | None = None
_sub_task: asyncio.Task | None = None


def derive_premium_until(state: str, period_end: datetime | None) -> datetime | None:
    """Pure-logic mapping — extracted so unit tests can pin the contract
    without standing up NATS or a DB connection."""
    now = datetime.now(tz=timezone.utc)
    if state in {"ACTIVE", "REACTIVATED", "PAST_DUE"}:
        return period_end  # could be None on partial Stripe payloads — that's fine
    if state == "CANCELED":
        if period_end is not None and period_end > now:
            return period_end
        return None
    # INACTIVE or anything else we don't yet understand → clear premium.
    if state == "INACTIVE":
        return None
    return None


async def _handle(msg: Any) -> None:
    try:
        payload: dict[str, Any] = json.loads(msg.data.decode("utf-8"))
    except Exception:  # noqa: BLE001
        log.warning("payment.subscription.changed: bad JSON, skipping")
        return
    user_id = payload.get("user_id")
    state = (payload.get("state") or "").upper()
    pe_iso = payload.get("period_end")
    if not user_id or not state:
        log.warning("payment.subscription.changed: missing user_id/state — %s", payload)
        return
    period_end: datetime | None = None
    if pe_iso:
        try:
            period_end = datetime.fromisoformat(pe_iso)
            if period_end.tzinfo is None:
                period_end = period_end.replace(tzinfo=timezone.utc)
        except ValueError:
            log.warning("payment.subscription.changed: bad period_end %r", pe_iso)

    new_pu = derive_premium_until(state, period_end)
    sm = sessionmaker()
    async with sm() as session:
        await UserRepo(session).set_premium_until(user_id, new_pu)
        await session.commit()
    log.info(
        "payment.subscription.changed: user=%s state=%s premium_until=%s",
        user_id,
        state,
        new_pu.isoformat() if new_pu else None,
    )


async def connect() -> None:
    global _client, _sub_task
    try:
        _client = await nats.connect(settings.nats_url, connect_timeout=2)
        sub = await _client.subscribe("payment.subscription.changed", cb=_handle)
        # Hold a reference so Python doesn't GC it.
        _sub_task = sub  # type: ignore[assignment]
        log.info("auth subscribed to payment.subscription.changed at %s", settings.nats_url)
    except Exception as err:  # noqa: BLE001
        log.warning("auth could not subscribe to payment events (%s)", err)
        _client = None
        _sub_task = None


async def close() -> None:
    global _client
    if _client is not None:
        try:
            await _client.drain()
        finally:
            _client = None
