"""Sprint 13 S13-B — append-only audit of invite claims.

Why a separate row per claim rather than a counter on cohort_invites:
the educator UI ("show me who actually joined via this link") needs the
identity per claim, not just an aggregate. Append-only design also
means the audit survives invite revocation — a deleted invite row
takes its claim history with it via FK CASCADE only because we accept
that revocation is a destructive op; the audit serves the "while it
was live" use case, not forensic reconstruction.

(Alternative considered + rejected: store claims under cohort_members
itself. cohort_members has no FK to cohort_invites, so the join would
be a LEFT JOIN with no integrity guarantee — and a student could be
added to a cohort by an educator directly, with no invite involved.
A dedicated audit table keeps the two flows distinct.)

Revision ID: 005
Revises: 004
Create Date: 2026-04-28
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "005"
down_revision: str | None = "004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "institution_schema"


def upgrade() -> None:
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.cohort_invite_claims (
          id           UUID NOT NULL DEFAULT gen_random_uuid(),
          invite_id    UUID NOT NULL,
          user_id      UUID NOT NULL,
          claimed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (id),
          FOREIGN KEY (invite_id) REFERENCES {SCHEMA}.cohort_invites(id)
            ON DELETE CASCADE
        )
        """
    )
    # Funnel queries: "for invite X, who claimed it and when"
    op.execute(
        f"CREATE INDEX idx_invite_claims_invite ON {SCHEMA}.cohort_invite_claims "
        f"(invite_id, claimed_at DESC)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.cohort_invite_claims")
