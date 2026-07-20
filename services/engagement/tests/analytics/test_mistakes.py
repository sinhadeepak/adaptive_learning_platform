"""Phase 3.1 — Mistake Notebook: capture, listing, due queue, SM-2 review."""

from __future__ import annotations

import base64
import json
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from engagement.analytics import db, mistakes_repo

UID = str(uuid4())
TID = str(uuid4())


def _bearer(sub: str, role: str = "STUDENT") -> dict[str, str]:
    """Craft the gateway-style bearer token get_principal decodes (payload is
    base64-only; signature isn't verified in-service)."""
    def _seg(obj: dict) -> str:
        return base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip("=")

    tok = f"{_seg({'alg': 'HS256'})}.{_seg({'sub': sub, 'role': role})}.sig"
    return {"Authorization": f"Bearer {tok}"}


async def _capture(session, *, item_idx, session_id, correct="Paris", chosen="Berlin", tag="conceptual_gap"):
    mid = await mistakes_repo.upsert_mistake(
        session,
        user_id=UID,
        session_id=session_id,
        item_idx=item_idx,
        topic_id=TID,
        question_id=str(uuid4()),
        error_tag=tag,
        stem_snapshot="Capital of France?",
        chosen_text=chosen,
        correct_text=correct,
        explanation_snapshot="Paris is the capital.",
    )
    if mid:
        await mistakes_repo.seed_review_state(
            session, mistake_id=mid, user_id=UID, now=datetime.now(tz=UTC)
        )
    return mid


@pytest.mark.asyncio
async def test_capture_is_idempotent_on_session_item() -> None:
    sid = str(uuid4())
    async with db.sessionmaker()() as session:
        first = await _capture(session, item_idx=0, session_id=sid)
        await session.commit()
    async with db.sessionmaker()() as session:
        second = await _capture(session, item_idx=0, session_id=sid)
        await session.commit()
    assert first is not None
    assert second is None  # redelivery is a no-op


@pytest.mark.asyncio
async def test_captured_mistake_is_listed_and_due_now() -> None:
    sid = str(uuid4())
    async with db.sessionmaker()() as session:
        await _capture(session, item_idx=1, session_id=sid)
        await session.commit()
    now = datetime.now(tz=UTC)
    async with db.sessionmaker()() as session:
        listed = await mistakes_repo.list_mistakes(session, UID)
        due = await mistakes_repo.list_due(session, UID, now=now)
        due_count = await mistakes_repo.count_due(session, UID, now=now)
    assert len(listed) == 1
    assert listed[0]["chosenText"] == "Berlin"
    assert listed[0]["correctText"] == "Paris"
    assert listed[0]["errorTag"] == "conceptual_gap"
    assert len(due) == 1 and due_count == 1  # seeded due immediately


@pytest.mark.asyncio
async def test_review_advances_schedule_and_clears_due() -> None:
    sid = str(uuid4())
    async with db.sessionmaker()() as session:
        mid = await _capture(session, item_idx=2, session_id=sid)
        await session.commit()
    now = datetime.now(tz=UTC)
    async with db.sessionmaker()() as session:
        result = await mistakes_repo.apply_review(
            session, mistake_id=mid, user_id=UID, quality=5, now=now
        )
        await session.commit()
    assert result is not None
    assert result["intervalDays"] == 1  # first successful review -> 1 day
    assert result["repetitions"] == 1
    # No longer due today.
    async with db.sessionmaker()() as session:
        due_after = await mistakes_repo.count_due(session, UID, now=now)
        due_tomorrow = await mistakes_repo.count_due(
            session, UID, now=now + timedelta(days=1, hours=1)
        )
    assert due_after == 0
    assert due_tomorrow == 1


@pytest.mark.asyncio
async def test_review_rejects_foreign_user() -> None:
    sid = str(uuid4())
    async with db.sessionmaker()() as session:
        mid = await _capture(session, item_idx=3, session_id=sid)
        await session.commit()
    async with db.sessionmaker()() as session:
        result = await mistakes_repo.apply_review(
            session, mistake_id=mid, user_id=str(uuid4()), quality=5, now=datetime.now(tz=UTC)
        )
    assert result is None  # not owned -> no-op


