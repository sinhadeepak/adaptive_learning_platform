"""Sprint 11 S11-A — cohort_invites for B2B self-service onboarding.

An educator generates an invite link and shares it (Slack / WhatsApp /
email). The student opens it, the platform claims the invite, and the
student is added to cohort_members atomically.

Schema:
- `token` is the URL-safe payload the student receives. We don't store
  the HMAC signature here — the server re-derives + verifies it on
  claim. Storing only the unique `token` keeps the row small AND makes
  the invite revocable by deleting the row (no need to rotate keys).
- `max_uses` lets a single link onboard a whole class. NULL means
  unlimited; finite values let the educator hand out a "20-seat" link.
- `uses` increments on every successful claim (UPDATE … WHERE uses < max_uses
  is the gate so we can't oversubscribe).

Why a row + a token rather than pure stateless JWT: revocation. A pure
JWT can't be invalidated without a denylist; a DB row can be DELETE'd.

Revision ID: 004
Revises: 003
Create Date: 2026-04-28
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "004"
down_revision: str | None = "003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "institution_schema"


def upgrade() -> None:
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.cohort_invites (
          id            UUID NOT NULL DEFAULT gen_random_uuid(),
          cohort_id     UUID NOT NULL,
          token         TEXT NOT NULL,
          created_by    UUID,
          max_uses      INT,
          uses          INT NOT NULL DEFAULT 0,
          expires_at    TIMESTAMPTZ,
          created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (id),
          UNIQUE (token),
          FOREIGN KEY (cohort_id) REFERENCES {SCHEMA}.cohorts(id) ON DELETE CASCADE
        )
        """
    )
    op.execute(
        f"CREATE INDEX idx_cohort_invites_cohort ON {SCHEMA}.cohort_invites (cohort_id)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.cohort_invites")
