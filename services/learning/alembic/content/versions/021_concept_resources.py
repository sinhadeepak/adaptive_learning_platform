"""concept_resources — teacher-curated content references (R-S1).

A pinning table that lets teachers attach external content (currently
YouTube clips, also direct URLs and free-form notes) to topics,
concepts, or specific questions. Drives the "Watch & Learn" shelf
on the student-facing topic detail page and the "Why this was
wrong → Watch this" CTA on the QuizResult screen.

The current source is YouTube — embed via youtube-nocookie.com. The
schema deliberately models `resource_type` so we can extend later
to platform-hosted clips, transcripts, or our own LMS without a
schema change.

Lifecycle:
  TEACHER pin           → DRAFT
  POST .../submit       → IN_REVIEW
  MODERATOR+ approve    → PUBLISHED   (visible to students)
  MODERATOR+ reject     → REJECTED
  daily availability    → REMOVED     (YouTube took the video down)

Revision ID: 021
Revises: 020
Create Date: 2026-05-02
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "021"
down_revision: str | None = "020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"


def upgrade() -> None:
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.concept_resources (
            id              UUID PRIMARY KEY,
            topic_id        UUID NULL,
            concept_id      UUID NULL,
            question_id     UUID NULL,
            resource_type   TEXT NOT NULL,
            external_id     TEXT NULL,
            url             TEXT NOT NULL,
            title           TEXT NOT NULL,
            description     TEXT NULL,
            channel_name    TEXT NULL,
            duration_seconds INT NULL,
            thumbnail_url   TEXT NULL,
            language        TEXT NOT NULL DEFAULT 'en',
            difficulty      TEXT NULL,
            status          TEXT NOT NULL DEFAULT 'DRAFT',
            position        INT NOT NULL DEFAULT 0,
            added_by        UUID NOT NULL,
            added_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
            approved_by     UUID NULL,
            approved_at     TIMESTAMPTZ NULL,
            review_notes    TEXT NULL,
            last_checked_at TIMESTAMPTZ NULL,
            is_available    BOOLEAN NOT NULL DEFAULT TRUE,
            retired_at      TIMESTAMPTZ NULL,

            CONSTRAINT chk_resource_type
                CHECK (resource_type IN
                    ('youtube_video','youtube_playlist','url','note')),
            CONSTRAINT chk_status
                CHECK (status IN
                    ('DRAFT','IN_REVIEW','PUBLISHED','REJECTED','REMOVED')),
            CONSTRAINT chk_difficulty
                CHECK (difficulty IS NULL OR difficulty IN
                    ('EASY','MEDIUM','HARD')),
            CONSTRAINT chk_at_least_one_scope
                CHECK (
                    topic_id IS NOT NULL
                    OR concept_id IS NOT NULL
                    OR question_id IS NOT NULL
                )
        )
        """
    )
    op.execute(
        f"""
        CREATE INDEX idx_concept_resources_topic
            ON {SCHEMA}.concept_resources (topic_id)
            WHERE topic_id IS NOT NULL
        """
    )
    op.execute(
        f"""
        CREATE INDEX idx_concept_resources_question
            ON {SCHEMA}.concept_resources (question_id)
            WHERE question_id IS NOT NULL
        """
    )
    op.execute(
        f"""
        CREATE INDEX idx_concept_resources_concept
            ON {SCHEMA}.concept_resources (concept_id)
            WHERE concept_id IS NOT NULL
        """
    )
    op.execute(
        f"""
        CREATE INDEX idx_concept_resources_status
            ON {SCHEMA}.concept_resources (status)
        """
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.concept_resources")