@pytest.mark.asyncio
async def test_route_blocks_reading_another_users_mistakes(client) -> None:
    """IDOR guard: a student may read their own notebook but not someone else's."""
    victim = str(uuid4())
    attacker = str(uuid4())
    # Own notebook → 200.
    ok = await client.get(f"/analytics/mistakes/{attacker}", headers=_bearer(attacker))
    assert ok.status_code == 200
    # Another user's notebook with attacker's token → 403.
    forbidden = await client.get(f"/analytics/mistakes/{victim}", headers=_bearer(attacker))
    assert forbidden.status_code == 403
    # Due queue is guarded too.
    due = await client.get(f"/analytics/mistakes/{victim}/due", headers=_bearer(attacker))
    assert due.status_code == 403
    # Missing token → 401.
    anon = await client.get(f"/analytics/mistakes/{victim}")
    assert anon.status_code == 401


@pytest.mark.asyncio
async def test_route_blocks_reviewing_another_users_mistake(client) -> None:
    sid = str(uuid4())
    async with db.sessionmaker()() as session:
        mid = await _capture(session, item_idx=0, session_id=sid)
        await session.commit()
    victim = UID
    attacker = str(uuid4())
    resp = await client.post(
        f"/analytics/mistakes/{victim}/review/{mid}",
        headers=_bearer(attacker),
        json={"quality": 5},
    )
    assert resp.status_code == 403


class _FakeMsg:
    def __init__(self, data: bytes) -> None:
        self.data = data

    async def ack(self) -> None: ...
    async def term(self) -> None: ...
    async def nak(self) -> None: ...


@pytest.mark.asyncio
async def test_session_completed_event_captures_wrong_answers() -> None:
    """Regression: the quiz.session.completed handler must capture a mistake for
    each wrong item. Guards against the datetime/UTC NameError that silently
    swallowed capture in the handler scope."""
    import json

    from engagement.analytics import events

    sid = str(uuid4())
    tid = str(uuid4())
    payload = {
        "session_id": sid,
        "user_id": UID,
        "topic_id": tid,
        "score": 0.5,
        "served_count": 2,
        "started_at": "2026-07-06T06:00:00Z",
        "submitted_at": "2026-07-06T06:05:00Z",
        "items": [
            {"item_idx": 0, "is_correct": False, "question_id": str(uuid4()), "topic_id": tid,
             "time_spent_ms": 8000, "chosen_choice_text": "Wrong", "correct_choice_text": "Right",
             "stem": "What is 2+2?", "explanation": "It is 4."},
            {"item_idx": 1, "is_correct": True, "question_id": str(uuid4()), "topic_id": tid,
             "time_spent_ms": 5000, "chosen_choice_text": "R", "correct_choice_text": "R"},
        ],
    }
    await events._on_session_completed(_FakeMsg(json.dumps(payload).encode()))

    now = datetime.now(tz=UTC)
    async with db.sessionmaker()() as session:
        listed = await mistakes_repo.list_mistakes(session, UID)
        due = await mistakes_repo.list_due(session, UID, now=now)
    # Exactly the one wrong answer captured (not the correct one).
    assert len(listed) == 1
    assert listed[0]["chosenText"] == "Wrong"
    assert listed[0]["correctText"] == "Right"
    assert len(due) == 1  # seeded due immediately


@pytest.mark.asyncio
async def test_filter_by_error_tag() -> None:
    async with db.sessionmaker()() as session:
        await _capture(session, item_idx=0, session_id=str(uuid4()), tag="silly_mistake")
        await _capture(session, item_idx=0, session_id=str(uuid4()), tag="conceptual_gap")
        await session.commit()
    async with db.sessionmaker()() as session:
        silly = await mistakes_repo.list_mistakes(session, UID, error_tag="silly_mistake")
        allm = await mistakes_repo.list_mistakes(session, UID)
    assert len(silly) == 1 and silly[0]["errorTag"] == "silly_mistake"
    assert len(allm) == 2
