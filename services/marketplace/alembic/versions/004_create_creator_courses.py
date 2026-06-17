"""Sprint 18 (P3-S3): creator content marketplace + ratings.

Five new tables in marketplace_schema:
  - creator_profiles    — mirrors tutor_profiles for the creator persona
  - courses             — atomic learning content; per-course pricing
  - course_purchases    — student-course purchase records
  - tutor_session_ratings — student rates a completed booking (1:1 with bookings)
  - course_ratings      — student rates a purchased course (1:1 with purchases)

Course pricing band per ADR-0008: 4900–499900 paise (₹49–₹4,999).
The PENDING_REVIEW step on courses lets admin gate publishing per
ADR-0008's premium-tier review pattern (applied to all courses for v1).

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

SCHEMA = "marketplace_schema"


def upgrade() -> None:
    # creator_profiles — mirrors tutor_profiles, no hourly_rate
    op.execute(f"""
        CREATE TABLE {SCHEMA}.creator_profiles (
            user_id UUID PRIMARY KEY,
            display_name TEXT NOT NULL,
            headline TEXT NOT NULL,
            bio TEXT NOT NULL DEFAULT '',
            tier TEXT NOT NULL DEFAULT 'STANDARD',
            application_status TEXT NOT NULL DEFAULT 'APPLIED',
            kyc_status TEXT NULL,
            stripe_identity_session_id TEXT NULL,
            stripe_connect_account_id TEXT NULL,
            commission_rate_override REAL NULL,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            approved_at TIMESTAMPTZ NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CHECK (tier IN ('STANDARD', 'PREMIUM_VERIFIED', 'RETIRED')),
            CHECK (application_status IN (
                'APPLIED', 'KYC_PENDING', 'KYC_VERIFIED',
                'APPROVED', 'ACTIVE', 'REJECTED', 'SUSPENDED'
            ))
        )
    """)

    # courses — atomic content artifact for v1.
    op.execute(f"""
        CREATE TABLE {SCHEMA}.courses (
            id UUID PRIMARY KEY,
            creator_user_id UUID NOT NULL REFERENCES {SCHEMA}.creator_profiles(user_id) ON DELETE RESTRICT,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            content_md TEXT NOT NULL DEFAULT '',
            price_paise BIGINT NOT NULL,
            tier TEXT NOT NULL DEFAULT 'STANDARD',
            status TEXT NOT NULL DEFAULT 'DRAFT',
            cover_image_url TEXT NULL,
            exam_id UUID NULL,
            subject_id UUID NULL,
            topic_ids JSONB NOT NULL DEFAULT '[]',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            published_at TIMESTAMPTZ NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CHECK (tier IN ('FREE', 'STANDARD', 'PREMIUM')),
            CHECK (status IN ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'RETIRED')),
            -- ADR-0008 course pricing band: ₹49–₹4,999 = 4900–499900 paise.
            -- FREE tier bypasses (price_paise must equal 0).
            CHECK (
                (tier = 'FREE' AND price_paise = 0)
                OR (tier <> 'FREE' AND price_paise BETWEEN 4900 AND 499900)
            )
        )
    """)
    op.execute(f"""
        CREATE INDEX idx_courses_creator
        ON {SCHEMA}.courses (creator_user_id, status, published_at DESC)
    """)
    op.execute(f"""
        CREATE INDEX idx_courses_published
        ON {SCHEMA}.courses (status, published_at DESC)
        WHERE status = 'PUBLISHED'
    """)

    # course_purchases — student bought a course.
    op.execute(f"""
        CREATE TABLE {SCHEMA}.course_purchases (
            id UUID PRIMARY KEY,
            student_user_id UUID NOT NULL,
            course_id UUID NOT NULL REFERENCES {SCHEMA}.courses(id) ON DELETE RESTRICT,
            price_paise BIGINT NOT NULL,
            commission_paise BIGINT NOT NULL,
            status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
            stripe_payment_intent_id TEXT NULL,
            purchased_at TIMESTAMPTZ NULL,
            refunded_at TIMESTAMPTZ NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CHECK (status IN ('PENDING_PAYMENT', 'PAID', 'REFUNDED')),
            CHECK (price_paise >= 0),
            CHECK (commission_paise >= 0 AND commission_paise <= price_paise)
        )
    """)
    op.execute(f"""
        CREATE UNIQUE INDEX idx_one_paid_purchase_per_student_course
        ON {SCHEMA}.course_purchases (student_user_id, course_id)
        WHERE status = 'PAID'
    """)
    op.execute(f"""
        CREATE INDEX idx_purchases_course
        ON {SCHEMA}.course_purchases (course_id, status)
    """)

    # tutor_session_ratings — one per booking.
    op.execute(f"""
        CREATE TABLE {SCHEMA}.tutor_session_ratings (
            id UUID PRIMARY KEY,
            booking_id UUID NOT NULL UNIQUE REFERENCES {SCHEMA}.bookings(id) ON DELETE CASCADE,
            student_user_id UUID NOT NULL,
            tutor_user_id UUID NOT NULL,
            stars INTEGER NOT NULL,
            comment TEXT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CHECK (stars BETWEEN 1 AND 5)
        )
    """)
    op.execute(f"""
        CREATE INDEX idx_session_ratings_tutor
        ON {SCHEMA}.tutor_session_ratings (tutor_user_id, created_at DESC)
    """)

    # course_ratings — one per purchase.
    op.execute(f"""
        CREATE TABLE {SCHEMA}.course_ratings (
            id UUID PRIMARY KEY,
            purchase_id UUID NOT NULL UNIQUE REFERENCES {SCHEMA}.course_purchases(id) ON DELETE CASCADE,
            course_id UUID NOT NULL REFERENCES {SCHEMA}.courses(id) ON DELETE CASCADE,
            student_user_id UUID NOT NULL,
            stars INTEGER NOT NULL,
            comment TEXT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CHECK (stars BETWEEN 1 AND 5)
        )
    """)
    op.execute(f"""
        CREATE INDEX idx_course_ratings_course
        ON {SCHEMA}.course_ratings (course_id, created_at DESC)
    """)

    # Extend the admin-actions enum to cover creators + courses.
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
            'COURSE_APPROVE', 'COURSE_REJECT'
        ))
    """)
    # Drop the FK to tutor_profiles — `tutor_user_id` now also holds
    # creator IDs and course-creator IDs (no single parent table). The
    # column name is kept for backward compatibility; semantics are
    # "the marketplace entity the admin acted on".
    op.execute(f"""
        ALTER TABLE {SCHEMA}.tutor_admin_actions
        DROP CONSTRAINT IF EXISTS tutor_admin_actions_tutor_user_id_fkey
    """)


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.course_ratings")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.tutor_session_ratings")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.course_purchases")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.courses")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.creator_profiles")
    op.execute(f"""
        ALTER TABLE {SCHEMA}.tutor_admin_actions
        DROP CONSTRAINT tutor_admin_actions_action_check
    """)
    op.execute(f"""
        ALTER TABLE {SCHEMA}.tutor_admin_actions
        ADD CONSTRAINT tutor_admin_actions_action_check
        CHECK (action IN ('APPROVE', 'REJECT', 'SUSPEND', 'REACTIVATE'))
    """)
