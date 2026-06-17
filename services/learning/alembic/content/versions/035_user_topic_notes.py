"""Phase 7 (P7-A1): user_topic_notes table.

Per-topic, student-authored markdown notes. Visibility enum is
forward-compat for future "share with my tutor / cohort" flows; in
v1 every note ships PRIVATE by default and only the author reads it.
4096-char ceiling avoids unbounded blob growth.

Revision ID: 035
Revises: 034
Create Date: 2026-05-04
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "035"
down_revision: str | None = "034"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"


def upgrade() -> None:
    note_visibility = postgresql.ENUM(
        "PRIVATE",
        "TEACHER_VISIBLE",
        "COHORT",
        "PUBLIC",
        name="note_visibility",
        schema=SCHEMA,
        create_type=True,
    )
    note_visibility.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "user_topic_notes",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("topic_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("content_md", sa.Text(), nullable=False),
        sa.Column(
            "visibility",
            postgresql.ENUM(
                "PRIVATE",
                "TEACHER_VISIBLE",
                "COHORT",
                "PUBLIC",
                name="note_visibility",
                schema=SCHEMA,
                create_type=False,
            ),
            nullable=False,
            server_default=sa.text("'PRIVATE'"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("user_id", "topic_id"),
        sa.CheckConstraint(
            "char_length(content_md) <= 4096",
            name="ck_utn_content_length",
        ),
        schema=SCHEMA,
    )
    op.create_index(
        "idx_utn_topic_visibility",
        "user_topic_notes",
        ["topic_id", "visibility"],
        schema=SCHEMA,
        postgresql_where=sa.text("visibility != 'PRIVATE'"),
    )


def downgrade() -> None:
    op.drop_index(
        "idx_utn_topic_visibility", "user_topic_notes", schema=SCHEMA
    )
    op.drop_table("user_topic_notes", schema=SCHEMA)
    note_visibility = postgresql.ENUM(
        "PRIVATE",
        "TEACHER_VISIBLE",
        "COHORT",
        "PUBLIC",
        name="note_visibility",
        schema=SCHEMA,
    )
    note_visibility.drop(op.get_bind(), checkfirst=True)
