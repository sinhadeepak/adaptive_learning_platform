"""Revision capsules — cached AI one-page topic summaries.

A capsule is generated on demand from a topic's published questions +
explanations (via the AI Gateway `authoring` touchpoint) and cached here so
repeat views don't re-spend LLM tokens. Keyed by topic_id; regenerated when
the source question set has grown materially (caller policy).

Revision ID: 048
Revises: 047
Create Date: 2026-07-05
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "048"
down_revision: str | None = "047"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"


def upgrade() -> None:
    op.execute(f"""
        CREATE TABLE {SCHEMA}.revision_capsules (
            topic_id         UUID PRIMARY KEY,
            capsule          JSONB NOT NULL,
            source_count     INTEGER NOT NULL DEFAULT 0,
            model            TEXT,
            generated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.revision_capsules")
