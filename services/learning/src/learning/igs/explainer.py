"""Explainer — produces human-readable rationale + alternatives.

The product surface contract from §11.5.C: every IGS recommendation
shows three things on the daily plan:
  1. The recommendation itself.
  2. Three short rationale bullets ("why this?").
  3. Top-2 alternatives the engine considered but didn't pick.

Without these three, the daily plan is a black box. With them, the
student understands the platform's reasoning and either accepts it
or overrides — both signals feed back into the model.
"""

from __future__ import annotations

from typing import Any


def rationale_for(scored: dict[str, Any]) -> list[str]:
    """Three-bullet rationale for a scored action. Plain English;
    never machine-jargon. Bullets are ordered by importance —
    the strongest reason comes first."""
    bullets: list[str] = []
    kind = scored.get("action_kind", "")
    sig = scored.get("signals") or {}
    em = scored.get("expected_marks_gained", 0.0)
    pd = scored.get("p_durable_mastery", 0.0)
    ef = scored.get("emotional_fit", 0.0)

    # Yield framing — the single most important signal.
    if em >= 6:
        bullets.append(
            f"Highest exam yield ({em:.1f} expected marks on practice)"
        )
    elif em >= 3:
        bullets.append(f"Solid exam yield ({em:.1f} expected marks)")
    elif kind == "revise_concept":
        days = int(sig.get("days_since_attempt", 0))
        bullets.append(
            f"Decay risk — you last touched this {days} days ago"
        )
    elif kind == "take_mock":
        bullets.append("Mock will surface unknown weak spots across topics")
    elif kind == "take_break":
        bullets.append("You've been at it 5+ days — a short break consolidates learning")

    # Mastery framing.
    mastery = float(sig.get("mastery", 0.5))
    if kind == "practice_concept":
        if mastery < 0.4:
            bullets.append(f"You're weak here (mastery {mastery:.0%}) — biggest score lift available")
        elif mastery < 0.7:
            bullets.append(f"Room to grow (mastery {mastery:.0%})")
        else:
            bullets.append(f"You're mostly there (mastery {mastery:.0%}) — short reinforcement")

    # Emotional / timing framing.
    if ef > 0.7:
        bullets.append("Fits your recent rhythm well")
    elif ef < 0.3:
        # Surface honestly when the action is sub-optimal for state.
        bullets.append("May feel hard given recent attempts — but worth pushing through")

    # Durability framing — only when it's meaningful.
    if pd > 0.6 and kind in ("practice_concept", "crash_drill"):
        bullets.append("In your flow zone — gains here are durable")

    # Cap at 3 bullets; if we somehow generated fewer, pad with a
    # generic fallback so the UI always renders 3 rows.
    while len(bullets) < 3:
        bullets.append("Aligned with your study plan")
    return bullets[:3]


def alternatives(scored: list[dict[str, Any]], n: int = 2) -> list[dict[str, Any]]:
    """Pick the next `n` candidates after the winner, each with a
    short why-not rationale.

    The "why not" line is the *difference* — what would have made
    this alternative the winner. Surfacing the diff is what turns
    a black-box recommendation into a teachable one.
    """
    if len(scored) <= 1:
        return []
    winner = scored[0]
    out: list[dict[str, Any]] = []
    for c in scored[1:1 + n]:
        why_not = _diff_explanation(winner, c)
        out.append({**c, "why_not": why_not})
    return out


def _diff_explanation(winner: dict[str, Any], alt: dict[str, Any]) -> str:
    """Why didn't the alternative win? Compare the dominant term."""
    w_em = winner.get("expected_marks_gained", 0)
    a_em = alt.get("expected_marks_gained", 0)
    if w_em - a_em >= 1.0:
        return f"Lower expected marks ({a_em:.1f} vs {w_em:.1f})"
    w_ef = winner.get("emotional_fit", 0)
    a_ef = alt.get("emotional_fit", 0)
    if w_ef - a_ef >= 0.2:
        return "Less fitting given your recent rhythm"
    w_cost = winner.get("cost", 0)
    a_cost = alt.get("cost", 0)
    if a_cost - w_cost >= 0.2:
        return f"Takes longer ({alt.get('expected_minutes', 0)} min vs {winner.get('expected_minutes', 0)} min)"
    return "Lower overall score by a small margin"


def confidence_from_gap(scored: list[dict[str, Any]]) -> float:
    """Confidence = how much the top action dominates the runner-up.

    A wide gap → we're sure. A tight race → low confidence and the
    UI should surface alternatives more prominently.

    Returns a value in [0, 1].
    """
    if len(scored) < 2:
        return 1.0
    top = scored[0]["score"]
    second = scored[1]["score"]
    if top <= 0:
        return 0.0
    gap = (top - second) / top
    return float(max(0.0, min(1.0, gap)))
