"""NATS subscriber for upstream quiz events.

Currently consumes:
- `quiz.session.completed` — drops a notification record (in-memory store)
  gated through the same channel-flag plane as `/notifications/send`. The email
  channel is the default; if `email_channel_enabled` is OFF the notification is
  dropped (logged, not enqueued).

In Sprint 3 the in-memory store moves to a Postgres-backed `notifications`
table + a real SMTP/SendGrid sender. The subject contract stays stable.
"""

from __future__ import annotations

import contextlib
import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import nats
from nats.aio.client import Client as NatsClient
from nats.aio.msg import Msg

from notification.config import settings
from notification.flags import channel_enabled

log = logging.getLogger(__name__)


@dataclass
class Notification:
    """In-memory notification record. Sprint 3 promotes to a DB row."""

    id: str
    user_id: str
    type: str
    channel: str
    payload: dict[str, Any]
    created_at: datetime = field(default_factory=lambda: datetime.now(tz=UTC))


class _Inbox:
    """Process-local notification log. Sprint 3 swaps for a DB-backed store."""

    def __init__(self) -> None:
        self._items: list[Notification] = []

    def append(self, n: Notification) -> None:
        self._items.append(n)

    def for_user(self, user_id: str) -> list[Notification]:
        return [n for n in self._items if n.user_id == user_id]

    def all(self) -> list[Notification]:
        return list(self._items)

    def clear(self) -> None:
        self._items.clear()


inbox = _Inbox()

_client: NatsClient | None = None
_subscription: Any | None = None


async def connect() -> None:
    global _client, _subscription
    try:
        _client = await nats.connect(settings.nats_url, connect_timeout=2)
    except Exception as err:
        log.warning("notification could not connect to NATS (%s); subscriber disabled", err)
        _client = None
        return
    _subscription = await _client.subscribe("quiz.session.completed", cb=_on_session_completed)
    log.info("notification subscribed to quiz.session.completed at %s", settings.nats_url)


async def close() -> None:
    global _client, _subscription
    if _subscription is not None:
        with contextlib.suppress(Exception):
            await _subscription.drain()
        _subscription = None
    if _client is not None:
        with contextlib.suppress(Exception):
            await _client.drain()
        _client = None


async def _on_session_completed(msg: Msg) -> None:
    try:
        payload = json.loads(msg.data.decode("utf-8"))
    except Exception as err:
        log.warning("notification bad quiz.session.completed payload: %s", err)
        return

    user_id = payload.get("user_id")
    session_id = payload.get("session_id")
    score = payload.get("score")
    tenant_id = payload.get("tenant_id")
    if not (user_id and session_id and score is not None):
        log.warning("notification quiz.session.completed missing fields: %s", payload)
        return

    channel = "email"
    if not await channel_enabled(channel, tenant_id=tenant_id):
        log.info(
            "notification dropping quiz.completed for user=%s — %s channel disabled",
            user_id,
            channel,
        )
        return

    inbox.append(
        Notification(
            id=str(uuid.uuid4()),
            user_id=user_id,
            type="quiz.completed",
            channel=channel,
            payload={"sessionId": session_id, "score": score, "topicId": payload.get("topic_id")},
        )
    )
    log.info(
        "notification enqueued quiz.completed user=%s session=%s score=%.2f",
        user_id,
        session_id,
        float(score),
    )
