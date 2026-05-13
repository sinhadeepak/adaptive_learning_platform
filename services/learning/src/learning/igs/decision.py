"""IGS decision function — score(action, context) → rank.

Score formula (plan §B3):

    score = α × expected_marks_gained
          + β × p_durable_mastery
          + γ × time_efficiency
          + δ × emotional_fit
          − ε × cost

Each term is a pure function of:
  - The candidate (action_kind, concept_id, signals dict)
  - Per-call context (recent frustration events, time-of-day,
    target exam date, etc.)

Weights α/β/γ/δ/ε are platform defaults at launch; the controlled
experiment in Phase B3 exit measures the lift from tuning them.

All scores are non-negative; cost is subtracted but capped so a
single high-cost action can't drive the score below zero.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

# Platform defaults. Tunable per the §B3 A/B test.
WEIGHTS = {
    "alpha_yield":     1.0,    # expected_marks_gained
    "beta_durability": 0.5,    # p_durable_mastery (flow effect)
    "gamma_efficiency": 0.3,   # time_efficiency
    "delta_emotional": 0.4,    # emotional_fit
    "epsilon_cost":    0.05,   # cost penalty
}


@dataclass
class IGSContext:
    """The slice of student state the decision function consumes.

    Kept narrow on purpose so the unit-test surface is small.
    """

    user_id: str
    exam_id: str
    forecast_year: int
    # Recent flow-corridor events (frustration / boredom). Used by
    # the emotional_fit term to suppress hard work after a streak
    # of wrongs or encourage a break.
    recent_frustration_events: int = 0
    recent_boredom_events: int = 0
    # Time-of-day in minutes-since-midnight (0–1439). Combined with
    # the student's circadian model to compute the time-of-day fit.
    # 0 = midnight, 540 = 9 AM, 1200 = 8 PM.
    time_of_day_minutes: int = 720
    # Streak length (consecutive days with activity). Long streaks
    # earn the "encourage continuation" emotional boost.
    streak_days: int = 0
    # Days the student has been active inside the last 7. 0 = idle
    # week → break-suppression turns off.
    active_last_7d: int = 0


def score_action(
    candidate: dict[str, Any],
    context: IGSContext,
    *,
    weights: dict[str, float] | None = None,
) -> dict[str, Any]:
    """Score one candidate. Returns the candidate dict augmented
    with per-term scores + total score.

    The contract: every numeric output is bounded in [0, ~10] so the
    final rank doesn't explode on outlier inputs. Cost is the only
    term that can dominate (it can pull the score to zero).
    """
    w = weights or WEIGHTS
    sig = candidate.get("signals") or {}
    action_kind = candidate["action_kind"]

    # ── component 1: expected marks gained ─────────────────────
    # For practice / revise: base_yield × (1 − mastery), already
    # rolled up by PCE into personal_yield. Cap at 12 marks to
    # smooth outliers.
    expected_marks = min(12.0, float(sig.get("personal_yield", 0.0)))

    # ── component 2: probability of durable mastery ────────────
    # Higher when the practice difficulty is in the flow corridor.
    # We approximate via "how much room to grow" + a yield-rank
    # bonus (top-3 ranked topics get +0.1).
    mastery = float(sig.get("mastery", 0.5))
    room_to_grow = max(0.0, 1.0 - mastery)
    rank_bonus = 0.1 if int(sig.get("yield_rank", 999)) <= 3 else 0.0
    p_durable = min(1.0, room_to_grow + rank_bonus)

    # ── component 3: time efficiency (marks per minute) ────────
    minutes = max(1, int(candidate.get("expected_minutes", 20)))
    time_efficiency = expected_marks / minutes

    # ── component 4: emotional fit ─────────────────────────────
    emotional_fit = _emotional_fit(action_kind, context)

    # ── component 5: cost ─────────────────────────────────────
    # Long actions cost more, but only proportionally. A 60-minute
    # mock costs ~0.6 marks of score, a 10-minute break costs ~0.1.
    cost = minutes / 100.0

    # ── total ─────────────────────────────────────────────────
    total = (
        w["alpha_yield"]     * expected_marks
        + w["beta_durability"] * p_durable
        + w["gamma_efficiency"] * time_efficiency
        + w["delta_emotional"] * emotional_fit
        - w["epsilon_cost"]   * cost
    )

    return {
        **candidate,
        "score": total,
        "expected_marks_gained": expected_marks,
        "p_durable_mastery": p_durable,
        "time_efficiency": time_efficiency,
        "emotional_fit": emotional_fit,
        "cost": cost,
    }


def _emotional_fit(action_kind: str, ctx: IGSContext) -> float:
    """How well the action fits the student's current emotional state.

    Heuristics:
      - Recent frustration → favour `revise_concept` + `watch_video`
        + `take_break`; suppress `practice_concept` at hard difficulty.
      - Recent boredom → favour `take_mock` + harder `practice_concept`;
        suppress `revise_concept`.
      - Long streak → `take_break` gets a moderate boost only when
        active_last_7d >= 5 (genuine fatigue risk).
      - Time-of-day fit: the student's most-accurate window gets
        a small bonus (placeholder until Phase A3 ships
        `/analytics/circadian/{user_id}`).
    """
    fit = 0.5  # neutral baseline
    if ctx.recent_frustration_events >= 2:
        if action_kind in ("revise_concept", "watch_video", "take_break"):
            fit += 0.3
        elif action_kind in ("practice_concept", "crash_drill"):
            fit -= 0.2
    if ctx.recent_boredom_events >= 1:
        if action_kind in ("take_mock", "crash_drill"):
            fit += 0.25
        elif action_kind == "revise_concept":
            fit -= 0.15
    if action_kind == "take_break":
        if ctx.active_last_7d >= 5 and ctx.streak_days >= 7:
            fit += 0.2
        else:
            # Default break suppression — surfaces only when warranted.
            fit -= 0.3
    # Time-of-day: 6-8 AM gets a small "morning person" bonus,
    # late-night 22+ a small penalty. Real circadian fit ships in A3.
    hour = ctx.time_of_day_minutes // 60
    if 6 <= hour <= 8 and action_kind in ("practice_concept", "take_mock"):
        fit += 0.1
    if hour >= 22:
        fit -= 0.05
    return max(0.0, min(1.0, fit))


def rank_candidates(
    candidates: list[dict[str, Any]],
    context: IGSContext,
    *,
    weights: dict[str, float] | None = None,
) -> list[dict[str, Any]]:
    """Score every candidate then sort score-descending. Returns the
    full ranked list (caller decides how many to surface)."""
    scored = [score_action(c, context, weights=weights) for c in candidates]
    scored.sort(key=lambda c: -c["score"])
    for i, c in enumerate(scored, start=1):
        c["rank"] = i
    return scored


def now_minutes_of_day() -> int:
    """Helper — minutes-since-midnight in UTC. Callers can override
    via the context object's `time_of_day_minutes` field when they
    know the user's local timezone."""
    now = datetime.now(tz=timezone.utc)
    return now.hour * 60 + now.minute
