"""Ingestion — accept an uploaded past paper, write rows to
`exam_past_papers` + `exam_past_questions` in DRAFT status.

PDF parsing is deferred to a follow-up. For Phase B1 we accept the
already-structured JSON shape (`PastPaperIn`) — the content team
runs their own OCR / structuring step before upload. This keeps
the ingest pipeline deterministic and the test surface tiny.
"""

from __future__ import annotations

import json
import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from learning.exam_intel.schemas import PastPaperIn

SCHEMA = "exam_intelligence_schema"


async def ingest_paper(
    session: AsyncSession, paper: PastPaperIn
) -> dict[str, str]:
    """Insert a paper + its questions. Returns the new paper id."""
    paper_id = str(uuid.uuid4())

    n_q = len(paper.questions)
    total_marks = sum(q.marks_correct for q in paper.questions)

    await session.execute(
        text(f"""
            INSERT INTO {SCHEMA}.exam_past_papers
                (id, exam_id, year, session, paper_url,
                 n_questions, total_marks, duration_minutes, status)
            VALUES
                (CAST(:id AS uuid), CAST(:eid AS uuid), :y, :sess, :url,
                 :nq, :tm, :dur, 'DRAFT')
        """),
        {
            "id": paper_id,
            "eid": paper.exam_id,
            "y": paper.year,
            "sess": paper.session,
            "url": paper.paper_url,
            "nq": n_q,
            "tm": total_marks,
            "dur": paper.duration_minutes,
        },
    )

    # Bulk-insert questions.
    for q in paper.questions:
        await session.execute(
            text(f"""
                INSERT INTO {SCHEMA}.exam_past_questions
                    (id, paper_id, item_idx, stem, choices,
                     correct_answer, question_type,
                     marks_correct, marks_negative)
                VALUES
                    (CAST(:id AS uuid), CAST(:pid AS uuid), :idx, :stem,
                     CAST(:choices AS jsonb), :ans, :qtype, :mc, :mn)
            """),
            {
                "id": str(uuid.uuid4()),
                "pid": paper_id,
                "idx": q.item_idx,
                "stem": q.stem,
                "choices": json.dumps(q.choices) if q.choices else None,
                "ans": q.correct_answer,
                "qtype": q.question_type,
                "mc": q.marks_correct,
                "mn": q.marks_negative,
            },
        )

    return {"paperId": paper_id, "status": "DRAFT"}


async def list_papers_for_exam(
    session: AsyncSession, exam_id: str
) -> list[dict[str, object]]:
    """List papers for an exam (admin view), newest first."""
    rows = (
        await session.execute(
            text(f"""
                SELECT id, year, session, status, n_questions, total_marks, ingested_at
                  FROM {SCHEMA}.exam_past_papers
                 WHERE exam_id = CAST(:eid AS uuid)
                 ORDER BY year DESC, session DESC
            """),
            {"eid": exam_id},
        )
    ).mappings().all()
    return [
        {
            "id": str(r["id"]),
            "year": r["year"],
            "session": r["session"],
            "status": r["status"],
            "nQuestions": r["n_questions"],
            "totalMarks": r["total_marks"],
            "ingestedAt": r["ingested_at"].isoformat() if r["ingested_at"] else None,
        }
        for r in rows
    ]
