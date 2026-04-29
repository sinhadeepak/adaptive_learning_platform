"""Sprint 29 (P4-S29): error_classifications table.

Per ADR-0016 — heuristic v1 taxonomy on wrong answers. Six axes:
silly_mistake / conceptual_gap / time_pressure / formula_error /
sign_or_unit_error / unattempted.

Keyed on (session_id, item_idx) so a JetStream redelivery is a no-op
via ON CONFLICT.

Revision ID: 007
Revises: 006
Create Date: 2026-04-28
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "007"
down_revision: str | None = "006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "analytics_schema"


def upgrade() -> None:
    op.execute(f"""
        CREATE TABLE {SCHEMA}.error_classifications (
            session_id     UUID NOT NULL,
            item_idx       SMALLINT NOT NULL,
            user_id        UUID NOT NULL,
            topic_id       UUID NOT NULL,
            classification TEXT NOT NULL CHECK (classification IN (
                'silly_mistake','conceptual_gap','time_pressure',
                'formula_error','sign_or_unit_error','unattempted'
            )),
            classified_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (session_id, item_idx)
        )
    """)
    op.execute(
        f"CREATE INDEX idx_error_class_user "
        f"ON {SCHEMA}.error_classifications (user_id, topic_id)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.error_classifications")
