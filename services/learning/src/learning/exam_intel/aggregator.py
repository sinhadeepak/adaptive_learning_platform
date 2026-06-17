"""Aggregator — rolls tagged past_questions up to per-(exam, topic, year)
appearance counts.

Reads from `exam_past_questions` (where `curated_tags` overrides
`nlp_tags`), groups by topic_id × year, sums questions + marks.
Writes / overwrites `topic_appearance_stats`. Idempotent.
"""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

SCHEMA = "exam_intelligence_schema"


async def rollup_appearance_stats(
    session: AsyncSession, exam_id: str
) -> dict[str, int]:
    """Wipe + rebuild appearance_stats rows for this exam.

    Strategy: aggregate from past_questions where the paper is
    PUBLISHED or REVIEWED. DRAFT and TAGGED papers do not contribute
    to the forecast yet (their tags haven't been validated).
    """
    # Topic rollup. We pull topic_ids out of the JSONB tag column —
    # COALESCE so curated overrides NLP. A question with 2 topic_ids
    # contributes 1 question to each topic (the marks split equally).
    result = await session.execute(
        text(f"""
            WITH q AS (
                SELECT
                    p.exam_id,
                    p.year,
                    q.marks_correct,
                    q.irt_b_observed AS b_obs,
                    COALESCE(q.curated_tags, q.nlp_tags) AS tags
                  FROM {SCHEMA}.exam_past_questions q
                  JOIN {SCHEMA}.exam_past_papers p ON p.id = q.paper_id
                 WHERE p.exam_id = CAST(:eid AS uuid)
                   AND p.status IN ('REVIEWED', 'PUBLISHED')
                   AND COALESCE(q.curated_tags, q.nlp_tags) IS NOT NULL
            ),
            exploded AS (
                SELECT
                    exam_id, year, marks_correct, b_obs,
                    jsonb_array_elements_text(tags->'topic_ids') AS topic_id
                  FROM q
            )
            SELECT exam_id, CAST(topic_id AS uuid) AS topic_id, year,
                   COUNT(*) AS n_q,
                   SUM(marks_correct) AS marks,
                   AVG(b_obs) AS avg_b
              FROM exploded
             GROUP BY exam_id, topic_id, year
        """),
        {"eid": exam_id},
    )
    rows = result.mappings().all()

    # Wipe existing rollups for this exam.
    await session.execute(
        text(f"""
            DELETE FROM {SCHEMA}.topic_appearance_stats
             WHERE exam_id = CAST(:eid AS uuid)
        """),
        {"eid": exam_id},
    )

    for r in rows:
        await session.execute(
            text(f"""
                INSERT INTO {SCHEMA}.topic_appearance_stats
                    (exam_id, topic_id, year, n_questions, total_marks, avg_difficulty)
                VALUES (:eid, :tid, :y, :nq, :tm, :ab)
            """),
            {
                "eid": r["exam_id"],
                "tid": r["topic_id"],
                "y": r["year"],
                "nq": int(r["n_q"]),
                "tm": int(r["marks"]),
                "ab": float(r["avg_b"]) if r["avg_b"] is not None else None,
            },
        )

    return {"rolled_up_rows": len(rows)}
