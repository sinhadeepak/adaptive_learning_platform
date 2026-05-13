"""Seed CBSE exam + Class 8 / Class 9 subjects + topics.

Until now the catalog had four exams (JEE_MAIN, NEET, UPSC_CSE, CAT)
but no CBSE coverage — so the e2e test setup couldn't generate Class
8-9 question banks. This migration adds CBSE as a fifth exam and
seeds four subjects (Class 8 Science / Math + Class 9 Science / Math)
with 12 representative topics drawn from the NCERT syllabus.

UUID conventions continue the deterministic series used by 002 + 007:
  Exam      : 11111111-0000-0000-0000-000000000005
  Subjects  : 22222222-0000-0000-0000-000000000013..016
  Topics    : 33333333-0000-0000-0000-000000000025..036

ON CONFLICT DO NOTHING keeps the migration idempotent.

Revision ID: 017
Revises: 016
Create Date: 2026-05-03
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "017"
down_revision: str | None = "016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "catalog_schema"

CBSE_EXAM_ID = "11111111-0000-0000-0000-000000000005"

SUBJECTS = [
    ("22222222-0000-0000-0000-000000000013", "C8_SCI", "Class 8 Science", 1),
    ("22222222-0000-0000-0000-000000000014", "C8_MATH", "Class 8 Maths", 2),
    ("22222222-0000-0000-0000-000000000015", "C9_SCI", "Class 9 Science", 3),
    ("22222222-0000-0000-0000-000000000016", "C9_MATH", "Class 9 Maths", 4),
]

TOPICS = [
    # Class 8 Science (3)
    ("33333333-0000-0000-0000-000000000025", "22222222-0000-0000-0000-000000000013",
     "C8_FORCE", "Force & Pressure", "Types of forces, pressure in fluids, atmospheric pressure.", 1),
    ("33333333-0000-0000-0000-000000000026", "22222222-0000-0000-0000-000000000013",
     "C8_LIGHT", "Light & Sound", "Reflection, refraction, propagation of sound, multiple reflections.", 2),
    ("33333333-0000-0000-0000-000000000027", "22222222-0000-0000-0000-000000000013",
     "C8_CELL", "Cell Structure", "Discovery of the cell, plant vs animal cells, organelles.", 3),
    # Class 8 Maths (3)
    ("33333333-0000-0000-0000-000000000028", "22222222-0000-0000-0000-000000000014",
     "C8_RAT", "Rational Numbers", "Properties of rationals, representation on number line.", 1),
    ("33333333-0000-0000-0000-000000000029", "22222222-0000-0000-0000-000000000014",
     "C8_LIN", "Linear Equations (1 var)", "Solving simple algebraic equations and word problems.", 2),
    ("33333333-0000-0000-0000-000000000030", "22222222-0000-0000-0000-000000000014",
     "C8_MENS", "Mensuration", "Areas of plane figures, surface area & volume of solids.", 3),
    # Class 9 Science (3)
    ("33333333-0000-0000-0000-000000000031", "22222222-0000-0000-0000-000000000015",
     "C9_MATTER", "Matter & Its Nature", "States of matter, solutions, atoms and molecules.", 1),
    ("33333333-0000-0000-0000-000000000032", "22222222-0000-0000-0000-000000000015",
     "C9_MOTION", "Motion & Newton's Laws", "Distance/displacement, equations of motion, force & inertia.", 2),
    ("33333333-0000-0000-0000-000000000033", "22222222-0000-0000-0000-000000000015",
     "C9_GRAV", "Gravitation & Sound", "Universal law of gravitation, weight, sound propagation.", 3),
    # Class 9 Maths (3)
    ("33333333-0000-0000-0000-000000000034", "22222222-0000-0000-0000-000000000016",
     "C9_NUM", "Number Systems", "Real numbers, irrational numbers, laws of exponents.", 1),
    ("33333333-0000-0000-0000-000000000035", "22222222-0000-0000-0000-000000000016",
     "C9_POLY", "Polynomials & Coord Geom", "Factor theorem, polynomial identities, coordinate plane.", 2),
    ("33333333-0000-0000-0000-000000000036", "22222222-0000-0000-0000-000000000016",
     "C9_TRI", "Triangles & Statistics", "Congruence, similarity, basic data handling.", 3),
]


def upgrade() -> None:
    op.execute(
        f"""
        INSERT INTO {SCHEMA}.exams (id, code, name, subtitle, icon_key, sort_order) VALUES
          ('{CBSE_EXAM_ID}', 'CBSE', 'CBSE (Class 8-9)',
           'NCERT Class 8 & 9 — Science and Maths', 'exam-cbse', 5)
        ON CONFLICT (code) DO NOTHING
        """
    )

    for sid, code, name, sort_order in SUBJECTS:
        op.execute(
            f"INSERT INTO {SCHEMA}.subjects (id, exam_id, code, name, sort_order) "
            f"VALUES ('{sid}', '{CBSE_EXAM_ID}', '{code}', "
            f"$${name}$$, {sort_order}) "
            f"ON CONFLICT (exam_id, code) DO NOTHING"
        )

    for tid, sid, code, title, desc, sort_order in TOPICS:
        op.execute(
            f"INSERT INTO {SCHEMA}.topics "
            f"(id, subject_id, code, title, description, question_count, sort_order) "
            f"VALUES ('{tid}', '{sid}', '{code}', "
            f"$${title}$$, $${desc}$$, 30, {sort_order}) "
            f"ON CONFLICT (subject_id, code) DO NOTHING"
        )

    # Enable the same default question-type families as the matrix in
    # 016_exam_question_type_support.py declares for CBSE:
    #   objective + numeric + matching + fill_in + subjective + visual + audio_video
    cbse_types = (
        # objective
        "MCQ_SINGLE", "MCQ_MULTI", "TRUE_FALSE", "ASSERTION_REASON", "MULTI_STATEMENT",
        # numeric
        "NUMERIC_INTEGER", "NUMERIC_DECIMAL", "NUMERIC_RANGE", "FORMULA_INPUT",
        # matching
        "MATCH_THE_FOLLOWING", "SEQUENCING", "CLASSIFICATION",
        # fill_in
        "FILL_BLANK_SINGLE", "FILL_BLANK_MULTI", "CLOZE_PASSAGE", "SHORT_TEXT",
        # subjective
        "ESSAY", "DESCRIPTIVE_LONG", "CASE_STUDY", "COMPREHENSION_LONG",
        # visual
        "DIAGRAM_HOTSPOT", "DIAGRAM_LABEL", "MAP_LOCATION", "PICTORIAL_IDENTIFY",
    )
    for type_id in cbse_types:
        op.execute(
            f"INSERT INTO {SCHEMA}.exam_question_type_support (exam_id, type_id, enabled) "
            f"VALUES ('{CBSE_EXAM_ID}', '{type_id}', TRUE) "
            f"ON CONFLICT (exam_id, type_id) DO NOTHING"
        )


def downgrade() -> None:
    topic_ids = ", ".join(f"'{t[0]}'" for t in TOPICS)
    subj_ids = ", ".join(f"'{s[0]}'" for s in SUBJECTS)
    op.execute(
        f"DELETE FROM {SCHEMA}.exam_question_type_support "
        f"WHERE exam_id = '{CBSE_EXAM_ID}'"
    )
    op.execute(f"DELETE FROM {SCHEMA}.topics WHERE id IN ({topic_ids})")
    op.execute(f"DELETE FROM {SCHEMA}.subjects WHERE id IN ({subj_ids})")
    op.execute(f"DELETE FROM {SCHEMA}.exams WHERE id = '{CBSE_EXAM_ID}'")
