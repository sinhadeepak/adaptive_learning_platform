"""F4 — blueprint_ratings.

Per-(blueprint, user) ratings of shared CUSTOM tests. Stars 1–5 + optional
comment. The author's MyTests row aggregates these as `avg stars · n
ratings`. Reuses catalog_schema so authoring + ratings co-locate.

Revision ID: 026
Revises: 025
Create Date: 2026-05-12
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "026"
down_revision: str | None = "025"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "catalog_schema"


def upgrade() -> None:
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.blueprint_ratings (
            blueprint_id UUID NOT NULL REFERENCES {SCHEMA}.exam_blueprints(id) ON DELETE CASCADE,
            user_id      UUID NOT NULL,
            stars        SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
            comment      TEXT,
            created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (blueprint_id, user_id)
        )
        """
    )
    op.execute(
        f"CREATE INDEX idx_blueprint_ratings_bp ON {SCHEMA}.blueprint_ratings (blueprint_id, created_at DESC)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.blueprint_ratings")
