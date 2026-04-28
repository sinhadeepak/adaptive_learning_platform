"""Sprint 13 S13-D — cohort-wide summary stats.

The cohort leaderboard answers "how do my students rank?". The summary
answers "how is the cohort doing overall?" — four headline numbers plus
a top-3 at-risk list. Both consume the same source rows; this module
extracts the aggregation as a pure function.
"""

from __future__ import annotations

from typing import Any

# Below this readiness AND after at least N topics, we flag the student
# for the "at risk" list. Picked so a brand-new student (n=0) doesn't
# show up as at-risk just because they haven't tried anything.
AT_RISK_READINESS_THRESHOLD = 0.4
AT_RISK_MIN_TOPICS = 3
AT_RISK_LIST_SIZE = 3


def summarise_cohort(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Pure aggregation over leaderboard rows.

    Returns:
      memberCount      — total members in the cohort
      startedCount     — members with at least one session
      avgReadinessPct  — mean readiness across started members (or 0)
      completionPct    — startedCount / memberCount (or 0)
      atRisk           — top-3 lowest scoring started members under
                         the AT_RISK threshold (UI dims them red)
    """
    if not rows:
        return {
            "memberCount": 0,
            "startedCount": 0,
            "avgReadinessPct": 0,
            "completionPct": 0,
            "atRisk": [],
        }

    member_count = len(rows)
    started = [r for r in rows if r.get("started")]
    started_count = len(started)
    avg = (
        round(100 * sum(r["score"] for r in started) / started_count)
        if started_count > 0
        else 0
    )
    completion = round(100 * started_count / member_count) if member_count > 0 else 0

    # At-risk: started + score < threshold + n_topics ≥ MIN_TOPICS.
    # Sorted by score ASC so the most-at-risk students surface first.
    at_risk_pool = [
        r
        for r in started
        if r["score"] < AT_RISK_READINESS_THRESHOLD
        and r["nTopics"] >= AT_RISK_MIN_TOPICS
    ]
    at_risk_pool.sort(key=lambda r: (r["score"], r["userId"]))
    at_risk = [
        {
            "userId": r["userId"],
            "score": r["score"],
            "nTopics": r["nTopics"],
        }
        for r in at_risk_pool[:AT_RISK_LIST_SIZE]
    ]

    return {
        "memberCount": member_count,
        "startedCount": started_count,
        "avgReadinessPct": avg,
        "completionPct": completion,
        "atRisk": at_risk,
    }
