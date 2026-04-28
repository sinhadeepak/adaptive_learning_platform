# ruff: noqa: S608 - schema name is a hardcoded constant
"""Sprint 9 — Educator Assignments persistence.

Lifecycle:
  DRAFT (published_at NULL) → PUBLISHED (published_at = NOW()) → ARCHIVED
                                                                  (no DB col yet)

Why no FSM module like Payment: assignments are simpler — there's exactly
one transition (publish), and "edit" is allowed in DRAFT only via repo
calls. The publish transition fires `content.assignment.created` to NATS;
that's the integration point Notification + Analytics consume.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

SCHEMA = "content_schema"


# ─────────────────────────────────────────────────────────────────────────
# assignments
# ─────────────────────────────────────────────────────────────────────────


async def create_assignment(
    session: AsyncSession,
    *,
    cohort_id: str,
    title: str,
    created_by: str,
    description: str | None = None,
    tenant_id: str | None = None,
    due_at: str | None = None,
) -> dict[str, Any]:
    res = await session.execute(
        text(
            f"""
            INSERT INTO {SCHEMA}.assignments
              (cohort_id, tenant_id, title, description, created_by, due_at)
            VALUES (:c, :t, :ti, :d, :cb, :due)
            RETURNING id, cohort_id, tenant_id, title, description, created_by,
                      due_at, published_at, created_at, updated_at
            """
        ),
        {
            "c": cohort_id,
            "t": tenant_id,
            "ti": title,
            "d": description,
            "cb": created_by,
            "due": due_at,
        },
    )
    row = res.mappings().first()
    return dict(row) if row else {}


async def get_assignment(
    session: AsyncSession, assignment_id: str
) -> dict[str, Any] | None:
    res = await session.execute(
        text(
            f"""
            SELECT id, cohort_id, tenant_id, title, description, created_by,
                   due_at, published_at, created_at, updated_at
              FROM {SCHEMA}.assignments WHERE id = :id
            """
        ),
        {"id": assignment_id},
    )
    row = res.mappings().first()
    return dict(row) if row else None


async def list_cohort_assignments(
    session: AsyncSession, cohort_id: str, *, only_published: bool = False
) -> list[dict[str, Any]]:
    """Educators see drafts + published; students get only_published=True."""
    where = "WHERE cohort_id = :c"
    if only_published:
        where += " AND published_at IS NOT NULL"
    res = await session.execute(
        text(
            f"""
            SELECT id, cohort_id, tenant_id, title, description, created_by,
                   due_at, published_at, created_at, updated_at
              FROM {SCHEMA}.assignments {where}
          ORDER BY COALESCE(published_at, created_at) DESC
            """
        ),
        {"c": cohort_id},
    )
    return [dict(r) for r in res.mappings().all()]


async def list_assignments_for_user(
    session: AsyncSession, user_id: str
) -> list[dict[str, Any]]:
    """Student inbox query — assignments published to ANY cohort the user
    is in. Joins on institution_schema.cohort_members which lives in a
    different DB in production; we hit the institution service via HTTP
    in that path. For local dev (single Postgres) the join works directly.

    We do this via a dedicated query in the routes layer so the cross-
    schema concern stays out of the repo. This function is kept here for
    completeness when both schemas live in the same DB."""
    res = await session.execute(
        text(
            f"""
            SELECT a.id, a.cohort_id, a.tenant_id, a.title, a.description,
                   a.created_by, a.due_at, a.published_at, a.created_at,
                   a.updated_at,
                   p.completed_at AS my_completed_at,
                   p.correct_count AS my_correct_count,
                   p.total_count AS my_total_count
              FROM {SCHEMA}.assignments a
              JOIN institution_schema.cohort_members m
                ON m.cohort_id = a.cohort_id AND m.user_id = :u
         LEFT JOIN {SCHEMA}.assignment_progress p
                ON p.assignment_id = a.id AND p.user_id = :u
             WHERE a.published_at IS NOT NULL
          ORDER BY COALESCE(a.due_at, a.published_at) ASC
            """
        ),
        {"u": user_id},
    )
    return [dict(r) for r in res.mappings().all()]


async def publish_assignment(
    session: AsyncSession, assignment_id: str
) -> dict[str, Any] | None:
    """Idempotent — re-publishing a published assignment is a no-op."""
    res = await session.execute(
        text(
            f"""
            UPDATE {SCHEMA}.assignments
               SET published_at = COALESCE(published_at, NOW()),
                   updated_at = NOW()
             WHERE id = :id
         RETURNING id, cohort_id, tenant_id, title, description, created_by,
                   due_at, published_at, created_at, updated_at
            """
        ),
        {"id": assignment_id},
    )
    row = res.mappings().first()
    return dict(row) if row else None


# ─────────────────────────────────────────────────────────────────────────
# assignment_questions
# ─────────────────────────────────────────────────────────────────────────


async def set_assignment_questions(
    session: AsyncSession,
    *,
    assignment_id: str,
    question_ids: list[str],
) -> None:
    """Replaces the entire question list for an assignment. Delete-then-
    insert is safe because the table has no foreign-key dependents."""
    await session.execute(
        text(
            f"DELETE FROM {SCHEMA}.assignment_questions WHERE assignment_id = :id"
        ),
        {"id": assignment_id},
    )
    if not question_ids:
        return
    # Position is 1-indexed (the educator UI shows "Question 1", "Question 2").
    rows = [
        {"a": assignment_id, "q": qid, "p": idx + 1}
        for idx, qid in enumerate(question_ids)
    ]
    await session.execute(
        text(
            f"""
            INSERT INTO {SCHEMA}.assignment_questions
              (assignment_id, question_id, position)
            VALUES (:a, :q, :p)
            """
        ),
        rows,
    )


async def list_assignment_questions(
    session: AsyncSession, assignment_id: str
) -> list[dict[str, Any]]:
    """Returns the ordered question list with stem + choices.

    Sprint 10 S10-D — `choices` added so the client can render answer
    buttons. The `correct_idx` is *NOT* returned here — that's served
    server-side at submit time so students can't peek at the JSON."""
    res = await session.execute(
        text(
            f"""
            SELECT aq.assignment_id, aq.question_id, aq.position,
                   q.stem, q.choices, q.subject_id, q.topic_id, q.language
              FROM {SCHEMA}.assignment_questions aq
              JOIN {SCHEMA}.questions q ON q.id = aq.question_id
             WHERE aq.assignment_id = :id
          ORDER BY aq.position
            """
        ),
        {"id": assignment_id},
    )
    return [dict(r) for r in res.mappings().all()]


