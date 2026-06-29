"""Drop the question_explanations → content_schema.questions FK.

The /adaptive/explain read-through cache is keyed by the QUIZ question id
(quiz_schema.questions, ~29k rows), but the cache table carried an FK to
content_schema.questions (~2k rows — only authored content). For every
quiz-originated question the upsert violated the FK, the error was swallowed
best-effort, and nothing ever cached → every viewer triggered a fresh LLM
call.

The cache is a write-through keyed store on a globally-unique question UUID;
it does not need referential integrity to the (separate) authored-content
table. Drop the FK so explanations persist for all questions. The unique
key on (question_id, picked_idx, language, prompt_template_version) and the
ON DELETE CASCADE are not relied upon by the cache (stale rows are harmless
and version-keyed).

Revision ID: 045
Revises: 044
Create Date: 2026-06-26
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "045"
down_revision: str | None = "044"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"
CONSTRAINT = "question_explanations_question_id_fkey"


def upgrade() -> None:
    op.execute(
        f"ALTER TABLE {SCHEMA}.question_explanations "
        f"DROP CONSTRAINT IF EXISTS {CONSTRAINT}"
    )


def downgrade() -> None:
    # Re-add the FK. Best-effort: rows referencing non-content questions
    # would block this, so guard with NOT VALID to avoid a full re-scan
    # failing on pre-existing quiz-keyed rows.
    op.execute(
        f"ALTER TABLE {SCHEMA}.question_explanations "
        f"ADD CONSTRAINT {CONSTRAINT} "
        f"FOREIGN KEY (question_id) REFERENCES {SCHEMA}.questions(id) "
        f"ON DELETE CASCADE NOT VALID"
    )
