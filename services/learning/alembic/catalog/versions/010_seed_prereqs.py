"""Sprint 26 (P4-S26): seed concept prerequisite edges on
catalog_schema.topics.prerequisites.

The prerequisites JSONB column has lived on topics since migration 001 but
has been empty for every row. S26 activates it: a small but realistic
dependency graph over the seeded JEE-side topics, plus NEET Genetics →
Cell Biology.

JSONB shape: a flat list of topic_id UUIDs (the foreign-key form) e.g.
`["33333333-0000-0000-0000-000000000001"]`. The traversal helpers in
learning.prereqs.traversal read this directly.

Bulk topology (~50 topics × ~80 edges for full JEE Physics) is content
workstream W1. Migration 010 is proof-of-pipeline only.

Revision ID: 010
Revises: 009
Create Date: 2026-04-28
"""

from __future__ import annotations

import json
from collections.abc import Sequence

from alembic import op

revision: str = "010"
down_revision: str | None = "009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "catalog_schema"

# Topic UUIDs from catalog seed 002 + pad migration 007.
MECH = "33333333-0000-0000-0000-000000000001"
THERMO = "33333333-0000-0000-0000-000000000002"
ELEC = "33333333-0000-0000-0000-000000000003"
PCHEM = "33333333-0000-0000-0000-000000000004"
OCHEM = "33333333-0000-0000-0000-000000000005"
CALC = "33333333-0000-0000-0000-000000000006"
COORD = "33333333-0000-0000-0000-000000000007"
CELL = "33333333-0000-0000-0000-000000000008"
GEN = "33333333-0000-0000-0000-000000000009"

# (topic_id, [prereq_topic_id, ...]) — empty list = foundation topic.
EDGES: list[tuple[str, list[str]]] = [
    (MECH, []),
    (THERMO, [MECH]),
    (ELEC, [MECH, CALC]),
    (PCHEM, [CALC, MECH]),
    (OCHEM, [PCHEM]),
    (CALC, []),
    (COORD, []),
    (CELL, []),
    (GEN, [CELL]),
]


def upgrade() -> None:
    for topic_id, prereqs in EDGES:
        op.execute(
            f"""
            UPDATE {SCHEMA}.topics
               SET prerequisites = $prereqs${json.dumps(prereqs)}$prereqs$::jsonb
             WHERE id = '{topic_id}'
            """
        )


def downgrade() -> None:
    op.execute(
        f"""
        UPDATE {SCHEMA}.topics
           SET prerequisites = '[]'::jsonb
         WHERE id IN (
           '{MECH}', '{THERMO}', '{ELEC}', '{PCHEM}', '{OCHEM}',
           '{CALC}', '{COORD}', '{CELL}', '{GEN}'
         )
        """
    )
