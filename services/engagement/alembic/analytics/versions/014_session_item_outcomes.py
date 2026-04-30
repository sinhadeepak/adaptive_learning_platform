"""Phase 5 (P5-S41): per-item outcomes for transfer-ability metric.

Per ADR-0017 dim 7. session_section_stats (S22) groups by section, but
transfer needs per-item granularity tagged by primary concept +
concept_tag_count. Computed at process_session time when learning's
question_concepts is queried via the catalog client.

Revision ID: 014
Revises: 013
Create Date: 2026-04-30
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "014"
down_revision: str | None = "013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "analytics_schema"


def upgrade() -> None:
    op.execute(f"""
        CREATE TABLE {SCHEMA}.session_item_outcomes (
            session_id          UUID NOT NULL,
            item_idx            INT  NOT NULL,
            user_id             UUID NOT NULL,
            question_id         UUID NOT NULL,
            primary_concept_id  UUID NOT NULL,
            concept_tag_count   INT  NOT NULL CHECK (concept_tag_count >= 1),
            is_correct          BOOLEAN NOT NULL,
            time_spent_ms       INT,
            recorded_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (session_id, item_idx)
        )
    """)
    # Read pattern: per-user, per-concept, group by tag-count bucket.
    op.execute(
        f"CREATE INDEX idx_outcomes_user_concept "
        f"ON {SCHEMA}.session_item_outcomes (user_id, primary_concept_id)"
    )
    op.execute(
        f"CREATE INDEX idx_outcomes_user_question "
        f"ON {SCHEMA}.session_item_outcomes (user_id, question_id)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.session_item_outcomes")
