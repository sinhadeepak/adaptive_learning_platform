"""Phase 1D-3: tutor_chat_sessions + tutor_chat_messages tables.

Persists AI tutor conversations so a student can resume a thread,
search past chats, and have the LLM recall context from prior
sessions. Cap content_md per message to 32 KB to bound row size.

The upgrade uses raw `CREATE TABLE IF NOT EXISTS` because the same
shape was applied directly via psql in dev to unblock work; replaying
through the runner stays a no-op.

Revision ID: 037
Revises: 036
Create Date: 2026-05-05
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "037"
down_revision: str | None = "036"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"


def upgrade() -> None:
    op.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {SCHEMA}.tutor_chat_sessions (
          id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id       UUID NOT NULL,
          topic_id      UUID NULL,
          title         TEXT NULL,
          summary       TEXT NULL,
          started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_msg_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          msg_count     INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    op.execute(
        f"""
        CREATE INDEX IF NOT EXISTS idx_tutor_chat_sessions_user
          ON {SCHEMA}.tutor_chat_sessions (user_id, last_msg_at DESC)
        """
    )
    op.execute(
        f"""
        CREATE INDEX IF NOT EXISTS idx_tutor_chat_sessions_topic
          ON {SCHEMA}.tutor_chat_sessions (user_id, topic_id)
        """
    )
    op.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {SCHEMA}.tutor_chat_messages (
          session_id   UUID NOT NULL
                       REFERENCES {SCHEMA}.tutor_chat_sessions(id) ON DELETE CASCADE,
          idx          INTEGER NOT NULL,
          role         TEXT NOT NULL,
          content_md   TEXT NOT NULL CHECK (char_length(content_md) <= 32768),
          created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (session_id, idx)
        )
        """
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.tutor_chat_messages")
    op.execute(f"DROP INDEX IF EXISTS {SCHEMA}.idx_tutor_chat_sessions_topic")
    op.execute(f"DROP INDEX IF EXISTS {SCHEMA}.idx_tutor_chat_sessions_user")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.tutor_chat_sessions")
