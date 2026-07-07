"""Mistake Notebook — DB helpers for analytics_schema.mistakes + review state.

Capture (`upsert_mistake` + `seed_review_state`) runs from the
quiz.session.completed handler; the review flow (`list_due`, `apply_review`)
backs the student-facing notebook. SM-2 math is the shared canonical core
(`alp_srs`), so mistake replay and topic revision schedule identically.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from alp_srs import DEFAULT_EASE_FACTOR, sm2_step
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

SCHEMA = "analytics_schema"


@dataclass(frozen=True)
class MistakeReviewState:
    mistake_id: str
    user_id: str
    ease_factor: float
    interval_days: int
    repetitions: int
    due_at: datetime


async def upsert_mistake(
    session: AsyncSession,
    *,
    user_id: str,
    session_id: str,
    item_idx: int,
    topic_id: str,
    question_id: str | None = None,
    exam_id: str | None = None,
    error_tag: str | None = None,
    stem_snapshot: str | None = None,
    chosen_text: str | None = None,
    correct_text: str | None = None,
    explanation_snapshot: str | None = None,
) -> str | None:
    """Insert one captured mistake. Idempotent on (session_id, item_idx):
    a redelivery is a no-op. Returns the new row's id when freshly inserted,
    else None (already captured) so the caller only seeds review state once."""
    row = (
        await session.execute(
            text(
                f"""
                INSERT INTO {SCHEMA}.mistakes
                  (user_id, session_id, item_idx, question_id, topic_id, exam_id,
                   error_tag, stem_snapshot, chosen_text, correct_text,
                   explanation_snapshot)
                VALUES
                  (:uid, :sid, :idx, :qid, :tid, :eid,
                   :tag, :stem, :chosen, :correct, :expl)
                ON CONFLICT (session_id, item_idx) DO NOTHING
                RETURNING id
                """
            ),
            {
                "uid": user_id,
                "sid": session_id,
                "idx": item_idx,
                "qid": question_id,
                "tid": topic_id,
                "eid": exam_id,
                "tag": error_tag,
                "stem": stem_snapshot,
                "chosen": chosen_text,
                "correct": correct_text,
                "expl": explanation_snapshot,
            },
        )
    ).first()
    return str(row[0]) if row else None


async def seed_review_state(
    session: AsyncSession, *, mistake_id: str, user_id: str, now: datetime
) -> None:
    """Seed a freshly-captured mistake as due immediately (due_at = now)."""
    await session.execute(
        text(
            f"""
            INSERT INTO {SCHEMA}.mistake_review_state
              (mistake_id, user_id, ease_factor, interval_days, repetitions, due_at)
            VALUES (:mid, :uid, :ef, 0, 0, :now)
            ON CONFLICT (mistake_id) DO NOTHING
            """
        ),
        {"mid": mistake_id, "uid": user_id, "ef": DEFAULT_EASE_FACTOR, "now": now},
    )


async def list_mistakes(
    session: AsyncSession,
    user_id: str,
    *,
    topic_id: str | None = None,
    error_tag: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """Newest-first notebook listing, optionally filtered by topic / error tag.
    Joins the review state so the UI can show the schedule + due status."""
    sql = f"""
        SELECT m.id, m.question_id, m.topic_id, m.exam_id, m.error_tag,
               m.stem_snapshot, m.chosen_text, m.correct_text,
               m.explanation_snapshot, m.created_at,
               s.interval_days, s.ease_factor, s.repetitions, s.due_at
          FROM {SCHEMA}.mistakes m
          LEFT JOIN {SCHEMA}.mistake_review_state s ON s.mistake_id = m.id
         WHERE m.user_id = :uid
    """
    params: dict[str, Any] = {"uid": user_id, "limit": limit, "offset": offset}
    if topic_id is not None:
        sql += " AND m.topic_id = CAST(:tid AS uuid)"
        params["tid"] = topic_id
    if error_tag is not None:
        sql += " AND m.error_tag = :tag"
        params["tag"] = error_tag
    sql += " ORDER BY m.created_at DESC LIMIT :limit OFFSET :offset"
    rows = (await session.execute(text(sql), params)).mappings().all()
    return [_serialize(r) for r in rows]


async def list_due(
    session: AsyncSession, user_id: str, *, now: datetime, limit: int = 20
) -> list[dict[str, Any]]:
    """Mistakes whose review is due (due_at <= now), most-overdue first."""
    rows = (
        await session.execute(
            text(
                f"""
                SELECT m.id, m.question_id, m.topic_id, m.exam_id, m.error_tag,
                       m.stem_snapshot, m.chosen_text, m.correct_text,
                       m.explanation_snapshot, m.created_at,
                       s.interval_days, s.ease_factor, s.repetitions, s.due_at
                  FROM {SCHEMA}.mistake_review_state s
                  JOIN {SCHEMA}.mistakes m ON m.id = s.mistake_id
                 WHERE s.user_id = :uid AND s.due_at <= :now
                 ORDER BY s.due_at ASC
                 LIMIT :limit
                """
            ),
            {"uid": user_id, "now": now, "limit": limit},
        )
    ).mappings().all()
    return [_serialize(r) for r in rows]


async def count_due(
    session: AsyncSession,
    user_id: str,
    *,
    now: datetime,
    topic_ids: set[str] | None = None,
) -> int:
    """Count of due mistakes for the user; optionally restricted to `topic_ids`.

    When `topic_ids` is a set we JOIN the mistakes row to filter by its
    `topic_id`; `topic_ids=set()` yields 0 (no topics in scope).
    """
    if topic_ids is not None and not topic_ids:
        return 0
    params: dict[str, Any] = {"uid": user_id, "now": now}
    if topic_ids is None:
        sql = f"""
            SELECT COUNT(*) FROM {SCHEMA}.mistake_review_state
             WHERE user_id = :uid AND due_at <= :now
        """
    else:
        sql = f"""
            SELECT COUNT(*)
              FROM {SCHEMA}.mistake_review_state s
              JOIN {SCHEMA}.mistakes m ON m.id = s.mistake_id
             WHERE s.user_id = :uid AND s.due_at <= :now
               AND m.topic_id = ANY(CAST(:tids AS uuid[]))
        """
        params["tids"] = list(topic_ids)
    row = (await session.execute(text(sql), params)).first()
    return int(row[0]) if row else 0


async def _get_review_state(
    session: AsyncSession, mistake_id: str, user_id: str
) -> MistakeReviewState | None:
    row = (
        await session.execute(
            text(
                f"""
                SELECT mistake_id, user_id, ease_factor, interval_days,
                       repetitions, due_at
                  FROM {SCHEMA}.mistake_review_state
                 WHERE mistake_id = CAST(:mid AS uuid) AND user_id = :uid
                """
            ),
            {"mid": mistake_id, "uid": user_id},
        )
    ).mappings().first()
    if row is None:
        return None
    return MistakeReviewState(
        mistake_id=str(row["mistake_id"]),
        user_id=str(row["user_id"]),
        ease_factor=float(row["ease_factor"]),
        interval_days=int(row["interval_days"]),
        repetitions=int(row["repetitions"]),
        due_at=row["due_at"],
    )


async def apply_review(
    session: AsyncSession,
    *,
    mistake_id: str,
    user_id: str,
    quality: int,
    now: datetime,
) -> dict[str, Any] | None:
    """Grade one mistake review (quality 0..5) and advance its SM-2 schedule.
    Returns the new schedule, or None if the mistake isn't owned by the user."""
    state = await _get_review_state(session, mistake_id, user_id)
    if state is None:
        return None
    step = sm2_step(
        prev_interval_days=state.interval_days,
        prev_ease_factor=state.ease_factor,
        prev_repetitions=state.repetitions,
        quality=quality,
    )
    due_at = now + timedelta(days=step.interval_days)
    await session.execute(
        text(
            f"""
            UPDATE {SCHEMA}.mistake_review_state
               SET ease_factor = :ef, interval_days = :iv, repetitions = :reps,
                   due_at = :due, last_reviewed_at = :now
             WHERE mistake_id = CAST(:mid AS uuid) AND user_id = :uid
            """
        ),
        {
            "ef": step.ease_factor,
            "iv": step.interval_days,
            "reps": step.repetitions,
            "due": due_at,
            "now": now,
            "mid": mistake_id,
            "uid": user_id,
        },
    )
    return {
        "mistakeId": mistake_id,
        "intervalDays": step.interval_days,
        "easeFactor": step.ease_factor,
        "repetitions": step.repetitions,
        "dueAt": due_at,
    }


def _serialize(r: Any) -> dict[str, Any]:
    return {
        "id": str(r["id"]),
        "questionId": str(r["question_id"]) if r["question_id"] else None,
        "topicId": str(r["topic_id"]),
        "examId": str(r["exam_id"]) if r["exam_id"] else None,
        "errorTag": r["error_tag"],
        "stem": r["stem_snapshot"],
        "chosenText": r["chosen_text"],
        "correctText": r["correct_text"],
        "explanation": r["explanation_snapshot"],
        "createdAt": r["created_at"],
        "intervalDays": int(r["interval_days"]) if r["interval_days"] is not None else 0,
        "easeFactor": (
            float(r["ease_factor"]) if r["ease_factor"] is not None else DEFAULT_EASE_FACTOR
        ),
        "repetitions": int(r["repetitions"]) if r["repetitions"] is not None else 0,
        "dueAt": r["due_at"],
    }
