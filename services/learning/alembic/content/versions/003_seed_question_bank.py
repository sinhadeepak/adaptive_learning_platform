"""Seed 20 PUBLISHED questions per topic across every exam — REAL
exam-prep questions (not templated dummies).

Drives the demo/local stack — the cascading dropdown on /questions/new
and the student-facing topic detail screens both look empty without a
populated question bank. Question content lives in
`services/content/seed/question_bank.py` so both Content (here) and
Quiz (services/quiz/migrations/004_seed_full_question_bank.up.sql via
the python-side build script) consume the same source.

Local-only: guarded by CONTENT_SEED_LOCAL=1 (set in docker-compose for
the content service). Absent in staging / production where real
authors create questions through the review pipeline.

Idempotent via deterministic question UUIDs (uuid5 over a stable
namespace + (topic_id, 1-based index)). Re-running is a no-op once the
rows exist; ON CONFLICT (id) DO NOTHING handles the second pass. The
namespace was BUMPED for the v2 (real-content) bank so the UUIDs are
distinct from the v1 dummy data — `make seed-restore` will insert the
new rows alongside any old dummy rows still present, but
restore_seed.py wipes first to keep the local stack clean.

All rows land as status='PUBLISHED' with created_by = the seed admin
(00000000-0000-0000-0000-000000000004).

Revision ID: 003
Revises: 002
Create Date: 2026-04-26 (refreshed with real content 2026-04-28)
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

revision: str = "003"
down_revision: str | None = "002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"

# Seeded admin from auth migration 005 — used as created_by so the
# seed questions show a sensible audit trail.
SEED_ADMIN_ID = "00000000-0000-0000-0000-000000000004"

# Stable namespace for uuid5. Kept on v1 so existing rows in long-lived
# local DBs (which were inserted with this namespace when the seed was
# templated dummy content) are matched by id and UPDATED in place by
# scripts/restore_seed.py — `assignment_questions` has an FK to
# `questions.id`, so deleting+reinserting at a new namespace would break
# any assignment that already references a seeded row.
QUESTION_NAMESPACE = uuid.UUID("a0000000-0000-4000-a000-000000000001")

QUESTIONS_PER_TOPIC = 20

# (topic_id, topic_title) — must match catalog migrations 002 + 007 AND
# the keys in services/content/seed/question_bank.py::TOPIC_QUESTIONS.
TOPICS: list[tuple[str, str]] = [
    # JEE Main (catalog 002)
    ("33333333-0000-0000-0000-000000000001", "Mechanics"),
    ("33333333-0000-0000-0000-000000000002", "Thermodynamics"),
    ("33333333-0000-0000-0000-000000000003", "Electrostatics"),
    ("33333333-0000-0000-0000-000000000004", "Physical Chemistry"),
    ("33333333-0000-0000-0000-000000000005", "Organic Chemistry"),
    ("33333333-0000-0000-0000-000000000006", "Calculus"),
    ("33333333-0000-0000-0000-000000000007", "Coordinate Geometry"),
    # NEET (catalog 002 + 007)
    ("33333333-0000-0000-0000-000000000008", "Cell Biology"),
    ("33333333-0000-0000-0000-000000000009", "Genetics"),
    ("33333333-0000-0000-0000-000000000010", "Mechanics & Waves"),
    ("33333333-0000-0000-0000-000000000011", "Optics"),
    ("33333333-0000-0000-0000-000000000012", "Inorganic Chemistry"),
    ("33333333-0000-0000-0000-000000000013", "Organic Chemistry (NEET)"),
    # UPSC_CSE (catalog 007)
    ("33333333-0000-0000-0000-000000000014", "Indian Constitution"),
    ("33333333-0000-0000-0000-000000000015", "Governance"),
    ("33333333-0000-0000-0000-000000000016", "Ancient India"),
    ("33333333-0000-0000-0000-000000000017", "Modern India"),
    ("33333333-0000-0000-0000-000000000018", "Physical Geography"),
    ("33333333-0000-0000-0000-000000000019", "Indian Geography"),
    # CAT (catalog 007)
    ("33333333-0000-0000-0000-000000000020", "Arithmetic"),
    ("33333333-0000-0000-0000-000000000021", "Algebra"),
    ("33333333-0000-0000-0000-000000000022", "Reading Comprehension"),
    ("33333333-0000-0000-0000-000000000023", "Grammar & Vocabulary"),
    ("33333333-0000-0000-0000-000000000024", "Data Interpretation"),
]


def _question_id(topic_id: str, idx: int) -> str:
    return str(uuid.uuid5(QUESTION_NAMESPACE, f"{topic_id}-{idx}"))


def _load_question_bank() -> dict[str, list[dict[str, Any]]]:
    """Import services/content/seed/question_bank.py from the migration
    context. Alembic doesn't add the service root to sys.path, so we
    insert it manually relative to this file."""
    here = Path(__file__).resolve()
    seed_dir = here.parent.parent.parent.parent / "src" / "learning" / "content" / "seed"
    if str(seed_dir) not in sys.path:
        sys.path.insert(0, str(seed_dir))
    import question_bank  # type: ignore[import-not-found]

    return question_bank.TOPIC_QUESTIONS


def _build_rows() -> list[dict[str, Any]]:
    bank = _load_question_bank()
    rows: list[dict[str, Any]] = []
    for topic_id, topic_title in TOPICS:
        if topic_title not in bank:
            raise RuntimeError(
                f"Topic {topic_title!r} missing from question_bank.TOPIC_QUESTIONS"
            )
        questions = bank[topic_title]
        if len(questions) != QUESTIONS_PER_TOPIC:
            raise RuntimeError(
                f"Topic {topic_title!r} has {len(questions)} questions; "
                f"expected exactly {QUESTIONS_PER_TOPIC}"
            )
        for i, q in enumerate(questions):
            n = i + 1
            rows.append(
                {
                    "id": _question_id(topic_id, n),
                    "topic_id": topic_id,
                    "stem": q["stem"],
                    "choices": json.dumps(q["choices"]),
                    "correct_idx": int(q["correct_idx"]),
                    "difficulty_b": float(q["difficulty_b"]),
                    "language": "en",
                    "status": "PUBLISHED",
                    "created_by": SEED_ADMIN_ID,
                }
            )
    return rows


def upgrade() -> None:
    if not os.environ.get("CONTENT_SEED_LOCAL"):
        return

    rows = _build_rows()
    # Bulk insert in chunks of 100 to keep one statement quick. The
    # ON CONFLICT (id) DO NOTHING makes the migration safe to re-run.
    chunk = 100
    for start in range(0, len(rows), chunk):
        batch = rows[start : start + chunk]
        values_sql = ", ".join(
            f"(CAST(:id_{i} AS uuid), CAST(:topic_{i} AS uuid), :stem_{i}, "
            f"CAST(:choices_{i} AS jsonb), :corr_{i}, :diff_{i}, :lang_{i}, "
            f":status_{i}, CAST(:by_{i} AS uuid))"
            for i in range(len(batch))
        )
        params: dict[str, Any] = {}
        for i, r in enumerate(batch):
            params[f"id_{i}"] = r["id"]
            params[f"topic_{i}"] = r["topic_id"]
            params[f"stem_{i}"] = r["stem"]
            params[f"choices_{i}"] = r["choices"]
            params[f"corr_{i}"] = r["correct_idx"]
            params[f"diff_{i}"] = r["difficulty_b"]
            params[f"lang_{i}"] = r["language"]
            params[f"status_{i}"] = r["status"]
            params[f"by_{i}"] = r["created_by"]
        op.execute(
            text(
                f"""
                INSERT INTO {SCHEMA}.questions
                  (id, topic_id, stem, choices, correct_idx, difficulty_b,
                   language, status, created_by)
                VALUES {values_sql}
                ON CONFLICT (id) DO NOTHING
                """
            ).bindparams(**params)
        )


def downgrade() -> None:
    if not os.environ.get("CONTENT_SEED_LOCAL"):
        return

    seed_ids = [
        _question_id(t_id, n)
        for t_id, _ in TOPICS
        for n in range(1, QUESTIONS_PER_TOPIC + 1)
    ]
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
