"""Topic decay computation — Phase 6 S56.

Pure-function classifier mapping (last_attempted, ewa, n) → severity.
Surfaced via a new field on the existing GET /analytics/concept-mastery
response and used by the mission engine to seed refresh_decay missions.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal


@dataclass(frozen=True)
class DecayRow:
    decay_days: int
    decay_severity: Literal["fresh", "mild", "stale", "critical"]


def compute_decay(
    *,
    last_attempted_at: datetime | None,
    current_ewa: float,
    n_attempts: int,
    today: datetime | None = None,
) -> DecayRow:
    """fresh: < 7d OR n_attempts < 3 (signal too thin)
       mild:  7-14d
       stale: 14-30d
       critical: > 30d AND ewa > 0.4
    """
    today = today or datetime.now(timezone.utc)
    if n_attempts < 3 or last_attempted_at is None:
        return DecayRow(decay_days=0, decay_severity="fresh")

    # Some last_attempted_at values come back without timezone; normalise to UTC
    if last_attempted_at.tzinfo is None:
        last_attempted_at = last_attempted_at.replace(tzinfo=timezone.utc)

    days = (today - last_attempted_at).days
    if days < 7:
        sev: Literal["fresh", "mild", "stale", "critical"] = "fresh"
    elif days < 14:
        sev = "mild"
    elif days < 30:
        sev = "stale"
    elif current_ewa > 0.4:
        sev = "critical"
    else:
        sev = "stale"
    return DecayRow(decay_days=days, decay_severity=sev)
