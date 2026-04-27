"""JetStream publisher for Content domain events.

Subjects:
  content.question.published — emitted when a question transitions to PUBLISHED
                               via /content/questions/{id}/review (approve=True).
                               Subscribed by Quiz, which mirrors the row into
                               its own question bank so students can be served
                               the new item.

Stream: CONTENT_EVENTS, subjects=[content.>], FILE storage, R=1 local.

Best-effort: connection failures log a warning but never fail the request — the
question row in Postgres is the durable record. Quiz can backfill on cold start
by reading content directly if needed (Sprint 4 work).
"""

from __future__ import annotations

import contextlib
import json
import logging
from typing import Any

import nats
from nats.aio.client import Client as NatsClient
from nats.js import JetStreamContext
from nats.js.api import RetentionPolicy, StorageType, StreamConfig
from nats.js.errors import BadRequestError

from content.config import settings

log = logging.getLogger(__name__)

STREAM = "CONTENT_EVENTS"
SUBJECT_QUESTION_PUBLISHED = "content.question.published"

_client: NatsClient | None = None
_js: JetStreamContext | None = None


async def connect() -> None:
    """Connect to NATS, ensure CONTENT_EVENTS exists. Idempotent — safe to
    call multiple times; failures degrade to a no-op publisher."""
    global _client, _js
    if _client is not None:
        return
    try:
        _client = await nats.connect(settings.nats_url, connect_timeout=2)
    except Exception as err:
        log.warning("content could not connect to NATS (%s); publisher disabled", err)
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
        # Already exists — fine.
        pass
    except Exception as err:
        log.warning("content jetstream add_stream failed: %s", err)
        _js = None
        return
    log.info("content jetstream stream ready: %s", STREAM)


async def close() -> None:
    global _client, _js
    _js = None
    if _client is not None:
        with contextlib.suppress(Exception):
            await _client.drain()
        _client = None


async def publish_question_published(question: dict[str, Any]) -> None:
    """Emit content.question.published. Best-effort: a publish failure is
    logged but not propagated — the DB row is the durable truth."""
    if _js is None:
        log.debug("content noop publish: js not connected")
        return
    payload = {
        "id": question["id"],
        "topic_id": question["topic_id"],
        "stem": question["stem"],
        "choices": question["choices"],
        "correct_idx": question["correct_idx"],
        "difficulty_b": question["difficulty_b"],
        # IRT calibration — present after Sprint 4 migration; defaults to
        # 1.0/0.0 (2PL) for rows authored before then.
        "discrimination_a": question.get("discrimination_a", 1.0),
        "guessing_c": question.get("guessing_c", 0.0),
        "language": question["language"],
        "explanation": question.get("explanation"),
        "reviewed_by": question["reviewed_by"],
        "reviewed_at": (
            question["reviewed_at"].isoformat() if question.get("reviewed_at") else None
        ),
    }
    try:
        await _js.publish(SUBJECT_QUESTION_PUBLISHED, json.dumps(payload).encode("utf-8"))
        log.info("content published question %s", question["id"])
    except Exception as err:
        log.warning("content publish failed for %s: %s", question["id"], err)
