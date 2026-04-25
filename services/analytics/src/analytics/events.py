"""NATS subscriber for upstream quiz events.

Currently consumes:
- `quiz.session.completed` (from Quiz) — re-derive EWA mastery for the
  (user, topic) pair, then refresh the user's GLOBAL readiness score.

Idempotent: a sessionId that's already in `processed_sessions` is a no-op.
This protects against NATS at-least-once redelivery (Sprint 2 carry-over
promotes the publisher to JetStream durable streams).
"""

from __future__ import annotations

import contextlib
import json
import logging
from typing import Any

import nats
from nats.aio.client import Client as NatsClient
from nats.aio.msg import Msg

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

_client: NatsClient | None = None
_subscription: Any | None = None


async def connect() -> None:
    global _client, _subscription
    try:
        _client = await nats.connect(settings.nats_url, connect_timeout=2)
    except Exception as err:
        log.warning(
            "analytics could not connect to NATS (%s); quiz.session.completed consumer disabled",
            err,
        )
        _client = None
        return
    _subscription = await _client.subscribe("quiz.session.completed", cb=_on_session_completed)
    log.info("analytics subscribed to quiz.session.completed at %s", settings.nats_url)


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
    """Re-derive mastery + readiness from a Quiz submit."""
    try:
        payload = json.loads(msg.data.decode("utf-8"))
    except Exception as err:
        log.warning("analytics bad quiz.session.completed payload: %s", err)
        return

    session_id = payload.get("session_id")
    user_id = payload.get("user_id")
    topic_id = payload.get("topic_id")
    score = payload.get("score")
    if not (session_id and user_id and topic_id and score is not None):
        log.warning("analytics quiz.session.completed missing fields: %s", payload)
        return

    try:
        async with sessionmaker()() as session:
            if await is_session_processed(session, session_id):
                log.info("analytics session %s already processed; skipping", session_id)
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
            # Refresh GLOBAL readiness
            rows = await list_user_mastery(session, user_id)
            # Replace the row we just upserted in-memory (read-after-write quirks
            # under some pool configs; trust our update over the SELECT).
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
        log.info(
            "analytics processed quiz.session.completed user=%s topic=%s ewa=%.3f readiness=%.3f",
            user_id,
            topic_id,
            new_ewa,
            score_global,
        )
    except Exception as err:
        log.warning("analytics quiz.session.completed handler failed for %s: %s", session_id, err)


def MasteryRowReplace(row, new_ewa: float):  # noqa: N802 — mimics dataclasses.replace
    """Return a copy of `row` with `ewa` swapped — avoids importing dataclasses just for this."""
    from analytics.mastery import MasteryRow

    return MasteryRow(user_id=row.user_id, topic_id=row.topic_id, ewa=new_ewa, n=row.n)
