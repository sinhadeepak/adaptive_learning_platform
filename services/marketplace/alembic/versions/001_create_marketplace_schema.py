"""Create marketplace_schema (V001) — initial baseline.

Sprint 15 (P3-S0): the schema starts empty. Tables land in P3-S1+
(tutor_profiles, tutor_availability, bookings, ...) via subsequent
migrations.

The CREATE SCHEMA itself is a no-op here because alembic env.py
pre-creates the schema before applying migrations (so version_table_schema
can place alembic_version inside the namespace from the very first run).
This file exists so alembic has a baseline to record.

Revision ID: 001
Revises:
Create Date: 2026-04-28
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "marketplace_schema"


def upgrade() -> None:
    # Idempotent — env.py also runs this. Defence-in-depth.
    op.execute(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}")


def downgrade() -> None:
    # Forward-only. A schema drop would cascade-delete every future
    # P3 table. If you really need to roll back the marketplace bring-up,
    # `DROP SCHEMA marketplace_schema CASCADE` and re-run from scratch.
    raise NotImplementedError(
        "Downgrade not supported. Use DROP SCHEMA marketplace_schema CASCADE "
        "if a clean re-baseline is required."
    )
