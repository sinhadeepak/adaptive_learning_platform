"""Seed full mock-test blueprints for NEET, JEE Main and CBSE 8-9
that mirror the real exam-day rules (count, duration, marking).

Migration 009 already seeded one JEE Main and two JEE Advanced
blueprints. This migration adds:

  * 2 more JEE Main mock variants (Mock 2 + Mock 3)
  * 3 NEET mock variants
  * 3 CBSE Class 9 Science + Maths mock variants

Real-exam rules captured per the MOCKS reference card:

  | Exam      | Q-count | Minutes | +Mark | -Mark | Sections    |
  |-----------|---------|---------|-------|-------|-------------|
  | JEE Main  |    75   |   180   |   4   | -1.0  | 3 (PCM)     |
  | NEET      |   200   |   200   |   4   | -1.0  | 4 (P/C/B/Z) |
  | CBSE 8-9  |    40   |    90   |   1   |  0.0  | 2-3         |

UUIDs continue from 009's series (44444444-...01 → 03 already used).

Revision ID: 018
Revises: 017
Create Date: 2026-05-03
"""

from __future__ import annotations

import json
from collections.abc import Sequence

from alembic import op

revision: str = "018"
down_revision: str | None = "017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "catalog_schema"

# Exam IDs
JEE_MAIN_EXAM_ID = "11111111-0000-0000-0000-000000000001"
NEET_EXAM_ID     = "11111111-0000-0000-0000-000000000002"
CBSE_EXAM_ID     = "11111111-0000-0000-0000-000000000005"

# Subject IDs (per migrations 002 + 007 + 017)
JEE_PHY = "22222222-0000-0000-0000-000000000001"
JEE_CHEM = "22222222-0000-0000-0000-000000000002"
JEE_MATH = "22222222-0000-0000-0000-000000000003"
NEET_BIO = "22222222-0000-0000-0000-000000000004"
NEET_PHY = "22222222-0000-0000-0000-000000000005"
NEET_CHEM = "22222222-0000-0000-0000-000000000006"
CBSE_C9_SCI = "22222222-0000-0000-0000-000000000015"
CBSE_C9_MATH = "22222222-0000-0000-0000-000000000016"


def _section(section_id, name, subject_id, n, m, dist=None):
    return {
        "section_id": section_id,
        "name": name,
        "subject_id": subject_id,
        "n_questions": n,
        "n_minutes": m,
        "difficulty_distribution": dist or {"easy": 0.30, "medium": 0.50, "hard": 0.20},
    }


