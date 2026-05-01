"""Seed 100 UPSC questions per active question type — 24 types × 100 = 2,400 rows.

Local-only seed (gated by CONTENT_SEED_LOCAL=1, same convention as
migrations 003 and 007). Idempotent via deterministic uuid5 over
(type_id, topic_id, idx). Re-running produces no diff.

Drives end-to-end testing of the Phase 5 polymorphic engine on UPSC
content: the multi-type author UI, polymorphic student renderers,
type-aware grading, multi-parameter mastery roll-ups, and the
calibration / cultural / human-grader flows can all exercise real
UPSC stems instead of synthetic Lorem-ipsum payloads.

Content lives in
  services/learning/src/learning/content/seed/upsc_polymorphic.py
to keep this migration thin and the bank inspectable from tests.

Revision ID: 019
Revises: 018
Create Date: 2026-05-01
"""

from __future__ import annotations

import json
import os
import sys
import uuid
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from alembic import op
from sqlalchemy import text

revision: str = "019"
down_revision: str | None = "018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"

# Same SEED_ADMIN as migration 003 — keeps audit trail consistent.
SEED_ADMIN_ID = "00000000-0000-0000-0000-000000000004"

# Distinct uuid5 namespace from the v1 (migration 003) MCQ bank, so
# the polymorphic seed coexists with the original 480 MCQs without
# id collisions.
QUESTION_NAMESPACE = uuid.UUID("a0000000-0000-4000-a000-000000000019")


def _question_id(type_id: str, topic_id: str, idx: int) -> str:
    return str(uuid.uuid5(QUESTION_NAMESPACE, f"{type_id}|{topic_id}|{idx}"))


def _load_bank() -> list[dict[str, Any]]:
    """Import the seed module from the alembic context. The service
    root isn't on sys.path during migrations, so add it explicitly."""
    here = Path(__file__).resolve()
    seed_dir = here.parent.parent.parent.parent / "src" / "learning" / "content" / "seed"
    if str(seed_dir) not in sys.path:
        sys.path.insert(0, str(seed_dir))
    import upsc_polymorphic  # type: ignore[import-not-found]

    return upsc_polymorphic.all_questions()


def upgrade() -> None:
    if not os.environ.get("CONTENT_SEED_LOCAL"):
        return

    rows = _load_bank()

    # Insert in chunks of 50 to keep each statement small.
    chunk = 50
    for start in range(0, len(rows), chunk):
        batch = rows[start : start + chunk]
        values_sql = ", ".join(
            f"(CAST(:id_{i} AS uuid), CAST(:topic_{i} AS uuid), :stem_{i}, "
            f"CAST(:choices_{i} AS jsonb), :corr_{i}, :diff_{i}, :lang_{i}, "
            f":status_{i}, CAST(:by_{i} AS uuid), :type_{i}, "
            f"CAST(:payload_{i} AS jsonb))"
            for i in range(len(batch))
        )
        params: dict[str, Any] = {}
        for i, r in enumerate(batch):
            qid = _question_id(r["type_id"], r["topic_id"], r["idx"])
            params[f"id_{i}"]      = qid
            params[f"topic_{i}"]   = r["topic_id"]
            params[f"stem_{i}"]    = r["stem"]
            params[f"choices_{i}"] = json.dumps(r["choices"])
            params[f"corr_{i}"]    = int(r["correct_idx"])
            params[f"diff_{i}"]    = float(r["difficulty_b"])
            params[f"lang_{i}"]    = "en"
            params[f"status_{i}"]  = "PUBLISHED"
            params[f"by_{i}"]      = SEED_ADMIN_ID
            params[f"type_{i}"]    = r["type_id"]
            params[f"payload_{i}"] = (
                json.dumps(r["payload"]) if r["payload"] is not None else None
            )
        op.execute(
            text(
                f"""
                INSERT INTO {SCHEMA}.questions
                  (id, topic_id, stem, choices, correct_idx, difficulty_b,
                   language, status, created_by, question_type, payload)
                VALUES {values_sql}
                ON CONFLICT (id) DO NOTHING
                """
            ).bindparams(**params)
        )


def downgrade() -> None:
    if not os.environ.get("CONTENT_SEED_LOCAL"):
        return

    rows = _load_bank()
    seed_ids = [_question_id(r["type_id"], r["topic_id"], r["idx"]) for r in rows]

    chunk = 200
    for start in range(0, len(seed_ids), chunk):
        batch = seed_ids[start : start + chunk]
        ids_sql = ", ".join(f":id_{i}" for i in range(len(batch)))
        params = {f"id_{i}": v for i, v in enumerate(batch)}
        op.execute(
            text(
                f"DELETE FROM {SCHEMA}.questions WHERE id IN ({ids_sql})"
            ).bindparams(**params)
        )
