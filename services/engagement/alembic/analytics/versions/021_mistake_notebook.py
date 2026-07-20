"""Mistake Notebook — captured wrong answers + their spaced-repetition state.

`mistakes` snapshots each wrong answer at scoring time (chosen/correct text,
stem, explanation) so the notebook is self-contained and immune to later
edits/deletes of the source question. `mistake_review_state` carries the
canonical SM-2 schedule (shared `alp_srs`) for replaying each mistake until
it's mastered.

Keyed on (session_id, item_idx) for JetStream-redelivery idempotency, mirroring
error_classifications.

Revision ID: 021
Revises: 020
Create Date: 2026-07-05
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "021"
down_revision: str | None = "020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "analytics_schema"


def upgrade() -> None:
    op.execute(f"""
        CREATE TABLE {SCHEMA}.mistakes (
            id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id              UUID NOT NULL,
            session_id           UUID NOT NULL,
            item_idx             SMALLINT NOT NULL,
            question_id          UUID,
            topic_id             UUID NOT NULL,
            exam_id              UUID,
            error_tag            TEXT,
            stem_snapshot        TEXT,
            chosen_text          TEXT,
            correct_text         TEXT,
            explanation_snapshot TEXT,
            created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (session_id, item_idx)
        )
    """)
    op.execute(
        f"CREATE INDEX idx_mistakes_user_topic "
        f"ON {SCHEMA}.mistakes (user_id, topic_id)"
    )
    op.execute(
        f"CREATE INDEX idx_mistakes_user_created "
        f"ON {SCHEMA}.mistakes (user_id, created_at DESC)"
    )

    op.execute(f"""
        CREATE TABLE {SCHEMA}.mistake_review_state (
            mistake_id       UUID PRIMARY KEY
                             REFERENCES {SCHEMA}.mistakes (id) ON DELETE CASCADE,
            user_id          UUID NOT NULL,
            ease_factor      DOUBLE PRECISION NOT NULL DEFAULT 2.5,
            interval_days    INTEGER NOT NULL DEFAULT 0,
            repetitions      INTEGER NOT NULL DEFAULT 0,
            due_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
            last_reviewed_at TIMESTAMPTZ
        )
    """)
    op.execute(
        f"CREATE INDEX idx_mistake_review_due "
        f"ON {SCHEMA}.mistake_review_state (user_id, due_at)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.mistake_review_state")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.mistakes")
