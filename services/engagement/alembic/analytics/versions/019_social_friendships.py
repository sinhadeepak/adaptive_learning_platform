"""social_friendships — F8a Friends.

Friends are stored canonically: (user_a_id, user_b_id) where
user_a_id < user_b_id. This avoids double rows and makes the PK
trivial. Status enum: PENDING (request sent but not yet accepted),
ACCEPTED (mutual friendship), BLOCKED (one side blocked the other).

Online presence is computed at read time by alp-battle's Redis
heartbeat (presence:<user_id> TTL 60s). Not stored here — keeps the
table read-cheap.

Revision: 019_social_friendships
Down revision: 018_mv_drill_topic
"""

from __future__ import annotations

from alembic import op

# revision identifiers
revision = "019"
down_revision = "018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS social_schema")
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS social_schema.friendships (
            user_a_id  uuid NOT NULL,
            user_b_id  uuid NOT NULL,
            -- requested_by stores who initiated, so the recipient can
            -- be shown the "Accept / Decline" prompt rather than the
            -- raw status.
            requested_by uuid NOT NULL,
            status     text NOT NULL CHECK (status IN ('PENDING','ACCEPTED','BLOCKED')),
            requested_at timestamptz NOT NULL DEFAULT now(),
            accepted_at  timestamptz,
            blocked_by   uuid,
            PRIMARY KEY (user_a_id, user_b_id),
            CHECK (user_a_id < user_b_id)
        )
        """
    )
    op.execute(
        """
        CREATE INDEX friendships_userb_idx
                  ON social_schema.friendships (user_b_id, status)
        """
    )
    op.execute(
        """
        CREATE INDEX friendships_status_idx
                  ON social_schema.friendships (status)
                WHERE status = 'ACCEPTED'
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS social_schema.friendships")
