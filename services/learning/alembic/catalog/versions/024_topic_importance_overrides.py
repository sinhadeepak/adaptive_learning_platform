"""Phase 7 (P7-A1): topic_importance_overrides table.

Hybrid topic-importance signal — admins override the auto-computed
PYQ-frequency / blueprint / uniform cascade. Separate `hidden` flag
distinguishes "low importance" (weight=0.05) from "hide entirely"
(hidden=true) so admins don't need to overload the weight column.

Revision ID: 024
Revises: 023
Create Date: 2026-05-04
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "024"
down_revision: str | None = "023"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "catalog_schema"


def upgrade() -> None:
    op.create_table(
        "topic_importance_overrides",
        sa.Column("exam_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("topic_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("weight", sa.Float(), nullable=False),
        sa.Column("hidden", sa.Boolean(), nullable=False, server_default=sa.text("FALSE")),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("set_by", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "set_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("exam_id", "topic_id"),
        sa.CheckConstraint("weight >= 0 AND weight <= 1", name="ck_tio_weight_range"),
        schema=SCHEMA,
    )
    op.create_index(
        "idx_tio_topic", "topic_importance_overrides", ["topic_id"], schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_index("idx_tio_topic", "topic_importance_overrides", schema=SCHEMA)
    op.drop_table("topic_importance_overrides", schema=SCHEMA)
