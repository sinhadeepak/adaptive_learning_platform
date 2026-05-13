"""user_theta_prior — F2a.

Stores per-user, per-exam IRT theta prior derived from the screening
(diagnostic) test. The adaptive engine reads this row at session start
and seeds EAP estimation with a non-zero prior, so a student who scored
strongly on the diagnostic doesn't cold-start at theta=0 and waste 8-10
items climbing back to their real ability level.

`readiness_seed` from screening (range [0.05, 0.95]) is mapped to
prior_mean via `θ = (readiness - 0.5) * 3` capped to [-1.5, +1.5] —
a gentle map so a single 12-item screening doesn't dominate downstream
session signal.

Revision ID: 039
Revises: 038
Create Date: 2026-05-12
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "039"
down_revision: str | None = "038"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"


def upgrade() -> None:
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.user_theta_prior (
            user_id     UUID NOT NULL,
            exam_code   TEXT NOT NULL,
            prior_mean  REAL NOT NULL,
            prior_sd    REAL NOT NULL DEFAULT 1.0,
            source      TEXT NOT NULL,
            set_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (user_id, exam_code)
        )
        """
    )
    op.execute(
        f"CREATE INDEX idx_user_theta_prior_user "
        f"ON {SCHEMA}.user_theta_prior (user_id, set_at DESC)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.user_theta_prior")
