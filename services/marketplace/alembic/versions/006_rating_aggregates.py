"""Sprint 21 (P3-S6): rating aggregate cache columns on tutor_profiles +
courses, with backfill from existing visible rating rows.

Performance: listings (`/marketplace/tutors`, `/marketplace/courses`) and
detail pages were computing avg/count per request. Cache + recompute on
write is plenty for current scale.

Revision ID: 006
Revises: 005
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "006"
down_revision: str | None = "005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "marketplace_schema"


def upgrade() -> None:
    for table in ("tutor_profiles", "courses"):
        op.execute(f"""
            ALTER TABLE {SCHEMA}.{table}
            ADD COLUMN rating_avg REAL NOT NULL DEFAULT 0.0,
            ADD COLUMN rating_count INTEGER NOT NULL DEFAULT 0,
            ADD COLUMN last_aggregated_at TIMESTAMPTZ NULL
        """)

    # Backfill — recompute from visible ratings.
    op.execute(f"""
        UPDATE {SCHEMA}.tutor_profiles tp
        SET rating_avg = COALESCE(agg.avg_stars, 0.0),
            rating_count = COALESCE(agg.cnt, 0),
            last_aggregated_at = now()
        FROM (
            SELECT tutor_user_id,
                   AVG(stars)::REAL AS avg_stars,
                   COUNT(*)::INT AS cnt
            FROM {SCHEMA}.tutor_session_ratings
            WHERE hidden_at IS NULL
            GROUP BY tutor_user_id
        ) agg
        WHERE tp.user_id = agg.tutor_user_id
    """)
    op.execute(f"""
        UPDATE {SCHEMA}.courses c
        SET rating_avg = COALESCE(agg.avg_stars, 0.0),
            rating_count = COALESCE(agg.cnt, 0),
            last_aggregated_at = now()
        FROM (
            SELECT course_id,
                   AVG(stars)::REAL AS avg_stars,
                   COUNT(*)::INT AS cnt
            FROM {SCHEMA}.course_ratings
            WHERE hidden_at IS NULL
            GROUP BY course_id
        ) agg
        WHERE c.id = agg.course_id
    """)


def downgrade() -> None:
    for table in ("tutor_profiles", "courses"):
        op.execute(f"""
            ALTER TABLE {SCHEMA}.{table}
            DROP COLUMN IF EXISTS rating_avg,
            DROP COLUMN IF EXISTS rating_count,
            DROP COLUMN IF EXISTS last_aggregated_at
        """)
