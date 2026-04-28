"""Sprint 12 S12-D — quiz.session.completed → assignment_progress mirror.

Pipeline:
  Student opens an assignment → Quiz `POST /sessions/from-assignment`
  creates a session with `mode=ASSIGNMENT` and stores `assignment_id`.
  Student answers + submits → Quiz publishes `quiz.session.completed`
  with both fields. This durable consumer picks it up, filters on
  `mode == ASSIGNMENT`, and calls `upsert_progress` so the educator's
  leaderboard sees the row.

Why a separate subscriber rather than co-locating in the existing
content.events publisher: that module is publish-only (CONTENT_EVENTS).
Adding a consumer there bloats it; isolation makes the connection
lifecycle explicit and the durable name unambiguous.

Idempotency: `assignment_progress` PK is (assignment_id, user_id) with
last-write-wins on re-attempt. NATS redelivery → same row gets the same
score; the educator's leaderboard remains stable.
"""

from __future__ import annotations

import contextlib
import json
import logging
from typing import Any

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

from learning.content.assignments_repo import upsert_progress
from learning.content.config import settings
from learning.content.db import sessionmaker

log = logging.getLogger(__name__)

STREAM = "QUIZ_EVENTS"
SUBJECT = "quiz.session.completed"
DURABLE = "content-assignment-progress"

_client: NatsClient | None = None
_js: JetStreamContext | None = None
_subscription: Any | None = None


async def _handle(payload: dict[str, Any]) -> bool:
    """Process one quiz.session.completed event. Returns True when a
    progress row was upserted, False when the event was ignored
    (non-assignment mode, missing fields, etc.)."""
    if (payload.get("mode") or "").upper() != "ASSIGNMENT":
        # Not our concern — Analytics has its own consumer for the same
        # stream (mastery + readiness + streak).
        return False
    assignment_id = payload.get("assignment_id")
    user_id = payload.get("user_id")
    if not (assignment_id and user_id):
        log.warning(
            "quiz.session.completed ASSIGNMENT mode missing fields: %s", payload
        )
        return False
    served = int(payload.get("served_count") or 0)
    correct = int(payload.get("correct_count") or 0)
    if served <= 0:
        log.warning(
            "quiz.session.completed ASSIGNMENT %s has served_count=0; skipping",
            assignment_id,
        )
        return False

    async with sessionmaker()() as session:
        await upsert_progress(
            session,
            assignment_id=assignment_id,
            user_id=user_id,
            correct_count=correct,
            total_count=served,
        )
        await session.commit()
    log.info(
        "content mirrored quiz.session.completed → assignment_progress "
        "assignment=%s user=%s score=%d/%d",
        assignment_id,
        user_id,
        correct,
        served,
    )
    return True


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
        log.warning("content quiz.session.completed handler failed: %s", err)
        with contextlib.suppress(Exception):
            await msg.nak(delay=5)


async def connect() -> None:
    global _client, _js, _subscription
    try:
        _client = await nats.connect(settings.nats_url, connect_timeout=2)
    except Exception as err:
        log.warning("content could not connect for quiz subscriber (%s)", err)
        _client = None
        return
    _js = _client.jetstream()
    try:
        await _js.add_stream(
            StreamConfig(
                name=STREAM,
                subjects=["quiz.>"],
                storage=StorageType.FILE,
                retention=RetentionPolicy.LIMITS,
                num_replicas=1,
            )
        )
    except BadRequestError:
        # Already exists — Quiz pre-creates this stream in production.
        pass
    except Exception as err:
        log.warning("content QUIZ_EVENTS add_stream failed: %s", err)
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
            "content subscribed to %s subject=%s durable=%s",
            STREAM,
            SUBJECT,
            DURABLE,
        )
    except Exception as err:
        log.warning("content quiz.session subscribe skipped: %s", err)
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
