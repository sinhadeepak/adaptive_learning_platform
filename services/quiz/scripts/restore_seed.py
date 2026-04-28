"""Restore Quiz's question bank with real exam-prep content.

The bank lives in services/content/seed/question_bank.py — single
source of truth shared with the Content service. This script:

  1. Imports the question bank module.
  2. Computes the deterministic IDs the v1 SQL migration created
     (md5 of `topic_id + '-quiz-seed-v1-' + n`) so existing rows
     keep their primary key.
  3. UPDATEs `stem`, `choices`, `correct_idx`, `difficulty_b` on each
     row in place. UPDATE (not DELETE+INSERT) is required because
     `quiz_session_items.question_id` has a FK to `questions.id` —
     deleting a question that any student has answered breaks history.

Idempotent: re-running just rewrites the same fields with the same
values. Safe to run repeatedly.
"""

from __future__ import annotations

import asyncio
import hashlib
import importlib.util
import json
import sys
from pathlib import Path

import asyncpg


TOPICS: list[tuple[str, str]] = [
    ("33333333-0000-0000-0000-000000000001", "Mechanics"),
    ("33333333-0000-0000-0000-000000000002", "Thermodynamics"),
    ("33333333-0000-0000-0000-000000000003", "Electrostatics"),
    ("33333333-0000-0000-0000-000000000004", "Physical Chemistry"),
    ("33333333-0000-0000-0000-000000000005", "Organic Chemistry"),
    ("33333333-0000-0000-0000-000000000006", "Calculus"),
    ("33333333-0000-0000-0000-000000000007", "Coordinate Geometry"),
    ("33333333-0000-0000-0000-000000000008", "Cell Biology"),
    ("33333333-0000-0000-0000-000000000009", "Genetics"),
    ("33333333-0000-0000-0000-000000000010", "Mechanics & Waves"),
    ("33333333-0000-0000-0000-000000000011", "Optics"),
    ("33333333-0000-0000-0000-000000000012", "Inorganic Chemistry"),
    ("33333333-0000-0000-0000-000000000013", "Organic Chemistry (NEET)"),
    ("33333333-0000-0000-0000-000000000014", "Indian Constitution"),
    ("33333333-0000-0000-0000-000000000015", "Governance"),
    ("33333333-0000-0000-0000-000000000016", "Ancient India"),
    ("33333333-0000-0000-0000-000000000017", "Modern India"),
    ("33333333-0000-0000-0000-000000000018", "Physical Geography"),
    ("33333333-0000-0000-0000-000000000019", "Indian Geography"),
    ("33333333-0000-0000-0000-000000000020", "Arithmetic"),
    ("33333333-0000-0000-0000-000000000021", "Algebra"),
    ("33333333-0000-0000-0000-000000000022", "Reading Comprehension"),
    ("33333333-0000-0000-0000-000000000023", "Grammar & Vocabulary"),
    ("33333333-0000-0000-0000-000000000024", "Data Interpretation"),
]

V1_PREFIX = "-quiz-seed-v1-"


def _v1_question_id(topic_id: str, idx: int) -> str:
    """md5-based UUID matching the SQL migration formula:
    `md5(topic_id::text || '-quiz-seed-v1-' || n)::uuid`."""
    raw = hashlib.md5(f"{topic_id}{V1_PREFIX}{idx}".encode()).hexdigest()
    return f"{raw[:8]}-{raw[8:12]}-{raw[12:16]}-{raw[16:20]}-{raw[20:32]}"


def _load_bank() -> dict[str, list[dict]]:
    """Single source of truth — the Python data file the Content seed
    also reads."""
    here = Path(__file__).resolve()
    bank_path = (
        here.parent.parent.parent
        / "learning"
        / "src"
        / "learning"
        / "content"
        / "seed"
        / "question_bank.py"
    )
    spec = importlib.util.spec_from_file_location("question_bank", bank_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load {bank_path}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules["question_bank"] = mod
    spec.loader.exec_module(mod)
    return mod.TOPIC_QUESTIONS


async def main() -> None:
    bank = _load_bank()

    conn = await asyncpg.connect(
        host="localhost",
        port=35432,
        user="postgres",
        password="postgres",  # noqa: S106
        database="quiz",
    )
    updated = 0
    inserted = 0
    try:
        for topic_id, topic_title in TOPICS:
            if topic_title not in bank:
                raise RuntimeError(
                    f"Topic {topic_title!r} missing from question bank"
                )
            questions = bank[topic_title]
            if len(questions) != 20:
                raise RuntimeError(
                    f"Topic {topic_title!r} has {len(questions)} questions; expected 20"
                )
            for i, q in enumerate(questions):
                n = i + 1
                qid = _v1_question_id(topic_id, n)
                stem = q["stem"]
                choices = json.dumps(q["choices"])
                correct = int(q["correct_idx"])
                diff = float(q["difficulty_b"])

                # Try UPDATE first — keeps FK refs intact for any
                # quiz_session_items already pointing at this id.
                tag = await conn.execute(
                    """
                    UPDATE quiz_schema.questions
                       SET stem = $1,
                           choices = $2::jsonb,
                           correct_idx = $3,
                           difficulty_b = $4
                     WHERE id = $5::uuid
                    """,
                    stem,
                    choices,
                    correct,
                    diff,
                    qid,
                )
                if tag.endswith(" 0"):
                    # Row didn't exist — fresh DB or different seed
                    # generation. INSERT it.
                    await conn.execute(
                        """
                        INSERT INTO quiz_schema.questions
                          (id, topic_id, stem, choices, correct_idx,
                           difficulty_b, language, status)
                        VALUES ($1::uuid, $2::uuid, $3, $4::jsonb, $5, $6,
                                'en', 'PUBLISHED')
                        ON CONFLICT (id) DO NOTHING
                        """,
                        qid,
                        topic_id,
                        stem,
                        choices,
                        correct,
                        diff,
                    )
                    inserted += 1
                else:
                    updated += 1

        n = await conn.fetchval(
            "SELECT COUNT(*) FROM quiz_schema.questions WHERE topic_id = ANY($1::uuid[])",
            [tid for (tid, _) in TOPICS],
        )
        print(
            f"quiz_schema.questions → updated {updated}, inserted {inserted}, "
            f"total seeded for these topics: {n}"
        )
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
