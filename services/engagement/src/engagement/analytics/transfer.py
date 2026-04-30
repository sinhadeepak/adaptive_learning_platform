"""Phase 5 (P5-S41) — Transfer-ability metric.

Per ADR-0017 dim 7. Score per (user, concept):

    transfer_score = mean(performance | k>=2 tags) − mean(performance | k=1 tag)

Negative scores mean the student stumbles on multi-concept items
(real-world transfer is the gap); positive scores mean they actually
do better when concepts compose. Surfaces in `GET /analytics/transfer/{user}`
and powers the "you score 18% lower when this concept needs to be
applied to a new context" callout in the student profile (S46).

Pure-function aggregator + thin DB writer + reader. Idempotent
upsert: re-applying the same items overwrites the row.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

SCHEMA = "analytics_schema"


# ── Pure aggregator (testable without DB) ────────────────────────────────────


def compute_transfer_score(
    *,
    single_tag_outcomes: list[bool],
    multi_tag_outcomes: list[bool],
    min_n_per_bucket: int = 3,
) -> tuple[float | None, dict[str, Any]]:
    """Pure: given two lists of correct/wrong booleans, compute the
    transfer score as `mean(multi) - mean(single)`. Returns
    `(score | None, metadata)`. Score is None when either bucket is
    below `min_n_per_bucket` — signal too thin to publish.

    Metadata always populated regardless of score availability.
    """
    n_single = len(single_tag_outcomes)
    n_multi = len(multi_tag_outcomes)
    accuracy_single = (
        sum(1 for x in single_tag_outcomes if x) / n_single if n_single > 0 else 0.0
    )
    accuracy_multi = (
        sum(1 for x in multi_tag_outcomes if x) / n_multi if n_multi > 0 else 0.0
    )
    metadata: dict[str, Any] = {
        "n_single_tag": n_single,
        "n_multi_tag": n_multi,
        "accuracy_single_tag": round(accuracy_single, 4),
        "accuracy_multi_tag": round(accuracy_multi, 4),
        "min_n_per_bucket": min_n_per_bucket,
    }
    if n_single < min_n_per_bucket or n_multi < min_n_per_bucket:
        return None, metadata
    score = accuracy_multi - accuracy_single
    return round(score, 4), metadata


# ── DB writer (per-item outcomes) ────────────────────────────────────────────


async def upsert_session_item_outcomes(
    session: AsyncSession,
    *,
    session_id: str,
    user_id: str,
    items_with_concepts: list[dict[str, Any]],
) -> int:
    """Persist per-item outcomes with concept-tag counts.

    `items_with_concepts` is a list of dicts containing at minimum:
        {item_idx, question_id, primary_concept_id, concept_tag_count,
         is_correct, time_spent_ms (optional)}.

    Idempotent upsert keyed on (session_id, item_idx) so retries don't
    double-count. Returns rows written.
    """
    if not items_with_concepts:
        return 0
    written = 0
    for it in items_with_concepts:
        await session.execute(
            text(f"""
                INSERT INTO {SCHEMA}.session_item_outcomes
                  (session_id, item_idx, user_id, question_id,
                   primary_concept_id, concept_tag_count,
                   is_correct, time_spent_ms)
                VALUES (:sid, :idx, :uid, :qid,
                        :cid, :ctc,
                        :ok, :tms)
                ON CONFLICT (session_id, item_idx) DO UPDATE
                  SET is_correct        = EXCLUDED.is_correct,
                      time_spent_ms     = EXCLUDED.time_spent_ms,
                      concept_tag_count = EXCLUDED.concept_tag_count,
                      primary_concept_id = EXCLUDED.primary_concept_id,
                      recorded_at       = now()
            """),
            {
                "sid": session_id,
                "idx": int(it["item_idx"]),
                "uid": user_id,
                "qid": str(it["question_id"]),
                "cid": str(it["primary_concept_id"]),
                "ctc": int(it["concept_tag_count"]),
                "ok": bool(it["is_correct"]),
                "tms": int(it["time_spent_ms"]) if it.get("time_spent_ms") else None,
            },
        )
        written += 1
    return written


# ── Reader: per-user transfer score by concept ───────────────────────────────


async def get_transfer_for_user(
    session: AsyncSession,
    *,
    user_id: str,
    min_n_per_bucket: int = 3,
) -> list[dict[str, Any]]:
    """Per-concept transfer-ability score for a user.

    Returns a row per concept the user has attempted; each row has
    score (or null when buckets are thin) plus metadata. Concepts the
    user has only attempted in single-tag form (no multi-tag exposure)
    are returned with score=null + reason="no_multi_tag_exposure".
    """
    rows = (
        await session.execute(
            text(f"""
                SELECT primary_concept_id,
                       SUM(CASE WHEN concept_tag_count = 1 AND is_correct THEN 1 ELSE 0 END) AS single_correct,
                       SUM(CASE WHEN concept_tag_count = 1 THEN 1 ELSE 0 END) AS single_total,
                       SUM(CASE WHEN concept_tag_count >= 2 AND is_correct THEN 1 ELSE 0 END) AS multi_correct,
                       SUM(CASE WHEN concept_tag_count >= 2 THEN 1 ELSE 0 END) AS multi_total
                  FROM {SCHEMA}.session_item_outcomes
                 WHERE user_id = :uid
                 GROUP BY primary_concept_id
            """),
            {"uid": user_id},
        )
    ).mappings().all()

    out: list[dict[str, Any]] = []
    for r in rows:
        n_single = int(r["single_total"] or 0)
        n_multi = int(r["multi_total"] or 0)
        # Reuse the pure aggregator semantics.
        single_outcomes = [True] * int(r["single_correct"] or 0) + \
                          [False] * (n_single - int(r["single_correct"] or 0))
        multi_outcomes = [True] * int(r["multi_correct"] or 0) + \
                         [False] * (n_multi - int(r["multi_correct"] or 0))
        score, meta = compute_transfer_score(
            single_tag_outcomes=single_outcomes,
            multi_tag_outcomes=multi_outcomes,
            min_n_per_bucket=min_n_per_bucket,
        )
        out.append(
            {
                "conceptId": str(r["primary_concept_id"]),
                "transferScore": score,
                **meta,
            }
        )
    return out
