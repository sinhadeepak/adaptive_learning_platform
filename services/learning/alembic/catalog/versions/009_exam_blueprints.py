"""Sprint 23 (P4-S23): exam_blueprints table + seed JEE Main + JEE
Advanced Paper 1 + Paper 2 blueprints.

Per ADR-0012 (exam-blueprint metadata + PYQ schema). Replaces the
hardcoded MOCK_BLUEPRINTS dict in adaptive/mock.py with real,
DB-backed exam patterns.

Section composition (the JSONB `sections` field) carries:
  - section_id: stable string key, used by the composer + by the UI
  - name: human-readable section label
  - subject_id: FK into catalog_schema.subjects (NULL when no subject
    mapping is needed — e.g., a generic "GS" section)
  - n_questions: count to draw from the candidate pool
  - n_minutes: per-section time budget (informational; section-locks
    enforced by the per_section_time_locked flag at the blueprint level)
  - difficulty_distribution: optional easy/medium/hard mix

JEE Main = 75 Q / 180 min / 3 sections (25 Phys / 25 Chem / 25 Math),
1/4 negative marking, inter-section navigation allowed.
JEE Advanced Paper 1 = 54 Q / 180 min / 3 sections.
JEE Advanced Paper 2 = 54 Q / 180 min / 3 sections.

The seeded blueprints assume the question bank can fill each section.
The composer (S23-B) handles short pools gracefully — Phase 4's content
workstream (W1) scales the bank to fill these papers fully.

Revision ID: 009
Revises: 008
Create Date: 2026-04-28
"""

from __future__ import annotations

import json
from collections.abc import Sequence

from alembic import op

revision: str = "009"
down_revision: str | None = "008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "catalog_schema"

JEE_MAIN_EXAM_ID = "11111111-0000-0000-0000-000000000001"
PHY_SUBJECT_ID = "22222222-0000-0000-0000-000000000001"
CHEM_SUBJECT_ID = "22222222-0000-0000-0000-000000000002"
MATH_SUBJECT_ID = "22222222-0000-0000-0000-000000000003"


def _section(section_id: str, name: str, subject_id: str, n: int, m: int) -> dict:
    return {
        "section_id": section_id,
        "name": name,
        "subject_id": subject_id,
        "n_questions": n,
        "n_minutes": m,
        "difficulty_distribution": {"easy": 0.30, "medium": 0.50, "hard": 0.20},
    }


def upgrade() -> None:
    op.execute(f"""
        CREATE TABLE {SCHEMA}.exam_blueprints (
            id UUID PRIMARY KEY,
            exam_id UUID NOT NULL REFERENCES {SCHEMA}.exams(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            total_questions INTEGER NOT NULL,
            total_minutes INTEGER NOT NULL,
            marks_correct INTEGER NOT NULL,
            marks_negative REAL NOT NULL DEFAULT 0,
            sections JSONB NOT NULL,
            inter_section_navigation BOOLEAN NOT NULL DEFAULT TRUE,
            per_section_time_locked BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CHECK (total_questions > 0),
            CHECK (total_minutes > 0)
        )
    """)
    op.execute(
        f"CREATE INDEX idx_exam_blueprints_exam ON {SCHEMA}.exam_blueprints (exam_id)"
    )

    # Seed JEE Main + JEE Advanced blueprints inline. UUIDs are deterministic
    # so the smoke test + Quiz Go sessions can reference them stably.
    blueprints: list[dict] = [
        {
            "id": "44444444-0000-0000-0000-000000000001",
            "exam_id": JEE_MAIN_EXAM_ID,
            "name": "JEE Main — Standard",
            "total_questions": 75,
            "total_minutes": 180,
            "marks_correct": 4,
            "marks_negative": -1.0,
            "sections": [
                _section("physics", "Physics", PHY_SUBJECT_ID, 25, 60),
                _section("chemistry", "Chemistry", CHEM_SUBJECT_ID, 25, 60),
                _section("maths", "Mathematics", MATH_SUBJECT_ID, 25, 60),
            ],
            "inter_section_navigation": True,
            "per_section_time_locked": False,
        },
        {
            "id": "44444444-0000-0000-0000-000000000002",
            "exam_id": JEE_MAIN_EXAM_ID,
            "name": "JEE Advanced — Paper 1",
            "total_questions": 54,
            "total_minutes": 180,
            "marks_correct": 4,
            "marks_negative": -1.0,
            "sections": [
                _section("physics", "Physics", PHY_SUBJECT_ID, 18, 60),
                _section("chemistry", "Chemistry", CHEM_SUBJECT_ID, 18, 60),
                _section("maths", "Mathematics", MATH_SUBJECT_ID, 18, 60),
            ],
            "inter_section_navigation": True,
            "per_section_time_locked": False,
        },
        {
            "id": "44444444-0000-0000-0000-000000000003",
            "exam_id": JEE_MAIN_EXAM_ID,
            "name": "JEE Advanced — Paper 2",
            "total_questions": 54,
            "total_minutes": 180,
            "marks_correct": 4,
            "marks_negative": -1.0,
            "sections": [
                _section("physics", "Physics", PHY_SUBJECT_ID, 18, 60),
                _section("chemistry", "Chemistry", CHEM_SUBJECT_ID, 18, 60),
                _section("maths", "Mathematics", MATH_SUBJECT_ID, 18, 60),
            ],
            "inter_section_navigation": True,
            "per_section_time_locked": False,
        },
    ]

    for bp in blueprints:
        sections_json = json.dumps(bp["sections"])
        op.execute(f"""
            INSERT INTO {SCHEMA}.exam_blueprints
              (id, exam_id, name, total_questions, total_minutes,
               marks_correct, marks_negative, sections,
               inter_section_navigation, per_section_time_locked)
            VALUES
              ('{bp["id"]}', '{bp["exam_id"]}', $${bp["name"]}$$,
               {bp["total_questions"]}, {bp["total_minutes"]},
               {bp["marks_correct"]}, {bp["marks_negative"]},
               $${sections_json}$$::jsonb,
               {bp["inter_section_navigation"]},
               {bp["per_section_time_locked"]})
            ON CONFLICT (id) DO NOTHING
        """)


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.exam_blueprints")
