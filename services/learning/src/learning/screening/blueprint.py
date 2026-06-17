"""Screening blueprint — exam-aware first-time-visitor diagnostic.

Each blueprint is a list of question references seeded into the test
in fixed order. v1 ships exam-aware (one blueprint per supported exam)
with a fallback for unknown exams. Question content is read from
`content_schema.questions` at start time so the screening test
reflects the live bank.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass(frozen=True)
class ScreeningBlueprint:
    exam_code: str
    target_count: int
    topic_targets: dict[str, int]   # topic_id → number of items
    difficulty_range: tuple[float, float] = (-0.5, 0.5)


# Static blueprints — one per supported exam family.
# topic_targets keys are topic UUIDs from catalog migrations.
BLUEPRINTS: dict[str, ScreeningBlueprint] = {
    "JEE-MAIN": ScreeningBlueprint(
        exam_code="JEE-MAIN",
        target_count=12,
        topic_targets={
            "33333333-0000-0000-0000-000000000001": 3,  # Mechanics
            "33333333-0000-0000-0000-000000000002": 2,  # Thermodynamics
            "33333333-0000-0000-0000-000000000004": 2,  # Physical Chemistry
            "33333333-0000-0000-0000-000000000005": 2,  # Organic Chemistry
            "33333333-0000-0000-0000-000000000006": 3,  # Calculus
        },
    ),
    "NEET": ScreeningBlueprint(
        exam_code="NEET",
        target_count=12,
        topic_targets={
            "33333333-0000-0000-0000-000000000008": 4,  # Cell Biology
            "33333333-0000-0000-0000-000000000009": 3,  # Genetics
            "33333333-0000-0000-0000-000000000012": 3,  # Inorganic Chemistry
            "33333333-0000-0000-0000-000000000013": 2,  # Organic Chemistry (NEET)
        },
    ),
    "UPSC-CSE": ScreeningBlueprint(
        exam_code="UPSC-CSE",
        target_count=12,
        topic_targets={
            "33333333-0000-0000-0000-000000000014": 3,  # Indian Constitution
            "33333333-0000-0000-0000-000000000015": 2,  # Governance
            "33333333-0000-0000-0000-000000000016": 3,  # Ancient India
            "33333333-0000-0000-0000-000000000017": 2,  # Modern India
            "33333333-0000-0000-0000-000000000018": 2,  # Physical Geography
        },
    ),
    "CBSE": ScreeningBlueprint(
        exam_code="CBSE",
        target_count=10,
        topic_targets={
            "33333333-0000-0000-0000-000000000001": 3,
            "33333333-0000-0000-0000-000000000004": 3,
            "33333333-0000-0000-0000-000000000006": 4,
        },
    ),
    "CAT": ScreeningBlueprint(
        exam_code="CAT",
        target_count=10,
        topic_targets={
            "33333333-0000-0000-0000-000000000020": 4,  # Arithmetic
            "33333333-0000-0000-0000-000000000022": 3,  # Reading Comp
            "33333333-0000-0000-0000-000000000024": 3,  # Data Interpretation
        },
    ),
}

DEFAULT_BLUEPRINT = BLUEPRINTS["JEE-MAIN"]


async def select_questions(
    session: AsyncSession,
    *,
    exam_code: str,
    language: str = "en",
) -> list[dict[str, Any]]:
    """Pull `target_count` MCQ_SINGLE questions from the bank,
    sampled per the exam's topic_targets. Falls back to JEE-MAIN
    blueprint when the exam isn't recognised.
    """
    bp = BLUEPRINTS.get(exam_code, DEFAULT_BLUEPRINT)
    items: list[dict[str, Any]] = []

    for topic_id, n in bp.topic_targets.items():
        res = await session.execute(
            text(
                """
                SELECT id, topic_id, stem, choices, correct_idx, difficulty_b,
                       discrimination_a, guessing_c, language, question_type
                  FROM content_schema.questions
                 WHERE topic_id = CAST(:tid AS uuid)
                   AND status = 'PUBLISHED'
                   AND question_type = 'MCQ_SINGLE'
                   AND language = :lang
                   AND difficulty_b BETWEEN :dmin AND :dmax
              ORDER BY random()
                 LIMIT :n
                """
            ),
            {
                "tid": topic_id,
                "lang": language,
                "dmin": bp.difficulty_range[0],
                "dmax": bp.difficulty_range[1],
                "n": n,
            },
        )
        for row in res.mappings():
            items.append(
                {
                    "id": str(row["id"]),
                    "topic_id": str(row["topic_id"]),
                    "stem": row["stem"],
                    "choices": row["choices"],
                    "correct_idx": int(row["correct_idx"]),
                    "difficulty_b": float(row["difficulty_b"]),
                }
            )
    return items
