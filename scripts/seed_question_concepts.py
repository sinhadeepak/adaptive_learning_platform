"""Bulk-tag every PUBLISHED question with concept_id = topic_id ('primary' role).

Cross-DB: questions live in quiz, question_concepts in learning. We do
two simple SELECT/INSERTs (asyncpg) instead of dblink.

Idempotent: ON CONFLICT DO NOTHING.
"""

from __future__ import annotations

import asyncio
import logging

import asyncpg

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger("seed-qc")


async def main() -> None:
    quiz = await asyncpg.connect(
        host="postgres", port=5432, user="postgres", password="postgres", database="quiz",
    )
    learning = await asyncpg.connect(
        host="postgres", port=5432, user="postgres", password="postgres", database="learning",
    )
    try:
        # Use content_schema.questions (in learning DB) as the source of
        # truth — content_schema is what the FK references and it already
        # mirrors the quiz catalog.
        rows = await learning.fetch(
            "SELECT id, topic_id FROM content_schema.questions"
        )
        log.info("Found %d questions in learning content_schema", len(rows))

        before = await learning.fetchval(
            "SELECT COUNT(*) FROM content_schema.question_concepts WHERE role = 'primary'"
        )
        # Bulk-insert in batches of 5000.
        batch_size = 5000
        for i in range(0, len(rows), batch_size):
            batch = rows[i:i + batch_size]
            values = [(r["id"], r["topic_id"]) for r in batch]
            await learning.executemany(
                """
                INSERT INTO content_schema.question_concepts
                  (question_id, concept_id, role)
                VALUES ($1, $2, 'primary')
                ON CONFLICT DO NOTHING
                """,
                values,
            )
            log.info("  inserted batch %d (%d so far)", i // batch_size + 1, i + len(batch))
        after = await learning.fetchval(
            "SELECT COUNT(*) FROM content_schema.question_concepts WHERE role = 'primary'"
        )
        log.info("primary concept tags: %d -> %d", before, after)
    finally:
        await quiz.close()
        await learning.close()


if __name__ == "__main__":
    asyncio.run(main())
