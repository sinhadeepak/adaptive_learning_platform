"""Sprint 16 (P3-S1): tutor profile domain.

Four tables in marketplace_schema:
  - tutor_profiles      — one row per tutor user, holds the application FSM
  - tutor_qualifications — bullet list of credentials
  - tutor_availability   — recurring weekly availability windows
  - tutor_topics         — what the tutor teaches (FK informally to learning.catalog_schema.topics)

Pricing band per ADR-0008: hourly_rate_paise must be 10000–500000 paise
(₹100–₹5000) when tier='STANDARD'. Premium tier is opt-in by admin.

Revision ID: 002
Revises: 001
Create Date: 2026-04-28
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "002"
down_revision: str | None = "001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "marketplace_schema"


def upgrade() -> None:
    op.execute(f"""
        CREATE TABLE {SCHEMA}.tutor_profiles (
            user_id UUID PRIMARY KEY,
            display_name TEXT NOT NULL,
            headline TEXT NOT NULL,
            bio TEXT NOT NULL DEFAULT '',
            hourly_rate_paise BIGINT NOT NULL,
            commission_rate_override REAL NULL,
            tier TEXT NOT NULL DEFAULT 'STANDARD',
            application_status TEXT NOT NULL DEFAULT 'APPLIED',
            kyc_status TEXT NULL,
            stripe_identity_session_id TEXT NULL,
            stripe_connect_account_id TEXT NULL,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            approved_at TIMESTAMPTZ NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CHECK (tier IN ('STANDARD', 'PREMIUM_VERIFIED', 'RETIRED')),
            CHECK (application_status IN (
                'APPLIED', 'KYC_PENDING', 'KYC_VERIFIED',
                'APPROVED', 'ACTIVE', 'REJECTED', 'SUSPENDED'
            )),
            -- Pricing band enforced at DB level for STANDARD tier (ADR-0008).
            -- PREMIUM_VERIFIED tutors bypass via the WHEN clause.
            CHECK (
                tier <> 'STANDARD'
                OR (hourly_rate_paise BETWEEN 10000 AND 500000)
            )
        )
    """)

    op.execute(f"""
        CREATE TABLE {SCHEMA}.tutor_qualifications (
            id UUID PRIMARY KEY,
            tutor_user_id UUID NOT NULL REFERENCES {SCHEMA}.tutor_profiles(user_id) ON DELETE CASCADE,
            kind TEXT NOT NULL,
            title TEXT NOT NULL,
            institution TEXT NULL,
            year_completed INTEGER NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CHECK (kind IN ('DEGREE', 'CERTIFICATE', 'EXAM_RANK', 'TEACHING_EXPERIENCE'))
        )
    """)
    op.execute(f"""
        CREATE INDEX idx_tutor_qual_user ON {SCHEMA}.tutor_qualifications (tutor_user_id)
    """)

    op.execute(f"""
        CREATE TABLE {SCHEMA}.tutor_availability (
            id UUID PRIMARY KEY,
            tutor_user_id UUID NOT NULL REFERENCES {SCHEMA}.tutor_profiles(user_id) ON DELETE CASCADE,
            day_of_week INTEGER NOT NULL,
            start_minute INTEGER NOT NULL,
            end_minute INTEGER NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CHECK (day_of_week BETWEEN 0 AND 6),
            CHECK (start_minute >= 0 AND start_minute < 1440),
            CHECK (end_minute > start_minute AND end_minute <= 1440)
        )
    """)
    op.execute(f"""
        CREATE INDEX idx_tutor_avail_user_day
        ON {SCHEMA}.tutor_availability (tutor_user_id, day_of_week)
    """)

    op.execute(f"""
        CREATE TABLE {SCHEMA}.tutor_topics (
            tutor_user_id UUID NOT NULL REFERENCES {SCHEMA}.tutor_profiles(user_id) ON DELETE CASCADE,
            topic_id UUID NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (tutor_user_id, topic_id)
        )
    """)
    op.execute(f"""
        CREATE INDEX idx_tutor_topics_topic ON {SCHEMA}.tutor_topics (topic_id)
    """)

    # Listing index — used by GET /marketplace/tutors with status + price filters.
    op.execute(f"""
        CREATE INDEX idx_tutor_active_rate
        ON {SCHEMA}.tutor_profiles (application_status, hourly_rate_paise)
        WHERE application_status = 'ACTIVE'
    """)


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.tutor_topics")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.tutor_availability")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.tutor_qualifications")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.tutor_profiles")
