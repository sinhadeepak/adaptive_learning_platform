"""Restore the local 480-row Content question bank with real exam-prep data.

Why this exists: integration tests TRUNCATE content_schema.questions
between runs, and the seed migration `003_seed_question_bank` only
runs once (alembic_version locks it). This script imports the
migration's pure `_build_rows()` data builder (which itself reads from
`services/content/seed/question_bank.py`, the single source of truth
shared with Quiz) and reapplies the rows.

Strategy: UPDATE in place keyed on the deterministic uuid5 id so
existing rows keep their primary key. `assignment_questions.question_id`
has an FK to `questions.id` — a DELETE+INSERT would either fail
outright or silently break any assignment already pointing at a
seeded row. UPDATE preserves those references while overwriting the
templated dummy content with real questions/choices.

Idempotent: re-running rewrites the same fields with the same values.
INSERT path is reserved for fresh DBs where the row doesn't exist yet.
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
    `_build_rows()` without going through alembic's env.

    Post-ADR-0005 consolidation, alembic versions for the content
    schema live at services/learning/alembic/content/versions/.
    From this file (services/learning/src/learning/content/scripts/),
    that's six parents up + alembic/content/versions/.
    """
    here = Path(__file__).resolve().parent
    # …/learning/src/learning/content/scripts → …/learning
    service_root = here.parent.parent.parent.parent
    mig_path = (
        service_root / "alembic" / "content" / "versions"
        / "003_seed_question_bank.py"
    )
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
        database="learning",
    )
    updated = 0
    inserted = 0
    try:
        for r in rows:
            choices_json = json.dumps(r["choices"])
            tag = await conn.execute(
                """
                UPDATE content_schema.questions
                   SET stem = $1,
                       choices = $2::jsonb,
                       correct_idx = $3,
                       difficulty_b = $4,
                       language = $5,
                       status = $6
                 WHERE id = $7::uuid
                """,
                r["stem"],
                choices_json,
                r["correct_idx"],
                r["difficulty_b"],
                r["language"],
                r["status"],
                r["id"],
            )
            if tag.endswith(" 0"):
                # Fresh DB or different seed generation — INSERT.
                await conn.execute(
                    """
                    INSERT INTO content_schema.questions (
                      id, topic_id, stem, choices, correct_idx, difficulty_b,
                      language, status, created_by
                    ) VALUES (
                      $1::uuid, $2::uuid, $3, $4::jsonb, $5, $6, $7, $8, $9::uuid
                    )
                    ON CONFLICT (id) DO NOTHING
                    """,
                    r["id"],
                    r["topic_id"],
                    r["stem"],
                    choices_json,
                    r["correct_idx"],
                    r["difficulty_b"],
                    r["language"],
                    r["status"],
                    r["created_by"],
                )
                inserted += 1
            else:
                updated += 1

        n = await conn.fetchval("SELECT COUNT(*) FROM content_schema.questions")
        print(
            f"content_schema.questions → updated {updated}, inserted {inserted}, "
            f"total rows: {n}"
        )
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
