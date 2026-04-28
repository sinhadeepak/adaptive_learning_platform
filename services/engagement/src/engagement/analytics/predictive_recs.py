"""Topic recommendations — heuristic v1 per ADR-0011.

Pure-function ranker. Embedding-based recommendations (OpenAI) ship in
P3-S6+ — the cached_recommendations table column shape is already
embedding-compatible (a `score` field) so the swap is mechanical.

Heuristic for v1:
  1. Identify the user's WEAK topics (mastery EWA < 0.4 AND n_attempts >= 3).
  2. For each weak topic, find BRIDGE topics — topics in the same
     subject_id where the user has mastered (mastery >= 0.6 AND
     n_attempts >= 5). Bridge candidates score higher.
  3. If no bridges available: recommend topics where the user has
     never been (n_attempts == 0) — exposure value.
  4. Cap at 5; sort by composite score.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

# Thresholds — tunable later.
WEAK_MASTERY_THRESHOLD: Final = 0.4
MASTERED_THRESHOLD: Final = 0.6
WEAK_MIN_ATTEMPTS: Final = 3
MASTERED_MIN_ATTEMPTS: Final = 5
MAX_RECOMMENDATIONS: Final = 5


@dataclass(frozen=True)
class TopicMastery:
    topic_id: str
    subject_id: str | None
    title: str
    ewa: float
    n_attempts: int


@dataclass(frozen=True)
class CandidateTopic:
    """A topic the user could be recommended (one they haven't fully mastered)."""

    topic_id: str
    subject_id: str | None
    title: str
    user_ewa: float  # 0 if never attempted
    user_attempts: int


@dataclass(frozen=True)
class Recommendation:
    topic_id: str
    score: float  # 0..1
    reason_string: str


def rank_recommendations(
    user_mastery: list[TopicMastery],
    candidate_topics: list[CandidateTopic],
) -> list[Recommendation]:
    """Returns up to MAX_RECOMMENDATIONS topics with reason strings.

    `user_mastery` is the user's existing mastery rows.
    `candidate_topics` is the universe of topics the user *could* study —
    typically all topics in their selected exam(s).
    """
    weak_topics = [
        m for m in user_mastery
        if m.ewa < WEAK_MASTERY_THRESHOLD and m.n_attempts >= WEAK_MIN_ATTEMPTS
    ]
    mastered = [
        m for m in user_mastery
        if m.ewa >= MASTERED_THRESHOLD and m.n_attempts >= MASTERED_MIN_ATTEMPTS
    ]
    mastered_by_subject: dict[str, list[TopicMastery]] = {}
    for m in mastered:
        if m.subject_id:
            mastered_by_subject.setdefault(m.subject_id, []).append(m)

    candidates_by_id = {c.topic_id: c for c in candidate_topics}
    user_topic_ids = {m.topic_id for m in user_mastery}

    scored: list[Recommendation] = []

    # Phase 1: bridge recommendations — for each weak topic, find a
    # mastered sibling in the same subject and recommend re-drilling
    # the mastered one to consolidate. Score = 0.7 + (1 - weak.ewa) * 0.3.
    bridge_seen: set[str] = set()
    for weak in weak_topics:
        if not weak.subject_id:
            continue
        siblings = mastered_by_subject.get(weak.subject_id, [])
        for sib in siblings:
            if sib.topic_id in bridge_seen:
                continue
            bridge_seen.add(sib.topic_id)
            score = round(0.7 + (1.0 - weak.ewa) * 0.3, 4)
            reason = (
                f"You've mastered {sib.title} ({int(sib.ewa * 100)}%) — "
                f"re-drilling will help with {weak.title} where you're at "
                f"{int(weak.ewa * 100)}%."
            )
            scored.append(
                Recommendation(topic_id=sib.topic_id, score=score, reason_string=reason)
            )

    # Phase 2: weak-topic direct recommendations — student should keep
    # working on what's not yet learned.
    for weak in weak_topics:
        if any(s.topic_id == weak.topic_id for s in scored):
            continue
        score = round(0.5 + (1.0 - weak.ewa) * 0.4, 4)  # 0.5..0.9
        reason = (
            f"Your {weak.title} mastery is at {int(weak.ewa * 100)}% — "
            f"more practice will lift this."
        )
        scored.append(
            Recommendation(topic_id=weak.topic_id, score=score, reason_string=reason)
        )

    # Phase 3: exposure — topics never attempted. Score 0.3..0.5.
    if len(scored) < MAX_RECOMMENDATIONS:
        unstarted = [
            c for c in candidate_topics
            if c.topic_id not in user_topic_ids
            and c.user_attempts == 0
        ]
        for c in unstarted:
            if any(s.topic_id == c.topic_id for s in scored):
                continue
            scored.append(
                Recommendation(
                    topic_id=c.topic_id,
                    score=0.4,
                    reason_string=f"Try {c.title} — you haven't started this yet.",
                )
            )
            if len(scored) >= MAX_RECOMMENDATIONS:
                break

    # Sort by score desc, cap at MAX_RECOMMENDATIONS.
    scored.sort(key=lambda r: r.score, reverse=True)
    return scored[:MAX_RECOMMENDATIONS]
