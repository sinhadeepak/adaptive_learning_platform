"""Sprint 34 (P4-S34): topic_references table + small seed.

Per Phase 4 plan S34. Ships the schema + a proof-of-pipeline seed
covering ~2 references per JEE-side topic. Bulk content (~150 entries
for full JEE Physics) is workstream W1.

Revision ID: 012
Revises: 011
Create Date: 2026-04-28
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence

from alembic import op

revision: str = "012"
down_revision: str | None = "011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "catalog_schema"

MECH = "33333333-0000-0000-0000-000000000001"
THERMO = "33333333-0000-0000-0000-000000000002"
ELEC = "33333333-0000-0000-0000-000000000003"
PCHEM = "33333333-0000-0000-0000-000000000004"
OCHEM = "33333333-0000-0000-0000-000000000005"
CALC = "33333333-0000-0000-0000-000000000006"
COORD = "33333333-0000-0000-0000-000000000007"

REF_NAMESPACE = uuid.UUID("9d8a3a4f-1234-4abc-9def-2026042800000001")


def _refs_for(topic_id: str, refs: list[tuple[str, str, str]]) -> list[tuple]:
    """refs = [(kind, title, url), ...]. Returns rows ready to insert."""
    out = []
    for i, (kind, title, url) in enumerate(refs, start=1):
        rid = str(uuid.uuid5(REF_NAMESPACE, f"{topic_id}#{i}"))
        out.append((rid, topic_id, kind, title, url, i - 1))
    return out


# Compact seed — placeholder URLs that the W1 content workstream will
# replace with curated NCERT chapter scans, vetted YouTube explainers,
# textbook references, and derivation PDFs. Schema is the contract;
# content is the deliverable.
SEEDS: list[tuple[str, str, str, str, str, int]] = []
SEEDS += _refs_for(MECH, [
    ("ncert", "NCERT Physics Class 11 — Ch 5: Laws of Motion",
     "https://ncert.nic.in/textbook/pdf/keph105.pdf"),
    ("textbook", "HC Verma — Concepts of Physics Vol 1, Ch 5–6",
     "https://example.com/textbook/hcverma-vol1-ch5-6"),
    ("video", "Newton's Laws — concept walkthrough (12 min)",
     "https://example.com/video/newton-laws-walkthrough"),
])
SEEDS += _refs_for(THERMO, [
    ("ncert", "NCERT Physics Class 11 — Ch 12: Thermodynamics",
     "https://ncert.nic.in/textbook/pdf/keph212.pdf"),
    ("formula_sheet", "Thermodynamics formula sheet",
     "https://example.com/formula/thermo-cheatsheet"),
])
SEEDS += _refs_for(ELEC, [
    ("ncert", "NCERT Physics Class 12 — Ch 1: Electric Charges and Fields",
     "https://ncert.nic.in/textbook/pdf/leph101.pdf"),
    ("derivation", "Coulomb's Law derivation walkthrough",
     "https://example.com/derivation/coulombs-law"),
])
SEEDS += _refs_for(PCHEM, [
    ("ncert", "NCERT Chemistry Class 11 — Ch 6: Thermodynamics",
     "https://ncert.nic.in/textbook/pdf/kech106.pdf"),
    ("video", "Chemical kinetics in 15 minutes",
     "https://example.com/video/kinetics"),
])
SEEDS += _refs_for(OCHEM, [
    ("ncert", "NCERT Chemistry Class 12 — Ch 10: Haloalkanes & Haloarenes",
     "https://ncert.nic.in/textbook/pdf/lech110.pdf"),
    ("textbook", "OP Tandon — Organic Chemistry, SN1/SN2 chapter",
     "https://example.com/textbook/optandon-sn"),
])
SEEDS += _refs_for(CALC, [
    ("ncert", "NCERT Maths Class 12 — Ch 7: Integrals",
     "https://ncert.nic.in/textbook/pdf/lemh107.pdf"),
    ("video", "Definite integrals — derivation + worked examples",
     "https://example.com/video/definite-integrals"),
])
SEEDS += _refs_for(COORD, [
    ("ncert", "NCERT Maths Class 11 — Ch 10: Straight Lines",
     "https://ncert.nic.in/textbook/pdf/kemh110.pdf"),
])


def upgrade() -> None:
    op.execute(f"""
        CREATE TABLE {SCHEMA}.topic_references (
            id          UUID PRIMARY KEY,
            topic_id    UUID NOT NULL REFERENCES {SCHEMA}.topics(id) ON DELETE CASCADE,
            kind        TEXT NOT NULL CHECK (kind IN ('ncert','textbook','video','derivation','formula_sheet')),
            title       TEXT NOT NULL,
            url         TEXT NOT NULL,
            position    INTEGER NOT NULL DEFAULT 0,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute(
        f"CREATE INDEX idx_topic_references_topic "
        f"ON {SCHEMA}.topic_references (topic_id, position)"
    )

    for rid, topic_id, kind, title, url, position in SEEDS:
        op.execute(f"""
            INSERT INTO {SCHEMA}.topic_references (id, topic_id, kind, title, url, position)
            VALUES ('{rid}', '{topic_id}', '{kind}', $title${title}$title$, $url${url}$url$, {position})
            ON CONFLICT (id) DO NOTHING
        """)


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.topic_references")
