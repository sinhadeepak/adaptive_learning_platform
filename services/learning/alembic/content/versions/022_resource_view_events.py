"""resource_view_events — student-side telemetry on the curated shelf (R-S2).

Records started/25/50/75/completed/closed events fired by the
yt-nocookie embed on the student web app. The session_id column
optionally links a view event back to the quiz session that
surfaced the resource (when the student clicked the "Why this was
wrong → Watch this" CTA on QuizResult), enabling future analytics
like "did watching the recommended clip improve next-quiz mastery."

Append-only table — no UPDATEs. Each fired event is a new row.

Revision ID: 022
Revises: 021
Create Date: 2026-05-02
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "022"
down_revision: str | None = "021"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"


def upgrade() -> None:
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.resource_view_events (
            id               UUID PRIMARY KEY,
            resource_id      UUID NOT NULL
                             REFERENCES {SCHEMA}.concept_resources(id)
                             ON DELETE CASCADE,
            user_id          UUID NOT NULL,
            event_type       TEXT NOT NULL,
            position_seconds INT NULL,
            occurred_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            session_id       UUID NULL,

            CONSTRAINT chk_event_type
                CHECK (event_type IN
                    ('started','25pct','50pct','75pct','completed','closed'))
        )
        """
    )
    op.execute(
        f"""
        CREATE INDEX idx_view_events_resource
            ON {SCHEMA}.resource_view_events (resource_id)
        """
    )
    op.execute(
        f"""
        CREATE INDEX idx_view_events_user_recent
            ON {SCHEMA}.resource_view_events (user_id, occurred_at DESC)
        """
    )
    op.execute(
        f"""
        CREATE INDEX idx_view_events_session
            ON {SCHEMA}.resource_view_events (session_id)
            WHERE session_id IS NOT NULL
        """
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.resource_view_events")
