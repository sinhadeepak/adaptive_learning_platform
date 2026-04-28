"""Idempotent re-seed for the 480-row local question bank.

Why this exists: integration tests TRUNCATE content_schema.questions
between runs (they share the compose Postgres at port 35432). The seed
migration `003_seed_question_bank` only runs once; once recorded,
alembic won't re-execute it. This script imports the migration's pure
`_build_rows()` data builder and re-inserts via ON CONFLICT DO NOTHING.

Safe to run repeatedly: every INSERT keys on the deterministic UUID
the seed builder generates from (topic_id, question_index).
"""

from __future__ import annotations

import asyncio
import importlib.util
import json
import os
import sys
from pathlib import Path

import asyncpg


def _load_seed_module():
    """Import the migration file purely as a module so we can call
    `_build_rows()` without going through alembic's env."""
    here = Path(__file__).resolve().parent
    mig_path = here.parent / "alembic" / "versions" / "003_seed_question_bank.py"
    spec = importlib.util.spec_from_file_location("content_seed_003", mig_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load {mig_path}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules["content_seed_003"] = mod
    spec.loader.exec_module(mod)
    return mod


async def main() -> None:
    if not os.environ.get("CONTENT_SEED_LOCAL"):
        print("Refusing to seed without CONTENT_SEED_LOCAL=1 (production guard).")
        return

    seed = _load_seed_module()
    rows = seed._build_rows()

    conn = await asyncpg.connect(
        host="localhost",
        port=35432,
        user="postgres",
        password="postgres",  # noqa: S106
        database="content",
    )
    try:
        # Insert in chunks of 50 to stay well under the asyncpg parameter
        # limit (it caps at 32k params per query — 50 rows × 9 columns =
        # 450, plenty of headroom).
        chunk = 50
        for start in range(0, len(rows), chunk):
            batch = rows[start : start + chunk]
            values_sql = ", ".join(
                f"(${i*9+1}::uuid, ${i*9+2}::uuid, ${i*9+3}, ${i*9+4}::jsonb, "
                f"${i*9+5}, ${i*9+6}, ${i*9+7}, ${i*9+8}, ${i*9+9}::uuid)"
                for i in range(len(batch))
            )
            params: list = []
            for r in batch:
                params.extend(
                    [
                        r["id"],
                        r["topic_id"],
                        r["stem"],
                        json.dumps(r["choices"]),
                        r["correct_idx"],
                        r["difficulty_b"],
                        r["language"],
                        r["status"],
                        r["created_by"],
                    ]
                )
            await conn.execute(
                f"""
                INSERT INTO content_schema.questions (
                  id, topic_id, stem, choices, correct_idx, difficulty_b,
                  language, status, created_by
                ) VALUES {values_sql}
                ON CONFLICT (id) DO NOTHING
                """,
                *params,
            )
        n = await conn.fetchval("SELECT COUNT(*) FROM content_schema.questions")
        print(f"content_schema.questions → {n} rows")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
