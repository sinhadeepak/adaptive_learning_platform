"""Sync the denormalized question_count on catalog topics to match
what the content service's seed migration 003 actually inserts.

Background: catalog migration 002 set hand-picked counts (48, 32, 40,
…) on the JEE / NEET-Biology topics for visual variety on the topic
browse cards. With the question-bank seed (content migration 003)
landing exactly 20 PUBLISHED rows per topic, those numbers became a
lie — students would see "48 questions" but the topic only has 20.

This migration normalizes every topic to question_count = 20. Catalog
and content live in separate databases so we can't COUNT(*) from
catalog directly; the value is hardcoded to match the seed contract.
When the Sprint-4 content.published event consumer lands and starts
maintaining question_count incrementally, this seed will stop being
authoritative — that's the right time to retire it.

Local-only: this hardcoded sync only makes sense when the seed
question bank is loaded. Guarded by CATALOG_SEED_LOCAL=1 to mirror
content's CONTENT_SEED_LOCAL gate. In staging/prod, real questions
land via authoring + the (future) event sync, and this migration is
a no-op so nothing real gets clobbered.

Revision ID: 008
Revises: 007
Create Date: 2026-04-26
"""

from __future__ import annotations

import os
from collections.abc import Sequence

from alembic import op

revision: str = "008"
down_revision: str | None = "007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "catalog_schema"

QUESTIONS_PER_TOPIC = 20


def upgrade() -> None:
    if not os.environ.get("CATALOG_SEED_LOCAL"):
        return

    op.execute(
        f"UPDATE {SCHEMA}.topics "
        f"SET question_count = {QUESTIONS_PER_TOPIC} "
        f"WHERE is_published = TRUE"
    )


def downgrade() -> None:
    # No restore — the original hand-picked values were arbitrary and
    # not worth tracking. If you need them back, revert catalog
    # migration 002 + 007.
    pass
