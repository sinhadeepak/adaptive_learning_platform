"""Tests for MockAttemptsRepo + QuestionFeedbackRepo (S7).

MockAttemptsRepo: durable scoreboard for the in-memory mock orchestrator
in adaptive-engine. The interesting paths are TEXT mock_id (the
`mock_<hex>` format that prompted migration 008) and the count_for_user
endpoint that adaptive-engine hits to decide on `mocks_5`/`mocks_10` badges.

QuestionFeedbackRepo: idempotent on (user, question, kind) so a double-tap
of the flag button never floods the moderator queue.
"""

from __future__ import annotations

import os
import uuid
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from identity.profile.repositories import MockAttemptsRepo, QuestionFeedbackRepo

os.environ.setdefault(
    "USER_PROFILE_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:35432/user_profile",
)

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def session() -> AsyncIterator[AsyncSession]:
    engine = create_async_engine(os.environ["USER_PROFILE_DATABASE_URL"])
    sm = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with engine.begin() as conn:
            await conn.execute(
                text(
                    "TRUNCATE profile_schema.mock_attempts, profile_schema.question_feedback "
                    "RESTART IDENTITY CASCADE"
                )
            )
        async with sm() as s:
            yield s
    finally:
        await engine.dispose()


def _uid() -> str:
    return str(uuid.uuid4())


# ─────────────────────────────────────────────────────────────────────────
# Mock attempts
# ─────────────────────────────────────────────────────────────────────────


async def test_mock_insert_round_trips_full_payload(session: AsyncSession) -> None:
    repo = MockAttemptsRepo(session)
    user = _uid()
    sections = [
        {"name": "Physics", "correct": 5, "wrong": 2, "unanswered": 3, "total": 10},
        {"name": "Chemistry", "correct": 3, "wrong": 4, "unanswered": 3, "total": 10},
    ]
    row = await repo.insert(
        user_id=user,
        mock_id="mock_55690641460d4956",  # The TEXT format that migration 008 unblocked.
        exam_code="NEET",
        exam_name="NEET (UG) — Quick Mock",
        raw_score=8,
        max_marks=80,
        accuracy=0.4,
        total_questions=20,
        n_correct=8,
        n_wrong=6,
        n_unanswered=6,
        percentile=42.5,
        projected_rank=875000,
        confidence="medium",
        sections=sections,
    )
    await session.commit()

    assert row["exam_code"] == "NEET"
    assert row["mock_id"] == "mock_55690641460d4956"  # TEXT preserved as-is
    assert row["raw_score"] == 8
    assert row["accuracy"] == pytest.approx(0.4, rel=1e-3)
    assert row["projected_rank"] == 875000
    assert row["sections"] == sections


async def test_mock_text_id_accepted(session: AsyncSession) -> None:
    """Regression test for the bug closed by migration 008. The original
    UUID column type rejected adaptive-engine's `mock_<hex>` format."""
    repo = MockAttemptsRepo(session)
    row = await repo.insert(
        user_id=_uid(),
        mock_id="mock_abc123",
        exam_code="JEE",
        exam_name=None,
        raw_score=0,
        max_marks=80,
        accuracy=0.0,
        total_questions=20,
        n_correct=0,
        n_wrong=0,
        n_unanswered=20,
        percentile=None,
        projected_rank=None,
        confidence=None,
        sections=None,
    )
    await session.commit()
    assert row["mock_id"] == "mock_abc123"


