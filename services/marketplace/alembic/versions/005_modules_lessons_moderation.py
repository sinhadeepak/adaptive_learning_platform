"""Sprint 19 (P3-S4): course modules + lessons + rating moderation +
booking refund state.

Schema additions:
  - course_modules    — module-level structure for courses
  - course_lessons    — lesson under a module; carries the content_md
  - rating moderation columns on tutor_session_ratings + course_ratings
  - widen admin_actions enum
  - widen booking status enum to include REFUNDED_BY_ADMIN

Revision ID: 005
Revises: 004
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "005"
down_revision: str | None = "004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "marketplace_schema"


def upgrade() -> None:
    op.execute(f"""
        CREATE TABLE {SCHEMA}.course_modules (
            id UUID PRIMARY KEY,
            course_id UUID NOT NULL REFERENCES {SCHEMA}.courses(id) ON DELETE CASCADE,
            position INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (course_id, position)
        )
    """)
    op.execute(f"CREATE INDEX idx_modules_course ON {SCHEMA}.course_modules (course_id, position)")

    op.execute(f"""
        CREATE TABLE {SCHEMA}.course_lessons (
            id UUID PRIMARY KEY,
            module_id UUID NOT NULL REFERENCES {SCHEMA}.course_modules(id) ON DELETE CASCADE,
            position INTEGER NOT NULL,
            title TEXT NOT NULL,
            content_md TEXT NOT NULL DEFAULT '',
            duration_seconds INTEGER NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (module_id, position),
            CHECK (duration_seconds IS NULL OR duration_seconds > 0)
        )
    """)
    op.execute(f"CREATE INDEX idx_lessons_module ON {SCHEMA}.course_lessons (module_id, position)")

    # Rating moderation columns
    for table in ("tutor_session_ratings", "course_ratings"):
        op.execute(f"""
            ALTER TABLE {SCHEMA}.{table}
            ADD COLUMN hidden_at TIMESTAMPTZ NULL,
            ADD COLUMN hidden_by_admin_id UUID NULL,
            ADD COLUMN hidden_reason TEXT NULL
        """)
        op.execute(
            f"CREATE INDEX idx_{table}_visible ON {SCHEMA}.{table} (hidden_at) WHERE hidden_at IS NULL"
        )

    # Widen admin_actions enum
    op.execute(f"""
        ALTER TABLE {SCHEMA}.tutor_admin_actions
        DROP CONSTRAINT tutor_admin_actions_action_check
    """)
    op.execute(f"""
        ALTER TABLE {SCHEMA}.tutor_admin_actions
        ADD CONSTRAINT tutor_admin_actions_action_check
        CHECK (action IN (
            'APPROVE', 'REJECT', 'SUSPEND', 'REACTIVATE',
            'CREATOR_APPROVE', 'CREATOR_REJECT',
            'COURSE_APPROVE', 'COURSE_REJECT',
            'RATING_HIDE', 'RATING_UNHIDE',
            'BOOKING_REFUND', 'COURSE_REFUND'
        ))
    """)

    # Widen booking status to include REFUNDED_BY_ADMIN
    op.execute(f"""
        ALTER TABLE {SCHEMA}.bookings
        DROP CONSTRAINT bookings_status_check
    """)
    op.execute(f"""
        ALTER TABLE {SCHEMA}.bookings
        ADD CONSTRAINT bookings_status_check
        CHECK (status IN (
            'PENDING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED',
            'CANCELLED_BY_STUDENT', 'CANCELLED_BY_TUTOR',
            'NO_SHOW_STUDENT', 'NO_SHOW_TUTOR',
            'REFUNDED_BY_ADMIN'
        ))
    """)


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.course_lessons")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.course_modules")
    for table in ("tutor_session_ratings", "course_ratings"):
        op.execute(f"DROP INDEX IF EXISTS {SCHEMA}.idx_{table}_visible")
        op.execute(f"""
            ALTER TABLE {SCHEMA}.{table}
            DROP COLUMN IF EXISTS hidden_at,
            DROP COLUMN IF EXISTS hidden_by_admin_id,
            DROP COLUMN IF EXISTS hidden_reason
        """)
