"""Sprint 28 (P4-S28) — pure-function syllabus coverage aggregator.

Takes a syllabus tree (from alp-learning) and a mastery dict (from local
analytics_schema.mastery) and produces per-subject + per-chapter coverage
stats with status bands.

No DB / HTTP coupling — fully unit-testable in isolation.

Status bands per chapter:
  - mastered     : has ≥1 topic AND ≥70% of mapped topics have EWA ≥ MASTERY_FLOOR
  - developing   : has attempted topics but < 70% mastered
  - not_started  : has mapped topics but no attempts (any EWA == 0 / missing)
  - missing      : zero mapped topics (content gap, not student gap)
"""

from __future__ import annotations

from typing import Any

MASTERY_FLOOR = 0.6
MASTERED_CHAPTER_FRACTION = 0.7  # ≥70% of mapped topics mastered → chapter mastered


def _status_for_chapter(
    n_topics: int, n_attempted: int, n_mastered: int
) -> str:
    if n_topics == 0:
        return "missing"
    if n_attempted == 0:
        return "not_started"
    if n_topics > 0 and (n_mastered / n_topics) >= MASTERED_CHAPTER_FRACTION:
        return "mastered"
    return "developing"


def _avg(values: list[float]) -> float:
    if not values:
        return 0.0
    return sum(values) / len(values)


def compute_coverage(
    tree: dict[str, Any],
    mastery: dict[str, float],
) -> dict[str, Any]:
    """Aggregate the syllabus tree against user mastery.

    Returns a coverage dict keyed by subject + chapter. `overallPct` is
    the fraction of mapped topics where EWA >= MASTERY_FLOOR.
    """
    subjects_out: list[dict[str, Any]] = []
    total_topics = 0
    total_mastered = 0

    for subject in tree.get("subjects", []):
        subj_total_topics = 0
        subj_attempted = 0
        subj_mastered = 0
        subj_total_chapters = 0
        subj_covered_chapters = 0
        chapters_out: list[dict[str, Any]] = []

        for chapter in subject.get("chapters", []):
            topics = chapter.get("topics", []) or []
            n_topics = len(topics)
            n_attempted = 0
            n_mastered = 0
            ewas: list[float] = []
            for t in topics:
                ewa = float(mastery.get(str(t.get("topicId") or t.get("topic_id") or ""), 0.0) or 0.0)
                ewas.append(ewa)
                if ewa > 0.0:
                    n_attempted += 1
                if ewa >= MASTERY_FLOOR:
                    n_mastered += 1
            status = _status_for_chapter(n_topics, n_attempted, n_mastered)
            chapters_out.append(
                {
                    "chapterId": chapter.get("chapterId"),
                    "name": chapter.get("name"),
                    "totalTopics": n_topics,
                    "attemptedTopics": n_attempted,
                    "masteredTopics": n_mastered,
                    "avgEwa": round(_avg(ewas), 4),
                    "status": status,
                }
            )
            subj_total_chapters += 1
            if status == "mastered":
                subj_covered_chapters += 1
            subj_total_topics += n_topics
            subj_attempted += n_attempted
            subj_mastered += n_mastered

        subjects_out.append(
            {
                "subjectId": subject.get("subjectId"),
                "name": subject.get("name"),
                "totalChapters": subj_total_chapters,
                "coveredChapters": subj_covered_chapters,
                "totalTopics": subj_total_topics,
                "attemptedTopics": subj_attempted,
                "masteredTopics": subj_mastered,
                "chapters": chapters_out,
            }
        )
        total_topics += subj_total_topics
        total_mastered += subj_mastered

    overall_pct = round((total_mastered / total_topics) * 100) if total_topics > 0 else 0
    return {
        "examId": tree.get("examId"),
        "overallPct": overall_pct,
        "totalTopics": total_topics,
        "masteredTopics": total_mastered,
        "subjects": subjects_out,
    }
