"""Pure roll-up core for the multi-exam dashboard summary."""
from __future__ import annotations

from engagement.analytics.mastery import MasteryRow
from engagement.analytics.multi_exam_summary import (
    ExamSummary,
    build_exam_summary,
    pick_weakest,
)


def _row(topic: str, ewa: float, n: int) -> MasteryRow:
    return MasteryRow(user_id="u1", topic_id=topic, ewa=ewa, n=n)


def test_pick_weakest_ignores_low_n() -> None:
    rows = [_row("a", 0.10, 2), _row("b", 0.40, 5), _row("c", 0.30, 3)]
    # 'a' has the lowest EWA but n<3, so 'c' wins.
    assert pick_weakest(rows).topic_id == "c"


def test_pick_weakest_none_when_all_low_n() -> None:
    assert pick_weakest([_row("a", 0.1, 1)]) is None


def test_build_exam_summary_rolls_up_all_fields() -> None:
    rows = [_row("a", 0.6, 4), _row("b", 0.2, 5)]
    s = build_exam_summary(
        exam_id="e1", mastery_rows=rows, mistakes_due=4, revision_due=2
    )
    assert isinstance(s, ExamSummary)
    assert s.exam_id == "e1"
    assert s.readiness_score == 0.4  # mean of 0.6, 0.2
    assert s.n_topics == 2
    assert s.weakest_topic_id == "b"
    assert s.weakest_ewa == 0.2
    assert s.mistakes_due == 4
    assert s.revision_due == 2


def test_build_exam_summary_empty_mastery() -> None:
    s = build_exam_summary(
        exam_id="e2", mastery_rows=[], mistakes_due=0, revision_due=0
    )
    assert s.readiness_score == 0.0
    assert s.n_topics == 0
    assert s.weakest_topic_id is None
    assert s.weakest_ewa is None
