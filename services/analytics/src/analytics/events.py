"""JetStream durable subscriber for upstream quiz events.

Sprint 3 promotion of Sprint 2's core-NATS pub/sub:
- Subject: `quiz.session.completed` (Quiz publishes via QUIZ_EVENTS stream).
- Durable consumer: `analytics-quiz-completed`. Survives Analytics restarts;
  replays any messages published while the service was down.
- AckPolicy = explicit. Handler acks on success, term-on-bad-payload (so the
  message doesn't loop forever), and nak-with-delay on infra failures (DB
  unavailable etc) so JetStream retries with backoff.

Idempotency is unchanged from Sprint 2: a sessionId already present in
`analytics_schema.processed_sessions` short-circuits — required because
JetStream is at-least-once, not exactly-once.
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

from analytics.config import settings
from analytics.db import sessionmaker
from analytics.processing import process_session

log = logging.getLogger(__name__)

STREAM = "QUIZ_EVENTS"
SUBJECT = "quiz.session.completed"
DURABLE = "analytics-quiz-completed"

_client: NatsClient | None = None
_js: JetStreamContext | None = None
_subscription: Any | None = None


async def connect() -> None:
    """Connect, ensure the QUIZ_EVENTS stream exists (idempotent), and
    subscribe to a durable consumer. Both Quiz and Analytics try to
    `add_stream`; whoever wins is fine — `BadRequestError` for "stream
    name already in use" is swallowed."""
    global _client, _js, _subscription
    try:
        _client = await nats.connect(settings.nats_url, connect_timeout=2)
    except Exception as err:
        log.warning("analytics could not connect to NATS (%s); subscriber disabled", err)
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
        # Stream already exists — fine, that's the publisher's pre-create.
        pass
    except Exception as err:
        log.warning("analytics jetstream add_stream failed: %s", err)
        return

    try:
        _subscription = await _js.subscribe(
            subject=SUBJECT,
            durable=DURABLE,
            cb=_on_session_completed,
            manual_ack=True,
            config=ConsumerConfig(
                ack_policy=AckPolicy.EXPLICIT,
                deliver_policy=DeliverPolicy.ALL,
                ack_wait=120,
                max_deliver=5,
            ),
        )
        log.info(
            "analytics subscribed to JetStream %s subject=%s durable=%s", STREAM, SUBJECT, DURABLE
        )
    except Exception as err:
        # "consumer is already bound" — happens under pytest when a test ASGI
        # client spins up while the live container holds the durable. Real
        # service processes (one per durable) never hit this.
        log.warning("analytics subscribe skipped: %s", err)
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


def _derive_minutes(started_at: object, submitted_at: object) -> int:
    """Compute session duration in minutes from ISO timestamps. Falls back to
    0 when either is missing or unparseable so the upsert just doesn't bump
    minutes — counters stay correct downstream."""
    from datetime import datetime
    if not isinstance(started_at, str) or not isinstance(submitted_at, str):
        return 0
    try:
        # Quiz emits Z-suffixed RFC3339; Python 3.11 datetime.fromisoformat
        # handles "+00:00" but we replace 'Z' for safety.
        s = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
        t = datetime.fromisoformat(submitted_at.replace("Z", "+00:00"))
    except ValueError:
        return 0
    delta = t - s
    secs = max(0, int(delta.total_seconds()))
    # Cap at 90 min (matches Quiz session TTL) so a stuck-tab session doesn't
    # log 14 hours of phantom study.
    return min(90, secs // 60)


async def _on_session_completed(msg: Msg) -> None:
    """Re-derive mastery + readiness from a Quiz submit. JetStream-aware:
    explicit ack/nak/term so retries do the right thing."""
    try:
        payload = json.loads(msg.data.decode("utf-8"))
    except Exception as err:
        log.warning("analytics bad quiz.session.completed payload: %s", err)
        with contextlib.suppress(Exception):
            await msg.term()  # poison-pill — never redeliver malformed
        return

    session_id = payload.get("session_id")
    user_id = payload.get("user_id")
    topic_id = payload.get("topic_id")
    score = payload.get("score")
    if not (session_id and user_id and topic_id and score is not None):
        log.warning("analytics quiz.session.completed missing fields: %s", payload)
        with contextlib.suppress(Exception):
            await msg.term()
        return

    # Quiz publishes served_count, started_at, submitted_at — derive minutes.
    served_count = int(payload.get("served_count", 0) or 0)
    minutes = _derive_minutes(payload.get("started_at"), payload.get("submitted_at"))

    try:
        async with sessionmaker()() as session:
            applied = await process_session(
                session,
                session_id=session_id,
                user_id=user_id,
                topic_id=topic_id,
                score=float(score),
                questions_answered=served_count,
                study_minutes=minutes,
            )
            await session.commit()
        with contextlib.suppress(Exception):
            await msg.ack()
        if applied:
            log.info(
                "analytics processed quiz.session.completed user=%s topic=%s",
                user_id,
                topic_id,
            )
        else:
            log.info("analytics session %s already processed; skipping", session_id)
    except Exception as err:
        log.warning("analytics quiz.session.completed handler failed for %s: %s", session_id, err)
        with contextlib.suppress(Exception):
            # Infra failure (DB down, etc) — nak with delay so JetStream
            # retries with backoff. MaxDeliver=5 caps the retry storm.
            await msg.nak(delay=5)
