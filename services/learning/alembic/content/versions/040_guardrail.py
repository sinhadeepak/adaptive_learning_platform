"""040 — AI Content Guardrail: pgvector + per-question guardrail columns.

Adds the two guardrail fields we actually query/index on the questions
table (the rest of the per-generation metadata lives in the existing
ai_origin JSONB and the ai_generation_jobs trace, migration 041):

  - guardrail_status : final PASS / REVIEW / FAIL outcome. Drives the
    moderator REVIEW sub-queue filter and the admin metrics endpoint.
  - embedding        : pgvector(1536) of the question stem, for the L3
    cosine-similarity nearest-neighbour scan.

Requires the pgvector extension (>= 0.5.0 for HNSW). CREATE EXTENSION
needs superuser or the extension preloaded in the Postgres image —
note for the infra/Docker side.

Revision ID: 040
Revises: 039
Create Date: 2026-06-15
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "040"
down_revision: str | None = "039"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute(
        f"""
        ALTER TABLE {SCHEMA}.questions
            ADD COLUMN IF NOT EXISTS guardrail_status TEXT NULL
                CHECK (guardrail_status IN ('PASS','REVIEW','FAIL')),
            ADD COLUMN IF NOT EXISTS embedding vector(1536) NULL
        """
    )
    # HNSW index for fast approximate cosine nearest-neighbour (pgvector
    # >= 0.5.0). vector_cosine_ops matches the `<=>` cosine-distance op.
    op.execute(
        f"CREATE INDEX IF NOT EXISTS idx_questions_embedding_hnsw "
        f"ON {SCHEMA}.questions USING hnsw (embedding vector_cosine_ops)"
    )
    op.execute(
        f"CREATE INDEX IF NOT EXISTS idx_questions_guardrail_status "
        f"ON {SCHEMA}.questions (guardrail_status) "
        f"WHERE guardrail_status IS NOT NULL"
    )


def downgrade() -> None:
    op.execute(f"DROP INDEX IF EXISTS {SCHEMA}.idx_questions_guardrail_status")
    op.execute(f"DROP INDEX IF EXISTS {SCHEMA}.idx_questions_embedding_hnsw")
    op.execute(
        f"ALTER TABLE {SCHEMA}.questions "
        f"DROP COLUMN IF EXISTS embedding, "
        f"DROP COLUMN IF EXISTS guardrail_status"
    )
    # Leave the `vector` extension installed — other objects may use it.
