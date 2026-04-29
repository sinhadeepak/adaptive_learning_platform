"""Sprint 29 (P4-S29) — DB helpers for analytics_schema.error_classifications."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

SCHEMA = "analytics_schema"


async def upsert_classification(
    session: AsyncSession,
    *,
    session_id: str,
    item_idx: int,
    user_id: str,
    topic_id: str,
    classification: str,
) -> None:
    """Idempotent insert. Same (session_id, item_idx) reapplies safely."""
    await session.execute(
        text(
            f"""
            INSERT INTO {SCHEMA}.error_classifications
              (session_id, item_idx, user_id, topic_id, classification)
            VALUES (:sid, :idx, :uid, :tid, :cls)
            ON CONFLICT (session_id, item_idx) DO UPDATE
              SET classification = EXCLUDED.classification,
                  classified_at  = now()
            """
        ),
        {
            "sid": session_id,
            "idx": item_idx,
            "uid": user_id,
            "tid": topic_id,
            "cls": classification,
        },
    )


async def list_classifications_for_user(
    session: AsyncSession,
    user_id: str,
    *,
    since_iso: str | None = None,
    limit: int = 1000,
) -> list[dict[str, Any]]:
    """Returns raw classification rows for a user, optionally filtered by
    since_iso (an ISO-8601 timestamp string). Joins catalog_schema.topics
    for the title."""
    where = ["e.user_id = :uid"]
    params: dict[str, Any] = {"uid": user_id, "lim": limit}
    if since_iso:
        where.append("e.classified_at >= :since")
        params["since"] = since_iso
    where_clause = " AND ".join(where)
    rows = (
        await session.execute(
            text(
                f"""
                SELECT e.session_id, e.item_idx, e.topic_id, e.classification,
                       e.classified_at, t.title AS topic_title
                  FROM {SCHEMA}.error_classifications e
             LEFT JOIN catalog_schema.topics t ON t.id = e.topic_id
                 WHERE {where_clause}
                 ORDER BY e.classified_at DESC
                 LIMIT :lim
                """
            ),
            params,
        )
    ).mappings().all()
    return [
        {
            "sessionId": str(r["session_id"]),
            "itemIdx": int(r["item_idx"]),
            "topicId": str(r["topic_id"]),
            "topicTitle": r["topic_title"] or "",
            "classification": r["classification"],
            "classifiedAt": r["classified_at"].isoformat() if r["classified_at"] else None,
        }
        for r in rows
    ]


def aggregate_patterns(
    rows: list[dict[str, Any]], *, top_topics_per_pattern: int = 3
) -> dict[str, Any]:
    """Pure-function rollup over raw classification rows.

    Returns:
        {
          "totals": {tag: count, ...},
          "topPatterns": [
            {"classification": "...", "count": N,
             "topTopics": [{"topicId": "...", "topicTitle": "...", "count": M}]}
          ]
        }
    """
    by_tag: dict[str, int] = defaultdict(int)
    by_tag_topic: dict[tuple[str, str, str], int] = defaultdict(int)
    for r in rows:
        tag = r["classification"]
        by_tag[tag] += 1
        key = (tag, r["topicId"], r["topicTitle"])
        by_tag_topic[key] += 1
    totals = dict(by_tag)
    sorted_tags = sorted(totals.items(), key=lambda kv: -kv[1])
    out_patterns: list[dict[str, Any]] = []
    for tag, count in sorted_tags:
        topics = [
            {"topicId": tid, "topicTitle": ttitle, "count": n}
            for (t, tid, ttitle), n in by_tag_topic.items()
            if t == tag
        ]
        topics.sort(key=lambda x: -x["count"])
        out_patterns.append(
            {
                "classification": tag,
                "count": count,
                "topTopics": topics[:top_topics_per_pattern],
            }
        )
    return {"totals": totals, "topPatterns": out_patterns}
