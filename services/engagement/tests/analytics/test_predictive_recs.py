"""Pure-function tests for the recommendation ranker."""

from __future__ import annotations

from engagement.analytics.predictive_recs import (
    CandidateTopic,
    TopicMastery,
    rank_recommendations,
)


def _mastery(topic_id: str, *, ewa: float, n: int, subject: str | None = "S1", title: str | None = None) -> TopicMastery:
    return TopicMastery(
        topic_id=topic_id,
        subject_id=subject,
        title=title or f"Topic {topic_id[:4]}",
        ewa=ewa,
        n_attempts=n,
    )


def _candidate(topic_id: str, *, subject: str | None = "S1", ewa: float = 0.0, n: int = 0) -> CandidateTopic:
    return CandidateTopic(
        topic_id=topic_id, subject_id=subject,
        title=f"Topic {topic_id[:4]}", user_ewa=ewa, user_attempts=n,
    )


def test_bridge_topic_recommended_when_subject_match() -> None:
    user_mastery = [
        _mastery("weak1", ewa=0.20, n=5, subject="S1", title="Weak Topic"),
        _mastery("master1", ewa=0.85, n=10, subject="S1", title="Mastered Topic"),
    ]
    recs = rank_recommendations(user_mastery, [])
    # Bridge: master1 should appear first (high score), referencing weak1 in reason.
    assert recs[0].topic_id == "master1"
    assert "Weak Topic" in recs[0].reason_string
    assert recs[0].score > 0.7


def test_no_bridge_falls_back_to_weak_topic() -> None:
    user_mastery = [
        _mastery("weak1", ewa=0.20, n=5, subject="S1", title="Weak Topic"),
        # No mastered topic in same subject
    ]
    recs = rank_recommendations(user_mastery, [])
    assert recs[0].topic_id == "weak1"
    assert "20%" in recs[0].reason_string


def test_capped_at_max() -> None:
    """≥10 weak topics → only 5 recs returned."""
    user_mastery = [
        _mastery(f"weak{i}", ewa=0.10, n=5, subject="S1") for i in range(10)
    ]
    recs = rank_recommendations(user_mastery, [])
    assert len(recs) == 5


def test_unstarted_exposure_phase() -> None:
    """If user has < 5 weak topics, exposure phase fills the rest."""
    user_mastery = [
        _mastery("weak1", ewa=0.20, n=5, subject="S1"),
    ]
    candidates = [
        _candidate("new1", ewa=0, n=0),
        _candidate("new2", ewa=0, n=0),
        _candidate("new3", ewa=0, n=0),
    ]
    recs = rank_recommendations(user_mastery, candidates)
    rec_ids = [r.topic_id for r in recs]
    assert "weak1" in rec_ids
    assert "new1" in rec_ids
    # Exposure recs have score 0.4 — lower than weak-topic direct (0.5+)
    weak_score = next(r.score for r in recs if r.topic_id == "weak1")
    new_score = next(r.score for r in recs if r.topic_id == "new1")
    assert weak_score > new_score


def test_score_descending() -> None:
    user_mastery = [
        _mastery("weak1", ewa=0.20, n=5, subject="S1", title="W1"),
        _mastery("master1", ewa=0.85, n=10, subject="S1", title="M1"),
    ]
    recs = rank_recommendations(user_mastery, [_candidate("new1", ewa=0, n=0)])
    scores = [r.score for r in recs]
    assert scores == sorted(scores, reverse=True)
