"""Phase 5 (P5-S37): localisation_glossary — terminology consistency.

Per ADR-0019 + Localisation pipeline (S43). Per-(subject, source_lang,
target_lang) glossary. AI translation prompts inject relevant entries.
5 categories: platform, subject, exam, locked (never translated),
cultural (flagged for human reviewer).

Revision ID: 015
Revises: 014
Create Date: 2026-04-30
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "015"
down_revision: str | None = "014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"


def upgrade() -> None:
    op.execute(f"""
        CREATE TABLE {SCHEMA}.localisation_glossary (
            id                UUID PRIMARY KEY,
            subject           TEXT NOT NULL,
            source_lang       TEXT NOT NULL,
            target_lang       TEXT NOT NULL,
            source_term       TEXT NOT NULL,
            target_term       TEXT NOT NULL,
            category          TEXT NOT NULL CHECK (category IN (
                'platform','subject','exam','locked','cultural'
            )),
            case_sensitive    BOOLEAN NOT NULL DEFAULT FALSE,
            context_hint      TEXT NULL,
            alt_translations  TEXT[] NULL,
            added_by          UUID NULL,
            added_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (subject, source_lang, target_lang, source_term)
        )
    """)
    op.execute(
        f"CREATE INDEX idx_glossary_lookup "
        f"ON {SCHEMA}.localisation_glossary (source_lang, target_lang, subject)"
    )
    op.execute(
        f"CREATE INDEX idx_glossary_category "
        f"ON {SCHEMA}.localisation_glossary (category)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.localisation_glossary")
