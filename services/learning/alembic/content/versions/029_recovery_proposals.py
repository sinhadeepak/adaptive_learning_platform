"""recovery_proposals — Phase 6 S57 / ADR-0023.

Recovery-mode catch-up plans surfaced when 2+ planned sessions
miss in a 7-day window.

Revision ID: 029
Revises: 028
Create Date: 2026-05-02
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "029"
down_revision: str | None = "028"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"


def upgrade() -> None:
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.recovery_proposals (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id             UUID NOT NULL,
            plan_id             UUID NOT NULL REFERENCES {SCHEMA}.study_plans(id) ON DELETE CASCADE,
            triggered_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
            missed_session_ids  JSONB NOT NULL,
            catch_up_payload    JSONB NOT NULL,
            rationale           TEXT NOT NULL,
            expected_minutes    INT NOT NULL,
            status              TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','accepted','declined','expired')),
            decided_at          TIMESTAMPTZ NULL
        )
        """
    )
    op.execute(
        f"CREATE INDEX idx_recovery_user_pending "
        f"ON {SCHEMA}.recovery_proposals (user_id, triggered_at DESC) "
        f"WHERE status = 'pending'"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.recovery_proposals")
