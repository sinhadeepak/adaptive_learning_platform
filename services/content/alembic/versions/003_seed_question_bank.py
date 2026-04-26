"""Seed 20 PUBLISHED questions per topic across every exam.

Drives the demo/local stack — the cascading dropdown on /questions/new
and the student-facing topic detail screens both look empty without a
populated question bank. With this migration applied, every topic the
catalog seed creates has 20 ready-to-serve MCQs.

Local-only: guarded by CONTENT_SEED_LOCAL=1 (set in docker-compose for
the content service). Absent in staging / production where real
authors create questions through the review pipeline.

Idempotent via deterministic question UUIDs (uuid5 over a stable
namespace + a topic_id/index pair). Re-running is a no-op once the
rows exist; ON CONFLICT (id) DO NOTHING handles the second pass.

All rows land as status='PUBLISHED' with created_by = the seed admin
(00000000-0000-0000-0000-000000000004). Skipping the DRAFT→REVIEW path
is intentional — these are demo data, not authored content.

Revision ID: 003
Revises: 002
Create Date: 2026-04-26
"""

from __future__ import annotations

import json
import os
import uuid
from collections.abc import Sequence
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

# Stable namespace for uuid5 — gives us deterministic question IDs so
# re-running this migration on a partially-seeded DB is a no-op.
QUESTION_NAMESPACE = uuid.UUID("a0000000-0000-4000-a000-000000000001")

QUESTIONS_PER_TOPIC = 20

# (topic_id, topic_title) — must match catalog migrations 002 + 007.
# Order chosen so the seeded ids in content roughly track exam order.
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

# Stem templates rotated across the 20 questions so each topic gets a
# variety of phrasing. {topic} is filled per row; {n} is the 1-based
# question index within the topic.
STEM_TEMPLATES = [
    "{topic} — Question {n}: Which of the following best describes the core principle?",
    "{topic} — Question {n}: Identify the correct statement.",
    "{topic} — Question {n}: Which option is NOT a feature of this concept?",
    "{topic} — Question {n}: What is the most accurate explanation?",
    "{topic} — Question {n}: Choose the correct answer.",
]

# Difficulty cycle (IRT b parameter) — covers easy → hard.
DIFFICULTY_CYCLE = [-1.5, -1.0, -0.5, 0.0, 0.5, 1.0, 1.5]


def _question_id(topic_id: str, idx: int) -> str:
    return str(uuid.uuid5(QUESTION_NAMESPACE, f"{topic_id}-{idx}"))


def _build_rows() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for topic_id, topic_title in TOPICS:
        for i in range(QUESTIONS_PER_TOPIC):
            n = i + 1
            stem = STEM_TEMPLATES[i % len(STEM_TEMPLATES)].format(
                topic=topic_title, n=n
            )
            choices = [
                f"{topic_title} — option A for Q{n}",
                f"{topic_title} — option B for Q{n}",
                f"{topic_title} — option C for Q{n}",
                f"{topic_title} — option D for Q{n}",
            ]
            rows.append(
                {
                    "id": _question_id(topic_id, n),
                    "topic_id": topic_id,
                    "stem": stem,
                    "choices": json.dumps(choices),
                    "correct_idx": i % 4,
                    "difficulty_b": DIFFICULTY_CYCLE[i % len(DIFFICULTY_CYCLE)],
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