# ─────────────────────────────────────────────────────────────────────────
# Mock-test catalogue. Every row produces one exam_blueprints record.
# ─────────────────────────────────────────────────────────────────────────
MOCKS: list[dict] = [
    # JEE Main — Mock 2 (additional variant alongside 009's "Standard")
    {
        "id": "44444444-0000-0000-0000-000000000010",
        "exam_id": JEE_MAIN_EXAM_ID,
        "name": "JEE Main — Mock 2",
        "total_questions": 75, "total_minutes": 180,
        "marks_correct": 4, "marks_negative": -1.0,
        "sections": [
            _section("physics",   "Physics",      JEE_PHY,  25, 60),
            _section("chemistry", "Chemistry",    JEE_CHEM, 25, 60),
            _section("maths",     "Mathematics",  JEE_MATH, 25, 60),
        ],
        "inter_section_navigation": True, "per_section_time_locked": False,
    },
    # JEE Main — Mock 3
    {
        "id": "44444444-0000-0000-0000-000000000011",
        "exam_id": JEE_MAIN_EXAM_ID,
        "name": "JEE Main — Mock 3 (challenger)",
        "total_questions": 75, "total_minutes": 180,
        "marks_correct": 4, "marks_negative": -1.0,
        "sections": [
            _section("physics",   "Physics",     JEE_PHY,  25, 60,
                     {"easy": 0.20, "medium": 0.50, "hard": 0.30}),
            _section("chemistry", "Chemistry",   JEE_CHEM, 25, 60,
                     {"easy": 0.20, "medium": 0.50, "hard": 0.30}),
            _section("maths",     "Mathematics", JEE_MATH, 25, 60,
                     {"easy": 0.20, "medium": 0.50, "hard": 0.30}),
        ],
        "inter_section_navigation": True, "per_section_time_locked": False,
    },
    # NEET — Mock 1 / 2 / 3 (200 Q / 200 min / +4/-1)
    {
        "id": "44444444-0000-0000-0000-000000000020",
        "exam_id": NEET_EXAM_ID,
        "name": "NEET — Mock 1",
        "total_questions": 200, "total_minutes": 200,
        "marks_correct": 4, "marks_negative": -1.0,
        "sections": [
            _section("physics",   "Physics",   NEET_PHY,  50, 50),
            _section("chemistry", "Chemistry", NEET_CHEM, 50, 50),
            _section("botany",    "Botany",    NEET_BIO,  50, 50),
            _section("zoology",   "Zoology",   NEET_BIO,  50, 50),
        ],
        "inter_section_navigation": True, "per_section_time_locked": False,
    },
    {
        "id": "44444444-0000-0000-0000-000000000021",
        "exam_id": NEET_EXAM_ID,
        "name": "NEET — Mock 2",
        "total_questions": 200, "total_minutes": 200,
        "marks_correct": 4, "marks_negative": -1.0,
        "sections": [
            _section("physics",   "Physics",   NEET_PHY,  50, 50),
            _section("chemistry", "Chemistry", NEET_CHEM, 50, 50),
            _section("botany",    "Botany",    NEET_BIO,  50, 50),
            _section("zoology",   "Zoology",   NEET_BIO,  50, 50),
        ],
        "inter_section_navigation": True, "per_section_time_locked": False,
    },
    {
        "id": "44444444-0000-0000-0000-000000000022",
        "exam_id": NEET_EXAM_ID,
        "name": "NEET — Mock 3 (final-prep)",
        "total_questions": 200, "total_minutes": 200,
        "marks_correct": 4, "marks_negative": -1.0,
        "sections": [
            _section("physics",   "Physics",   NEET_PHY,  50, 50,
                     {"easy": 0.20, "medium": 0.50, "hard": 0.30}),
            _section("chemistry", "Chemistry", NEET_CHEM, 50, 50,
                     {"easy": 0.20, "medium": 0.50, "hard": 0.30}),
            _section("botany",    "Botany",    NEET_BIO,  50, 50,
                     {"easy": 0.20, "medium": 0.50, "hard": 0.30}),
            _section("zoology",   "Zoology",   NEET_BIO,  50, 50,
                     {"easy": 0.20, "medium": 0.50, "hard": 0.30}),
        ],
        "inter_section_navigation": True, "per_section_time_locked": False,
    },
    # CBSE Class 9 — Science Mock 1 (40 MCQs, 90 min, no neg marking)
    {
        "id": "44444444-0000-0000-0000-000000000030",
        "exam_id": CBSE_EXAM_ID,
        "name": "CBSE Class 9 Science — Mock 1",
        "total_questions": 40, "total_minutes": 90,
        "marks_correct": 1, "marks_negative": 0.0,
        "sections": [
            _section("science",   "Science",     CBSE_C9_SCI,  40, 90),
        ],
        "inter_section_navigation": True, "per_section_time_locked": False,
    },
    # CBSE Class 9 — Maths Mock 1 (40 Q, 90 min)
    {
        "id": "44444444-0000-0000-0000-000000000031",
        "exam_id": CBSE_EXAM_ID,
        "name": "CBSE Class 9 Maths — Mock 1",
        "total_questions": 40, "total_minutes": 90,
        "marks_correct": 1, "marks_negative": 0.0,
        "sections": [
            _section("maths",     "Mathematics", CBSE_C9_MATH, 40, 90),
        ],
        "inter_section_navigation": True, "per_section_time_locked": False,
    },
    # CBSE Class 9 — Combined Sample (Sci + Math)
    {
        "id": "44444444-0000-0000-0000-000000000032",
        "exam_id": CBSE_EXAM_ID,
        "name": "CBSE Class 9 Combined — Sample Paper",
        "total_questions": 50, "total_minutes": 120,
        "marks_correct": 1, "marks_negative": 0.0,
        "sections": [
            _section("science",   "Science",     CBSE_C9_SCI,  25, 60),
            _section("maths",     "Mathematics", CBSE_C9_MATH, 25, 60),
        ],
        "inter_section_navigation": True, "per_section_time_locked": False,
    },
]


def upgrade() -> None:
    for bp in MOCKS:
        sections_json = json.dumps(bp["sections"])
        op.execute(f"""
            INSERT INTO {SCHEMA}.exam_blueprints
              (id, exam_id, name, total_questions, total_minutes,
               marks_correct, marks_negative, sections,
               inter_section_navigation, per_section_time_locked)
            VALUES
              ('{bp["id"]}', '{bp["exam_id"]}', $${bp["name"]}$$,
               {bp["total_questions"]}, {bp["total_minutes"]},
               {bp["marks_correct"]}, {bp["marks_negative"]},
               $${sections_json}$$::jsonb,
               {bp["inter_section_navigation"]},
               {bp["per_section_time_locked"]})
            ON CONFLICT (id) DO NOTHING
        """)


def downgrade() -> None:
    ids = ", ".join(f"'{m['id']}'" for m in MOCKS)
    op.execute(f"DELETE FROM {SCHEMA}.exam_blueprints WHERE id IN ({ids})")
