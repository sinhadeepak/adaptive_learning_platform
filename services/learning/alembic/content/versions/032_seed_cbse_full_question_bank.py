"""Seed PUBLISHED MCQ questions for the full CBSE Class 8 + Class 9
NCERT syllabus (catalog migration 019). Five questions per topic
across all 8 subjects (Maths, Science, Social Science, English × 2
classes), totalling ~470 questions.

Source data lives in
``services/learning/src/learning/content/seed/cbse_class8_bank.py``
and ``cbse_class9_bank.py`` so the same dicts can be re-used by the
quiz mirror, the AI authoring eval harness, etc.

UUIDs are deterministic via uuid5 so re-running the migration is a
no-op once the rows exist; ``ON CONFLICT (id) DO NOTHING`` makes the
INSERT side safe and the namespace is distinct from migration 030's
CBSE namespace so we don't collide with the polymorphic seed.

Local-only: gated on ``CONTENT_SEED_LOCAL=1`` (matches 003 / 030).
Absent in staging / production where real questions land via the
authoring + review pipeline.

Revision ID: 032
Revises: 031
Create Date: 2026-05-03
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

revision: str = "032"
down_revision: str | None = "031"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"

# Same seed admin used by content migration 003 / 030.
SEED_ADMIN_ID = "00000000-0000-0000-0000-000000000004"

# Distinct from migration 030's CBSE namespace so there is no overlap
# with the existing 12-topic polymorphic CBSE seed.
NAMESPACE = uuid.UUID("a0000000-0000-4000-a000-000000000033")


def _question_id(topic_id: str, idx: int) -> str:
    return str(uuid.uuid5(NAMESPACE, f"cbse-full|{topic_id}|{idx}"))


def _import_seed_module(module_name: str):
    here = Path(__file__).resolve()
    seed_root = here.parent.parent.parent.parent / "src"
    if str(seed_root) not in sys.path:
        sys.path.insert(0, str(seed_root))
    return __import__(
        f"learning.content.seed.{module_name}", fromlist=[module_name]
    )


def _build_rows() -> list[dict[str, Any]]:
    c8 = _import_seed_module("cbse_class8_bank")
    c9 = _import_seed_module("cbse_class9_bank")

    rows: list[dict[str, Any]] = []
    for bank_module in (c8, c9):
        topic_ids: dict[str, str] = bank_module.TOPIC_IDS
        topic_questions: dict[str, list[tuple]] = bank_module.TOPIC_QUESTIONS

        for code, topic_uuid in topic_ids.items():
            qs = topic_questions.get(code)
            if not qs:
                raise RuntimeError(
                    f"CBSE seed: topic code {code!r} has no questions in "
                    f"{bank_module.__name__}.TOPIC_QUESTIONS"
                )
            for i, (stem, choices, correct_idx, difficulty_b) in enumerate(qs):
                idx = i + 1
                if not isinstance(choices, list) or len(choices) < 2:
                    raise RuntimeError(
                        f"CBSE seed: bad choices on {code} #{idx}"
                    )
                if not (0 <= correct_idx < len(choices)):
                    raise RuntimeError(
                        f"CBSE seed: correct_idx out of range on {code} #{idx}"
                    )
                rows.append(
                    {
                        "id": _question_id(topic_uuid, idx),
                        "topic_id": topic_uuid,
                        "stem": stem,
                        "choices": json.dumps(choices),
                        "correct_idx": int(correct_idx),
                        "difficulty_b": float(difficulty_b),
                        "language": "en",
                        "status": "PUBLISHED",
                        "created_by": SEED_ADMIN_ID,
                        "question_type": "MCQ_SINGLE",
                    }
                )
    return rows


def upgrade() -> None:
    if not os.environ.get("CONTENT_SEED_LOCAL"):
        return

    rows = _build_rows()
    chunk = 100
    for start in range(0, len(rows), chunk):
        batch = rows[start : start + chunk]
        values_sql = ", ".join(
            f"(CAST(:id_{i} AS uuid), CAST(:topic_{i} AS uuid), :stem_{i}, "
            f"CAST(:choices_{i} AS jsonb), :corr_{i}, :diff_{i}, :lang_{i}, "
            f":status_{i}, CAST(:by_{i} AS uuid), :type_{i})"
            for i in range(len(batch))
        )
        params: dict[str, Any] = {}
        for i, r in enumerate(batch):
            params[f"id_{i}"]      = r["id"]
            params[f"topic_{i}"]   = r["topic_id"]
            params[f"stem_{i}"]    = r["stem"]
            params[f"choices_{i}"] = r["choices"]
            params[f"corr_{i}"]    = r["correct_idx"]
            params[f"diff_{i}"]    = r["difficulty_b"]
            params[f"lang_{i}"]    = r["language"]
            params[f"status_{i}"]  = r["status"]
            params[f"by_{i}"]      = r["created_by"]
            params[f"type_{i}"]    = r["question_type"]
        op.execute(
            text(
                f"""
                INSERT INTO {SCHEMA}.questions
                  (id, topic_id, stem, choices, correct_idx, difficulty_b,
                   language, status, created_by, question_type)
                VALUES {values_sql}
                ON CONFLICT (id) DO NOTHING
                """
            ).bindparams(**params)
        )


def downgrade() -> None:
    if not os.environ.get("CONTENT_SEED_LOCAL"):
        return

    rows = _build_rows()
    chunk = 200
    for start in range(0, len(rows), chunk):
        batch = rows[start : start + chunk]
        ids_sql = ", ".join(f":id_{i}" for i in range(len(batch)))
        params = {f"id_{i}": r["id"] for i, r in enumerate(batch)}
        op.execute(
            text(
                f"DELETE FROM {SCHEMA}.questions WHERE id IN ({ids_sql})"
            ).bindparams(**params)
        )