async def test_mock_count_for_user(session: AsyncSession) -> None:
    """count_for_user is what adaptive-engine pings after each score to
    decide on `mocks_5` / `mocks_10` badges."""
    repo = MockAttemptsRepo(session)
    user = _uid()
    other_user = _uid()

    # Six attempts for `user`; a single attempt for `other_user`.
    for i in range(6):
        await repo.insert(
            user_id=user,
            mock_id=f"mock_user_{i:02x}",
            exam_code="NEET",
            exam_name=None,
            raw_score=i * 4,
            max_marks=80,
            accuracy=i / 20,
            total_questions=20,
            n_correct=i,
            n_wrong=20 - i,
            n_unanswered=0,
            percentile=None,
            projected_rank=None,
            confidence=None,
            sections=None,
        )
    await repo.insert(
        user_id=other_user,
        mock_id="mock_other_01",
        exam_code="NEET",
        exam_name=None,
        raw_score=10,
        max_marks=80,
        accuracy=0.5,
        total_questions=20,
        n_correct=5,
        n_wrong=5,
        n_unanswered=10,
        percentile=None,
        projected_rank=None,
        confidence=None,
        sections=None,
    )
    await session.commit()

    assert await repo.count_for_user(user) == 6
    assert await repo.count_for_user(other_user) == 1
    assert await repo.count_for_user(_uid()) == 0


async def test_mock_list_orders_newest_first(session: AsyncSession) -> None:
    repo = MockAttemptsRepo(session)
    user = _uid()
    for i in range(3):
        await repo.insert(
            user_id=user,
            mock_id=f"mock_attempt_{i}",
            exam_code="NEET",
            exam_name=None,
            raw_score=i,
            max_marks=80,
            accuracy=0.05 * i,
            total_questions=20,
            n_correct=i,
            n_wrong=20 - i,
            n_unanswered=0,
            percentile=None,
            projected_rank=None,
            confidence=None,
            sections=None,
        )
        await session.commit()

    rows = await repo.list_for_user(user)
    ids = [r["mock_id"] for r in rows]
    assert ids == ["mock_attempt_2", "mock_attempt_1", "mock_attempt_0"]


# ─────────────────────────────────────────────────────────────────────────
# Question feedback
# ─────────────────────────────────────────────────────────────────────────


async def test_feedback_create_returns_row(session: AsyncSession) -> None:
    repo = QuestionFeedbackRepo(session)
    user, qid = _uid(), _uid()
    row = await repo.create(
        user_id=user,
        question_id=qid,
        kind="AMBIGUOUS",
        note="Two answers seem equally valid",
    )
    await session.commit()
    assert row["kind"] == "AMBIGUOUS"
    assert row["note"] == "Two answers seem equally valid"


async def test_feedback_idempotent_on_user_question_kind(
    session: AsyncSession,
) -> None:
    """Tapping the flag twice with the same kind is a no-op upsert (note
    merge per ON CONFLICT DO UPDATE)."""
    repo = QuestionFeedbackRepo(session)
    user, qid = _uid(), _uid()
    first = await repo.create(
        user_id=user, question_id=qid, kind="AMBIGUOUS", note="initial"
    )
    await session.commit()
    second = await repo.create(
        user_id=user, question_id=qid, kind="AMBIGUOUS", note="updated"
    )
    await session.commit()
    # Same id; note was overwritten by the second call.
    assert first["id"] == second["id"]
    assert second["note"] == "updated"


async def test_feedback_different_kind_creates_new_row(session: AsyncSession) -> None:
    """The UNIQUE is on (user, question, kind) — flagging the same question
    with a DIFFERENT kind is a new report, not a merge."""
    repo = QuestionFeedbackRepo(session)
    user, qid = _uid(), _uid()
    a = await repo.create(user_id=user, question_id=qid, kind="AMBIGUOUS", note="a")
    await session.commit()
    b = await repo.create(user_id=user, question_id=qid, kind="TYPO", note="b")
    await session.commit()
    assert a["id"] != b["id"]


async def test_feedback_merge_preserves_note_when_new_is_none(
    session: AsyncSession,
) -> None:
    """If the second tap omits a note, the first one's note should survive
    (matches the COALESCE pattern in the SQL)."""
    repo = QuestionFeedbackRepo(session)
    user, qid = _uid(), _uid()
    await repo.create(user_id=user, question_id=qid, kind="AMBIGUOUS", note="keep me")
    await session.commit()
    second = await repo.create(
        user_id=user, question_id=qid, kind="AMBIGUOUS", note=None
    )
    await session.commit()
    assert second["note"] == "keep me"
