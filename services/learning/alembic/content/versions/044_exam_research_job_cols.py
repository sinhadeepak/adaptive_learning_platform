"""Async exam-builder research jobs — add requested_by + request_input.

The exam-builder research flow becomes an async background job that reuses
`content_schema.ai_generation_jobs` (discriminated by
`prompt_template_id='exam_research'`). Two additive, nullable columns:

  - `requested_by`  — the admin user id, so the poller's list/get endpoints
                      can be scoped per-admin.
  - `request_input` — the original ResearchRequest payload, so the worker
                      (and a retry) can reconstruct the prompt.

Both nullable → backward compatible with existing authoring/translation rows.

Revision ID: 044
Revises: 043
Create Date: 2026-06-26
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "044"
down_revision: str | None = "043"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"


def upgrade() -> None:
    op.execute(
        f"ALTER TABLE {SCHEMA}.ai_generation_jobs "
        f"ADD COLUMN IF NOT EXISTS requested_by UUID NULL"
    )
    op.execute(
        f"ALTER TABLE {SCHEMA}.ai_generation_jobs "
        f"ADD COLUMN IF NOT EXISTS request_input JSONB NULL"
    )
    # Poller queries by (prompt_template_id, requested_by, created_at).
    op.execute(
        f"CREATE INDEX IF NOT EXISTS idx_ai_jobs_template_requester "
        f"ON {SCHEMA}.ai_generation_jobs (prompt_template_id, requested_by, created_at DESC)"
    )


def downgrade() -> None:
    op.execute(f"DROP INDEX IF EXISTS {SCHEMA}.idx_ai_jobs_template_requester")
    op.execute(f"ALTER TABLE {SCHEMA}.ai_generation_jobs DROP COLUMN IF EXISTS request_input")
    op.execute(f"ALTER TABLE {SCHEMA}.ai_generation_jobs DROP COLUMN IF EXISTS requested_by")
