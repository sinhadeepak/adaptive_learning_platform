"""daily_missions — Phase 6 S50.

One row per (user_id, mission_date). Mission card on Home reads;
engagement consumer writes status='completed' when the linked
session passes quality gates.

Revision ID: 026
Revises: 025
Create Date: 2026-05-02
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "026"
down_revision: str | None = "025"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"


def upgrade() -> None:
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.daily_missions (
            id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id                  UUID NOT NULL,
            mission_date             DATE NOT NULL,
            kind                     TEXT NOT NULL
                CHECK (kind IN ('refresh_decay','weak_concept_drill',
                                'bloom_lift','revision_set','mock_segment')),
            concept_id               UUID NULL,
            topic_id                 UUID NULL,
            expected_minutes         INT NOT NULL,
            expected_questions       INT NOT NULL,
            why_picked               TEXT NOT NULL,
            why_picked_source        TEXT NOT NULL DEFAULT 'heuristic'
                CHECK (why_picked_source IN ('heuristic','ai')),
            primary_cta              JSONB NOT NULL,
            plan_session_id          UUID NULL,
            status                   TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','started','completed','skipped','expired')),
            started_at               TIMESTAMPTZ NULL,
            completed_at             TIMESTAMPTZ NULL,
            skipped_at               TIMESTAMPTZ NULL,
            linked_session_id        UUID NULL,
            completion_quality_score NUMERIC NULL,
            generated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

            CONSTRAINT uq_daily_missions_user_date
                UNIQUE (user_id, mission_date)
        )
        """
    )
    op.execute(
        f"CREATE INDEX idx_daily_missions_user "
        f"ON {SCHEMA}.daily_missions (user_id, mission_date DESC)"
    )
    op.execute(
        f"CREATE INDEX idx_daily_missions_status "
        f"ON {SCHEMA}.daily_missions (status, mission_date)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.daily_missions")
