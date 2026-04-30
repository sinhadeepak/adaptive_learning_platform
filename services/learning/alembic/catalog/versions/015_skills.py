"""Phase 5 (P5-S37): skills static reference (9 rows).

6 Bloom levels + 2 procedural + 1 strategic. The skill axes referenced
by `cognitive_demand` JSONB on questions and by `analytics_schema.bloom_mastery`.

Revision ID: 015
Revises: 014
Create Date: 2026-04-30
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence

from alembic import op

revision: str = "015"
down_revision: str | None = "014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "catalog_schema"

# Deterministic UUIDs so the IDs are stable across environments.
SKILL_NAMESPACE = uuid.UUID("0e5a1b8c-1234-4def-9abc-202604300001")

SKILLS = [
    "BLOOM_REMEMBER",
    "BLOOM_UNDERSTAND",
    "BLOOM_APPLY",
    "BLOOM_ANALYSE",
    "BLOOM_EVALUATE",
    "BLOOM_CREATE",
    "PROCEDURAL_BASIC",
    "PROCEDURAL_MULTI_STEP",
    "STRATEGIC_TEST_TAKING",
]


def upgrade() -> None:
    op.execute(f"""
        CREATE TABLE {SCHEMA}.skills (
            id    UUID PRIMARY KEY,
            name  TEXT NOT NULL UNIQUE
        )
    """)

    for name in SKILLS:
        sid = str(uuid.uuid5(SKILL_NAMESPACE, name))
        op.execute(f"""
            INSERT INTO {SCHEMA}.skills (id, name) VALUES ('{sid}', '{name}')
            ON CONFLICT (name) DO NOTHING
        """)


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.skills")
