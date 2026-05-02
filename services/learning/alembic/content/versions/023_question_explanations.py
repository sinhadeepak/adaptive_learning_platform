"""question_explanations — cache for AI-generated teaching notes.

The student-facing /adaptive/explain endpoint produces a structured
teaching note (explanation + key_concept + common_pitfall) on every
wrong-answer expansion. Without caching the LLM is hit on every
expansion of every wrong answer by every student — high cost,
unnecessary latency.

This table caches one explanation per
(question_id, picked_idx, language, prompt_template_version) tuple.
First request misses → calls LLM → persists. Subsequent requests
read through and skip the LLM call entirely.

Cache invalidation: when a prompt template version bumps, new rows
land alongside old ones (the unique constraint includes the
version), so we always serve the explanation that matches the
*current* prompt. Old rows are kept for audit / experiments and
can be GC'd later.

Heuristic-source rows are not cached (they're cheap to compute and
caching them would just inflate the table).

Revision ID: 023
Revises: 022
Create Date: 2026-05-02
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "023"
down_revision: str | None = "022"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"


def upgrade() -> None:
    op.execute(
        f"""
        CREATE TABLE {SCHEMA}.question_explanations (
            id                       UUID PRIMARY KEY,
            question_id              UUID NOT NULL
                                     REFERENCES {SCHEMA}.questions(id)
                                     ON DELETE CASCADE,
            picked_idx               SMALLINT NOT NULL,
            language                 TEXT NOT NULL DEFAULT 'en',
            explanation              TEXT NOT NULL,
            key_concept              TEXT NOT NULL,
            common_pitfall           TEXT NOT NULL,
            source                   TEXT NOT NULL DEFAULT 'ai',
            model                    TEXT NULL,
            prompt_template_id       TEXT NOT NULL,
            prompt_template_version  TEXT NOT NULL,
            created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
            hit_count                INT NOT NULL DEFAULT 0,
            last_served_at           TIMESTAMPTZ NULL,

            CONSTRAINT chk_qe_source
                CHECK (source IN ('ai','heuristic'))
        )
        """
    )
    # Cache key: question + picked + language + prompt version. The
    # picked_idx encodes "no answer yet" as -1 and "correct answer"
    # path with the same idx as correctIdx.
    op.execute(
        f"""
        CREATE UNIQUE INDEX uq_question_explanations_key
            ON {SCHEMA}.question_explanations
            (question_id, picked_idx, language, prompt_template_version)
        """
    )
    # Lookup-by-question for diagnostic queries.
    op.execute(
        f"""
        CREATE INDEX idx_question_explanations_qid
            ON {SCHEMA}.question_explanations (question_id)
        """
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.question_explanations")
