"""ai_provider_config — admin-managed AI provider chain.

P7. Today every AI call (question authoring, exam research, grading)
goes to OpenAI via OPENAI_API_KEY. This migration adds a per-row
provider config table the admin UI manages: kind (ollama/openai/
anthropic), priority order, model, base URL (for self-hosted Ollama),
and an at-rest-encrypted API key.

The runtime fallback wrapper (services/learning/.../ai_providers/)
walks rows in priority order until one succeeds — so admins can put
Ollama first (free, local), OpenAI second (paid, reliable), Anthropic
third, and the system uses whichever is up.

Encryption: api_key_encrypted holds a Fernet token (32-byte AES + HMAC,
base64). The master key comes from `ALP_AI_KEY_SECRET` env var; if
unset the providers module logs a loud warning and falls back to a
dev-only constant — fine for local, never for prod.

Revision ID: 035
Revises: 035
Create Date: 2026-05-04
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "036"
down_revision: str | None = "035"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"


def upgrade() -> None:
    op.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {SCHEMA}.ai_provider_config (
            id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
            kind                TEXT         NOT NULL
                                CHECK (kind IN ('ollama', 'openai', 'anthropic')),
            display_name        TEXT         NOT NULL,
            enabled             BOOLEAN      NOT NULL DEFAULT TRUE,
            priority            INTEGER      NOT NULL DEFAULT 100,
            base_url            TEXT,
            model               TEXT         NOT NULL,
            -- Fernet-encrypted bytes of the API key. Empty/NULL is OK
            -- for Ollama (no auth) and as the "key not yet pasted" state.
            api_key_encrypted   TEXT,
            -- Last-4 chars of the plain key, kept clear so the admin UI
            -- can show "sk-…ab12" without round-tripping the key through
            -- the gateway. Set in tandem with api_key_encrypted; reset
            -- to NULL when the key is cleared.
            api_key_last4       TEXT,
            -- Free-form per-provider config that doesn't deserve a
            -- column (e.g. Ollama's `keep_alive`, Anthropic's `top_k`).
            extra               JSONB        NOT NULL DEFAULT '{{}}'::jsonb,
            created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            -- One row per (kind, model) so two OpenAI rows for gpt-4o
            -- vs gpt-4o-mini can coexist.
            CONSTRAINT uq_ai_provider_kind_model UNIQUE (kind, model)
        )
        """
    )
    op.execute(
        f"CREATE INDEX IF NOT EXISTS idx_ai_provider_priority "
        f"ON {SCHEMA}.ai_provider_config (priority) WHERE enabled = TRUE"
    )

    # Seed three default rows (disabled). Admin pastes keys + flips
    # enabled=TRUE via the UI to bring each online. Priorities are
    # 10/20/30 so admins can reorder without renumbering everyone —
    # gives breathing room for new entries between existing ones.
    op.execute(
        f"""
        INSERT INTO {SCHEMA}.ai_provider_config
            (kind, display_name, enabled, priority, base_url, model)
        VALUES
            ('ollama',    'Ollama (local)',     FALSE, 10, 'http://host.docker.internal:11434', 'llama3.1:8b'),
            ('openai',    'OpenAI',             FALSE, 20, NULL,                                 'gpt-4o-mini'),
            ('anthropic', 'Anthropic Claude',   FALSE, 30, NULL,                                 'claude-haiku-4-5-20251001')
        ON CONFLICT (kind, model) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute(f"DROP INDEX IF EXISTS {SCHEMA}.idx_ai_provider_priority")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.ai_provider_config")
