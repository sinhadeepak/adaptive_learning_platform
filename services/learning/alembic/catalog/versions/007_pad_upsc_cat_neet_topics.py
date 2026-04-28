"""Pad NEET + add UPSC_CSE + CAT subjects/topics so every exam has
real coverage in the cascading dropdown.

Before this migration the catalog looked like:
  JEE_MAIN: 7 topics across Physics / Chemistry / Math
  NEET:     2 topics under Biology only
  UPSC_CSE: 0 topics
  CAT:      0 topics

After:
  JEE_MAIN: unchanged (7 topics)
  NEET:     6 topics (added Physics + Chemistry)
  UPSC_CSE: 6 topics across Polity / History / Geography
  CAT:      5 topics across QA / VA / DI&LR

UUIDs are deterministic so the content service's question seed
(migration 003) can reference them by literal. ON CONFLICT DO NOTHING
makes the migration safe to re-run on a partially-seeded DB.

Revision ID: 007
Revises: 006
Create Date: 2026-04-26
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "007"
down_revision: str | None = "006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "catalog_schema"


# Subject UUIDs continue from 002's series (used 22222222-...01 through 06).
NEW_SUBJECTS = [
    # NEET extras — Physics + Chemistry (Biology already seeded in 002)
    ("22222222-0000-0000-0000-000000000005", "11111111-0000-0000-0000-000000000002", "PHY", "Physics", 2),
    ("22222222-0000-0000-0000-000000000006", "11111111-0000-0000-0000-000000000002", "CHEM", "Chemistry", 3),
    # UPSC_CSE
    ("22222222-0000-0000-0000-000000000007", "11111111-0000-0000-0000-000000000003", "POL", "Polity", 1),
    ("22222222-0000-0000-0000-000000000008", "11111111-0000-0000-0000-000000000003", "HIS", "History", 2),
    ("22222222-0000-0000-0000-000000000009", "11111111-0000-0000-0000-000000000003", "GEO", "Geography", 3),
    # CAT
    ("22222222-0000-0000-0000-000000000010", "11111111-0000-0000-0000-000000000004", "QA", "Quantitative Aptitude", 1),
    ("22222222-0000-0000-0000-000000000011", "11111111-0000-0000-0000-000000000004", "VA", "Verbal Ability", 2),
    ("22222222-0000-0000-0000-000000000012", "11111111-0000-0000-0000-000000000004", "DILR", "Data Interpretation & LR", 3),
]

# Topic UUIDs continue from 002's series (used 33333333-...01 through 09).
NEW_TOPICS = [
    # NEET Physics
    ("33333333-0000-0000-0000-000000000010", "22222222-0000-0000-0000-000000000005", "MECH_NEET", "Mechanics & Waves", "Newtonian motion, oscillations, sound.", 1),
    ("33333333-0000-0000-0000-000000000011", "22222222-0000-0000-0000-000000000005", "OPT_NEET",  "Optics",            "Reflection, refraction, lenses.",         2),
    # NEET Chemistry
    ("33333333-0000-0000-0000-000000000012", "22222222-0000-0000-0000-000000000006", "INORG_NEET","Inorganic Chemistry","Periodic table, bonding, coordination.", 1),
    ("33333333-0000-0000-0000-000000000013", "22222222-0000-0000-0000-000000000006", "ORG_NEET",  "Organic Chemistry",  "Hydrocarbons, biomolecules, polymers.",  2),
    # UPSC Polity
    ("33333333-0000-0000-0000-000000000014", "22222222-0000-0000-0000-000000000007", "CONST",   "Indian Constitution", "Preamble, fundamental rights, DPSP.", 1),
    ("33333333-0000-0000-0000-000000000015", "22222222-0000-0000-0000-000000000007", "GOV",     "Governance",          "Executive, legislature, judiciary.",  2),
    # UPSC History
    ("33333333-0000-0000-0000-000000000016", "22222222-0000-0000-0000-000000000008", "ANCIENT", "Ancient India",       "Indus, Vedic, Maurya, Gupta.",        1),
    ("33333333-0000-0000-0000-000000000017", "22222222-0000-0000-0000-000000000008", "MODERN",  "Modern India",        "Colonialism, freedom struggle.",      2),
    # UPSC Geography
    ("33333333-0000-0000-0000-000000000018", "22222222-0000-0000-0000-000000000009", "PHYS_GEO","Physical Geography",  "Climate, landforms, oceans.",         1),
    ("33333333-0000-0000-0000-000000000019", "22222222-0000-0000-0000-000000000009", "IND_GEO", "Indian Geography",    "Rivers, soils, monsoon, resources.",  2),
    # CAT QA
    ("33333333-0000-0000-0000-000000000020", "22222222-0000-0000-0000-000000000010", "ARITH",   "Arithmetic",          "Percentages, ratios, time-work.",     1),
    ("33333333-0000-0000-0000-000000000021", "22222222-0000-0000-0000-000000000010", "ALG",     "Algebra",             "Equations, inequalities, functions.", 2),
    # CAT VA
    ("33333333-0000-0000-0000-000000000022", "22222222-0000-0000-0000-000000000011", "RC",      "Reading Comprehension","Inference, tone, main idea.",         1),
    ("33333333-0000-0000-0000-000000000023", "22222222-0000-0000-0000-000000000011", "GRAM",    "Grammar & Vocabulary","Para jumbles, error spotting.",       2),
    # CAT DILR
    ("33333333-0000-0000-0000-000000000024", "22222222-0000-0000-0000-000000000012", "DI_LR",   "Data Interpretation", "Tables, charts, logical puzzles.",    1),
]


def upgrade() -> None:
    for sid, eid, code, name, sort_order in NEW_SUBJECTS:
        op.execute(
            f"INSERT INTO {SCHEMA}.subjects (id, exam_id, code, name, sort_order) "
            f"VALUES ('{sid}', '{eid}', '{code}', '{name}', {sort_order}) "
            f"ON CONFLICT (exam_id, code) DO NOTHING"
        )

    # Forward-fix for early test runs of this migration that used a
    # `$$ {title} $$` literal — the leading/trailing spaces ended up in
    # the row. Trim before re-inserting / on a second-pass run.
    op.execute(
        f"UPDATE {SCHEMA}.topics SET title = TRIM(title), "
        f"description = TRIM(description) "
        f"WHERE title <> TRIM(title) OR description <> TRIM(description)"
    )

    for tid, sid, code, title, desc, sort_order in NEW_TOPICS:
        # Set question_count to 20 to match content's seed migration 003.
        # Existing topics keep their pre-existing inflated counts to avoid
        # disturbing other seed expectations; future runs of the question
        # seed will keep them in sync explicitly if needed.
        op.execute(
            f"INSERT INTO {SCHEMA}.topics "
            f"(id, subject_id, code, title, description, question_count, sort_order) "
            f"VALUES ('{tid}', '{sid}', '{code}', "
            f"$${title}$$, $${desc}$$, 20, {sort_order}) "
            f"ON CONFLICT (subject_id, code) DO NOTHING"
        )


def downgrade() -> None:
    new_topic_ids = ", ".join(f"'{t[0]}'" for t in NEW_TOPICS)
    new_subject_ids = ", ".join(f"'{s[0]}'" for s in NEW_SUBJECTS)
    op.execute(f"DELETE FROM {SCHEMA}.topics WHERE id IN ({new_topic_ids})")
    op.execute(f"DELETE FROM {SCHEMA}.subjects WHERE id IN ({new_subject_ids})")
