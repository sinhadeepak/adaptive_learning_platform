"""Phase 5 (P5-S37): per-exam question-type filter table.

Per ADR-0018 §"Per-exam type filter" + Question Catalogue §2.2 coverage
matrix. Authoring UI hides types not enabled for the author's exam.

Revision ID: 016
Revises: 015
Create Date: 2026-04-30
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "016"
down_revision: str | None = "015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "catalog_schema"

# Default coverage matrix per Question Catalogue §2.2.
# Maps each known exam to its enabled families. Per-type explosion happens
# inside upgrade() against the exam's actual id.
DEFAULT_FAMILY_SUPPORT = {
    "NEET": ["objective", "matching", "visual"],
    "JEE-MAIN": ["objective", "numeric", "visual"],
    "JEE-ADV": ["objective", "numeric", "visual"],
    "GATE": ["objective", "numeric", "subjective", "visual"],
    "UPSC": ["objective", "matching", "subjective", "visual"],
    "CBSE": ["objective", "numeric", "matching", "fill_in", "subjective", "visual", "audio_video"],
    "CAT": ["objective", "numeric", "matching", "fill_in", "subjective"],
    "KBC": ["objective", "visual", "interactive"],
}

FAMILY_TO_TYPES = {
    "objective": ["MCQ_SINGLE", "MCQ_MULTI", "TRUE_FALSE", "ASSERTION_REASON", "MULTI_STATEMENT"],
    "numeric": ["NUMERIC_INTEGER", "NUMERIC_DECIMAL", "NUMERIC_RANGE", "FORMULA_INPUT"],
    "matching": ["MATCH_THE_FOLLOWING", "SEQUENCING", "CLASSIFICATION"],
    "fill_in": ["FILL_BLANK_SINGLE", "FILL_BLANK_MULTI", "CLOZE_PASSAGE", "SHORT_TEXT"],
    "subjective": ["ESSAY", "DESCRIPTIVE_LONG", "CASE_STUDY", "COMPREHENSION_LONG"],
    "visual": ["DIAGRAM_HOTSPOT", "DIAGRAM_LABEL", "MAP_LOCATION", "PICTORIAL_IDENTIFY"],
    "audio_video": ["LISTENING_COMP", "VIDEO_QUESTION"],
    "interactive": ["KBC_LIFELINE", "TIMED_REVEAL", "ADAPTIVE_DIFFICULTY"],
}


def upgrade() -> None:
    op.execute(f"""
        CREATE TABLE {SCHEMA}.exam_question_type_support (
            exam_id     UUID NOT NULL REFERENCES {SCHEMA}.exams(id) ON DELETE CASCADE,
            type_id     TEXT NOT NULL,
            enabled     BOOLEAN NOT NULL DEFAULT TRUE,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (exam_id, type_id)
        )
    """)
    op.execute(
        f"CREATE INDEX idx_exam_qts_enabled "
        f"ON {SCHEMA}.exam_question_type_support (exam_id, enabled)"
    )

    # Seed defaults for any exam whose code matches DEFAULT_FAMILY_SUPPORT.
    # Unknown exams get no rows — authoring UI defaults to allowing all
    # types until an admin configures the support table.
    for exam_code, families in DEFAULT_FAMILY_SUPPORT.items():
        types_for_exam = [t for f in families for t in FAMILY_TO_TYPES[f]]
        for type_id in types_for_exam:
            op.execute(f"""
                INSERT INTO {SCHEMA}.exam_question_type_support (exam_id, type_id, enabled)
                SELECT e.id, '{type_id}', TRUE
                FROM {SCHEMA}.exams e
                WHERE e.code = '{exam_code}'
                ON CONFLICT (exam_id, type_id) DO NOTHING
            """)


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.exam_question_type_support")
