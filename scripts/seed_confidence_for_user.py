"""Seed confidence ratings for a single user (default: student@alp.dev)."""
import asyncio
import random
import sys
import uuid

import asyncpg


async def main(user_id: str) -> None:
    quiz = await asyncpg.connect(
        host="postgres", user="postgres", password="postgres", database="quiz",
    )
    eng = await asyncpg.connect(
        host="postgres", user="postgres", password="postgres", database="engagement",
    )
    rows = await quiz.fetch(
        """
        SELECT i.question_id, i.is_correct
          FROM quiz_schema.quiz_session_items i
          JOIN quiz_schema.quiz_sessions s ON s.id = i.session_id
         WHERE s.user_id = $1 AND i.answered_at IS NOT NULL
         LIMIT 60
        """,
        uuid.UUID(user_id),
    )
    rng = random.Random(42)
    inserted = 0
    for r in rows:
        actual = bool(r["is_correct"])
        pred = max(0.0, min(1.0, (1.0 if actual else 0.6) + rng.uniform(-0.15, 0.15)))
        await eng.execute(
            """
            INSERT INTO analytics_schema.confidence_calibration
              (user_id, question_id, predicted_correct, actual_correct)
            VALUES ($1, $2, $3, $4)
            """,
            uuid.UUID(user_id), r["question_id"], pred, actual,
        )
        inserted += 1
    print(f"inserted {inserted} confidence ratings for {user_id}")
    await quiz.close()
    await eng.close()


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "00000000-0000-0000-0000-000000000001"))
