"""Predictive analytics persistence — separate module so the existing
repositories.py stays focused on Phase 1/2 mastery + readiness queries."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

SCHEMA = "analytics_schema"

# Cache TTL for v1.
CACHE_TTL = timedelta(hours=1)


# -- dropout score cache ---------------------------------------------------


async def get_dropout_score(
    session: AsyncSession, user_id: str, *, max_age: timedelta = CACHE_TTL
) -> dict[str, Any] | None:
    """Returns the cached score if fresh enough, else None."""
    row = (
        await session.execute(
            text(f"""
                SELECT user_id, score, risk_band, intervention_kind,
                       signals_json, computed_at
                  FROM {SCHEMA}.predictive_dropout_scores
                 WHERE user_id = :uid
            """),
            {"uid": user_id},
        )
    ).mappings().first()
    if row is None:
        return None
    age = datetime.now(timezone.utc) - row["computed_at"]
    if age > max_age:
        return None
    return dict(row)


async def upsert_dropout_score(
    session: AsyncSession,
    *,
    user_id: str,
    score: float,
    risk_band: str,
    intervention_kind: str | None,
    signals: dict[str, Any],
) -> None:
    await session.execute(
        text(f"""
            INSERT INTO {SCHEMA}.predictive_dropout_scores
              (user_id, score, risk_band, intervention_kind, signals_json, computed_at)
            VALUES (:uid, :s, :b, :i, CAST(:sj AS jsonb), now())
            ON CONFLICT (user_id) DO UPDATE
              SET score = EXCLUDED.score,
                  risk_band = EXCLUDED.risk_band,
                  intervention_kind = EXCLUDED.intervention_kind,
                  signals_json = EXCLUDED.signals_json,
                  computed_at = EXCLUDED.computed_at
        """),
        {
            "uid": user_id, "s": score, "b": risk_band,
            "i": intervention_kind, "sj": json.dumps(signals),
        },
    )


async def list_high_risk_in_cohort(
    session: AsyncSession, user_ids: list[str]
) -> list[dict[str, Any]]:
    """Return the high+medium-risk subset of the given user_ids who have
    a non-stale cached score. Used by educator drill-down."""
    if not user_ids:
        return []
    rows = (
        await session.execute(
            text(f"""
                SELECT user_id, score, risk_band, intervention_kind, computed_at
                  FROM {SCHEMA}.predictive_dropout_scores
                 WHERE user_id = ANY(CAST(:uids AS uuid[]))
                   AND risk_band IN ('HIGH', 'MEDIUM')
                 ORDER BY score DESC
            """),
            {"uids": user_ids},
        )
    ).mappings().all()
    return [dict(r) for r in rows]


# -- recommendations cache -------------------------------------------------


async def get_cached_recommendations(
    session: AsyncSession, user_id: str, *, max_age: timedelta = CACHE_TTL
) -> list[dict[str, Any]] | None:
    rows = (
        await session.execute(
            text(f"""
                SELECT user_id, position, topic_id, score, reason_string, computed_at
                  FROM {SCHEMA}.cached_recommendations
                 WHERE user_id = :uid
                 ORDER BY position
            """),
            {"uid": user_id},
        )
    ).mappings().all()
    if not rows:
        return None
    # If any row is stale, treat the whole set as stale.
    age = datetime.now(timezone.utc) - rows[0]["computed_at"]
    if age > max_age:
        return None
    return [dict(r) for r in rows]


async def replace_cached_recommendations(
    session: AsyncSession,
    *,
    user_id: str,
    items: list[dict[str, Any]],  # [{topic_id, score, reason_string}]
) -> None:
    await session.execute(
        text(f"DELETE FROM {SCHEMA}.cached_recommendations WHERE user_id = :uid"),
        {"uid": user_id},
    )
    for i, item in enumerate(items, start=1):
        await session.execute(
            text(f"""
                INSERT INTO {SCHEMA}.cached_recommendations
                  (user_id, position, topic_id, score, reason_string, computed_at)
                VALUES (:uid, :p, :tid, :s, :r, now())
            """),
            {
                "uid": user_id, "p": i,
                "tid": item["topic_id"], "s": item["score"],
                "r": item["reason_string"],
            },
        )
