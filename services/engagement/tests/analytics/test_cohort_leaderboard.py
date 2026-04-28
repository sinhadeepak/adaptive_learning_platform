"""Sprint 9 L-1 — cohort leaderboard pure-logic tests.

`rank_leaderboard` is the deterministic core. The HTTP fetch + DB batch
read are exercised in the live compose smoke; pinning the ranker here
gives us the contract: sort by score DESC, then nTopics DESC, then
userId ASC.
"""

from __future__ import annotations

import pytest

from engagement.analytics.cohort_leaderboard import rank_leaderboard


def _m(uid: str, role: str = "STUDENT") -> dict:
    return {"userId": uid, "role": role}


def _r(score: float, n_topics: int = 1, updated: str | None = None) -> dict:
    return {"score": score, "nTopics": n_topics, "updatedAt": updated}


def test_empty_cohort_returns_empty_list() -> None:
    assert rank_leaderboard([], {}) == []


def test_score_desc_drives_ranking() -> None:
    members = [_m("u-low"), _m("u-high"), _m("u-mid")]
    readiness = {
        "u-low": _r(0.2),
        "u-high": _r(0.9),
        "u-mid": _r(0.5),
    }
    rows = rank_leaderboard(members, readiness)
    assert [r["userId"] for r in rows] == ["u-high", "u-mid", "u-low"]
    assert [r["rank"] for r in rows] == [1, 2, 3]


def test_n_topics_breaks_score_ties() -> None:
    """Two students at score=0.6 — the one with more topics covered
    ranks higher (broader signal)."""
    members = [_m("u-shallow"), _m("u-deep")]
    readiness = {
        "u-shallow": _r(0.6, n_topics=2),
        "u-deep": _r(0.6, n_topics=10),
    }
    rows = rank_leaderboard(members, readiness)
    assert rows[0]["userId"] == "u-deep"


def test_user_id_alphabetical_breaks_remaining_ties() -> None:
    """When score AND n_topics tie, sort by userId ASC for determinism —
    so the leaderboard ordering is stable across reloads."""
    members = [_m("u-bbb"), _m("u-aaa")]
    readiness = {"u-aaa": _r(0.5, 3), "u-bbb": _r(0.5, 3)}
    rows = rank_leaderboard(members, readiness)
    assert rows[0]["userId"] == "u-aaa"


def test_unstarted_members_listed_with_started_false() -> None:
    """Members without a readiness row aren't dropped — they render at
    the bottom with `started: false`. Educators want to see who's
    enrolled but inactive."""
    members = [_m("u-active"), _m("u-inactive")]
    readiness = {"u-active": _r(0.7, 5)}
    rows = rank_leaderboard(members, readiness)
    assert len(rows) == 2
    assert rows[0]["userId"] == "u-active"
    assert rows[0]["started"] is True
    assert rows[1]["userId"] == "u-inactive"
    assert rows[1]["started"] is False
    assert rows[1]["score"] == 0.0


def test_lead_teachers_excluded_by_default() -> None:
    """The leaderboard exists to rank STUDENTS — having the teacher show
    up between two students is a UX bug, so they're filtered by default."""
    members = [_m("u-stu"), _m("u-tch", "LEAD_TEACHER")]
    readiness = {"u-stu": _r(0.5), "u-tch": _r(0.9)}
    rows = rank_leaderboard(members, readiness)
    assert len(rows) == 1
    assert rows[0]["userId"] == "u-stu"


def test_lead_teachers_included_when_requested() -> None:
    """Educator may want to see "where would I rank" — the API exposes
    `includeTeachers=true` so they can opt in."""
    members = [_m("u-stu"), _m("u-tch", "LEAD_TEACHER")]
    readiness = {"u-stu": _r(0.5), "u-tch": _r(0.9)}
    rows = rank_leaderboard(members, readiness, include_teachers=True)
    assert len(rows) == 2
    assert rows[0]["role"] == "LEAD_TEACHER"


def test_rank_is_one_indexed() -> None:
    """UI renders rank directly without arithmetic — 1, 2, 3 not 0, 1, 2."""
    members = [_m("a"), _m("b"), _m("c")]
    readiness = {"a": _r(0.9), "b": _r(0.6), "c": _r(0.3)}
    rows = rank_leaderboard(members, readiness)
    assert [r["rank"] for r in rows] == [1, 2, 3]
