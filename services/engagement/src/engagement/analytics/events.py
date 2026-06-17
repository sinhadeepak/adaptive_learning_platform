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

from engagement.analytics.config import settings
from engagement.analytics.db import sessionmaker
from engagement.analytics.processing import process_session
from engagement.analytics.realtime import publish_user_recomputed
from engagement.analytics.section_stats import upsert_session_section_stats

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

    # Sprint 22 (P4-S22) — per-item array; absent on pre-S22 publishers, so
    # default to empty list and skip the per-section upsert below.
    items = payload.get("items") or []

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
            if items:
                await upsert_session_section_stats(
                    session,
                    session_id=session_id,
                    user_id=user_id,
                    items=items,
                )
                # Sprint 29 (P4-S29) — per-item error-pattern classification.
                # Best-effort: a classifier write failure must not roll
                # back the mastery + section-stats writes above.
                try:
                    from engagement.analytics.error_classifier import classify_error
                    from engagement.analytics.error_classifier_repo import (
                        upsert_classification,
                    )

                    for it in items:
                        time_ms = it.get("time_spent_ms")
                        time_int = int(time_ms) if time_ms else None
                        answered = bool(time_int) and time_int > 0
                        # mastery_ewa we have only for the session's
                        # representative topic; use score as a coarse proxy
                        # for the per-item topic (good enough for v1 — the
                        # heuristic gates are wide).
                        tag = classify_error(
                            is_correct=bool(it.get("is_correct", False)),
                            answered=answered,
                            time_spent_ms=time_int,
                            mastery_ewa=float(score),
                            chosen_choice_text=str(it.get("chosen_choice_text") or ""),
                            correct_choice_text=str(it.get("correct_choice_text") or ""),
                        )
                        if tag is None:
                            continue
                        await upsert_classification(
                            session,
                            session_id=session_id,
                            item_idx=int(it.get("item_idx") or 0),
                            user_id=user_id,
                            topic_id=str(it.get("topic_id") or topic_id),
                            classification=tag,
                        )
                except Exception:
                    log.exception(
                        "error_classification.failed session=%s", session_id
                    )

                # Phase 5 (P5-S39) — multi-parameter mastery fan-out.
                # Per ADR-0017 dims 1, 2, 3, 6: concept_mastery,
                # bloom_mastery, fluency, confidence_calibration. Each
                # update is best-effort try/except (matches S22 / S27 /
                # S29 pattern); a transient failure here MUST NOT roll
                # back the load-bearing topic-mastery + readiness updates.
                try:
                    from engagement.analytics import (
                        bloom_mastery as _bloom,
                    )
                    from engagement.analytics import (
                        concept_mastery as _concept,
                    )
                    from engagement.analytics import (
                        confidence as _conf,
                    )
                    from engagement.analytics import (
                        fluency_model as _flu,
                    )

                    for it in items:
                        qid = str(it.get("question_id") or "")
                        if not qid:
                            continue
                        score_item = 1.0 if bool(it.get("is_correct")) else 0.0
                        time_ms = int(it.get("time_spent_ms") or 0)
                        # For v1, the question's primary concept defaults
                        # to its topic_id (topic-as-root-concept backfill
                        # makes this a no-op identity). Richer concept
                        # tagging comes via author UI in S45.
                        concept_id = str(it.get("topic_id") or topic_id)
                        bloom_lvl = str(it.get("bloom_level") or "")
                        confidence = it.get("confidence")
                        try:
                            await _concept.update_concept_mastery(
                                session,
                                user_id=user_id,
                                concept_id=concept_id,
                                score=score_item,
                                now=datetime.now(tz=UTC),
                            )
                        except Exception:
                            log.exception(
                                "concept_mastery.update failed user=%s "
                                "concept=%s", user_id, concept_id,
                            )
                        if bloom_lvl:
                            try:
                                await _bloom.update_bloom_mastery(
                                    session,
                                    user_id=user_id,
                                    concept_id=concept_id,
                                    bloom_level=bloom_lvl,
                                    score=score_item,
                                )
                            except Exception:
                                log.exception(
                                    "bloom_mastery.update failed user=%s "
                                    "concept=%s bloom=%s",
                                    user_id, concept_id, bloom_lvl,
                                )
                        if time_ms > 0:
                            try:
                                await _flu.update_fluency(
                                    session,
                                    user_id=user_id,
                                    concept_id=concept_id,
                                    time_spent_ms=time_ms,
                                )
                            except Exception:
                                log.exception(
                                    "fluency.update failed user=%s concept=%s",
                                    user_id, concept_id,
                                )
                        if confidence is not None:
                            try:
                                await _conf.record_confidence(
                                    session,
                                    user_id=user_id,
                                    question_id=qid,
                                    predicted_correct=float(confidence),
                                    actual_correct=bool(it.get("is_correct", False)),
                                )
                            except Exception:
                                log.exception(
                                    "confidence.record failed user=%s qid=%s",
                                    user_id, qid,
                                )
                except Exception:
                    log.exception(
                        "multi_parameter_fanout.failed session=%s", session_id
                    )

                # Phase 5 (P5-S41) — per-item outcomes for transfer-ability
                # metric. Items emit concept_tag_count; pre-S45 producers
                # default to 1 (single-tag), so transfer scores remain
                # null until multi-tag authoring lands. Best-effort: a
                # write failure here MUST NOT roll back the mastery /
                # readiness writes above.
                try:
                    from engagement.analytics import transfer as _transfer

                    outcomes_payload = []
                    for it in items:
                        qid = it.get("question_id")
                        if not qid:
                            continue
                        outcomes_payload.append(
                            {
                                "item_idx": int(it.get("item_idx") or 0),
                                "question_id": str(qid),
                                # v1: topic-as-root-concept identity holds, so
                                # primary_concept_id = topic_id of the item.
                                "primary_concept_id": str(it.get("topic_id") or topic_id),
                                # Pre-S45 publishers omit this field → 1.
                                "concept_tag_count": int(
                                    it.get("concept_tag_count") or 1
                                ),
                                "is_correct": bool(it.get("is_correct", False)),
                                "time_spent_ms": (
                                    int(it["time_spent_ms"])
                                    if it.get("time_spent_ms")
                                    else None
                                ),
                            }
                        )
                    if outcomes_payload:
                        await _transfer.upsert_session_item_outcomes(
                            session,
                            session_id=session_id,
                            user_id=user_id,
                            items_with_concepts=outcomes_payload,
                        )
                except Exception:
                    log.exception(
                        "transfer_outcomes.failed session=%s", session_id
                    )

                # Phase 1D-9 — gamification XP. Award per-session XP +
                # per-correct XP. Best-effort: a gamification write
                # failure must not roll back mastery / readiness.
                try:
                    from engagement.gamification import service as _gam

                    correct_count = sum(
                        1 for it in items if bool(it.get("is_correct"))
                    )
                    base_xp = _gam.XP_RULES.get("quiz_completed", 0)
                    per_correct = _gam.XP_RULES.get("quiz_correct_answer", 0)
                    total_xp = base_xp + per_correct * correct_count
                    if total_xp > 0:
                        await _gam.award_xp(
                            session,
                            user_id=user_id,
                            event_type="quiz_completed",
                            source_id=session_id,
                            xp_delta=total_xp,
                        )
                    # Mastery milestone — for any per-item topic that just
                    # crossed 0.7 EWA on this update, award milestone XP.
                    # Detection: re-read mastery rows we just updated and
                    # check current EWA against a synthetic prior (>=0.7
                    # now, was <0.7 before). v1 uses a coarser proxy: if
                    # the session's primary topic crosses, award once.
                    try:
                        from sqlalchemy import text as _t
                        row = (
                            await session.execute(
                                _t(
                                    """
                                    SELECT ewa FROM analytics_schema.mastery
                                     WHERE user_id = CAST(:uid AS uuid)
                                       AND topic_id = CAST(:tid AS uuid)
                                    """
                                ),
                                {"uid": user_id, "tid": topic_id},
                            )
                        ).first()
                        if row is not None and float(row[0]) >= 0.7:
                            # Awarded only if there's no prior milestone
                            # event for this (user, topic) — dedupe via
                            # source_id.
                            existed = (
                                await session.execute(
                                    _t(
                                        """
                                        SELECT 1
                                          FROM analytics_schema.xp_events
                                         WHERE user_id = CAST(:uid AS uuid)
                                           AND event_type = 'mastery_milestone'
                                           AND source_id = CAST(:tid AS uuid)
                                         LIMIT 1
                                        """
                                    ),
                                    {"uid": user_id, "tid": topic_id},
                                )
                            ).first()
                            if not existed:
                                await _gam.award_xp(
                                    session,
                                    user_id=user_id,
                                    event_type="mastery_milestone",
                                    source_id=topic_id,
                                )
                    except Exception:
                        log.exception(
                            "gamification.milestone.failed user=%s topic=%s",
                            user_id, topic_id,
                        )
                except Exception:
                    log.exception(
                        "gamification.xp.failed session=%s", session_id,
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
            # Sprint 13 S13-A — wake any cohort SSE subscribers that
            # have this user in their member set. publish_user_recomputed
            # is in-process + non-blocking; a slow SSE consumer can't
            # stall this consumer.
            with contextlib.suppress(Exception):
                publish_user_recomputed(user_id)
        else:
            log.info("analytics session %s already processed; skipping", session_id)
    except Exception as err:
        log.warning("analytics quiz.session.completed handler failed for %s: %s", session_id, err)
        with contextlib.suppress(Exception):
            # Infra failure (DB down, etc) — nak with delay so JetStream
            # retries with backoff. MaxDeliver=5 caps the retry storm.
            await msg.nak(delay=5)
