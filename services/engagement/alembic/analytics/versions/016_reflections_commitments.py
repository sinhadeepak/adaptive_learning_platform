"""reflections_commitments — Phase 6 S57.

UX-27 reflection + commitment loop. One row per (trigger, artifact).

Revision ID: 016
Revises: 015
Create Date: 2026-05-02
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "016"
down_revision: str | None = "015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "analytics_schema"


def upgrade() -> None:
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.reflections_commitments (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id             UUID NOT NULL,
            trigger             TEXT NOT NULL
                CHECK (trigger IN ('session','mock','weekly')),
            trigger_artifact_id UUID NULL,
            prompt_id           TEXT NOT NULL,
            response            TEXT NULL,
            commitment          TEXT NULL,
            commitment_due_at   TIMESTAMPTZ NULL,
            commitment_status   TEXT NULL
                CHECK (commitment_status IS NULL OR
                       commitment_status IN ('pending','kept','missed')),
            check_in_response   TEXT NULL,
            occurred_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
            last_check_in_at    TIMESTAMPTZ NULL
        )
        """
    )
    op.execute(
        f"CREATE INDEX idx_reflections_user "
        f"ON {SCHEMA}.reflections_commitments (user_id, occurred_at DESC)"
    )
    op.execute(
        f"CREATE INDEX idx_commitments_due "
        f"ON {SCHEMA}.reflections_commitments (commitment_due_at) "
        f"WHERE commitment_status = 'pending'"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.reflections_commitments")
