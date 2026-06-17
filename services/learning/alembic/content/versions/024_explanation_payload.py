"""Question_explanations: payload JSONB + question-only cache key (R-S3 polish).

Bumps the cache to be per-question rather than per-(question, picked).
The teaching note for "Who founded the Mauryan empire?" is the same
regardless of which wrong distractor a student picked, so caching by
the picked index just inflated the table 4× without producing
materially different content. New rows after the v2.0.0 prompt write
picked_idx = -1 (the canonical-explanation sentinel).

Adds a `payload` JSONB column that holds the full structured teaching
note: headline + key_concept + why_correct + per-option verdicts +
common_pitfall + worked_example + next_steps. The legacy TEXT columns
(explanation / key_concept / common_pitfall) stay populated for
backward compat with any pre-v2.0.0 reader, but the new UI reads from
`payload` for the rich layout.

Old rows from the v1.0.0 prompt remain in place (audit / experiments).
The v2.0.0 prompt produces fresh rows alongside; the unique constraint
already includes prompt_template_version so reads naturally select
the current version.

Revision ID: 024
Revises: 023
Create Date: 2026-05-02
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "024"
down_revision: str | None = "023"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"


def upgrade() -> None:
    op.execute(
        f"""
        ALTER TABLE {SCHEMA}.question_explanations
            ADD COLUMN IF NOT EXISTS payload JSONB NULL
        """
    )


def downgrade() -> None:
    op.execute(
        f"""
        ALTER TABLE {SCHEMA}.question_explanations
            DROP COLUMN IF EXISTS payload
        """
    )
