"""screening_attempts — Phase 6 S49.

Persists post-signup screenings as the user's first diagnostic data
point. Anonymous attempts live in Redis until signup completes.

Revision ID: 025
Revises: 024
Create Date: 2026-05-02
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "025"
down_revision: str | None = "024"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"


def upgrade() -> None:
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.screening_attempts (
            id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id            UUID NOT NULL,
            completed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
            item_responses     JSONB NOT NULL,
            score_pct          NUMERIC NOT NULL,
            topic_breakdown    JSONB NOT NULL,
            readiness_seed     NUMERIC NOT NULL,
            blueprint_version  TEXT NOT NULL DEFAULT '1.0.0'
        )
        """
    )
    op.execute(
        f"CREATE INDEX idx_screening_user "
        f"ON {SCHEMA}.screening_attempts (user_id, completed_at DESC)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.screening_attempts")
