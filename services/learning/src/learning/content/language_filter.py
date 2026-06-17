"""Catalog publish-language filter (P5-S51, closes CE-406).

Per AIM §6.4. Hindi students should never see questions whose Hindi
translation is still in DRAFT/IN_REVIEW. The filter:

    artifact.status = PUBLISHED
    AND (
      language = student.preferred_language        -- primary-lang match
      OR EXISTS (
        SELECT 1 FROM content_artifact_translations t
         WHERE t.artifact_id = artifact.id
           AND t.language    = student.preferred_language
           AND t.status      = 'PUBLISHED'
      )
    )

Two helpers:

  1. filter_questions_by_published_language() — pure SQL builder for
     callers who already query content_schema.questions; appends the
     CTE-style EXISTS clause.

  2. list_published_for_language() — full query, returns artifacts
     currently visible to a student with the given preferred_language.

Quiz orchestration imports the SQL fragment when it picks questions
for a session; mock blueprints use list_published_for_language() with
fallback policy resolution at the orchestrator layer.
"""

from __future__ import annotations

from typing import Any, Literal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

CONTENT_SCHEMA = "content_schema"

FallbackPolicy = Literal["skip_untranslated", "show_with_banner"]


def published_language_clause(alias: str = "q") -> str:
    """Return a SQL fragment usable inside a WHERE clause.

    The caller binds `:lang` to the student's preferred language. The
    fragment filters to questions visible in that language (primary
    match OR PUBLISHED translation exists).
    """
    return f"""(
      {alias}.language = :lang
      OR EXISTS (
        SELECT 1 FROM {CONTENT_SCHEMA}.content_artifact_translations t
         WHERE t.artifact_id = {alias}.id
           AND t.language    = :lang
           AND t.status      = 'PUBLISHED'
      )
    )"""


async def list_published_for_language(
    session: AsyncSession,
    *,
    preferred_language: str,
    topic_id: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    """Fetch questions PUBLISHED in primary language AND have a
    PUBLISHED translation for `preferred_language` (or primary lang
    matches). Optionally filter by topic_id."""
    where = ["q.status = 'PUBLISHED'", published_language_clause("q")]
    params: dict[str, Any] = {"lang": preferred_language, "lim": limit}
    if topic_id is not None:
        where.append("q.topic_id = :tid")
        params["tid"] = topic_id
    sql = f"""
        SELECT q.id, q.topic_id, q.stem, q.question_type, q.language,
               q.difficulty_b, q.discrimination_a, q.guessing_c
          FROM {CONTENT_SCHEMA}.questions q
         WHERE {' AND '.join(where)}
         ORDER BY q.created_at DESC
         LIMIT :lim
    """
    rows = (await session.execute(text(sql), params)).mappings().all()
    return [
        {
            "id": str(r["id"]),
            "topicId": str(r["topic_id"]) if r["topic_id"] else None,
            "stem": r["stem"],
            "questionType": r["question_type"],
            "language": r["language"],
            "difficultyB": float(r["difficulty_b"]) if r["difficulty_b"] is not None else None,
            "discriminationA": float(r["discrimination_a"]) if r["discrimination_a"] is not None else None,
            "guessingC": float(r["guessing_c"]) if r["guessing_c"] is not None else None,
        }
        for r in rows
    ]


async def count_visible_in_language(
    session: AsyncSession,
    *,
    preferred_language: str,
    topic_id: str | None = None,
) -> int:
    """Used by quiz orchestration to know whether `skip_untranslated`
    fallback would leave the student with too few items."""
    where = ["q.status = 'PUBLISHED'", published_language_clause("q")]
    params: dict[str, Any] = {"lang": preferred_language}
    if topic_id is not None:
        where.append("q.topic_id = :tid")
        params["tid"] = topic_id
    rows = (
        await session.execute(
            text(f"""
                SELECT COUNT(*) AS n
                  FROM {CONTENT_SCHEMA}.questions q
                 WHERE {' AND '.join(where)}
            """),
            params,
        )
    ).mappings().all()
    return int(rows[0]["n"]) if rows else 0
