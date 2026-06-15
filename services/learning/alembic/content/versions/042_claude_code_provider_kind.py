"""Add 'claude_code' provider kind.

Widens the ai_provider_config.kind CHECK constraint to allow a fourth
provider that fulfils calls via the local `claude -p` CLI (subscription
auth) instead of an HTTP API. Seeds one disabled row so it appears in
the admin AI Providers UI out of the box.

Revision ID: 042
Revises: 041
Create Date: 2026-06-15
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "042"
down_revision: str | None = "041"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"


def upgrade() -> None:
    # Inline CHECK from migration 036 is auto-named <table>_<column>_check.
    op.execute(
        f"ALTER TABLE {SCHEMA}.ai_provider_config "
        f"DROP CONSTRAINT IF EXISTS ai_provider_config_kind_check"
    )
    op.execute(
        f"ALTER TABLE {SCHEMA}.ai_provider_config "
        f"ADD CONSTRAINT ai_provider_config_kind_check "
        f"CHECK (kind IN ('ollama', 'openai', 'anthropic', 'claude_code'))"
    )
    # Seed one disabled row. No key/base_url — CLI uses subscription login.
    # Priority 25 sits between OpenAI (20) and Anthropic (30) from migration 036.
    op.execute(
        f"""
        INSERT INTO {SCHEMA}.ai_provider_config
            (kind, display_name, enabled, priority, base_url, model,
             api_key_encrypted, api_key_last4, extra)
        VALUES
            ('claude_code', 'Claude Code (CLI)', FALSE, 25, NULL,
             'sonnet', NULL, NULL, '{{}}'::jsonb)
        ON CONFLICT (kind, model) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute(
        f"DELETE FROM {SCHEMA}.ai_provider_config WHERE kind = 'claude_code'"
    )
    op.execute(
        f"ALTER TABLE {SCHEMA}.ai_provider_config "
        f"DROP CONSTRAINT IF EXISTS ai_provider_config_kind_check"
    )
    op.execute(
        f"ALTER TABLE {SCHEMA}.ai_provider_config "
        f"ADD CONSTRAINT ai_provider_config_kind_check "
        f"CHECK (kind IN ('ollama', 'openai', 'anthropic'))"
    )
