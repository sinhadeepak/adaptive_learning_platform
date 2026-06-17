"""Sprint 24 (P4-S24): seed 6 sample PYQ questions for JEE-MAIN-2024-JAN-S1.

Proof-of-pipeline only. The S24 PYQ ingest CLI is the production tool;
this seed exists so a fresh `make seed-restore` stack returns non-empty
data from the new /content/pyqs + /content/pyqs/frequency endpoints.

Bulk PYQ corpus (10 yrs × ~225 questions × 3 sessions per exam) is the
parallel content workstream W1.

Local-only: guarded by CONTENT_SEED_LOCAL=1 to mirror the question bank
seed at migration 003. Absent in staging/prod.

Idempotent — uses deterministic UUIDs derived from paper_session +
question index. Re-running is a no-op (ON CONFLICT (id) DO NOTHING).

Revision ID: 007
Revises: 006
Create Date: 2026-04-28
"""

from __future__ import annotations

import json
import os
import uuid
from collections.abc import Sequence

from alembic import op

revision: str = "007"
down_revision: str | None = "006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "content_schema"
PAPER_SESSION = "JEE-MAIN-2024-JAN-S1"
EXAM_YEAR = 2024
SEED_AUTHOR_ID = "00000000-0000-0000-0000-000000000004"

# Topic UUIDs from catalog seed 002.
TOPIC_MECH = "33333333-0000-0000-0000-000000000001"
TOPIC_PCHEM = "33333333-0000-0000-0000-000000000004"
TOPIC_OCHEM = "33333333-0000-0000-0000-000000000005"
TOPIC_CALC = "33333333-0000-0000-0000-000000000006"
TOPIC_COORD = "33333333-0000-0000-0000-000000000007"

PYQ_NAMESPACE = uuid.UUID("3a4ef6c4-9af2-4f6b-a7c3-202401010001")


def _qid(idx: int) -> str:
    return str(uuid.uuid5(PYQ_NAMESPACE, f"{PAPER_SESSION}#{idx}"))


# Six representative PYQ-style questions. Stems are paraphrased
# JEE-Main-flavoured items. Difficulty + IRT params are placeholders;
# real PYQ ingest carries calibrated triples.
SAMPLES = [
    # Physics — Mechanics (2)
    {
        "topic_id": TOPIC_MECH,
        "stem": (
            "A block of mass 2 kg slides down a frictionless incline of angle 30°. "
            "What is its acceleration along the incline? (g = 10 m/s²)"
        ),
        "choices": ["2.5 m/s²", "5 m/s²", "7.5 m/s²", "10 m/s²"],
        "correct_idx": 1,
        "difficulty_b": -0.4,
        "explanation": "a = g sin θ = 10 × sin 30° = 5 m/s².",
    },
    {
        "topic_id": TOPIC_MECH,
        "stem": (
            "A body executes uniform circular motion of radius 2 m at 4 m/s. "
            "Its centripetal acceleration is:"
        ),
        "choices": ["2 m/s²", "4 m/s²", "8 m/s²", "16 m/s²"],
        "correct_idx": 2,
        "difficulty_b": -0.2,
        "explanation": "a = v²/r = 16/2 = 8 m/s².",
    },
    # Chemistry — Physical (1) + Organic (1)
    {
        "topic_id": TOPIC_PCHEM,
        "stem": (
            "For the reaction A → B with k = 0.0693 min⁻¹, the half-life is closest to:"
        ),
        "choices": ["1 min", "5 min", "10 min", "20 min"],
        "correct_idx": 2,
        "difficulty_b": 0.0,
        "explanation": "t½ = ln 2 / k = 0.693 / 0.0693 = 10 min.",
    },
    {
        "topic_id": TOPIC_OCHEM,
        "stem": (
            "Which of the following undergoes SN1 reaction most readily?"
        ),
        "choices": [
            "Methyl chloride",
            "Ethyl chloride",
            "Isopropyl chloride",
            "Tert-butyl chloride",
        ],
        "correct_idx": 3,
        "difficulty_b": 0.2,
        "explanation": "SN1 favours stable carbocations; tert-butyl gives a 3° cation.",
    },
    # Maths — Calculus (1) + Coord (1)
    {
        "topic_id": TOPIC_CALC,
        "stem": "The value of ∫₀^π sin x dx is:",
        "choices": ["0", "1", "2", "π"],
        "correct_idx": 2,
        "difficulty_b": -0.5,
        "explanation": "∫₀^π sin x dx = [-cos x]₀^π = -(-1) - (-1) = 2.",
    },
    {
        "topic_id": TOPIC_COORD,
        "stem": (
            "The slope of the line passing through (2, 3) and (5, 11) is:"
        ),
        "choices": ["8/3", "5/2", "11/5", "3/8"],
        "correct_idx": 0,
        "difficulty_b": -0.3,
        "explanation": "slope = (11−3) / (5−2) = 8/3.",
    },
]


def upgrade() -> None:
    if os.environ.get("CONTENT_SEED_LOCAL") != "1":
        # Staging/prod: real authors land PYQs via the ingest CLI; the
        # seed is a no-op so we don't pollute the bank.
        return

    for idx, q in enumerate(SAMPLES, start=1):
        qid = _qid(idx)
        op.execute(
            f"""
            INSERT INTO {SCHEMA}.questions
              (id, topic_id, stem, choices, correct_idx, difficulty_b,
               discrimination_a, guessing_c, language, status, created_by, explanation,
               exam_year, paper_session, pyq_flag,
               submitted_at, reviewed_at, reviewed_by)
            VALUES
              ('{qid}', '{q["topic_id"]}',
               $stem${q["stem"]}$stem$,
               $choices${json.dumps(q["choices"])}$choices$::jsonb,
               {q["correct_idx"]}, {q["difficulty_b"]},
               1.0, 0.25, 'en', 'PUBLISHED', '{SEED_AUTHOR_ID}',
               $exp${q["explanation"]}$exp$,
               {EXAM_YEAR}, '{PAPER_SESSION}', TRUE,
               now(), now(), '{SEED_AUTHOR_ID}')
            ON CONFLICT (id) DO NOTHING
            """
        )


def downgrade() -> None:
    if os.environ.get("CONTENT_SEED_LOCAL") != "1":
        return
    for idx in range(1, len(SAMPLES) + 1):
        qid = _qid(idx)
        op.execute(f"DELETE FROM {SCHEMA}.questions WHERE id = '{qid}'")
