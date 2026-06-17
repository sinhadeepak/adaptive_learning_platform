"""Predictive analytics orchestrator — gathers signals, calls scorers,
persists results.

Per ADR-0010, this is pure Python; lightgbm/sklearn upgrade lands in
P3-S6+ once we have training-data volume. The contract (function
signatures + DB schemas) stays stable so the swap is mechanical.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from engagement.analytics import predictive_repo
from engagement.analytics.predictive_dropout import (
    DropoutScore,
    DropoutSignals,
    score_user,
)
from engagement.analytics.predictive_recs import (
    CandidateTopic,
    Recommendation,
    TopicMastery,
    rank_recommendations,
)


SCHEMA = "analytics_schema"


# ---- signal gathering ----------------------------------------------------


async def gather_dropout_signals(
    session: AsyncSession, user_id: str
) -> DropoutSignals:
    """Pull from mastery + streaks + daily_activity to fill DropoutSignals."""
    # Mastery aggregate
    mastery_row = (
        await session.execute(
            text(f"""
                SELECT COALESCE(AVG(ewa), 0)::float AS avg_ewa,
                       COUNT(*) AS n_total,
                       COALESCE(SUM(CASE WHEN ewa < 0.4 AND n >= 3 THEN 1 ELSE 0 END), 0) AS n_below
                  FROM {SCHEMA}.mastery
                 WHERE user_id = :uid
            """),
            {"uid": user_id},
        )
    ).mappings().first()

    # Streaks
    streak_row = (
        await session.execute(
            text(f"""
                SELECT current_streak, longest_streak, last_active_date
                  FROM {SCHEMA}.streaks
                 WHERE user_id = :uid
            """),
            {"uid": user_id},
        )
    ).mappings().first()

    if streak_row and streak_row.get("last_active_date"):
        # last_active_date is a DATE — convert to datetime midnight UTC.
        last = streak_row["last_active_date"]
        last_dt = datetime(last.year, last.month, last.day, tzinfo=timezone.utc)
        days_since = max(0, (datetime.now(timezone.utc) - last_dt).days)
    else:
        days_since = 999  # never active

    return DropoutSignals(
        days_since_last_active=days_since,
        current_streak=int(streak_row["current_streak"]) if streak_row else 0,
        longest_streak=int(streak_row["longest_streak"]) if streak_row else 0,
        avg_mastery=float(mastery_row["avg_ewa"]) if mastery_row else 0.0,
        n_topics_below_floor=int(mastery_row["n_below"]) if mastery_row else 0,
        n_topics_total=int(mastery_row["n_total"]) if mastery_row else 0,
    )


# ---- public orchestrators ------------------------------------------------


async def compute_or_get_dropout(
    session: AsyncSession, user_id: str, *, force: bool = False
) -> dict[str, Any]:
    """Return the cached score (if fresh) or compute fresh + persist."""
    if not force:
        cached = await predictive_repo.get_dropout_score(session, user_id)
        if cached is not None:
            return {
                "score": float(cached["score"]),
                "risk_band": cached["risk_band"],
                "intervention_kind": cached.get("intervention_kind"),
                "signals": cached["signals_json"],
                "computed_at": cached["computed_at"].isoformat(),
                "cached": True,
            }

    signals = await gather_dropout_signals(session, user_id)
    score = score_user(signals)
    signals_json = {
        "days_since_last_active": signals.days_since_last_active,
        "current_streak": signals.current_streak,
        "longest_streak": signals.longest_streak,
        "avg_mastery": round(signals.avg_mastery, 4),
        "n_topics_below_floor": signals.n_topics_below_floor,
        "n_topics_total": signals.n_topics_total,
        "components": score.components,
    }
    await predictive_repo.upsert_dropout_score(
        session,
        user_id=user_id,
        score=score.score,
        risk_band=score.risk_band,
        intervention_kind=score.intervention_kind,
        signals=signals_json,
    )
    await session.commit()
    return {
        "score": score.score,
        "risk_band": score.risk_band,
        "intervention_kind": score.intervention_kind,
        "signals": signals_json,
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "cached": False,
    }


async def gather_user_mastery(
    session: AsyncSession, user_id: str
) -> list[TopicMastery]:
    """Pull mastery rows with the topic's subject_id from learning.

    Cross-database read: we don't actually have a JOIN-able view onto
    learning.catalog_schema.topics from the engagement DB. For v1, we
    treat all topics as in the same "subject" by leaving subject_id None
    if we can't resolve it. Real cross-DB joins land if we ever
    consolidate engagement+learning into one DB; meanwhile, accept the
    limitation that bridge-topic recs are weaker than they could be.
    """
    rows = (
        await session.execute(
            text(f"""
                SELECT topic_id, ewa, n
                  FROM {SCHEMA}.mastery
                 WHERE user_id = :uid
            """),
            {"uid": user_id},
        )
    ).mappings().all()
    return [
        TopicMastery(
            topic_id=str(r["topic_id"]),
            subject_id=None,  # cross-DB join deferred
            title=str(r["topic_id"])[:8] + "…",  # client renders nicer
            ewa=float(r["ewa"]),
            n_attempts=int(r["n"]),
        )
        for r in rows
    ]


async def compute_or_get_recommendations(
    session: AsyncSession,
    user_id: str,
    *,
    candidate_topics: list[CandidateTopic] | None = None,
    force: bool = False,
) -> list[Recommendation]:
    """Return cached recs or compute fresh.

    `candidate_topics` is the universe to choose from — passed in by the
    caller so engagement doesn't need to know about learning's catalog
    tables. If None, we just rank the user's own existing mastery rows
    (weak-topic only, no exposure phase).
    """
    if not force:
        cached = await predictive_repo.get_cached_recommendations(session, user_id)
        if cached is not None:
            return [
                Recommendation(
                    topic_id=str(r["topic_id"]),
                    score=float(r["score"]),
                    reason_string=r["reason_string"],
                )
                for r in cached
            ]

    user_mastery = await gather_user_mastery(session, user_id)
    candidates = candidate_topics or [
        CandidateTopic(
            topic_id=m.topic_id, subject_id=m.subject_id, title=m.title,
            user_ewa=m.ewa, user_attempts=m.n_attempts,
        )
        for m in user_mastery
    ]
    recs = rank_recommendations(user_mastery, candidates)

    await predictive_repo.replace_cached_recommendations(
        session,
        user_id=user_id,
        items=[
            {"topic_id": r.topic_id, "score": r.score, "reason_string": r.reason_string}
            for r in recs
        ],
    )
    await session.commit()
    return recs
