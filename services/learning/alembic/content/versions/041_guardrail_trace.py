"""041 — AI Content Guardrail audit trace columns on ai_generation_jobs.

Extends the existing audit table with the per-attempt guardrail trace
(one row per generation attempt; a 3-attempt FAIL writes three, plus a
`final` summary row sharing generation_group_id). Avoids a new table —
the guardrail trace is just richer AI-generation provenance.

Revision ID: 041
Revises: 040
Create Date: 2026-06-15
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "041"
down_revision: str | None = "040"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"


def upgrade() -> None:
    op.execute(
        f"""
        ALTER TABLE {SCHEMA}.ai_generation_jobs
            ADD COLUMN IF NOT EXISTS generation_group_id UUID NULL,
            ADD COLUMN IF NOT EXISTS guardrail_layer TEXT NULL,
            ADD COLUMN IF NOT EXISTS generation_attempt SMALLINT NULL,
            ADD COLUMN IF NOT EXISTS guardrail_status TEXT NULL
                CHECK (guardrail_status IN ('PASS','REVIEW','FAIL')),
            ADD COLUMN IF NOT EXISTS audit_confidence SMALLINT NULL,
            ADD COLUMN IF NOT EXISTS similarity_score NUMERIC(6,5) NULL,
            ADD COLUMN IF NOT EXISTS nearest_neighbour_id UUID NULL,
            ADD COLUMN IF NOT EXISTS exact_hash_hit BOOLEAN NULL,
            ADD COLUMN IF NOT EXISTS guardrail_version TEXT NULL,
            ADD COLUMN IF NOT EXISTS self_audit_report JSONB NULL
        """
    )
    op.execute(
        f"CREATE INDEX IF NOT EXISTS idx_ai_jobs_guardrail_group "
        f"ON {SCHEMA}.ai_generation_jobs (generation_group_id) "
        f"WHERE generation_group_id IS NOT NULL"
    )
    op.execute(
        f"CREATE INDEX IF NOT EXISTS idx_ai_jobs_guardrail_status "
        f"ON {SCHEMA}.ai_generation_jobs (guardrail_status, created_at DESC) "
        f"WHERE guardrail_status IS NOT NULL"
    )


def downgrade() -> None:
    op.execute(f"DROP INDEX IF EXISTS {SCHEMA}.idx_ai_jobs_guardrail_status")
    op.execute(f"DROP INDEX IF EXISTS {SCHEMA}.idx_ai_jobs_guardrail_group")
    op.execute(
        f"""
        ALTER TABLE {SCHEMA}.ai_generation_jobs
            DROP COLUMN IF EXISTS self_audit_report,
            DROP COLUMN IF EXISTS guardrail_version,
            DROP COLUMN IF EXISTS exact_hash_hit,
            DROP COLUMN IF EXISTS nearest_neighbour_id,
            DROP COLUMN IF EXISTS similarity_score,
            DROP COLUMN IF EXISTS audit_confidence,
            DROP COLUMN IF EXISTS guardrail_status,
            DROP COLUMN IF EXISTS generation_attempt,
            DROP COLUMN IF EXISTS guardrail_layer,
            DROP COLUMN IF EXISTS generation_group_id
        """
    )