async def list_assignment_questions_with_keys(
    session: AsyncSession, assignment_id: str
) -> list[dict[str, Any]]:
    """Sprint 10 S10-D — server-side variant that includes correct_idx
    + Sprint 11 S11-C explanation. Used ONLY by POST /submit to grade
    the student's answers and surface the educator's teaching note on
    misses. Never returned ahead of submission."""
    res = await session.execute(
        text(
            f"""
            SELECT aq.assignment_id, aq.question_id, aq.position,
                   q.stem, q.correct_idx, q.explanation
              FROM {SCHEMA}.assignment_questions aq
              JOIN {SCHEMA}.questions q ON q.id = aq.question_id
             WHERE aq.assignment_id = :id
          ORDER BY aq.position
            """
        ),
        {"id": assignment_id},
    )
    return [dict(r) for r in res.mappings().all()]


def grade_answers(
    questions_with_keys: list[dict[str, Any]],
    answers: dict[str, int],
) -> tuple[int, int, list[dict[str, Any]]]:
    """Pure function — given the answer key + student's submitted answers,
    return (correct_count, total_count, breakdown). Extracted so unit tests
    can pin the contract without DB or HTTP.

    Sprint 11 S11-C — `breakdown` now carries `stem` + `explanation` so
    the result panel can render the educator's teaching note inline on
    misses (only on misses — showing it on correct answers would dilute
    the signal)."""
    correct = 0
    breakdown: list[dict[str, Any]] = []
    for q in questions_with_keys:
        qid = str(q["question_id"])
        student_idx = answers.get(qid)
        is_correct = student_idx is not None and student_idx == q["correct_idx"]
        if is_correct:
            correct += 1
        breakdown.append(
            {
                "questionId": qid,
                "position": q["position"],
                "studentAnswer": student_idx,
                "correctAnswer": q["correct_idx"],
                "isCorrect": is_correct,
                "stem": q.get("stem"),
                # Only populate explanation on misses — correct answers
                # don't need the teaching note and surfacing it there
                "explanation": (
                    None if is_correct else q.get("explanation")
                ),
            }
        )
    return correct, len(questions_with_keys), breakdown


# ─────────────────────────────────────────────────────────────────────────
# assignment_progress
# ─────────────────────────────────────────────────────────────────────────


async def upsert_progress(
    session: AsyncSession,
    *,
    assignment_id: str,
    user_id: str,
    correct_count: int,
    total_count: int,
) -> dict[str, Any]:
    """Last-write-wins on (assignment_id, user_id). The student may
    re-attempt; the latest score replaces the previous one."""
    res = await session.execute(
        text(
            f"""
            INSERT INTO {SCHEMA}.assignment_progress
              (assignment_id, user_id, correct_count, total_count, completed_at)
            VALUES (:a, :u, :c, :t, NOW())
            ON CONFLICT (assignment_id, user_id) DO UPDATE
              SET correct_count = EXCLUDED.correct_count,
                  total_count = EXCLUDED.total_count,
                  completed_at = NOW()
         RETURNING assignment_id, user_id, correct_count, total_count, completed_at
            """
        ),
        {"a": assignment_id, "u": user_id, "c": correct_count, "t": total_count},
    )
    row = res.mappings().first()
    return dict(row) if row else {}


async def list_assignment_progress(
    session: AsyncSession, assignment_id: str
) -> list[dict[str, Any]]:
    """Educator-side view — every cohort member's progress for an
    assignment, sorted by accuracy DESC then completion time."""
    res = await session.execute(
        text(
            f"""
            SELECT assignment_id, user_id, correct_count, total_count, completed_at,
                   CASE WHEN total_count = 0 THEN 0
                        ELSE ROUND(100.0 * correct_count / total_count) END AS accuracy_pct
              FROM {SCHEMA}.assignment_progress
             WHERE assignment_id = :id
          ORDER BY accuracy_pct DESC, completed_at ASC
            """
        ),
        {"id": assignment_id},
    )
    return [dict(r) for r in res.mappings().all()]
