"""Split combined "CBSE (Class 8-9)" exam into Class 8 + Class 9.

Per ADR-0025. Migration 017 introduced one CBSE row keyed at
`11111111-…-005` carrying both grades; migrations 019 + 020 layered
their subjects on top. After full-syllabus seeding (migration 034
content-side), the dashboard mixes Class 8 and Class 9 readiness in
one ring, which masks per-grade signal.

This migration adds two new exams (CBSE_8, CBSE_9), re-points existing
subjects by their `C8_*` / `C9_*` code prefix, and hides the legacy
row from `/catalog/exams` by flipping `is_published = FALSE`. The
legacy row stays around so analytics rows / mastery rows / blueprints
still resolve their FK.

Companion migration: identity profile_schema 011_split_cbse_exam_selections
which rebinds users from legacy → CBSE_9 (preserves target_date).

Idempotent — safe to re-run. INSERTs use ON CONFLICT DO NOTHING; the
UPDATE statements are write-once-per-row by the WHERE predicate.

Revision ID: 021
Revises: 020
Create Date: 2026-05-04
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "021"
down_revision: str | None = "020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "catalog_schema"

# Exam IDs.
LEGACY_CBSE_ID = "11111111-0000-0000-0000-000000000005"
CBSE_8_ID      = "11111111-0000-0000-0000-000000000007"
CBSE_9_ID      = "11111111-0000-0000-0000-000000000008"


def upgrade() -> None:
    # 1. Insert the two new exam rows. sort_order keeps them grouped
    #    next to the legacy CBSE row in the catalog ordering.
    op.execute(
        f"""
        INSERT INTO {SCHEMA}.exams (id, code, name, subtitle, sort_order, is_published)
        VALUES
          ('{CBSE_8_ID}', 'CBSE_8', 'CBSE (Class 8)',
           'NCERT Class 8 — Science, Maths, Social Science, English, Hindi, Sanskrit',
           5, TRUE),
          ('{CBSE_9_ID}', 'CBSE_9', 'CBSE (Class 9)',
           'NCERT Class 9 — Science, Maths, Social Science, English, Hindi, Sanskrit',
           6, TRUE)
        ON CONFLICT (id) DO NOTHING
        """
    )

    # 2. Re-point Class 8 subjects (codes start with C8_) to CBSE_8.
    #    The escaped underscore matches a literal `_` in LIKE; without
    #    it Postgres would treat `_` as "any char" and could grab
    #    cross-grade rows that happen to have an underscore early.
    op.execute(
        f"""
        UPDATE {SCHEMA}.subjects
           SET exam_id = '{CBSE_8_ID}'
         WHERE exam_id = '{LEGACY_CBSE_ID}'
           AND code LIKE 'C8\\_%' ESCAPE '\\'
        """
    )

    # 3. Re-point Class 9 subjects (codes start with C9_) to CBSE_9.
    op.execute(
        f"""
        UPDATE {SCHEMA}.subjects
           SET exam_id = '{CBSE_9_ID}'
         WHERE exam_id = '{LEGACY_CBSE_ID}'
           AND code LIKE 'C9\\_%' ESCAPE '\\'
        """
    )

    # 4. Hide legacy row from /catalog/exams. The list query already
    #    filters on `is_published = TRUE`, so this single UPDATE is
    #    enough to drop it from every picker. Renaming clarifies the
    #    row's status if an admin queries the table directly.
    op.execute(
        f"""
        UPDATE {SCHEMA}.exams
           SET is_published = FALSE,
               name = 'CBSE (Class 8-9, legacy)'
         WHERE id = '{LEGACY_CBSE_ID}'
        """
    )

    # 5. Mirror exam_question_type_support so the new exams accept the
    #    same question types as legacy. Without this, polymorphic seeds
    #    can't render against either new exam. CONFLICT DO NOTHING
    #    keeps the migration idempotent.
    op.execute(
        f"""
        INSERT INTO {SCHEMA}.exam_question_type_support (exam_id, type_id, enabled)
        SELECT CAST('{CBSE_8_ID}' AS uuid), type_id, enabled
          FROM {SCHEMA}.exam_question_type_support
         WHERE exam_id = '{LEGACY_CBSE_ID}'
        ON CONFLICT (exam_id, type_id) DO NOTHING
        """
    )
    op.execute(
        f"""
        INSERT INTO {SCHEMA}.exam_question_type_support (exam_id, type_id, enabled)
        SELECT CAST('{CBSE_9_ID}' AS uuid), type_id, enabled
          FROM {SCHEMA}.exam_question_type_support
         WHERE exam_id = '{LEGACY_CBSE_ID}'
        ON CONFLICT (exam_id, type_id) DO NOTHING
        """
    )


def downgrade() -> None:
    # Reverse the 5 steps in inverse order so each rollback is well-defined.
    op.execute(
        f"DELETE FROM {SCHEMA}.exam_question_type_support "
        f"WHERE exam_id IN ('{CBSE_8_ID}', '{CBSE_9_ID}')"
    )
    op.execute(
        f"UPDATE {SCHEMA}.exams "
        f"   SET is_published = TRUE, name = 'CBSE (Class 8-9)' "
        f" WHERE id = '{LEGACY_CBSE_ID}'"
    )
    op.execute(
        f"UPDATE {SCHEMA}.subjects "
        f"   SET exam_id = '{LEGACY_CBSE_ID}' "
        f" WHERE exam_id IN ('{CBSE_8_ID}', '{CBSE_9_ID}')"
    )
    op.execute(
        f"DELETE FROM {SCHEMA}.exams WHERE id IN ('{CBSE_8_ID}', '{CBSE_9_ID}')"
    )
