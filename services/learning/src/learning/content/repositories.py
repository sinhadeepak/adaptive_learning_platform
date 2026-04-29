# ruff: noqa: S608 - schema name is a hardcoded constant
"""Persistence for content_schema.questions."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

SCHEMA = "content_schema"


def _row_to_dict(r: Any) -> dict[str, Any]:
    choices = r["choices"]
    if not isinstance(choices, list):
        choices = json.loads(choices)
    out = {
        "id": str(r["id"]),
        "topic_id": str(r["topic_id"]),
        "stem": r["stem"],
        "choices": choices,
        "correct_idx": int(r["correct_idx"]),
        "difficulty_b": float(r["difficulty_b"]),
        "discrimination_a": float(r["discrimination_a"]),
        "guessing_c": float(r["guessing_c"]),
        "language": r["language"],
        "status": r["status"],
        "explanation": r["explanation"],
        "created_by": str(r["created_by"]),
        "created_at": r["created_at"],
        "submitted_at": r["submitted_at"],
        "reviewed_by": str(r["reviewed_by"]) if r["reviewed_by"] else None,
        "reviewed_at": r["reviewed_at"],
        "review_notes": r["review_notes"],
    }
    # Sprint 24 (P4-S24) — PYQ metadata is optional; default rows have
    # pyq_flag=False, exam_year=NULL, paper_session=NULL.
    if "exam_year" in r.keys():
        out["exam_year"] = int(r["exam_year"]) if r["exam_year"] is not None else None
    if "paper_session" in r.keys():
        out["paper_session"] = r["paper_session"]
    if "pyq_flag" in r.keys():
        out["pyq_flag"] = bool(r["pyq_flag"])
    return out


async def insert_question(
    session: AsyncSession,
    *,
    question_id: str,
    topic_id: str,
    stem: str,
    choices: list[str],
    correct_idx: int,
    difficulty_b: float,
    discrimination_a: float,
    guessing_c: float,
    language: str,
    created_by: str,
    explanation: str | None = None,
    # Sprint 24 (P4-S24) — PYQ metadata. Optional; defaults match the
    # non-PYQ authoring path.
    exam_year: int | None = None,
    paper_session: str | None = None,
    pyq_flag: bool = False,
) -> dict[str, Any]:
    if correct_idx >= len(choices):
        raise ValueError("correctIdx out of range for choices")
    res = await session.execute(
        text(
            f"""
            INSERT INTO {SCHEMA}.questions
              (id, topic_id, stem, choices, correct_idx, difficulty_b,
               discrimination_a, guessing_c, language, status, created_by, explanation,
               exam_year, paper_session, pyq_flag)
            VALUES (:id, :tid, :stem, CAST(:choices AS JSONB), :ci, :db,
                    :da, :gc, :lang, 'DRAFT', :cb, :exp,
                    :ey, :ps, :pyq)
            RETURNING id, topic_id, stem, choices, correct_idx, difficulty_b,
                      discrimination_a, guessing_c, language, status, explanation,
                      created_by, created_at, submitted_at, reviewed_by, reviewed_at, review_notes,
                      exam_year, paper_session, pyq_flag
            """
        ),
        {
            "id": question_id,
            "tid": topic_id,
            "stem": stem,
            "choices": json.dumps(choices),
            "ci": correct_idx,
            "db": difficulty_b,
            "da": discrimination_a,
            "gc": guessing_c,
            "lang": language,
            "cb": created_by,
            "exp": explanation,
            "ey": exam_year,
            "ps": paper_session,
            "pyq": pyq_flag,
        },
    )
    return _row_to_dict(res.mappings().first())


async def list_questions(
    session: AsyncSession,
    *,
    created_by: str | None = None,
    status_filter: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    where = []
    params: dict[str, Any] = {"lim": limit}
    if created_by is not None:
        where.append("created_by = :cb")
        params["cb"] = created_by
    if status_filter is not None:
        where.append("status = :status")
        params["status"] = status_filter
    where_clause = "WHERE " + " AND ".join(where) if where else ""
    res = await session.execute(
        text(
            f"""
            SELECT id, topic_id, stem, choices, correct_idx, difficulty_b,
                   discrimination_a, guessing_c, language, status, explanation,
                   created_by, created_at, submitted_at, reviewed_by, reviewed_at, review_notes
                   , exam_year, paper_session, pyq_flag
              FROM {SCHEMA}.questions {where_clause}
          ORDER BY created_at DESC LIMIT :lim
            """
        ),
        params,
    )
    return [_row_to_dict(r) for r in res.mappings()]


async def get_question(session: AsyncSession, question_id: str) -> dict[str, Any] | None:
    res = await session.execute(
        text(
            f"SELECT id, topic_id, stem, choices, correct_idx, difficulty_b, "
            f"discrimination_a, guessing_c, language, status, explanation, "
            f"created_by, created_at, submitted_at, reviewed_by, reviewed_at, review_notes, "
            f"exam_year, paper_session, pyq_flag "
            f"FROM {SCHEMA}.questions WHERE id = :id"
        ),
        {"id": question_id},
    )
    row = res.mappings().first()
    return _row_to_dict(row) if row else None


async def submit_for_review(session: AsyncSession, question_id: str, by_user: str) -> bool:
    """DRAFT → REVIEW. Only the author can submit. Returns True on success."""
    res = await session.execute(
        text(
            f"UPDATE {SCHEMA}.questions "
            "SET status='REVIEW', submitted_at=now() "
            "WHERE id = :id AND created_by = :cb AND status = 'DRAFT'"
        ),
        {"id": question_id, "cb": by_user},
    )
    return bool(res.rowcount)


async def review(
    session: AsyncSession,
    question_id: str,
    *,
    reviewer: str,
    approve: bool,
    notes: str | None,
) -> bool:
    """REVIEW → PUBLISHED (approve) or REVIEW → REJECTED. Author can't
    self-approve — caller validates principal.role + principal.user_id."""
    new_status = "PUBLISHED" if approve else "REJECTED"
    res = await session.execute(
        text(
            f"UPDATE {SCHEMA}.questions "
            "SET status = :st, reviewed_by = :by, reviewed_at = now(), review_notes = :nt "
            "WHERE id = :id AND status = 'REVIEW' AND created_by != :by"
        ),
        {"id": question_id, "by": reviewer, "st": new_status, "nt": notes},
    )
    return bool(res.rowcount)
