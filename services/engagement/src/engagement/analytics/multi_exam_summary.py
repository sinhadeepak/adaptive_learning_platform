"""Pure roll-up core for the multi-exam dashboard summary.

Given a user's per-exam mastery rows plus the exam's due-counts, produce the
compact per-exam summary the web-student dashboard renders (readiness score,
weakest topic, mistakes/revision due). No I/O — the route layer fetches rows
and calls these functions so the math stays unit-testable with fakes.
"""
from __future__ import annotations

from dataclasses import dataclass

from engagement.analytics.mastery import MasteryRow, readiness_from_mastery


def pick_weakest(rows: list[MasteryRow], *, min_n: int = 3) -> MasteryRow | None:
    """Lowest-EWA topic with at least `min_n` observations (avoids tiny-n noise).

    Returns None when no row clears the min_n bar.
    """
    eligible = [r for r in rows if r.n >= min_n]
    if not eligible:
        return None
    return min(eligible, key=lambda r: r.ewa)


@dataclass(frozen=True)
class ExamSummary:
    exam_id: str
    readiness_score: float
    n_topics: int
    weakest_topic_id: str | None
    weakest_ewa: float | None
    mistakes_due: int
    revision_due: int


def build_exam_summary(
    *,
    exam_id: str,
    mastery_rows: list[MasteryRow],
    mistakes_due: int,
    revision_due: int,
) -> ExamSummary:
    weakest = pick_weakest(mastery_rows)
    return ExamSummary(
        exam_id=exam_id,
        readiness_score=readiness_from_mastery(mastery_rows),
        n_topics=len(mastery_rows),
        weakest_topic_id=weakest.topic_id if weakest else None,
        weakest_ewa=weakest.ewa if weakest else None,
        mistakes_due=mistakes_due,
        revision_due=revision_due,
    )
