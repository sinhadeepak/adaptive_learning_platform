"""Translation workbench: language registry + batch engine tables.

Revision ID: 043
Revises: 042
Create Date: 2026-06-17
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "043"
down_revision: str | None = "042"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"


def upgrade() -> None:
    # ── Language registry ────────────────────────────────────────────────
    op.execute(f"""
        CREATE TABLE {SCHEMA}.supported_languages (
            code         TEXT PRIMARY KEY,
            name         TEXT NOT NULL,
            native_name  TEXT NOT NULL,
            script       TEXT NULL,
            enabled      BOOLEAN NOT NULL DEFAULT TRUE,
            is_source    BOOLEAN NOT NULL DEFAULT FALSE,
            sort_order   INTEGER NOT NULL DEFAULT 100,
            created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    # At most one source language.
    op.execute(f"""
        CREATE UNIQUE INDEX uq_supported_languages_single_source
        ON {SCHEMA}.supported_languages (is_source)
        WHERE is_source = TRUE
    """)
    op.execute(f"""
        INSERT INTO {SCHEMA}.supported_languages
          (code, name, native_name, script, enabled, is_source, sort_order)
        VALUES
          ('en', 'English',  'English', 'Latin',      TRUE, TRUE,  0),
          ('hi', 'Hindi',    'हिन्दी',   'Devanagari', TRUE, FALSE, 10),
          ('ta', 'Tamil',    'தமிழ்',    'Tamil',      TRUE, FALSE, 20),
          ('te', 'Telugu',   'తెలుగు',   'Telugu',     TRUE, FALSE, 30),
          ('bn', 'Bengali',  'বাংলা',     'Bengali',    TRUE, FALSE, 40),
          ('mr', 'Marathi',  'मराठी',    'Devanagari', TRUE, FALSE, 50)
    """)

    # ── Batch header ─────────────────────────────────────────────────────
    op.execute(f"""
        CREATE TABLE {SCHEMA}.translation_batches (
            id                 UUID PRIMARY KEY,
            created_by         UUID NULL,
            status             TEXT NOT NULL DEFAULT 'QUEUED'
                               CHECK (status IN ('QUEUED','RUNNING','DONE','DONE_WITH_ERRORS')),
            total_tasks        INTEGER NOT NULL DEFAULT 0,
            done_tasks         INTEGER NOT NULL DEFAULT 0,
            failed_tasks       INTEGER NOT NULL DEFAULT 0,
            target_langs       TEXT[] NOT NULL DEFAULT '{{}}',
            subject            TEXT NOT NULL DEFAULT 'general',
            overwrite_existing BOOLEAN NOT NULL DEFAULT FALSE,
            created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
            finished_at        TIMESTAMPTZ NULL
        )
    """)

    # ── Per (question, language) task ────────────────────────────────────
    op.execute(f"""
        CREATE TABLE {SCHEMA}.translation_batch_tasks (
            id           UUID PRIMARY KEY,
            batch_id     UUID NOT NULL REFERENCES {SCHEMA}.translation_batches(id) ON DELETE CASCADE,
            question_id  UUID NOT NULL,
            language     TEXT NOT NULL,
            status       TEXT NOT NULL DEFAULT 'PENDING'
                         CHECK (status IN ('PENDING','RUNNING','SUCCEEDED','FAILED','SKIPPED')),
            error        TEXT NULL,
            version      INTEGER NULL,
            created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (batch_id, question_id, language)
        )
    """)
    op.execute(
        f"CREATE INDEX idx_batch_tasks_batch_status "
        f"ON {SCHEMA}.translation_batch_tasks (batch_id, status)"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.translation_batch_tasks")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.translation_batches")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.supported_languages")
