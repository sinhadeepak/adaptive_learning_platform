"""Phase 5 (P5-S39) — confidence calibration.

Per ADR-0017 dim 6. Records each per-question (predicted_correct,
actual_correct) tuple. Brier score = mean((p - o)^2) computed on
read; lower is better-calibrated.

Honest-signalling pattern: surface n alongside the score so a small
sample (e.g. n=3) is visibly low-confidence vs a stable n=200 reading.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

SCHEMA = "analytics_schema"


def brier_score(samples: list[tuple[float, bool]]) -> float:
    """Pure: Brier = mean((p - o)^2). o = 1 if correct else 0.
    Returns 0.0 on empty input (caller checks n > 0 before showing)."""
    if not samples:
        return 0.0
    total = 0.0
    for predicted, actual in samples:
        o = 1.0 if actual else 0.0
        total += (predicted - o) ** 2
    return total / len(samples)


async def record_confidence(
    session: AsyncSession,
    *,
    user_id: str,
    question_id: str,
    predicted_correct: float,
    actual_correct: bool,
) -> None:
    """Insert a calibration sample. Bounds-clamped at the table
    CHECK; caller passes [0.0, 1.0]."""
    if not 0.0 <= predicted_correct <= 1.0:
        # Defensive — silently clamp rather than raise; this is a
        # best-effort fan-out and a bad confidence value shouldn't
        # break the load-bearing topic-mastery update.
        predicted_correct = max(0.0, min(1.0, predicted_correct))

    await session.execute(
        text(
            f"""
            INSERT INTO {SCHEMA}.confidence_calibration
              (user_id, question_id, predicted_correct, actual_correct)
            VALUES (:uid, :qid, :p, :o)
            """
        ),
        {"uid": user_id, "qid": question_id,
         "p": predicted_correct, "o": actual_correct},
    )


async def get_brier_for_user(
    session: AsyncSession, user_id: str, *, since_iso: str | None = None
) -> dict[str, Any]:
    """Aggregate Brier score for a user. Returns {n, brier} dict.
    `since_iso` filters to recent attempts when set."""
    where = "user_id = :uid"
    params: dict[str, Any] = {"uid": user_id}
    if since_iso:
        where += " AND submitted_at >= :since"
        params["since"] = since_iso

    rows = (
        await session.execute(
            text(
                f"""
                SELECT predicted_correct, actual_correct
                  FROM {SCHEMA}.confidence_calibration
                 WHERE {where}
                 ORDER BY submitted_at DESC
                 LIMIT 1000
                """
            ),
            params,
        )
    ).all()
    samples = [(float(r[0]), bool(r[1])) for r in rows]
    return {"n": len(samples), "brier": brier_score(samples)}
