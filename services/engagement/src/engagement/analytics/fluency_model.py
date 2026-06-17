"""Phase 5 (P5-S39) — per-concept fluency.

Pure-function update + repo helpers. `fluency_score = expected_ms /
actual_ms_rolling_avg`; > 1 = slower than baseline.

The `expected_ms_baseline` is set to the question's median time on
first observation (`time_spent_ms` from S22). Subsequent attempts
update the rolling average.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

SCHEMA = "analytics_schema"

# Smoothing factor for the rolling average. Same α=0.4 as EWA.
FLUENCY_ALPHA = 0.4


def compute_fluency_score(expected_ms: float, actual_ms: float) -> float:
    """Pure: expected/actual; clamped to [0.1, 10.0] so a single
    outlier doesn't blow up the score. Returns 1.0 (par) when actual
    is non-positive (defensive)."""
    if actual_ms <= 0 or expected_ms <= 0:
        return 1.0
    raw = expected_ms / actual_ms
    return max(0.1, min(10.0, raw))


def update_actual_ms_rolling(
    prev_avg_ms: float, prev_n: int, observation_ms: int
) -> float:
    """EWA-style smoothing for the rolling actual-ms average."""
    if prev_n == 0:
        return float(observation_ms)
    return (1 - FLUENCY_ALPHA) * prev_avg_ms + FLUENCY_ALPHA * observation_ms


async def update_fluency(
    session: AsyncSession,
    *,
    user_id: str,
    concept_id: str,
    time_spent_ms: int,
    expected_ms_baseline: float | None = None,
) -> None:
    """Update one (user, concept) fluency row. Skips when
    time_spent_ms <= 0 (unanswered items)."""
    if time_spent_ms <= 0:
        return

    row = (
        await session.execute(
            text(
                f"SELECT expected_ms_baseline, actual_ms_rolling_avg, n "
                f"FROM {SCHEMA}.fluency "
                "WHERE user_id = :uid AND concept_id = :cid"
            ),
            {"uid": user_id, "cid": concept_id},
        )
    ).first()

    if row is None:
        # Cold start: bootstrap baseline from first observation if no
        # caller-supplied expected (which is the common case for v1
        # since per-question expected times aren't yet calibrated).
        new_expected = (
            expected_ms_baseline
            if expected_ms_baseline is not None
            else float(time_spent_ms)
        )
        new_actual_avg = float(time_spent_ms)
        new_n = 1
    else:
        new_expected = float(row[0])  # baseline never updates after cold-start
        new_actual_avg = update_actual_ms_rolling(
            prev_avg_ms=float(row[1]), prev_n=int(row[2]), observation_ms=time_spent_ms
        )
        new_n = int(row[2]) + 1

    new_score = compute_fluency_score(new_expected, new_actual_avg)

    await session.execute(
        text(
            f"""
            INSERT INTO {SCHEMA}.fluency
              (user_id, concept_id, expected_ms_baseline,
               actual_ms_rolling_avg, n, fluency_score)
            VALUES (:uid, :cid, :exp, :avg, :n, :score)
            ON CONFLICT (user_id, concept_id) DO UPDATE SET
              actual_ms_rolling_avg = EXCLUDED.actual_ms_rolling_avg,
              n = EXCLUDED.n,
              fluency_score = EXCLUDED.fluency_score,
              updated_at = now()
            """
        ),
        {
            "uid": user_id, "cid": concept_id,
            "exp": new_expected, "avg": new_actual_avg,
            "n": new_n, "score": new_score,
        },
    )


async def list_for_user(
    session: AsyncSession, user_id: str
) -> list[dict[str, Any]]:
    rows = (
        await session.execute(
            text(
                f"""
                SELECT concept_id, expected_ms_baseline, actual_ms_rolling_avg,
                       n, fluency_score
                  FROM {SCHEMA}.fluency
                 WHERE user_id = :uid
                 ORDER BY fluency_score ASC
                """
            ),
            {"uid": user_id},
        )
    ).mappings().all()
    return [
        {
            "conceptId": str(r["concept_id"]),
            "expectedMsBaseline": float(r["expected_ms_baseline"]),
            "actualMsRollingAvg": float(r["actual_ms_rolling_avg"]),
            "n": int(r["n"]),
            "fluencyScore": float(r["fluency_score"]),
        }
        for r in rows
    ]
