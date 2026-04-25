"""Add Hindi titles to topics — Sprint 2 bilingual search (GAP-04 closure).

Per [SPIKE-02 closure](docs/02_planning/13_SPIKE-02_OpenSearch_Hindi_Analyzer.md),
each topic gains a `title_hi` (Devanagari) so the Search service can index
both alp_english and alp_hindi analyzed views from the same source row.
Description column already carries the Hinglish alias used as cross-script
fallback.

Revision ID: 004
Revises: 003
Create Date: 2026-04-25
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "004"
down_revision: str | None = "003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "catalog_schema"


def upgrade() -> None:
    op.execute(f"ALTER TABLE {SCHEMA}.topics ADD COLUMN IF NOT EXISTS title_hi TEXT")

    # Hindi titles for the 9 seeded topics — source of truth is the SPIKE-02 matrix.
    # Hinglish fallback is already in `description` (or appended to it).
    hindi_map = {
        "33333333-0000-0000-0000-000000000001": "यांत्रिकी",  # Mechanics
        "33333333-0000-0000-0000-000000000002": "ऊष्मागतिकी",  # Thermodynamics
        "33333333-0000-0000-0000-000000000003": "स्थिरवैद्युतिकी",  # Electrostatics
        "33333333-0000-0000-0000-000000000004": "भौतिक रसायन",  # Physical Chemistry
        "33333333-0000-0000-0000-000000000005": "कार्बनिक रसायन",  # Organic Chemistry
        "33333333-0000-0000-0000-000000000006": "कलन",  # Calculus
        "33333333-0000-0000-0000-000000000007": "निर्देशांक ज्यामिति",  # Coordinate Geometry
        "33333333-0000-0000-0000-000000000008": "कोशिका जीवविज्ञान",  # Cell Biology
        "33333333-0000-0000-0000-000000000009": "आनुवंशिकी",  # Genetics
    }
    for topic_id, title_hi in hindi_map.items():
        op.execute(
            f"UPDATE {SCHEMA}.topics SET title_hi = '{title_hi}' WHERE id = '{topic_id}'"
        )

    # Append Hinglish alias to description so cross-script ("yantriki") queries
    # still hit via the description field's standard analyzer.
    hinglish_aliases = {
        "33333333-0000-0000-0000-000000000001": "yantriki",
        "33333333-0000-0000-0000-000000000002": "ushmagatiki",
        "33333333-0000-0000-0000-000000000003": "sthir vidyutiki",
        "33333333-0000-0000-0000-000000000004": "bhautik rasayan",
        "33333333-0000-0000-0000-000000000005": "karbanik rasayan",
        "33333333-0000-0000-0000-000000000006": "kalan",
        "33333333-0000-0000-0000-000000000007": "jyamiti",
        "33333333-0000-0000-0000-000000000008": "jeev vigyan",
        "33333333-0000-0000-0000-000000000009": "anuvanshiki",
    }
    for topic_id, alias in hinglish_aliases.items():
        op.execute(
            f"UPDATE {SCHEMA}.topics "
            f"SET description = description || ' (' || '{alias}' || ')' "
            f"WHERE id = '{topic_id}' AND description NOT LIKE '%' || '{alias}' || '%'"
        )


def downgrade() -> None:
    op.execute(f"ALTER TABLE {SCHEMA}.topics DROP COLUMN IF EXISTS title_hi")
