"""weekly_narratives — Phase 6 S53.

Cached structured weekly narrative payloads. One row per
(user_id, week_start, prompt_template_version) for the full weekly;
unlimited delta rows for mini-updates.

Revision ID: 027
Revises: 026
Create Date: 2026-05-02
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "027"
down_revision: str | None = "026"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"


def upgrade() -> None:
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.weekly_narratives (
            id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id                  UUID NOT NULL,
            week_start               DATE NOT NULL,
            narrative                JSONB NOT NULL,
            signals_snapshot         JSONB NOT NULL,
            source                   TEXT NOT NULL DEFAULT 'ai'
                CHECK (source IN ('ai','heuristic_fallback')),
            model                    TEXT NULL,
            prompt_template_id       TEXT NOT NULL,
            prompt_template_version  TEXT NOT NULL,
            is_delta                 BOOLEAN NOT NULL DEFAULT FALSE,
            delta_trigger            TEXT NULL
                CHECK (delta_trigger IS NULL OR delta_trigger IN
                       ('meaningful_sessions','mock_complete','readiness_jump')),
            generated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
            seen_at                  TIMESTAMPTZ NULL,
            sections_expanded        JSONB NULL
        )
        """
    )
    op.execute(
        f"""
        CREATE UNIQUE INDEX uq_weekly_narratives_full
            ON {SCHEMA}.weekly_narratives
            (user_id, week_start, prompt_template_version)
            WHERE is_delta = FALSE
        """
    )
    op.execute(
        f"CREATE INDEX idx_weekly_narratives_user "
        f"ON {SCHEMA}.weekly_narratives (user_id, week_start DESC)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.weekly_narratives")
