"""Phase 5 (P5-S39) — per-(concept, bloom-level) EWA.

Knowledge-depth axis per ADR-0017 dim 2. Same EWA formula (α=0.4),
different key. Concept's `cognitive_demand.bloom` field drives which
row updates per attempt.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from engagement.analytics.mastery import update_ewa

SCHEMA = "analytics_schema"

# 6 valid Bloom levels — must match the CHECK constraint on the table.
BLOOM_LEVELS = (
    "BLOOM_REMEMBER",
    "BLOOM_UNDERSTAND",
    "BLOOM_APPLY",
    "BLOOM_ANALYSE",
    "BLOOM_EVALUATE",
    "BLOOM_CREATE",
)


async def update_bloom_mastery(
    session: AsyncSession,
    *,
    user_id: str,
    concept_id: str,
    bloom_level: str,
    score: float,
) -> None:
    """Update one (user, concept, bloom_level) row. bloom_level must
    be in BLOOM_LEVELS — caller passes from the question's
    `cognitive_demand.bloom` field. Silently skips when bloom_level
    is missing or unrecognised (cognitive_demand is optional)."""
    if bloom_level not in BLOOM_LEVELS:
        return  # Bloom not declared on the question; skip silently.

    row = (
        await session.execute(
            text(
                f"SELECT ewa, n FROM {SCHEMA}.bloom_mastery "
                "WHERE user_id = :uid AND concept_id = :cid AND bloom_level = :bl"
            ),
            {"uid": user_id, "cid": concept_id, "bl": bloom_level},
        )
    ).first()

    if row is None:
        new_ewa = score
        new_n = 1
    else:
        new_ewa = update_ewa(prev_ewa=float(row[0]), prev_n=int(row[1]), score=score)
        new_n = int(row[1]) + 1

    await session.execute(
        text(
            f"""
            INSERT INTO {SCHEMA}.bloom_mastery
              (user_id, concept_id, bloom_level, ewa, n)
            VALUES (:uid, :cid, :bl, :ewa, :n)
            ON CONFLICT (user_id, concept_id, bloom_level) DO UPDATE SET
              ewa = EXCLUDED.ewa,
              n = EXCLUDED.n,
              updated_at = now()
            """
        ),
        {"uid": user_id, "cid": concept_id, "bl": bloom_level,
         "ewa": new_ewa, "n": new_n},
    )


async def list_matrix_for_user(
    session: AsyncSession, user_id: str
) -> dict[str, dict[str, dict[str, Any]]]:
    """Returns {concept_id: {bloom_level: {ewa, n}}}. Used by
    /analytics/student/{user_id}/multi-profile to build the concept
    × bloom matrix."""
    rows = (
        await session.execute(
            text(
                f"""
                SELECT concept_id, bloom_level, ewa, n
                  FROM {SCHEMA}.bloom_mastery
                 WHERE user_id = :uid
                """
            ),
            {"uid": user_id},
        )
    ).mappings().all()
    out: dict[str, dict[str, dict[str, Any]]] = {}
    for r in rows:
        cid = str(r["concept_id"])
        out.setdefault(cid, {})[r["bloom_level"]] = {
            "ewa": float(r["ewa"]),
            "n": int(r["n"]),
        }
    return out
