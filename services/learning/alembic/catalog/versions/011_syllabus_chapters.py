"""Sprint 28 (P4-S28): syllabus_chapters table + chapter_id on topics.

Adds a chapter layer between catalog_schema.subjects and topics so the
coverage view can render "JEE Physics: 67% covered, 7 chapters remaining"
against the exam syllabus rather than just the bare topic count.

Per Phase 4 plan S28. Bulk chapter mapping (~50 chapters per exam, ~80
topic-chapter assignments for full JEE Main + Advanced) is content
workstream W1; this migration ships the schema + a small but realistic
proof-of-pipeline mapping over the 9 seeded JEE-side topics.

Revision ID: 011
Revises: 010
Create Date: 2026-04-28
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "011"
down_revision: str | None = "010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "catalog_schema"

JEE_MAIN_EXAM_ID = "11111111-0000-0000-0000-000000000001"
PHY_SUBJECT_ID = "22222222-0000-0000-0000-000000000001"
CHEM_SUBJECT_ID = "22222222-0000-0000-0000-000000000002"
MATH_SUBJECT_ID = "22222222-0000-0000-0000-000000000003"

# Topic UUIDs from catalog seed 002.
MECH = "33333333-0000-0000-0000-000000000001"
THERMO = "33333333-0000-0000-0000-000000000002"
ELEC = "33333333-0000-0000-0000-000000000003"
PCHEM = "33333333-0000-0000-0000-000000000004"
OCHEM = "33333333-0000-0000-0000-000000000005"
CALC = "33333333-0000-0000-0000-000000000006"
COORD = "33333333-0000-0000-0000-000000000007"

# (chapter_id, exam_id, subject_id, name, position, optional topic mapping)
_CHAPTERS = [
    # Physics — 5 chapters; 3 mapped, 2 missing
    ("55555555-0000-0000-0000-000000000001", JEE_MAIN_EXAM_ID, PHY_SUBJECT_ID, "Mechanics", 1, MECH),
    ("55555555-0000-0000-0000-000000000002", JEE_MAIN_EXAM_ID, PHY_SUBJECT_ID, "Thermodynamics", 2, THERMO),
    ("55555555-0000-0000-0000-000000000003", JEE_MAIN_EXAM_ID, PHY_SUBJECT_ID, "Electrostatics", 3, ELEC),
    ("55555555-0000-0000-0000-000000000004", JEE_MAIN_EXAM_ID, PHY_SUBJECT_ID, "Modern Physics", 4, None),
    ("55555555-0000-0000-0000-000000000005", JEE_MAIN_EXAM_ID, PHY_SUBJECT_ID, "Optics", 5, None),
    # Chemistry — 3 chapters; 2 mapped, 1 missing
    ("55555555-0000-0000-0000-000000000006", JEE_MAIN_EXAM_ID, CHEM_SUBJECT_ID, "Physical Chemistry", 1, PCHEM),
    ("55555555-0000-0000-0000-000000000007", JEE_MAIN_EXAM_ID, CHEM_SUBJECT_ID, "Organic Chemistry", 2, OCHEM),
    ("55555555-0000-0000-0000-000000000008", JEE_MAIN_EXAM_ID, CHEM_SUBJECT_ID, "Inorganic Chemistry", 3, None),
    # Mathematics — 4 chapters; 2 mapped, 2 missing
    ("55555555-0000-0000-0000-000000000009", JEE_MAIN_EXAM_ID, MATH_SUBJECT_ID, "Calculus", 1, CALC),
    ("55555555-0000-0000-0000-00000000000a", JEE_MAIN_EXAM_ID, MATH_SUBJECT_ID, "Coordinate Geometry", 2, COORD),
    ("55555555-0000-0000-0000-00000000000b", JEE_MAIN_EXAM_ID, MATH_SUBJECT_ID, "Algebra", 3, None),
    ("55555555-0000-0000-0000-00000000000c", JEE_MAIN_EXAM_ID, MATH_SUBJECT_ID, "Trigonometry", 4, None),
]


def upgrade() -> None:
    op.execute(f"""
        CREATE TABLE {SCHEMA}.syllabus_chapters (
            id          UUID PRIMARY KEY,
            exam_id     UUID NOT NULL REFERENCES {SCHEMA}.exams(id),
            subject_id  UUID NOT NULL REFERENCES {SCHEMA}.subjects(id),
            name        TEXT NOT NULL,
            position    INTEGER NOT NULL,
            UNIQUE (exam_id, subject_id, position)
        )
    """)
    op.execute(
        f"CREATE INDEX idx_syllabus_chapters_exam_subj "
        f"ON {SCHEMA}.syllabus_chapters (exam_id, subject_id)"
    )
    op.execute(f"""
        ALTER TABLE {SCHEMA}.topics
            ADD COLUMN IF NOT EXISTS chapter_id UUID NULL
            REFERENCES {SCHEMA}.syllabus_chapters(id)
    """)
    op.execute(
        f"CREATE INDEX IF NOT EXISTS idx_topics_chapter "
        f"ON {SCHEMA}.topics (chapter_id) WHERE chapter_id IS NOT NULL"
    )

    # Seed chapters
    for cid, eid, sid, name, pos, _topic in _CHAPTERS:
        op.execute(f"""
            INSERT INTO {SCHEMA}.syllabus_chapters (id, exam_id, subject_id, name, position)
            VALUES ('{cid}', '{eid}', '{sid}', $name${name}$name$, {pos})
            ON CONFLICT (id) DO NOTHING
        """)

    # Map existing topics → chapters (1:1 today; W1 fans out further)
    for cid, _eid, _sid, _name, _pos, topic_id in _CHAPTERS:
        if topic_id is None:
            continue
        op.execute(f"""
            UPDATE {SCHEMA}.topics
               SET chapter_id = '{cid}'
             WHERE id = '{topic_id}' AND chapter_id IS NULL
        """)


def downgrade() -> None:
    op.execute(f"DROP INDEX IF EXISTS {SCHEMA}.idx_topics_chapter")
    op.execute(f"ALTER TABLE {SCHEMA}.topics DROP COLUMN IF EXISTS chapter_id")
    op.execute(f"DROP INDEX IF EXISTS {SCHEMA}.idx_syllabus_chapters_exam_subj")
    op.execute(f"DROP TABLE IF EXISTS {SCHEMA}.syllabus_chapters")
