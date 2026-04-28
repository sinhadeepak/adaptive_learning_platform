"""Drop-out forecasting — heuristic v1 per ADR-0010.

Pure function: take a `DropoutSignals` dataclass, return a `DropoutScore`.
No DB, no IO. The orchestrator in predictive.py gathers signals from
mastery/streaks/daily_activity and persists the result.

v2 (P3-S6+) replaces this with a trained lightgbm model. The contract
(input dataclass + output dataclass) stays stable so the swap is
mechanical.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final, Literal

RiskBand = Literal["LOW", "MEDIUM", "HIGH"]
Intervention = Literal[
    "re_engagement_notification", "suggest_tutor", "lower_difficulty", "none"
]

# Score thresholds. Tuneable later — they're flag-driven candidates.
HIGH_THRESHOLD: Final = 0.7
MEDIUM_THRESHOLD: Final = 0.4

# Signal-component caps. Sum of these is normalised by component count
# so each axis contributes proportionally.
INACTIVITY_CAP_DAYS: Final = 14
STREAK_BROKEN_LONGEST_MIN: Final = 5
MASTERY_FLOOR: Final = 0.35
WEAK_TOPICS_FLOOR: Final = 3


@dataclass(frozen=True)
class DropoutSignals:
    days_since_last_active: int  # >= 0; 999 = never active
    current_streak: int
    longest_streak: int
    avg_mastery: float  # 0..1, NaN-free
    n_topics_below_floor: int  # count where mastery < 0.4 AND attempts >= 3
    n_topics_total: int  # how many topics they have any data for


@dataclass(frozen=True)
class DropoutScore:
    score: float  # 0..1
    risk_band: RiskBand
    intervention_kind: Intervention
    components: dict[str, float]  # per-axis scores for explainability


def score_user(signals: DropoutSignals) -> DropoutScore:
    """Compute drop-out risk + recommended intervention.

    Each signal component contributes 0..1 to its axis. The final score
    is the average of all axes (so each is weighted equally).
    """
    # Inactivity: 0..1 over 14 days. 7 days = 0.5, 14+ = 1.0.
    inactivity_score = min(1.0, signals.days_since_last_active / INACTIVITY_CAP_DAYS)

    # Streak broken: was engaged (longest >= 5), now isn't (current = 0).
    streak_broken_score = (
        1.0
        if signals.longest_streak >= STREAK_BROKEN_LONGEST_MIN
        and signals.current_streak == 0
        else 0.0
    )

    # Mastery decline: simple flat — below MASTERY_FLOOR triggers full axis.
    mastery_decline_score = 1.0 if signals.avg_mastery < MASTERY_FLOOR else 0.0

    # Many weak topics: at least WEAK_TOPICS_FLOOR with mastery < 0.4 + n_attempts >= 3.
    many_weak_score = 1.0 if signals.n_topics_below_floor >= WEAK_TOPICS_FLOOR else 0.0

    # Cold-start: if user has zero topic data, we can't really score them
    # — return LOW with a neutral component breakdown so we don't false-positive.
    if signals.n_topics_total == 0 and signals.days_since_last_active >= 999:
        return DropoutScore(
            score=0.0,
            risk_band="LOW",
            intervention_kind="none",
            components={
                "inactivity": 0.0,
                "streak_broken": 0.0,
                "mastery_decline": 0.0,
                "many_weak_topics": 0.0,
            },
        )

    # Average across the 4 axes — equal weight.
    components = {
        "inactivity": inactivity_score,
        "streak_broken": streak_broken_score,
        "mastery_decline": mastery_decline_score,
        "many_weak_topics": many_weak_score,
    }
    score = sum(components.values()) / len(components)

    # Band
    if score >= HIGH_THRESHOLD:
        band: RiskBand = "HIGH"
    elif score >= MEDIUM_THRESHOLD:
        band = "MEDIUM"
    else:
        band = "LOW"

    # Intervention
    intervention: Intervention
    if band == "HIGH":
        if signals.days_since_last_active >= 7:
            intervention = "re_engagement_notification"
        elif signals.avg_mastery < MASTERY_FLOOR and signals.n_topics_below_floor >= WEAK_TOPICS_FLOOR:
            intervention = "suggest_tutor"
        else:
            intervention = "re_engagement_notification"
    elif band == "MEDIUM":
        if signals.n_topics_below_floor >= WEAK_TOPICS_FLOOR:
            intervention = "lower_difficulty"
        else:
            intervention = "none"
    else:
        intervention = "none"

    return DropoutScore(
        score=round(score, 4),
        risk_band=band,
        intervention_kind=intervention,
        components=components,
    )
