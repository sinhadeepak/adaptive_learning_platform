"""Sprint 12 S12-B — SSE leaderboard digest tests.

The poll-based SSE endpoint diffs snapshots via `_leaderboard_digest`.
The contract:
  - Identical row sets → identical digest (no `delta` frame emitted).
  - Any rank/score/nTopics change → different digest (delta fires).
  - Order matters (the slot tuples encode position).
"""

from __future__ import annotations

from analytics.routes import _leaderboard_digest


def _row(user_id: str, rank: int, score: float, n_topics: int) -> dict:
    return {
        "userId": user_id,
        "role": "STUDENT",
        "score": score,
        "nTopics": n_topics,
        "started": True,
        "rank": rank,
        "updatedAt": None,
    }


def test_identical_rows_produce_identical_digest() -> None:
    a = [_row("u1", 1, 0.8, 5), _row("u2", 2, 0.5, 3)]
    b = [_row("u1", 1, 0.8, 5), _row("u2", 2, 0.5, 3)]
    assert _leaderboard_digest(a) == _leaderboard_digest(b)


def test_score_change_changes_digest() -> None:
    a = [_row("u1", 1, 0.8, 5)]
    b = [_row("u1", 1, 0.9, 5)]
    assert _leaderboard_digest(a) != _leaderboard_digest(b)


def test_rank_change_changes_digest() -> None:
    """If two students swap places, the digest must reflect that even if
    every other field stays the same — the UI needs to re-render."""
    a = [_row("u1", 1, 0.8, 5), _row("u2", 2, 0.7, 5)]
    b = [_row("u1", 2, 0.8, 5), _row("u2", 1, 0.7, 5)]
    assert _leaderboard_digest(a) != _leaderboard_digest(b)


def test_n_topics_change_changes_digest() -> None:
    """A student covering more topics deserves a re-render even if the
    overall score stays flat — UI shows "Topics" column."""
    a = [_row("u1", 1, 0.8, 5)]
    b = [_row("u1", 1, 0.8, 6)]
    assert _leaderboard_digest(a) != _leaderboard_digest(b)


def test_empty_board_has_stable_digest() -> None:
    assert _leaderboard_digest([]) == _leaderboard_digest([])


def test_digest_ignores_unsorted_payload_order_only_through_explicit_slots() -> None:
    """The digest takes rows in the order supplied — callers must pass
    already-ranked rows. Reordering changes the digest, which is the
    correct behaviour: an out-of-order delta IS a UI-relevant change."""
    a = [_row("u1", 1, 0.8, 5), _row("u2", 2, 0.7, 5)]
    b = [_row("u2", 2, 0.7, 5), _row("u1", 1, 0.8, 5)]
    assert _leaderboard_digest(a) != _leaderboard_digest(b)
