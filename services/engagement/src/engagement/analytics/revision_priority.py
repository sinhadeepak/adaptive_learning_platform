"""Phase 3.2 — yield-weighted revision priority.

The daily revision queue used to order purely by how overdue a topic was. This
re-ranks the *due* topics by blending three signals engagement already holds,
so "due AND weak AND error-prone" beats "due but comfortable":

  * overdue   — how far past its SM-2 due date the topic is
  * weakness  — 1 minus mastery EWA (a low-mastery topic is worth more)
  * errors    — concentration of captured wrong-answers on the topic

Pure functions only — the endpoint fetches the raw signals and calls `rank`.
`reason` gives the UI a short "why this is prioritised" chip.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

# Blend weights — overdue leads (it's the scheduler's own signal), then
# weakness, then error concentration. Tunable without a schema change.
W_OVERDUE = 0.45
W_WEAK = 0.35
W_ERROR = 0.20

_OVERDUE_SATURATION_DAYS = 14.0  # overdue signal maxes out here
_ERROR_SATURATION = 5.0          # this many logged errors on a topic = full signal


@dataclass(frozen=True)
class TopicSignals:
    topic_id: str
    overdue_days: int
    ewa: float | None      # mastery 0..1; None = never assessed
    error_count: int


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def priority_score(sig: TopicSignals) -> float:
    overdue = _clamp01(sig.overdue_days / _OVERDUE_SATURATION_DAYS)
    # Unknown mastery is treated as moderately weak (0.5) so brand-new topics
    # don't sink to the bottom.
    weakness = 1.0 - (sig.ewa if sig.ewa is not None else 0.5)
    errors = _clamp01(sig.error_count / _ERROR_SATURATION)
    return W_OVERDUE * overdue + W_WEAK * _clamp01(weakness) + W_ERROR * errors


def priority_reason(sig: TopicSignals) -> str:
    """Human 'why' for the UI chip — names the dominant contributing factor."""
    overdue = _clamp01(sig.overdue_days / _OVERDUE_SATURATION_DAYS)
    weakness = _clamp01(1.0 - (sig.ewa if sig.ewa is not None else 0.5))
    errors = _clamp01(sig.error_count / _ERROR_SATURATION)
    contrib = {
        "overdue": W_OVERDUE * overdue,
        "weak": W_WEAK * weakness,
        "errors": W_ERROR * errors,
    }
    top = max(contrib, key=contrib.get)
    if contrib[top] == 0.0:
        return "Scheduled review"
    if top == "overdue":
        return f"{sig.overdue_days}d overdue"
    if top == "weak":
        return "Weak mastery here"
    return "You keep missing this"


def rank(items: list[dict[str, Any]], signals: dict[str, TopicSignals]) -> list[dict[str, Any]]:
    """Attach `priority` + `priorityReason` to each due item and return them
    sorted highest-priority first. `items` are the serialized revision rows
    (must carry `topicId`); `signals` maps topicId → TopicSignals."""
    enriched: list[dict[str, Any]] = []
    for it in items:
        sig = signals.get(it["topicId"])
        if sig is None:
            sig = TopicSignals(
                topic_id=it["topicId"],
                overdue_days=int(it.get("overdueDays", 0) or 0),
                ewa=None,
                error_count=0,
            )
        enriched.append(
            {
                **it,
                "priority": round(priority_score(sig), 4),
                "priorityReason": priority_reason(sig),
                "errorCount": sig.error_count,
            }
        )
    enriched.sort(key=lambda r: (-r["priority"], -int(r.get("overdueDays", 0) or 0)))
    return enriched
