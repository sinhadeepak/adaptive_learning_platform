"""Sprint 17 (P3-S2): bookings + tutor_sessions + tutor_admin_actions.

Three tables:
  - bookings — student-tutor booking with FSM state, price snapshot,
    Stripe + Daily metadata.
  - tutor_sessions — operational telemetry per session (1:1 with bookings).
  - tutor_admin_actions — append-only audit log for admin approve/reject.

Slot-conflict prevention is a partial unique index for now; range-based
EXCLUDE USING gist requires the btree_gist extension and is deferred to P3-S6.

Revision ID: 003
Revises: 002
Create Date: 2026-04-28
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "003"
down_revision: str | None = "002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "marketplace_schema"


def upgrade() -> None:
    # bookings
    op.execute(f"""
        CREATE TABLE {SCHEMA}.bookings (
            id UUID PRIMARY KEY,
            student_user_id UUID NOT NULL,
            tutor_user_id UUID NOT NULL REFERENCES {SCHEMA}.tutor_profiles(user_id) ON DELETE RESTRICT,
            slot_start TIMESTAMPTZ NOT NULL,
            slot_end TIMESTAMPTZ NOT NULL,
            price_paise BIGINT NOT NULL,
            commission_paise BIGINT NOT NULL,
            status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
            stripe_payment_intent_id TEXT NULL,
            daily_room_url TEXT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            confirmed_at TIMESTAMPTZ NULL,
            started_at TIMESTAMPTZ NULL,
            completed_at TIMESTAMPTZ NULL,
            cancelled_at TIMESTAMPTZ NULL,
            CHECK (slot_end > slot_start),
            CHECK (price_paise >= 0),
            CHECK (commission_paise >= 0 AND commission_paise <= price_paise),
            CHECK (status IN (
                'PENDING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED',
                'CANCELLED_BY_STUDENT', 'CANCELLED_BY_TUTOR',
                'NO_SHOW_STUDENT', 'NO_SHOW_TUTOR'
            ))
        )
    """)
    op.execute(f"""
        CREATE INDEX idx_bookings_tutor_slot
        ON {SCHEMA}.bookings (tutor_user_id, slot_start)
    """)
    op.execute(f"""
        CREATE INDEX idx_bookings_student_recent
        ON {SCHEMA}.bookings (student_user_id, created_at DESC)
    """)
    # Best-effort dup-block for the same exact start time. True range
    # exclusion (overlapping ranges) needs btree_gist — P3-S6 follow-up.
    op.execute(f"""
        CREATE UNIQUE INDEX idx_tutor_active_slots
        ON {SCHEMA}.bookings (tutor_user_id, slot_start)
        WHERE status IN ('CONFIRMED', 'IN_PROGRESS')
    """)

    # tutor_sessions — 1:1 with bookings.
    op.execute(f"""
        CREATE TABLE {SCHEMA}.tutor_sessions (
            id UUID PRIMARY KEY REFERENCES {SCHEMA}.bookings(id) ON DELETE CASCADE,
            daily_room_id TEXT NOT NULL,
            daily_room_url TEXT NOT NULL,
            joined_by_student_at TIMESTAMPTZ NULL,
            joined_by_tutor_at TIMESTAMPTZ NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    # tutor_admin_actions — audit.
    op.execute(f"""
        CREATE TABLE {SCHEMA}.tutor_admin_actions (
            id UUID PRIMARY KEY,
            admin_user_id UUID NOT NULL,
            tutor_user_id UUID NOT NULL REFERENCES {SCHEMA}.tutor_profiles(user_id) ON DELETE CASCADE,
            action TEXT NOT NULL,
            reason TEXT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CHECK (action IN ('APPROVE', 'REJECT', 'SUSPEND', 'REACTIVATE'))
        )
    """)
    op.execute(f"""
        CREATE INDEX idx_tutor_admin_actions_tutor
        ON {SCHEMA}.tutor_admin_actions (tutor_user_id, created_at DESC)
    """)


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.tutor_admin_actions")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.tutor_sessions")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.bookings")
