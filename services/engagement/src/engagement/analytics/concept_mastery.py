"""Phase 5 (P5-S39) — per-concept EWA mastery.

Pure-function update + repo helpers. Reuses the existing α=0.4 EWA
formula from `mastery.py` (per ADR-0017 §"Decision: concept-grain
substrate" — same constant, different keys).

Per ADR-0014 + S22 best-effort fan-out: a transient failure in
this update **does not** roll back the load-bearing topic-mastery
+ readiness updates. Caller wraps in try/except.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from engagement.analytics.mastery import update_ewa

SCHEMA = "analytics_schema"


async def update_concept_mastery(
    session: AsyncSession,
    *,
    user_id: str,
    concept_id: str,
    score: float,
    now: datetime,
) -> None:
    """Update one (user, concept) row. score ∈ {0.0, 1.0} for binary
    is_correct; partial-credit responses pass the matched fraction.

    Uses INSERT ... ON CONFLICT for read-modify-write atomicity. The
    existing row's (ewa, n) feeds `update_ewa(prev_ewa, prev_n, score)`
    to compute the new EWA per the same formula as topic-mastery.
    """
    # Read current row (None if first attempt).
    row = (
        await session.execute(
            text(
                f"SELECT ewa, n FROM {SCHEMA}.concept_mastery "
                "WHERE user_id = :uid AND concept_id = :cid"
            ),
            {"uid": user_id, "cid": concept_id},
        )
    ).first()

    if row is None:
        new_ewa = score  # cold start — first observation IS the EWA
        new_n = 1
    else:
        new_ewa = update_ewa(prev_ewa=float(row[0]), prev_n=int(row[1]), score=score)
        new_n = int(row[1]) + 1

    await session.execute(
        text(
            f"""
            INSERT INTO {SCHEMA}.concept_mastery
              (user_id, concept_id, ewa, n, last_seen_at, updated_at)
            VALUES (:uid, :cid, :ewa, :n, :now, :now)
            ON CONFLICT (user_id, concept_id) DO UPDATE SET
              ewa = EXCLUDED.ewa,
              n = EXCLUDED.n,
              last_seen_at = EXCLUDED.last_seen_at,
              updated_at = EXCLUDED.updated_at
            """
        ),
        {"uid": user_id, "cid": concept_id, "ewa": new_ewa, "n": new_n, "now": now},
    )


async def list_for_user(
    session: AsyncSession, user_id: str
) -> list[dict[str, Any]]:
    """Return per-concept rows for a user. Used by
    GET /analytics/concept-mastery/{user_id} + the multi-profile endpoint."""
    rows = (
        await session.execute(
            text(
                f"""
                SELECT concept_id, ewa, n, last_seen_at
                  FROM {SCHEMA}.concept_mastery
                 WHERE user_id = :uid
                 ORDER BY ewa ASC, last_seen_at DESC NULLS LAST
                """
            ),
            {"uid": user_id},
        )
    ).mappings().all()
    return [
        {
            "conceptId": str(r["concept_id"]),
            "ewa": float(r["ewa"]),
            "n": int(r["n"]),
            "lastSeenAt": r["last_seen_at"].isoformat() if r["last_seen_at"] else None,
        }
        for r in rows
    ]
