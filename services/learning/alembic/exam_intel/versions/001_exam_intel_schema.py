"""EIS — Exam Intelligence System schema (Pillar A — Phase B1).

Creates `exam_intelligence_schema` with 6 tables:

  exam_past_papers          — one row per ingested official paper
  exam_past_questions       — per-question text + tags + difficulty
  topic_appearance_stats    — per-(exam, topic, year) rollup
  concept_appearance_stats  — finer-grained per-concept rollup
  topic_forecast            — predicted P(appears) + expected_marks
  question_pattern_stats    — per-(exam, topic, question_type) counts

The schema deliberately mirrors the catalog convention (uuid PKs,
text enums via CHECK rather than Postgres ENUMs so additions are
cheap, timestamptz with `now()` defaults).

References to catalog tables (`exam_id`, `topic_id`, `concept_id`)
are *not* foreign-keyed across schemas — per ADR-0001 each service
owns its data; we keep the link by id only and trust the application
layer to keep them consistent.

Revision ID: 001
Revises:
Create Date: 2026-05-13
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "exam_intelligence_schema"


def upgrade() -> None:
    op.execute(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}")

    # ── exam_past_papers ─────────────────────────────────────────
    # One row per ingested official paper. `session` distinguishes
    # multi-session exams (JEE Main Jan/April, CBSE Term-1/Term-2).
    op.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {SCHEMA}.exam_past_papers (
            id              uuid PRIMARY KEY,
            exam_id         uuid NOT NULL,
            year            smallint NOT NULL,
            session         text DEFAULT '' NOT NULL,
            paper_url       text,
            ingested_at     timestamptz NOT NULL DEFAULT now(),
            n_questions     integer NOT NULL DEFAULT 0,
            total_marks     integer NOT NULL DEFAULT 0,
            duration_minutes integer,
            -- Lifecycle so the content team can stage / publish:
            --   DRAFT          : just ingested, not yet tagged
            --   TAGGED         : LLM tags filled, awaiting human review
            --   REVIEWED       : content team has signed off
            --   PUBLISHED      : included in forecast + visible
            --   ARCHIVED       : kept for history but excluded from forecast
            status          text NOT NULL DEFAULT 'DRAFT'
                CHECK (status IN ('DRAFT','TAGGED','REVIEWED','PUBLISHED','ARCHIVED')),
            UNIQUE (exam_id, year, session)
        )
        """
    )
    op.execute(
        f"""
        CREATE INDEX exam_past_papers_exam_year_idx
            ON {SCHEMA}.exam_past_papers (exam_id, year DESC)
        """
    )

    # ── exam_past_questions ─────────────────────────────────────
    # The atom of EIS. Each question carries:
    #   • The text + choices + correct answer
    #   • nlp_tags    : LLM-suggested topic_ids / concept_ids / bloom_level
    #   • curated_tags: content team overrides (preferred when present)
    #   • irt_b_estimate : initial difficulty guess
    #   • irt_b_observed : refined once student attempts roll in
    op.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {SCHEMA}.exam_past_questions (
            id              uuid PRIMARY KEY,
            paper_id        uuid NOT NULL REFERENCES {SCHEMA}.exam_past_papers(id) ON DELETE CASCADE,
            item_idx        smallint NOT NULL,
            stem            text NOT NULL,
            choices         jsonb,
            correct_answer  text,
            question_type   text NOT NULL DEFAULT 'MCQ_SINGLE',
            marks_correct   smallint NOT NULL DEFAULT 4,
            marks_negative  real NOT NULL DEFAULT 1.0,
            nlp_tags        jsonb,
            curated_tags    jsonb,
            irt_b_estimate  real,
            irt_b_observed  real,
            n_attempts      integer NOT NULL DEFAULT 0,
            n_correct       integer NOT NULL DEFAULT 0,
            created_at      timestamptz NOT NULL DEFAULT now(),
            updated_at      timestamptz NOT NULL DEFAULT now(),
            UNIQUE (paper_id, item_idx)
        )
        """
    )
    op.execute(
        f"""
        CREATE INDEX exam_past_questions_paper_idx
            ON {SCHEMA}.exam_past_questions (paper_id)
        """
    )

    # ── topic_appearance_stats ──────────────────────────────────
    # Rollup at the topic level — one row per (exam, topic, year)
    # so the forecaster can fit per-topic time series.
    op.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {SCHEMA}.topic_appearance_stats (
            exam_id         uuid NOT NULL,
            topic_id        uuid NOT NULL,
            year            smallint NOT NULL,
            n_questions     integer NOT NULL DEFAULT 0,
            total_marks     integer NOT NULL DEFAULT 0,
            avg_difficulty  real,
            PRIMARY KEY (exam_id, topic_id, year)
        )
        """
    )

    # ── concept_appearance_stats ────────────────────────────────
    # Finer than topic — same shape, keyed by concept.
    op.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {SCHEMA}.concept_appearance_stats (
            exam_id         uuid NOT NULL,
            concept_id      uuid NOT NULL,
            year            smallint NOT NULL,
            n_questions     integer NOT NULL DEFAULT 0,
            total_marks     integer NOT NULL DEFAULT 0,
            PRIMARY KEY (exam_id, concept_id, year)
        )
        """
    )

    # ── topic_forecast ──────────────────────────────────────────
    # The output of forecaster.py. Updated nightly. Confidence band
    # is non-negotiable per §11.4.1; lo/hi are at the 95% level.
    op.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {SCHEMA}.topic_forecast (
            exam_id              uuid NOT NULL,
            topic_id             uuid NOT NULL,
            forecast_year        smallint NOT NULL,
            p_appears            real NOT NULL,
            p_appears_ci_low     real NOT NULL,
            p_appears_ci_high    real NOT NULL,
            expected_questions   real NOT NULL,
            expected_marks       real NOT NULL,
            confidence           real NOT NULL,
            trend                text NOT NULL DEFAULT 'stable'
                CHECK (trend IN ('rising','stable','falling','volatile')),
            last_computed_at     timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (exam_id, topic_id, forecast_year)
        )
        """
    )
    op.execute(
        f"""
        CREATE INDEX topic_forecast_yield_idx
            ON {SCHEMA}.topic_forecast (exam_id, forecast_year, expected_marks DESC)
        """
    )

    # ── question_pattern_stats ──────────────────────────────────
    # Distribution of question types per (exam, topic). Drives
    # `/exam-intel/{id}/question-pattern` and informs ADP candidate
    # selection (favour the question_type that's likely to appear).
    op.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {SCHEMA}.question_pattern_stats (
            exam_id         uuid NOT NULL,
            topic_id        uuid NOT NULL,
            question_type   text NOT NULL,
            n_observed      integer NOT NULL DEFAULT 0,
            avg_difficulty  real,
            last_seen_year  smallint,
            PRIMARY KEY (exam_id, topic_id, question_type)
        )
        """
    )


def downgrade() -> None:
    # Drop in dependency order. Cascade handles questions ←→ papers.
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.question_pattern_stats")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.topic_forecast")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.concept_appearance_stats")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.topic_appearance_stats")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.exam_past_questions")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.exam_past_papers")
    op.execute(f"DROP SCHEMA IF EXISTS {SCHEMA}")
