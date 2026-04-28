"""Sprint 13 S13-D — cohort summary aggregation tests.

Pinning the headline-stats contract:
- Empty cohort yields zeroed payload (no NaN, no None).
- avgReadinessPct averages only `started` members.
- completionPct = startedCount / memberCount.
- atRisk includes started members under the threshold AND with
  >= AT_RISK_MIN_TOPICS, top 3 by score ASC.
"""

from __future__ import annotations

from engagement.analytics.cohort_summary import (
    AT_RISK_LIST_SIZE,
    AT_RISK_MIN_TOPICS,
    AT_RISK_READINESS_THRESHOLD,
    summarise_cohort,
)


def _r(uid: str, score: float, n: int, started: bool = True) -> dict:
    return {
        "userId": uid,
        "role": "STUDENT",
        "score": score,
        "nTopics": n,
        "started": started,
        "rank": 1,
        "updatedAt": None,
    }


def test_empty_cohort_returns_zeroed_payload() -> None:
    out = summarise_cohort([])
    assert out["memberCount"] == 0
    assert out["startedCount"] == 0
    assert out["avgReadinessPct"] == 0
    assert out["completionPct"] == 0
    assert out["atRisk"] == []


def test_completion_pct_includes_unstarted_members() -> None:
    rows = [
        _r("u1", 0.8, 5, started=True),
        _r("u2", 0.0, 0, started=False),
        _r("u3", 0.0, 0, started=False),
    ]
    out = summarise_cohort(rows)
    assert out["memberCount"] == 3
    assert out["startedCount"] == 1
    # 1/3 → 33%
    assert out["completionPct"] == 33


def test_avg_readiness_averages_only_started_members() -> None:
    """Including unstarted members would tank the average and mislead
    the educator. Average is over students who actually started."""
    rows = [
        _r("u1", 0.8, 5, started=True),
        _r("u2", 0.6, 4, started=True),
        _r("u3", 0.0, 0, started=False),
    ]
    out = summarise_cohort(rows)
    assert out["avgReadinessPct"] == 70  # round(100 * (0.8 + 0.6) / 2)


def test_at_risk_filters_by_threshold_and_topic_floor() -> None:
    """A student under the threshold but with only 1 topic shouldn't
    show up — they haven't tried enough to be flagged."""
    rows = [
        _r("u-shallow", 0.2, 1, started=True),  # under threshold but only 1 topic → skip
        _r("u-real-risk", 0.2, AT_RISK_MIN_TOPICS, started=True),
        _r("u-strong", 0.85, 5, started=True),
        _r("u-developing", 0.5, 5, started=True),
    ]
    out = summarise_cohort(rows)
    risk_ids = [r["userId"] for r in out["atRisk"]]
    assert "u-real-risk" in risk_ids
    assert "u-shallow" not in risk_ids
    assert "u-strong" not in risk_ids


def test_at_risk_caps_at_three() -> None:
    rows = [
        _r(f"u-{i}", 0.1 + i * 0.01, AT_RISK_MIN_TOPICS, started=True)
        for i in range(5)
    ]
    out = summarise_cohort(rows)
    assert len(out["atRisk"]) == AT_RISK_LIST_SIZE


def test_at_risk_sorted_by_score_ascending() -> None:
    """Most at risk surfaces first so the educator sees who needs
    attention immediately."""
    rows = [
        _r("u-0.20", 0.20, AT_RISK_MIN_TOPICS, started=True),
        _r("u-0.30", 0.30, AT_RISK_MIN_TOPICS, started=True),
        _r("u-0.10", 0.10, AT_RISK_MIN_TOPICS, started=True),
    ]
    out = summarise_cohort(rows)
    assert [r["userId"] for r in out["atRisk"]] == [
        "u-0.10",
        "u-0.20",
        "u-0.30",
    ]


def test_at_risk_excludes_unstarted() -> None:
    """Unstarted members are not at risk — they haven't tried."""
    rows = [
        _r("u-fresh", 0.0, 0, started=False),
    ]
    out = summarise_cohort(rows)
    assert out["atRisk"] == []


def test_threshold_constant_is_pinned() -> None:
    """UI copy references "below 40% readiness" — change requires
    coordinated update of the educator help docs."""
    assert AT_RISK_READINESS_THRESHOLD == 0.4
