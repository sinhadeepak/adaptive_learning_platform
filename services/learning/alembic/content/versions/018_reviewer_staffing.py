"""Phase 5 (P5-S63): per-language reviewer staffing tracker.

Per AIM §4.5 — Hindi panel of 6, Tamil/Telugu/Bengali/Marathi mix of
internal + freelance, etc. Operations needs this surfaced so reviewer
panels can be scaled when queue depth changes.

Tracks: per-language reviewer count, SLA target, current depth,
recent SLA breach count. The route layer aggregates against the
existing content_artifact_translations + cultural-flags rows; this
table is the operator-facing config.

Revision ID: 018
Revises: 017
Create Date: 2026-04-30
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "018"
down_revision: str | None = "017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"


def upgrade() -> None:
    op.execute(f"""
        CREATE TABLE {SCHEMA}.reviewer_staffing (
            language               TEXT PRIMARY KEY,
            reviewer_count         INT  NOT NULL CHECK (reviewer_count >= 0),
            sla_first_review_hours INT  NOT NULL,
            sla_resolution_hours   INT  NOT NULL,
            cultural_sla_hours     INT  NOT NULL DEFAULT 120,
            staffing_model         TEXT NOT NULL CHECK (staffing_model IN (
                'internal_panel', 'mix_internal_freelance', 'external_agency'
            )),
            notes                  TEXT,
            updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    # Seed defaults per AIM §4.5.
    op.execute(f"""
        INSERT INTO {SCHEMA}.reviewer_staffing
          (language, reviewer_count, sla_first_review_hours,
           sla_resolution_hours, cultural_sla_hours, staffing_model)
        VALUES
          ('hi',  6, 24, 48,  120, 'internal_panel'),
          ('ta',  3, 48, 96,  120, 'mix_internal_freelance'),
          ('te',  3, 48, 96,  120, 'mix_internal_freelance'),
          ('bn',  3, 48, 96,  120, 'mix_internal_freelance'),
          ('mr',  3, 48, 96,  120, 'mix_internal_freelance')
        ON CONFLICT (language) DO NOTHING
    """)


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.reviewer_staffing")
