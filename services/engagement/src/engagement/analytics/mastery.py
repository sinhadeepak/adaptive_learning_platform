"""EWA mastery + readiness score computation.

EWA (Exponentially Weighted Average) of correctness ratio per (user, topic):

    ewa_new = alpha · score + (1 - alpha) · ewa_prev

with alpha = 0.4 — weights the latest session at 40%, history at 60%. Empirically
chosen from the GAP-03 LLD; tunable via ANALYTICS_EWA_ALPHA without redeploy
once we have telemetry on cohort drift. Cold-start (n=0) seeds with the first
session's score directly so a high initial score isn't dragged down by 0.

Readiness score is a per-user aggregate over the user's mastery set, scope =
"GLOBAL" today. When users start onboarding to multiple exams (Sprint 3), we
add per-exam scopes by passing the exam_id through.
"""

from __future__ import annotations

from dataclasses import dataclass

EWA_ALPHA = 0.4


@dataclass(frozen=True)
class MasteryRow:
    user_id: str
    topic_id: str
    ewa: float
    n: int


def update_ewa(prev_ewa: float, prev_n: int, score: float, alpha: float = EWA_ALPHA) -> float:
    """Return the new EWA after observing `score` (0..1) on top of (prev_ewa, prev_n).

    `prev_n == 0` means cold start: the first session sets the EWA outright.
    """
    if prev_n == 0:
        return score
    return alpha * score + (1.0 - alpha) * prev_ewa


def readiness_from_mastery(rows: list[MasteryRow]) -> float:
    """Plain mean of EWAs across all topics the user has touched.

    Sprint 3 weights this by topic importance per the active exam's blueprint;
    today every topic counts equally. Empty input → 0.0 (the user hasn't taken
    a quiz yet).
    """
    if not rows:
        return 0.0
    return sum(r.ewa for r in rows) / float(len(rows))
