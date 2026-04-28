"""Create catalog_schema (V001) — initial baseline.

3 tables: exams, subjects, topics.
1 enum:  content_tier_enum (FREE, PREMIUM).

Source: docs/01_design/02_DatabaseSchema_ERD_AdaptiveLearningPlatform.docx §6 (catalog layer).

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


SCHEMA = "catalog_schema"


def upgrade() -> None:
    op.execute(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}")

    op.execute(
        f"CREATE TYPE {SCHEMA}.content_tier_enum AS ENUM ('FREE','PREMIUM')"
    )

    # exams — top-level entrance test (JEE Main, NEET, UPSC CSE, CAT, etc.)
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.exams (
          id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
          code            TEXT         NOT NULL UNIQUE,
          name            TEXT         NOT NULL,
          subtitle        TEXT,
          icon_key        TEXT,
          is_published    BOOLEAN      NOT NULL DEFAULT TRUE,
          sort_order      SMALLINT     NOT NULL DEFAULT 0,
          created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
          updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute(
        f"CREATE INDEX idx_exams_published ON {SCHEMA}.exams (is_published) WHERE is_published"
    )

    # subjects — a subject under an exam (Physics under JEE Main, etc.)
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.subjects (
          id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
          exam_id         UUID         NOT NULL REFERENCES {SCHEMA}.exams(id),
          code            TEXT         NOT NULL,
          name            TEXT         NOT NULL,
          subtitle        TEXT,
          icon_key        TEXT,
          is_published    BOOLEAN      NOT NULL DEFAULT TRUE,
          sort_order      SMALLINT     NOT NULL DEFAULT 0,
          created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
          updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
          CONSTRAINT uq_subject_code_per_exam UNIQUE (exam_id, code)
        )
        """
    )
    op.execute(f"CREATE INDEX idx_subjects_exam ON {SCHEMA}.subjects (exam_id)")

    # topics — a topic under a subject (Rotational Motion under Physics, etc.)
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.topics (
          id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
          subject_id      UUID         NOT NULL REFERENCES {SCHEMA}.subjects(id),
          code            TEXT         NOT NULL,
          title           TEXT         NOT NULL,
          description     TEXT,
          tier            {SCHEMA}.content_tier_enum NOT NULL DEFAULT 'FREE',
          question_count  INTEGER      NOT NULL DEFAULT 0,
          sort_order      SMALLINT     NOT NULL DEFAULT 0,
          objectives      JSONB        NOT NULL DEFAULT '[]'::jsonb,
          prerequisites   JSONB        NOT NULL DEFAULT '[]'::jsonb,
          is_published    BOOLEAN      NOT NULL DEFAULT TRUE,
          created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
          updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
          CONSTRAINT uq_topic_code_per_subject UNIQUE (subject_id, code)
        )
        """
    )
    op.execute(f"CREATE INDEX idx_topics_subject ON {SCHEMA}.topics (subject_id)")
    op.execute(f"CREATE INDEX idx_topics_tier ON {SCHEMA}.topics (tier)")


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.topics")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.subjects")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.exams")
    op.execute(f"DROP TYPE IF EXISTS {SCHEMA}.content_tier_enum")
    op.execute(f"DROP SCHEMA IF EXISTS {SCHEMA}")
