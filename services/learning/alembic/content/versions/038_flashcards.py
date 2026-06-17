"""Phase 1D-8: flashcards (decks + cards + subscriptions + SM-2 review state).

Tables:
  - decks(id, owner_user_id, tenant_id, title, description, topic_id,
          status, visibility, language, created_at, updated_at)
  - flashcards(id, deck_id, front_md, back_md, position, created_at)
  - deck_subscriptions(user_id, deck_id, subscribed_at)
  - flashcard_review_state(user_id, card_id, ease_factor, interval_days,
                            due_at, last_reviewed_at, repetitions)

SM-2 reuses the same fields as analytics_schema.revision_queue.

Revision ID: 038
Revises: 037
Create Date: 2026-05-05
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "038"
down_revision: str | None = "037"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"


def upgrade() -> None:
    op.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {SCHEMA}.decks (
          id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          owner_user_id   UUID NOT NULL,
          tenant_id       UUID NULL,
          title           TEXT NOT NULL CHECK (char_length(title) <= 200),
          description     TEXT NULL CHECK (char_length(description) <= 1000),
          topic_id        UUID NULL,
          status          TEXT NOT NULL DEFAULT 'DRAFT'
                          CHECK (status IN ('DRAFT','IN_REVIEW','PUBLISHED','REJECTED')),
          visibility      TEXT NOT NULL DEFAULT 'PRIVATE'
                          CHECK (visibility IN ('PRIVATE','COHORT','PUBLIC')),
          language        CHAR(2) NOT NULL DEFAULT 'en',
          created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute(f"CREATE INDEX IF NOT EXISTS idx_decks_owner ON {SCHEMA}.decks (owner_user_id)")
    op.execute(f"CREATE INDEX IF NOT EXISTS idx_decks_topic ON {SCHEMA}.decks (topic_id)")
    op.execute(
        f"CREATE INDEX IF NOT EXISTS idx_decks_visibility "
        f"ON {SCHEMA}.decks (visibility, status) WHERE status = 'PUBLISHED'"
    )

    op.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {SCHEMA}.flashcards (
          id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          deck_id     UUID NOT NULL REFERENCES {SCHEMA}.decks(id) ON DELETE CASCADE,
          front_md    TEXT NOT NULL CHECK (char_length(front_md) <= 4096),
          back_md     TEXT NOT NULL CHECK (char_length(back_md) <= 4096),
          position    INT NOT NULL DEFAULT 0,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute(f"CREATE INDEX IF NOT EXISTS idx_flashcards_deck ON {SCHEMA}.flashcards (deck_id, position)")

    op.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {SCHEMA}.deck_subscriptions (
          user_id        UUID NOT NULL,
          deck_id        UUID NOT NULL REFERENCES {SCHEMA}.decks(id) ON DELETE CASCADE,
          subscribed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (user_id, deck_id)
        )
        """
    )

    op.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {SCHEMA}.flashcard_review_state (
          user_id           UUID NOT NULL,
          card_id           UUID NOT NULL REFERENCES {SCHEMA}.flashcards(id) ON DELETE CASCADE,
          ease_factor       REAL NOT NULL DEFAULT 2.5,
          interval_days     INT NOT NULL DEFAULT 0,
          repetitions       INT NOT NULL DEFAULT 0,
          last_reviewed_at  TIMESTAMPTZ NULL,
          due_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (user_id, card_id)
        )
        """
    )
    op.execute(
        f"CREATE INDEX IF NOT EXISTS idx_review_state_due "
        f"ON {SCHEMA}.flashcard_review_state (user_id, due_at)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.flashcard_review_state")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.deck_subscriptions")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.flashcards")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.decks")
