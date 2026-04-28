"""Sprint 20 (P3-S5): predictive analytics tables.

Per ADR-0010, predictive analytics live in engagement.analytics.predictive
as pure Python — no MLflow/Sagemaker until scale demands it. v1 = heuristic
scorer; v2 = lightgbm/sklearn training pipeline (P3-S6+).

Two new caches:
  - predictive_dropout_scores — per-user dropout risk score with
    recommended intervention. Recomputed on demand with TTL ~1h.
  - cached_recommendations — per-user topic recommendation list.

Both tables are caches; truncating them is safe — the next read
recomputes from source-of-truth (mastery, streaks, daily_activity).

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

SCHEMA = "analytics_schema"


def upgrade() -> None:
    op.execute(f"""
        CREATE TABLE {SCHEMA}.predictive_dropout_scores (
            user_id UUID PRIMARY KEY,
            score REAL NOT NULL,
            risk_band TEXT NOT NULL,
            intervention_kind TEXT NULL,
            signals_json JSONB NOT NULL,
            computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CHECK (score >= 0.0 AND score <= 1.0),
            CHECK (risk_band IN ('LOW', 'MEDIUM', 'HIGH')),
            CHECK (
                intervention_kind IS NULL
                OR intervention_kind IN (
                    're_engagement_notification',
                    'suggest_tutor',
                    'lower_difficulty',
                    'none'
                )
            )
        )
    """)
    op.execute(f"""
        CREATE INDEX idx_predictive_dropout_high_risk
        ON {SCHEMA}.predictive_dropout_scores (score DESC, computed_at DESC)
        WHERE risk_band IN ('HIGH', 'MEDIUM')
    """)

    op.execute(f"""
        CREATE TABLE {SCHEMA}.cached_recommendations (
            user_id UUID NOT NULL,
            position INTEGER NOT NULL,
            topic_id UUID NOT NULL,
            score REAL NOT NULL,
            reason_string TEXT NOT NULL,
            computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (user_id, position),
            CHECK (score >= 0.0 AND score <= 1.0),
            CHECK (position >= 1)
        )
    """)
    op.execute(f"""
        CREATE INDEX idx_cached_recs_user
        ON {SCHEMA}.cached_recommendations (user_id, computed_at DESC)
    """)


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.cached_recommendations")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.predictive_dropout_scores")
