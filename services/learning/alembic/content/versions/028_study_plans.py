"""study_plans + plan_sessions + plan_edits — Phase 6 S55.

Three-table set for the constrained plan editor (ADR-0023).

Revision ID: 028
Revises: 027
Create Date: 2026-05-02
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "028"
down_revision: str | None = "027"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"


def upgrade() -> None:
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.study_plans (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id             UUID NOT NULL,
            week_start          DATE NOT NULL,
            target_date         DATE NULL,
            daily_minutes_goal  INT NOT NULL,
            status              TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','superseded','completed','abandoned')),
            source              TEXT NOT NULL DEFAULT 'ai_initial'
                CHECK (source IN ('ai_initial','ai_regenerated','student_edited')),
            generated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
            last_edited_at      TIMESTAMPTZ NULL,
            CONSTRAINT uq_study_plans_user_week UNIQUE (user_id, week_start)
        )
        """
    )
    op.execute(
        f"CREATE INDEX idx_study_plans_user_active "
        f"ON {SCHEMA}.study_plans (user_id, week_start) "
        f"WHERE status = 'active'"
    )

    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.plan_sessions (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            plan_id             UUID NOT NULL REFERENCES {SCHEMA}.study_plans(id) ON DELETE CASCADE,
            day_offset          SMALLINT NOT NULL CHECK (day_offset BETWEEN 0 AND 6),
            slot                TEXT NOT NULL CHECK (slot IN ('morning','afternoon','evening','flex')),
            kind                TEXT NOT NULL CHECK (kind IN ('practice','revision','mock')),
            concept_id          UUID NULL,
            topic_id            UUID NULL,
            expected_minutes    INT NOT NULL,
            expected_questions  INT NOT NULL,
            is_required         BOOLEAN NOT NULL DEFAULT FALSE,
            locked_reason       TEXT NULL,
            status              TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','in_progress','completed','missed','postponed','removed')),
            completed_at        TIMESTAMPTZ NULL,
            linked_session_id   UUID NULL,
            position            INT NOT NULL DEFAULT 0
        )
        """
    )
    op.execute(
        f"CREATE INDEX idx_plan_sessions_plan "
        f"ON {SCHEMA}.plan_sessions (plan_id, day_offset, position)"
    )
    op.execute(
        f"CREATE INDEX idx_plan_sessions_required "
        f"ON {SCHEMA}.plan_sessions (plan_id, is_required) WHERE is_required = TRUE"
    )

    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.plan_edits (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            plan_id         UUID NOT NULL REFERENCES {SCHEMA}.study_plans(id) ON DELETE CASCADE,
            user_id         UUID NOT NULL,
            edit_kind       TEXT NOT NULL
                CHECK (edit_kind IN ('move','swap','rest','shorten','add',
                                     'regenerate','replace','postpone','split')),
            payload         JSONB NOT NULL,
            impact_preview  JSONB NULL,
            occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        f"CREATE INDEX idx_plan_edits_plan "
        f"ON {SCHEMA}.plan_edits (plan_id, occurred_at DESC)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.plan_edits")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.plan_sessions")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.study_plans")
