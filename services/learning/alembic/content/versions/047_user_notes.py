"""create content_schema.user_notes — per-exam student rich-text notebook.

Revision ID: 047
Revises: 046
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "047"
down_revision: str | None = "046"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"


def upgrade() -> None:
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.user_notes (
          id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id     UUID        NOT NULL,
          tenant_id   UUID        NOT NULL,
          exam_id     UUID        NOT NULL,
          title       TEXT        NOT NULL DEFAULT 'Untitled note',
          body        JSONB       NOT NULL DEFAULT '{{}}'::jsonb,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        f"CREATE INDEX idx_user_notes_owner_exam "
        f"ON {SCHEMA}.user_notes (user_id, exam_id, updated_at DESC)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.user_notes")
