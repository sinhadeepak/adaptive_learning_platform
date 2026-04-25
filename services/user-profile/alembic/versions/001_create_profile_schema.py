"""Create profile_schema (V001) — initial baseline.

2 tables: profiles, exam_selections.
1 enum:  onboarding_state_enum (NEW → EXAM_SELECTED → ONBOARDED).

Source: docs/01_design/02_DatabaseSchema_ERD_AdaptiveLearningPlatform.docx §5 (profile layer).

Note: user_id is an application-layer reference to auth_schema.users(id) in the
auth database. No cross-schema FK because the two schemas live in separate
databases in local dev (one DB per service).

Revision ID: 001
Revises:
Create Date: 2026-04-23

"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


SCHEMA = "profile_schema"


def upgrade() -> None:
    op.execute(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}")

    op.execute(
        f"CREATE TYPE {SCHEMA}.onboarding_state_enum AS ENUM "
        "('NEW','EXAM_SELECTED','ONBOARDED')"
    )

    # profiles — profile-layer attributes keyed by Auth's user_id.
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.profiles (
          user_id             UUID         PRIMARY KEY,
          first_name          TEXT         NOT NULL CHECK (char_length(first_name) BETWEEN 1 AND 60),
          last_name           TEXT         NOT NULL CHECK (char_length(last_name) BETWEEN 1 AND 60),
          avatar_url          TEXT,
          locale              TEXT         NOT NULL DEFAULT 'en-IN'
                                CHECK (locale IN ('en-IN','hi-IN','en-US')),
          language_pref       TEXT         NOT NULL DEFAULT 'en'
                                CHECK (language_pref IN ('en','hi','hinglish')),
          daily_goal_minutes  SMALLINT     CHECK (daily_goal_minutes > 0 AND daily_goal_minutes <= 240),
          onboarding_state    {SCHEMA}.onboarding_state_enum NOT NULL DEFAULT 'NEW',
          timezone            TEXT         NOT NULL DEFAULT 'Asia/Kolkata',
          tenant_id           UUID,
          tos_version         TEXT,
          tos_accepted_at     TIMESTAMPTZ,
          created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
          updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute(
        f"CREATE INDEX idx_profiles_tenant ON {SCHEMA}.profiles (tenant_id) "
        "WHERE tenant_id IS NOT NULL"
    )
    op.execute(
        f"CREATE INDEX idx_profiles_onboarding ON {SCHEMA}.profiles (onboarding_state)"
    )
    op.execute(f"CREATE INDEX idx_profiles_updated ON {SCHEMA}.profiles (updated_at)")

    # exam_selections — the student → exam join, profile-layer.
    # exam_id is an app-layer reference to catalog_schema.exams.
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.exam_selections (
          id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id      UUID         NOT NULL
                          REFERENCES {SCHEMA}.profiles(user_id) ON DELETE CASCADE,
          exam_id      UUID         NOT NULL,
          target_date  DATE,
          selected_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
          removed_at   TIMESTAMPTZ,
          CONSTRAINT uq_exam_selections_user_exam UNIQUE (user_id, exam_id)
        )
        """
    )
    op.execute(
        f"CREATE INDEX idx_exam_selections_user ON {SCHEMA}.exam_selections (user_id)"
    )
    op.execute(
        f"CREATE INDEX idx_exam_selections_exam ON {SCHEMA}.exam_selections (exam_id)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.exam_selections")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.profiles")
    op.execute(f"DROP TYPE IF EXISTS {SCHEMA}.onboarding_state_enum")
    op.execute(f"DROP SCHEMA IF EXISTS {SCHEMA}")
