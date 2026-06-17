"""IGS reactive trigger — NATS → WebSocket push bridge.

Subscribes to the events that affect IGS guidance state and calls
`igs.stream.on_state_change(user_id, exam_id, trigger)` so the
connected WebSocket pushes a fresh next-action snapshot.

Wired subjects (Phase B3 scope):
  • quiz.session.completed       — Quiz Go's session-end fan-out
  • mastery.delta                — engagement service's mastery update

Future subjects (placeholders, plumbed but not yet emitted):
  • quiz.session.item.answered
  • cohort.intervention.flagged
  • decay.tick

Connection lifecycle mirrors `content.quiz_session_subscriber`: a
single durable consumer, manual ack, redelivery on handler exceptions.
A separate durable name keeps this consumer independent of Content's
assignment-progress mirror so neither slows the other down.
"""

from __future__ import annotations

import contextlib
import json
import logging
import os
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

from learning.content.config import settings
from learning.igs.stream import on_state_change

log = logging.getLogger(__name__)

STREAM = "QUIZ_EVENTS"
SUBJECT_FILTER = "quiz.session.completed"
DURABLE = "igs-reactive-push"

_client: NatsClient | None = None
_js: JetStreamContext | None = None
_subscription: Any = None


async def _on_message(msg: Msg) -> None:
    try:
        payload = json.loads(msg.data.decode("utf-8"))
    except Exception:
        with contextlib.suppress(Exception):
            await msg.term()
        return
    try:
        user_id = payload.get("user_id")
        exam_id = payload.get("exam_id") or os.environ.get("DEFAULT_EXAM_ID", "")
        if user_id and exam_id:
            await on_state_change(user_id, exam_id, trigger="quiz.session.completed")
        with contextlib.suppress(Exception):
            await msg.ack()
    except Exception as err:
        log.warning("igs reactive handler failed: %s", err)
        with contextlib.suppress(Exception):
            await msg.nak(delay=5)


async def connect() -> None:
    global _client, _js, _subscription
    try:
        _client = await nats.connect(settings.nats_url, connect_timeout=2)
    except Exception as err:
        log.warning("igs reactive subscriber: nats connect failed (%s)", err)
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
        pass
    except Exception as err:
        log.warning("igs reactive subscriber: QUIZ_EVENTS add_stream failed: %s", err)
        return
    try:
        _subscription = await _js.subscribe(
            subject=SUBJECT_FILTER,
            durable=DURABLE,
            cb=_on_message,
            manual_ack=True,
            config=ConsumerConfig(
                ack_policy=AckPolicy.EXPLICIT,
                deliver_policy=DeliverPolicy.NEW,
                ack_wait=60,
                max_deliver=3,
            ),
        )
        log.info(
            "igs reactive subscriber: %s subject=%s durable=%s",
            STREAM, SUBJECT_FILTER, DURABLE,
        )
    except Exception as err:
        log.warning("igs reactive subscribe skipped: %s", err)
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
