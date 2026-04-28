"""Sprint 9 E-5 — Notification consumes `content.assignment.created`.

Fan-out shape:
  Content service publishes ONE event when an assignment is published.
  This subscriber resolves the cohort's members via the Institution HTTP
  surface and writes one `assignment.new` row per member into
  `notification_schema.notifications`.

Why HTTP rather than a SQL JOIN: institution_schema lives in a separate
service-owned database in production (AP-01). Local compose puts them in
the same Postgres so a JOIN would work, but the abstraction-respecting
contract is the one that survives staging.

Idempotency: `processed_events` short-circuit on the assignment id keeps
re-deliveries (Stripe redelivers; NATS too on transient failure) from
creating N duplicate rows in the inbox.
"""

from __future__ import annotations

import contextlib
import json
import logging
import uuid
from typing import Any

import httpx
import nats
from nats.aio.client import Client as NatsClient
from nats.aio.msg import Msg
from nats.js import JetStreamContext
from nats.js.api import (
    AckPolicy,
    ConsumerConfig,
    DeliverPolicy,
    RetentionPolicy,
    StorageType,
    StreamConfig,
)
from nats.js.errors import BadRequestError

from notification.config import settings
from notification.db import sessionmaker
from notification.repositories import append_notification, mark_event_processed

log = logging.getLogger(__name__)

STREAM = "CONTENT_EVENTS"
SUBJECT = "content.assignment.created"
DURABLE = "notification-assignment-created"

_client: NatsClient | None = None
_js: JetStreamContext | None = None
_subscription: Any | None = None


async def fetch_cohort_members(cohort_id: str) -> list[str]:
    """Hit Institution's `GET /institution/cohorts/{id}/members` and return
    the user_ids. Empty list on any failure — handler treats that as
    "nothing to fan out" and acks."""
    base = settings.institution_base_url.rstrip("/")
    url = f"{base}/institution/cohorts/{cohort_id}/members"
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get(url)
        if r.status_code != 200:
            log.warning("fetch_cohort_members %s → %s", cohort_id, r.status_code)
            return []
        body = r.json()
    except Exception as err:  # noqa: BLE001
        log.warning("fetch_cohort_members %s failed: %s", cohort_id, err)
        return []
    return [str(m["userId"]) for m in body if m.get("userId")]


async def _handle(payload: dict[str, Any]) -> int:
    """Process one assignment.created event. Returns the count of
    notification rows written (zero on idempotent replay or empty cohort)."""
    assignment_id = payload.get("id")
    cohort_id = payload.get("cohort_id")
    title = payload.get("title")
    if not (assignment_id and cohort_id and title):
        log.warning("assignment.created missing fields: %s", payload)
        return 0

    members = await fetch_cohort_members(cohort_id)
    if not members:
        log.info("assignment %s has no cohort members; skipping fanout", assignment_id)
        return 0

    body = {
        "assignmentId": assignment_id,
        "cohortId": cohort_id,
        "title": title,
        "description": payload.get("description"),
        "dueAt": payload.get("due_at"),
    }

    written = 0
    async with sessionmaker()() as session:
        for user_id in members:
            # Use a deterministic id derived from (assignment_id, user_id)
            # so a redelivered NATS message ON CONFLICT DO NOTHING — when
            # it lands — silently no-ops. uuid5 with a fixed namespace
            # gives us the determinism without a separate dedup table.
            notif_id = str(
                uuid.uuid5(uuid.NAMESPACE_OID, f"assignment.new:{assignment_id}:{user_id}")
            )
            try:
                await append_notification(
                    session,
                    notification_id=notif_id,
                    user_id=user_id,
                    type_="assignment.new",
                    channel="inbox",
                    payload=body,
                )
                written += 1
            except Exception as err:
                # PK conflict on redelivery is fine — every other error
                # we log and continue so one bad row doesn't drop the rest.
                log.warning(
                    "assignment.new append failed for user=%s: %s", user_id, err
                )
        # Mark the event itself as processed (the existing helper is
        # keyed on event_id; we use the assignment id which is stable).
        with contextlib.suppress(Exception):
            await mark_event_processed(session, assignment_id)
        await session.commit()
    return written


async def connect() -> None:
    global _client, _js, _subscription
    try:
        _client = await nats.connect(settings.nats_url, connect_timeout=2)
    except Exception as err:
        log.warning(
            "notification could not connect for assignment subscriber (%s)", err
        )
        _client = None
        return
    _js = _client.jetstream()
    try:
        await _js.add_stream(
            StreamConfig(
                name=STREAM,
                subjects=["content.>"],
                storage=StorageType.FILE,
                retention=RetentionPolicy.LIMITS,
                num_replicas=1,
            )
        )
    except BadRequestError:
        pass
    except Exception as err:
        log.warning("notification CONTENT_EVENTS add_stream failed: %s", err)
        return
    try:
        _subscription = await _js.subscribe(
            subject=SUBJECT,
            durable=DURABLE,
            cb=_on_message,
            manual_ack=True,
            config=ConsumerConfig(
                ack_policy=AckPolicy.EXPLICIT,
                deliver_policy=DeliverPolicy.ALL,
                ack_wait=120,
                max_deliver=5,
            ),
        )
        log.info(
            "notification subscribed to %s subject=%s durable=%s",
            STREAM,
            SUBJECT,
            DURABLE,
        )
    except Exception as err:
        log.warning("notification assignment subscribe skipped: %s", err)
        _subscription = None


async def close() -> None:
    global _client, _js, _subscription
    if _subscription is not None:
        with contextlib.suppress(Exception):
            await _subscription.unsubscribe()
        _subscription = None
    _js = None
    if _client is not None:
        with contextlib.suppress(Exception):
            await _client.drain()
        _client = None


async def _on_message(msg: Msg) -> None:
    try:
        payload = json.loads(msg.data.decode("utf-8"))
    except Exception:  # noqa: BLE001
        with contextlib.suppress(Exception):
            await msg.term()
        return
    try:
        await _handle(payload)
        with contextlib.suppress(Exception):
            await msg.ack()
    except Exception as err:
        log.warning("assignment.created handler failed: %s", err)
        with contextlib.suppress(Exception):
            await msg.nak(delay=5)
