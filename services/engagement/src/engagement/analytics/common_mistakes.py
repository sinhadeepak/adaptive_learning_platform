"""Phase 1C — cohort-wide common-mistake patterns.

Aggregates `analytics_schema.error_classifications` across all
students in a cohort. Surfaces:

  - Top error classifications cohort-wide ("70% of attempts misclassify
    as conceptual_gap on Mechanics")
  - Per-topic breakdown — for each topic, which classification dominates
  - Top problem topics by error count

Drives the teacher's "what should I attack in class this week" insight.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from engagement.analytics.cohort_leaderboard import fetch_cohort_members

log = logging.getLogger(__name__)

# Honest-signalling: skip classifications with too few samples to be
# statistically useful at the cohort level.
_MIN_TOPIC_SAMPLE = 5


@dataclass
class ClassificationCount:
    classification: str
    count: int
    pct_of_errors: float


@dataclass
class TopicErrorPattern:
    topic_id: str
    error_count: int
    n_students_affected: int
    dominant_classification: str
    dominant_pct: float


@dataclass
class CommonMistakesReport:
    cohort_id: str
    n_students: int
    n_errors_total: int
    classifications: list[ClassificationCount]
    top_problem_topics: list[TopicErrorPattern]
    notes: list[str]


async def compute(
    session: AsyncSession, *, cohort_id: str
) -> CommonMistakesReport:
    notes: list[str] = []

    members = await fetch_cohort_members(cohort_id)
    student_ids = [m["userId"] for m in members if m.get("role") == "STUDENT"]

    if not student_ids:
        return CommonMistakesReport(
            cohort_id=cohort_id,
            n_students=0,
            n_errors_total=0,
            classifications=[],
            top_problem_topics=[],
            notes=["Cohort has no students yet."],
        )

    rows = (
        await session.execute(
            text(
                """
                SELECT topic_id::text AS topic_id,
                       classification,
                       COUNT(*)::int AS n,
                       COUNT(DISTINCT user_id)::int AS n_users
                  FROM analytics_schema.error_classifications
                 WHERE user_id = ANY(CAST(:uids AS uuid[]))
                 GROUP BY topic_id, classification
                """
            ),
            {"uids": student_ids},
        )
    ).mappings().all()

    if not rows:
        return CommonMistakesReport(
            cohort_id=cohort_id,
            n_students=len(student_ids),
            n_errors_total=0,
            classifications=[],
            top_problem_topics=[],
            notes=["No error data yet — students need to take quizzes for patterns to emerge."],
        )

    n_errors_total = sum(int(r["n"]) for r in rows)

    # Cohort-wide classification rollup
    by_class: dict[str, int] = {}
    for r in rows:
        by_class[r["classification"]] = by_class.get(r["classification"], 0) + int(r["n"])
    classifications = sorted(
        [
            ClassificationCount(
                classification=c,
                count=n,
                pct_of_errors=round(n / n_errors_total, 4) if n_errors_total > 0 else 0.0,
            )
            for c, n in by_class.items()
        ],
        key=lambda c: -c.count,
    )

    # Per-topic patterns: dominant classification + n_students
    by_topic: dict[str, dict] = {}
    for r in rows:
        slot = by_topic.setdefault(
            r["topic_id"],
            {"total": 0, "by_class": {}, "users": set()},
        )
        slot["total"] += int(r["n"])
        slot["by_class"][r["classification"]] = (
            slot["by_class"].get(r["classification"], 0) + int(r["n"])
        )
        # n_users we already have at the (topic, class) level — track max per topic
        slot["users"].add(int(r["n_users"]))

    topic_patterns: list[TopicErrorPattern] = []
    for topic_id, slot in by_topic.items():
        if slot["total"] < _MIN_TOPIC_SAMPLE:
            continue
        top_class, top_count = max(
            slot["by_class"].items(), key=lambda kv: kv[1]
        )
        topic_patterns.append(
            TopicErrorPattern(
                topic_id=topic_id,
                error_count=slot["total"],
                # Approximate distinct users — sum is wrong, but this is
                # already aggregated; max-of-(per-class user counts) is
                # a tight lower bound.
                n_students_affected=max(slot["users"]) if slot["users"] else 0,
                dominant_classification=top_class,
                dominant_pct=round(top_count / slot["total"], 4),
            )
        )
    topic_patterns.sort(key=lambda t: -t.error_count)

    if topic_patterns:
        notes.append(
            f"Top problem topic: {topic_patterns[0].topic_id[:8]}… with "
            f"{topic_patterns[0].error_count} errors, dominantly "
            f"{topic_patterns[0].dominant_classification}."
        )

    return CommonMistakesReport(
        cohort_id=cohort_id,
        n_students=len(student_ids),
        n_errors_total=n_errors_total,
        classifications=classifications,
        top_problem_topics=topic_patterns[:10],
        notes=notes,
    )
