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
from analytics.mastery import readiness_from_mastery, update_ewa
from analytics.repositories import (
    get_mastery,
    is_session_processed,
    list_user_mastery,
    mark_session_processed,
    upsert_mastery,
    upsert_readiness,
)

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
    except Exception as err:  # noqa: BLE001
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
    except Exception as err:  # noqa: BLE001
        log.warning("analytics jetstream add_stream failed: %s", err)
        return

    _subscription = await _js.subscribe(
        subject=SUBJECT,
        durable=DURABLE,
        cb=_on_session_completed,
        manual_ack=True,
        config=ConsumerConfig(
            ack_policy=AckPolicy.EXPLICIT,
            deliver_policy=DeliverPolicy.ALL,
            ack_wait=120,  # seconds
            max_deliver=5,
        ),
    )
    log.info("analytics subscribed to JetStream %s subject=%s durable=%s", STREAM, SUBJECT, DURABLE)


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


async def _on_session_completed(msg: Msg) -> None:
    """Re-derive mastery + readiness from a Quiz submit. JetStream-aware:
    explicit ack/nak/term so retries do the right thing."""
    try:
        payload = json.loads(msg.data.decode("utf-8"))
    except Exception as err:  # noqa: BLE001
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

    try:
        async with sessionmaker()() as session:
            if await is_session_processed(session, session_id):
                log.info("analytics session %s already processed; skipping", session_id)
                with contextlib.suppress(Exception):
                    await msg.ack()
                return
            current = await get_mastery(session, user_id, topic_id)
            prev_ewa = current.ewa if current else 0.0
            prev_n = current.n if current else 0
            new_ewa = update_ewa(prev_ewa, prev_n, float(score))
            await upsert_mastery(
                session,
                user_id=user_id,
                topic_id=topic_id,
                new_ewa=new_ewa,
                new_n=prev_n + 1,
                last_session_id=session_id,
            )
            rows = await list_user_mastery(session, user_id)
            rows = [MasteryRowReplace(r, new_ewa) if r.topic_id == topic_id else r for r in rows]
            score_global = readiness_from_mastery(rows)
            await upsert_readiness(
                session,
                user_id=user_id,
                scope="GLOBAL",
                score=score_global,
                n_topics=len(rows),
            )
            await mark_session_processed(session, session_id)
            await session.commit()
        with contextlib.suppress(Exception):
            await msg.ack()
        log.info(
            "analytics processed quiz.session.completed user=%s topic=%s ewa=%.3f readiness=%.3f",
            user_id,
            topic_id,
            new_ewa,
            score_global,
        )
    except Exception as err:  # noqa: BLE001
        log.warning("analytics quiz.session.completed handler failed for %s: %s", session_id, err)
        with contextlib.suppress(Exception):
            # Infra failure (DB down, etc) — nak with delay so JetStream
            # retries with backoff. MaxDeliver=5 caps the retry storm.
            await msg.nak(delay=5)


def MasteryRowReplace(row, new_ewa: float):  # noqa: N802 — mimics dataclasses.replace
    """Return a copy of `row` with `ewa` swapped — avoids importing dataclasses just for this."""
    from analytics.mastery import MasteryRow

    return MasteryRow(user_id=row.user_id, topic_id=row.topic_id, ewa=new_ewa, n=row.n)
