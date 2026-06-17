"""Phase 5 (P5-S37): question_type discriminator + payload + cognitive_demand + ai_origin.

Per ADR-0018. Extends content_schema.questions with the polymorphic
type substrate. All 480 existing rows backfill to question_type='MCQ_SINGLE';
their existing `choices` + `correct_idx` columns continue to back the
MCQ_SINGLE handler's evaluate() path. New `payload` JSONB stays NULL
for MCQ; non-MCQ types use it from S38 onwards.

Revision ID: 008
Revises: 007
Create Date: 2026-04-30
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "008"
down_revision: str | None = "007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"

ALL_TYPE_IDS = (
    # Objective
    "MCQ_SINGLE", "MCQ_MULTI", "TRUE_FALSE", "ASSERTION_REASON", "MULTI_STATEMENT",
    # Numeric
    "NUMERIC_INTEGER", "NUMERIC_DECIMAL", "NUMERIC_RANGE", "FORMULA_INPUT",
    # Matching
    "MATCH_THE_FOLLOWING", "SEQUENCING", "CLASSIFICATION",
    # Fill-in
    "FILL_BLANK_SINGLE", "FILL_BLANK_MULTI", "CLOZE_PASSAGE", "SHORT_TEXT",
    # Subjective
    "ESSAY", "DESCRIPTIVE_LONG", "CASE_STUDY", "COMPREHENSION_LONG",
    # Visual
    "DIAGRAM_HOTSPOT", "DIAGRAM_LABEL", "MAP_LOCATION", "PICTORIAL_IDENTIFY",
    # Audio/Video (gated)
    "LISTENING_COMP", "VIDEO_QUESTION",
    # Interactive (gated)
    "KBC_LIFELINE", "TIMED_REVEAL", "ADAPTIVE_DIFFICULTY",
)


def upgrade() -> None:
    type_check_list = ", ".join(f"'{t}'" for t in ALL_TYPE_IDS)
    op.execute(f"""
        ALTER TABLE {SCHEMA}.questions
            ADD COLUMN question_type        TEXT NOT NULL DEFAULT 'MCQ_SINGLE',
            ADD COLUMN payload              JSONB NULL,
            ADD COLUMN cognitive_demand     JSONB NULL,
            ADD COLUMN procedural_steps_json JSONB NULL,
            ADD COLUMN ai_origin            JSONB NULL,
            ADD CONSTRAINT chk_question_type
                CHECK (question_type IN ({type_check_list}))
    """)
    op.execute(
        f"CREATE INDEX idx_questions_question_type "
        f"ON {SCHEMA}.questions (question_type)"
    )

    # Backfill — all 480 existing rows are MCQ_SINGLE.
    op.execute(f"""
        UPDATE {SCHEMA}.questions
        SET question_type = 'MCQ_SINGLE'
        WHERE question_type IS NULL OR question_type = ''
    """)


def downgrade() -> None:
    op.execute(f"DROP INDEX IF EXISTS {SCHEMA}.idx_questions_question_type")
    op.execute(f"""
        ALTER TABLE {SCHEMA}.questions
            DROP CONSTRAINT IF EXISTS chk_question_type,
            DROP COLUMN IF EXISTS question_type,
            DROP COLUMN IF EXISTS payload,
            DROP COLUMN IF EXISTS cognitive_demand,
            DROP COLUMN IF EXISTS procedural_steps_json,
            DROP COLUMN IF EXISTS ai_origin
    """)
