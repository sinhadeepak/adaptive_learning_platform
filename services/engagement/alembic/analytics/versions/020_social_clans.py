"""social_clans — F8b Clans + leaderboards.

Clans are user-formed groups of 1-30 members. Visibility = PUBLIC means
anyone can browse + join; INVITE_ONLY requires an owner/officer invite.

Roles inside a clan: OWNER (immutable creator, max 1), OFFICER (can
invite + kick), MEMBER (default).

Leaderboards are persisted as denormalised rows keyed by
`leaderboard_id`. Examples: `elo:exam:JEE_MAIN`, `xp:global`,
`wins:weekly:2026-W19`, `clan:elo`. The job that populates them lives
in `engagement/jobs/leaderboards.py` (next sprint).

Revision: 020_social_clans
Down revision: 019_social_friendships
"""

from __future__ import annotations

from alembic import op

revision = "020"
down_revision = "019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS social_schema.clans (
            id           uuid PRIMARY KEY,
            name         text UNIQUE NOT NULL,
            description  text,
            created_by   uuid NOT NULL,
            visibility   text NOT NULL DEFAULT 'PUBLIC'
                         CHECK (visibility IN ('PUBLIC','INVITE_ONLY')),
            member_cap   smallint NOT NULL DEFAULT 30,
            member_count smallint NOT NULL DEFAULT 1,
            created_at   timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS social_schema.clan_members (
            clan_id    uuid NOT NULL REFERENCES social_schema.clans(id) ON DELETE CASCADE,
            user_id    uuid NOT NULL,
            role       text NOT NULL CHECK (role IN ('OWNER','OFFICER','MEMBER'))
                       DEFAULT 'MEMBER',
            joined_at  timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (clan_id, user_id)
        )
        """
    )
    op.execute(
        """
        CREATE INDEX clan_members_user_idx
                  ON social_schema.clan_members (user_id)
        """
    )
    # Leaderboard storage — flexible key so the same table backs
    # ELO/XP/weekly/clan boards.
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS social_schema.leaderboards (
            leaderboard_id text NOT NULL,
            user_id        uuid NOT NULL,
            score          real NOT NULL,
            rank           integer NOT NULL,
            recorded_at    timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (leaderboard_id, user_id)
        )
        """
    )
    op.execute(
        """
        CREATE INDEX leaderboards_lb_rank_idx
                  ON social_schema.leaderboards (leaderboard_id, rank)
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS social_schema.leaderboards")
    op.execute("DROP TABLE IF EXISTS social_schema.clan_members")
    op.execute("DROP TABLE IF EXISTS social_schema.clans")
