"""Pure roll-up core for the multi-exam dashboard summary."""
from __future__ import annotations

from engagement.analytics.mastery import MasteryRow
from engagement.analytics.multi_exam_summary import (
    ExamSummary,
    build_exam_summary,
    pick_weakest,
)


def _row(topic: str, ewa: float, n: int) -> MasteryRow:
    return MasteryRow(user_id="u1", topic_id=topic, ewa=ewa, n=n)


def test_pick_weakest_ignores_low_n() -> None:
    rows = [_row("a", 0.10, 2), _row("b", 0.40, 5), _row("c", 0.30, 3)]
    # 'a' has the lowest EWA but n<3, so 'c' wins.
    assert pick_weakest(rows).topic_id == "c"


def test_pick_weakest_none_when_all_low_n() -> None:
    assert pick_weakest([_row("a", 0.1, 1)]) is None


def test_build_exam_summary_rolls_up_all_fields() -> None:
    rows = [_row("a", 0.6, 4), _row("b", 0.2, 5)]
    s = build_exam_summary(
        exam_id="e1", mastery_rows=rows, mistakes_due=4, revision_due=2
    )
    assert isinstance(s, ExamSummary)
    assert s.exam_id == "e1"
    assert s.readiness_score == 0.4  # mean of 0.6, 0.2
    assert s.n_topics == 2
    assert s.weakest_topic_id == "b"
    assert s.weakest_ewa == 0.2
    assert s.mistakes_due == 4
    assert s.revision_due == 2


def test_build_exam_summary_empty_mastery() -> None:
    s = build_exam_summary(
        exam_id="e2", mastery_rows=[], mistakes_due=0, revision_due=0
    )
    assert s.readiness_score == 0.0
    assert s.n_topics == 0
    assert s.weakest_topic_id is None
    assert s.weakest_ewa is None


# --- append to services/engagement/tests/analytics/test_multi_exam_summary.py ---
from datetime import UTC, datetime
from uuid import uuid4

import pytest

from engagement.analytics import db, mistakes_repo, revision_queue_repo


@pytest.mark.asyncio
async def test_mistakes_count_due_respects_topic_set() -> None:
    uid = str(uuid4())
    t_in, t_out = str(uuid4()), str(uuid4())
    now = datetime.now(tz=UTC)
    async with db.sessionmaker()() as session:
        for tid in (t_in, t_out):
            mid = await mistakes_repo.upsert_mistake(
                session, user_id=uid, session_id=str(uuid4()), item_idx=0,
                topic_id=tid, question_id=str(uuid4()), error_tag="conceptual_gap",
                stem_snapshot="s", chosen_text="x", correct_text="y",
                explanation_snapshot="e",
            )
            await mistakes_repo.seed_review_state(
                session, mistake_id=mid, user_id=uid, now=now
            )
        await session.commit()
    async with db.sessionmaker()() as session:
        all_due = await mistakes_repo.count_due(session, uid, now=now)
        scoped = await mistakes_repo.count_due(session, uid, now=now, topic_ids={t_in})
        empty = await mistakes_repo.count_due(session, uid, now=now, topic_ids=set())
    assert all_due == 2
    assert scoped == 1
    assert empty == 0


@pytest.mark.asyncio
async def test_revision_count_due_respects_topic_set() -> None:
    uid = str(uuid4())
    t_in, t_out = str(uuid4()), str(uuid4())
    past = datetime(2020, 1, 1, tzinfo=UTC)
    now = datetime.now(tz=UTC)
    async with db.sessionmaker()() as session:
        for tid in (t_in, t_out):
            await revision_queue_repo.upsert(
                session, user_id=uid, topic_id=tid, last_attempt_at=past,
                due_at=past, interval_days=1, ease_factor=2.5, attempts=1,
            )
        await session.commit()
    async with db.sessionmaker()() as session:
        all_due = await revision_queue_repo.count_due(session, uid, now=now)
        scoped = await revision_queue_repo.count_due(session, uid, now=now, topic_ids={t_in})
    assert all_due == 2
    assert scoped == 1
