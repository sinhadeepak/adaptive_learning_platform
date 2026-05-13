"""Backfill analytics_schema.session_item_outcomes for the seeded sessions.

After bulk-seeding quiz_session_items, the per-item outcomes table is
empty for our 1700+ new sessions. confidence_gap and other primitives
read primary_concept_id from this table — without it, concept-level
breakdowns are blank.

For seed purposes we use concept_id = topic_id (topic-as-concept identity).
"""

from __future__ import annotations

import asyncio
import logging
import uuid

import asyncpg

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger("backfill")


async def main() -> None:
    quiz = await asyncpg.connect(
        host="postgres", user="postgres", password="postgres", database="quiz",
    )
    eng = await asyncpg.connect(
        host="postgres", user="postgres", password="postgres", database="engagement",
    )
    try:
        rows = await quiz.fetch(
            """
            SELECT i.session_id, i.item_idx, s.user_id, i.question_id,
                   s.topic_id AS primary_concept_id,
                   COALESCE(i.is_correct, false) AS is_correct,
                   i.time_spent_ms
              FROM quiz_schema.quiz_session_items i
              JOIN quiz_schema.quiz_sessions s ON s.id = i.session_id
             WHERE s.status = 'SUBMITTED'
            """
        )
        log.info("loaded %d submitted-session items", len(rows))
        before = await eng.fetchval("SELECT COUNT(*) FROM analytics_schema.session_item_outcomes")

        # Bulk insert in batches.
        BATCH = 5000
        for i in range(0, len(rows), BATCH):
            batch = rows[i:i + BATCH]
            payload = [
                (
                    r["session_id"], int(r["item_idx"]), r["user_id"],
                    r["question_id"], r["primary_concept_id"],
                    1, bool(r["is_correct"]),
                    r["time_spent_ms"],
                )
                for r in batch
            ]
            await eng.executemany(
                """
                INSERT INTO analytics_schema.session_item_outcomes
                  (session_id, item_idx, user_id, question_id,
                   primary_concept_id, concept_tag_count, is_correct, time_spent_ms)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (session_id, item_idx) DO NOTHING
                """,
                payload,
            )
            log.info("  batch %d: %d rows", i // BATCH + 1, len(batch))
        after = await eng.fetchval("SELECT COUNT(*) FROM analytics_schema.session_item_outcomes")
        log.info("session_item_outcomes: %d -> %d", before, after)
    finally:
        await quiz.close()
        await eng.close()


if __name__ == "__main__":
    asyncio.run(main())
