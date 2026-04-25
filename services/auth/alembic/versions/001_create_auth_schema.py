"""Create auth_schema (V001) — initial baseline.

5 tables: users, refresh_tokens, otp_tokens, user_exam_selections, invite_links.
4 enums: user_role_enum, admin_level_enum, account_status_enum, onboarding_status_enum.

Source: docs/01_design/02_DatabaseSchema_ERD_AdaptiveLearningPlatform.docx §4.

Revision ID: 001
Revises:
Create Date: 2026-04-22

"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


SCHEMA = "auth_schema"


def upgrade() -> None:
    # Schema container — every Auth-service table lives here, never in `public`.
    op.execute(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}")

    # Enums. Defined once at the schema level; reused across multiple columns.
    op.execute(
        f"CREATE TYPE {SCHEMA}.user_role_enum AS ENUM "
        "('STUDENT','EXPERT','TEACHER','MODERATOR')"
    )
    op.execute(
        f"CREATE TYPE {SCHEMA}.admin_level_enum AS ENUM "
        "('NONE','INSTITUTION','PLATFORM')"
    )
    op.execute(
        f"CREATE TYPE {SCHEMA}.account_status_enum AS ENUM "
        "('PENDING_VERIFICATION','ACTIVE','SUSPENDED','BANNED','DELETED')"
    )
    op.execute(
        f"CREATE TYPE {SCHEMA}.onboarding_status_enum AS ENUM ('PENDING','COMPLETE')"
    )

    # users — identity table. Application generates UUIDs (DEFAULT is a fallback).
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.users (
          id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
          email               TEXT         NOT NULL,
          password_hash       TEXT,
          full_name           TEXT         NOT NULL CHECK (char_length(full_name) BETWEEN 2 AND 100),
          role                {SCHEMA}.user_role_enum         NOT NULL DEFAULT 'STUDENT',
          admin_access_level  {SCHEMA}.admin_level_enum       NOT NULL DEFAULT 'NONE',
          account_status      {SCHEMA}.account_status_enum    NOT NULL DEFAULT 'PENDING_VERIFICATION',
          preferred_language  CHAR(2)      NOT NULL DEFAULT 'en'
                                CHECK (preferred_language IN ('en','hi')),
          study_goal_minutes  SMALLINT     CHECK (study_goal_minutes > 0),
          onboarding_status   {SCHEMA}.onboarding_status_enum NOT NULL DEFAULT 'PENDING',
          institution_id      UUID,
          tos_version         TEXT,
          tos_accepted_at     TIMESTAMPTZ,
          suspension_end_at   TIMESTAMPTZ,
          suspension_reason   TEXT,
          is_deleted          BOOLEAN      NOT NULL DEFAULT FALSE,
          deleted_at          TIMESTAMPTZ,
          created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
          updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
          CONSTRAINT uq_users_email UNIQUE (email),
          CONSTRAINT chk_users_email CHECK (email ~* '^[^@]+@[^@]+\\.[^@]+$')
        )
        """
    )
    op.execute(f"CREATE INDEX idx_users_email        ON {SCHEMA}.users (email)")
    op.execute(
        f"CREATE INDEX idx_users_institution  ON {SCHEMA}.users (institution_id) "
        "WHERE institution_id IS NOT NULL"
    )
    op.execute(
        f"CREATE INDEX idx_users_status       ON {SCHEMA}.users (account_status) "
        "WHERE is_deleted = FALSE"
    )
    op.execute(f"CREATE INDEX idx_users_created_at   ON {SCHEMA}.users (created_at)")
    op.execute(
        f"CREATE INDEX idx_users_is_deleted   ON {SCHEMA}.users (is_deleted) "
        "WHERE is_deleted = TRUE"
    )

    # refresh_tokens — opaque tokens, hashed before storage.
    # ON DELETE CASCADE here is intentional and explicit: tokens have no value
    # without the parent user; cleanup is desirable. This is the documented
    # exception to the project's "no cascade deletes" rule.
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.refresh_tokens (
          id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id      UUID         NOT NULL
                          REFERENCES {SCHEMA}.users(id) ON DELETE CASCADE,
          token_hash   TEXT         NOT NULL,
          expires_at   TIMESTAMPTZ  NOT NULL,
          revoked_at   TIMESTAMPTZ,
          device_hint  TEXT,
          created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
          CONSTRAINT uq_refresh_tokens_hash UNIQUE (token_hash)
        )
        """
    )
    op.execute(
        f"CREATE INDEX idx_rt_user_id    ON {SCHEMA}.refresh_tokens (user_id)"
    )
    op.execute(
        f"CREATE INDEX idx_rt_expires_at ON {SCHEMA}.refresh_tokens (expires_at)"
    )

    # otp_tokens — short-lived (10 min). No FK to users: OTPs are issued to
    # contacts (email/phone) before the user account exists in some flows.
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.otp_tokens (
          id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
          contact      TEXT         NOT NULL,
          otp_hash     TEXT         NOT NULL,
          attempts     SMALLINT     NOT NULL DEFAULT 0 CHECK (attempts <= 3),
          expires_at   TIMESTAMPTZ  NOT NULL,
          used_at      TIMESTAMPTZ,
          created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute(f"CREATE INDEX idx_otp_contact ON {SCHEMA}.otp_tokens (contact)")
    op.execute(f"CREATE INDEX idx_otp_expires ON {SCHEMA}.otp_tokens (expires_at)")

    # user_exam_selections — the student → exam join. exam_id is an
    # application-layer FK to catalog_schema.exams — no cross-schema FK because
    # the two schemas live in separate databases in local dev (one DB per service).
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.user_exam_selections (
          id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id     UUID        NOT NULL
                        REFERENCES {SCHEMA}.users(id) ON DELETE CASCADE,
          exam_id     UUID        NOT NULL,
          target_date DATE        CHECK (target_date > CURRENT_DATE),
          selected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          removed_at  TIMESTAMPTZ,
          CONSTRAINT uq_ues_user_exam UNIQUE (user_id, exam_id)
        )
        """
    )
    op.execute(
        f"CREATE INDEX idx_ues_user_id ON {SCHEMA}.user_exam_selections (user_id)"
    )
    op.execute(
        f"CREATE INDEX idx_ues_exam_id ON {SCHEMA}.user_exam_selections (exam_id)"
    )

    # invite_links — single-use tokens for institution onboarding.
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.invite_links (
          id              UUID                       PRIMARY KEY DEFAULT gen_random_uuid(),
          token_hash      TEXT                       NOT NULL,
          institution_id  UUID                       NOT NULL,
          email           TEXT                       NOT NULL,
          role            {SCHEMA}.user_role_enum    NOT NULL DEFAULT 'STUDENT',
          created_by      UUID                       NOT NULL
                            REFERENCES {SCHEMA}.users(id),
          expires_at      TIMESTAMPTZ                NOT NULL,
          used_at         TIMESTAMPTZ,
          created_at      TIMESTAMPTZ                NOT NULL DEFAULT NOW(),
          CONSTRAINT uq_invite_token UNIQUE (token_hash)
        )
        """
    )
    op.execute(
        f"CREATE INDEX idx_invite_institution ON {SCHEMA}.invite_links (institution_id)"
    )
    op.execute(
        f"CREATE INDEX idx_invite_expires     ON {SCHEMA}.invite_links (expires_at)"
    )


def downgrade() -> None:
    # Reverse order of upgrade. Tables before enums before schema.
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.invite_links")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.user_exam_selections")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.otp_tokens")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.refresh_tokens")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.users")
    op.execute(f"DROP TYPE IF EXISTS {SCHEMA}.onboarding_status_enum")
    op.execute(f"DROP TYPE IF EXISTS {SCHEMA}.account_status_enum")
    op.execute(f"DROP TYPE IF EXISTS {SCHEMA}.admin_level_enum")
    op.execute(f"DROP TYPE IF EXISTS {SCHEMA}.user_role_enum")
    op.execute(f"DROP SCHEMA IF EXISTS {SCHEMA}")
