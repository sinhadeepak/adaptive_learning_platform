"""JetStream durable subscriber for upstream quiz events.

Sprint 3 promotion of Sprint 2's core-NATS pub/sub:
- Subject: `quiz.session.completed` (Quiz publishes via QUIZ_EVENTS stream).
- Durable consumer: `notification-quiz-completed`. Survives Notification
  restarts; replays any messages published while the service was down.
- AckPolicy = explicit. Handler acks after the channel-flag gate decision
  (whether the inbox accepts or drops the message — both are terminal
  outcomes from JetStream's point of view).

The in-memory inbox stays in Sprint 3; promotes to a Postgres-backed table
with real SMTP/SendGrid sender in a follow-up PR.
"""

from __future__ import annotations

import contextlib
import json
import logging
import uuid
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

from notification.config import settings
from notification.db import sessionmaker
from notification.flags import channel_enabled
from notification.repositories import (
    append_notification,
    is_event_processed,
    mark_event_processed,
)

log = logging.getLogger(__name__)

STREAM = "QUIZ_EVENTS"
SUBJECT = "quiz.session.completed"
DURABLE = "notification-quiz-completed"

_client: NatsClient | None = None
_js: JetStreamContext | None = None
_subscription: Any | None = None


async def connect() -> None:
    """Connect, ensure QUIZ_EVENTS stream exists, subscribe to durable
    consumer. Stream creation is idempotent — both Quiz and the subscribers
    try, NATS returns BadRequestError on the second call which we swallow."""
    global _client, _js, _subscription
    try:
        _client = await nats.connect(settings.nats_url, connect_timeout=2)
    except Exception as err:  # noqa: BLE001
        log.warning("notification could not connect to NATS (%s); subscriber disabled", err)
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
    except Exception as err:  # noqa: BLE001
        log.warning("notification jetstream add_stream failed: %s", err)
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
        log.info("notification subscribed to JetStream %s subject=%s durable=%s", STREAM, SUBJECT, DURABLE)
    except Exception as err:  # noqa: BLE001
        # "consumer is already bound to a subscription" — happens when a test
        # ASGI client spins up while the live container holds the durable.
        # Swallow so test_health doesn't crash; live processes won't hit this.
        log.warning("notification subscribe skipped: %s", err)
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


async def _on_session_completed(msg: Msg) -> None:
    try:
        payload = json.loads(msg.data.decode("utf-8"))
    except Exception as err:  # noqa: BLE001
        log.warning("notification bad quiz.session.completed payload: %s", err)
        with contextlib.suppress(Exception):
            await msg.term()
        return

    user_id = payload.get("user_id")
    session_id = payload.get("session_id")
    score = payload.get("score")
    tenant_id = payload.get("tenant_id")
    if not (user_id and session_id and score is not None):
        log.warning("notification quiz.session.completed missing fields: %s", payload)
        with contextlib.suppress(Exception):
            await msg.term()
        return

    channel = "email"
    try:
        if not await channel_enabled(channel, tenant_id=tenant_id):
            log.info(
                "notification dropping quiz.completed for user=%s — %s channel disabled",
                user_id,
                channel,
            )
            # Flag-disabled is a terminal decision — also mark the event
            # processed so a future flag-flip doesn't replay backlog into
            # the inbox once the channel re-opens.
            try:
                async with sessionmaker()() as session:
                    await mark_event_processed(session, session_id)
                    await session.commit()
            except Exception as err:  # noqa: BLE001
                log.warning("notification mark_processed (drop path) failed: %s", err)
            with contextlib.suppress(Exception):
                await msg.ack()
            return

        async with sessionmaker()() as session:
            if await is_event_processed(session, session_id):
                log.info("notification event %s already processed; skipping", session_id)
                with contextlib.suppress(Exception):
                    await msg.ack()
                return
            await append_notification(
                session,
                notification_id=str(uuid.uuid4()),
                user_id=user_id,
                type_="quiz.completed",
                channel=channel,
                payload={"sessionId": session_id, "score": score, "topicId": payload.get("topic_id")},
            )
            await mark_event_processed(session, session_id)
            await session.commit()

        log.info(
            "notification enqueued quiz.completed user=%s session=%s score=%.2f",
            user_id,
            session_id,
            float(score),
        )
        with contextlib.suppress(Exception):
            await msg.ack()
    except Exception as err:  # noqa: BLE001
        log.warning("notification handler failed for %s: %s", session_id, err)
        with contextlib.suppress(Exception):
            await msg.nak(delay=5)
