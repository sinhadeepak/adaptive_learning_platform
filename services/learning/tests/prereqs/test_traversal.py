"""Sprint 26 (P4-S26) — pure-function tests for prereq graph traversal."""

from __future__ import annotations

import pytest

from learning.prereqs.traversal import (
    direct_prereqs,
    gate_state,
    has_cycle,
    missing_prereqs,
    prereq_depth,
    topological_order,
    transitive_prereqs,
)

# Reusable fixture: realistic JEE-flavoured graph.
# foundation: mech, calc, coord, cell
# thermo -> mech
# elec   -> mech, calc
# pchem  -> calc, mech
# ochem  -> pchem
# gen    -> cell
GRAPH: dict[str, list[str]] = {
    "mech": [],
    "calc": [],
    "coord": [],
    "cell": [],
    "thermo": ["mech"],
    "elec": ["mech", "calc"],
    "pchem": ["calc", "mech"],
    "ochem": ["pchem"],
    "gen": ["cell"],
}


def test_direct_prereqs_returns_immediate_only() -> None:
    assert direct_prereqs(GRAPH, "ochem") == ["pchem"]
    assert direct_prereqs(GRAPH, "elec") == ["mech", "calc"]
    assert direct_prereqs(GRAPH, "mech") == []


def test_direct_prereqs_unknown_topic_is_empty() -> None:
    assert direct_prereqs(GRAPH, "unknown") == []


def test_transitive_prereqs_walks_chain() -> None:
    # ochem -> pchem -> {calc, mech}
    out = transitive_prereqs(GRAPH, "ochem")
    assert "pchem" in out
    assert "calc" in out
    assert "mech" in out
    # No spurious topics
    assert "thermo" not in out
    assert "ochem" not in out  # never include the input topic


def test_transitive_prereqs_dedups() -> None:
    # pchem requires calc + mech; both reachable through different paths
    # in a deeper graph. Confirm BFS dedups.
    out = transitive_prereqs(GRAPH, "pchem")
    assert sorted(out) == ["calc", "mech"]


def test_transitive_prereqs_respects_max_depth() -> None:
    # max_depth=1 caps to direct prereqs only.
    out = transitive_prereqs(GRAPH, "ochem", max_depth=1)
    assert out == ["pchem"]


def test_topological_order_foundation_first() -> None:
    inputs = ["ochem", "pchem", "mech", "calc"]
    out = topological_order(GRAPH, inputs)
    # mech + calc must come before pchem; pchem must come before ochem.
    assert out.index("mech") < out.index("pchem")
    assert out.index("calc") < out.index("pchem")
    assert out.index("pchem") < out.index("ochem")


def test_topological_order_handles_singleton() -> None:
    assert topological_order(GRAPH, ["mech"]) == ["mech"]


def test_topological_order_raises_on_cycle() -> None:
    cycle: dict[str, list[str]] = {"a": ["b"], "b": ["c"], "c": ["a"]}
    with pytest.raises(ValueError):
        topological_order(cycle, ["a", "b", "c"])


def test_has_cycle_detects_back_edge() -> None:
    cycle: dict[str, list[str]] = {"a": ["b"], "b": ["a"]}
    assert has_cycle(cycle) is True


def test_has_cycle_returns_false_on_dag() -> None:
    assert has_cycle(GRAPH) is False


def test_missing_prereqs_filters_by_floor() -> None:
    mastery = {"mech": 0.8, "calc": 0.3}
    out = missing_prereqs(GRAPH, "elec", mastery, floor=0.6)
    # mech is mastered (0.8 >= 0.6), calc is not (0.3 < 0.6)
    assert out == ["calc"]


def test_missing_prereqs_treats_absent_as_zero() -> None:
    """Cold-start users with no mastery dict entries get every prereq listed
    as missing."""
    out = missing_prereqs(GRAPH, "elec", {}, floor=0.6)
    assert sorted(out) == ["calc", "mech"]


def test_gate_state_foundation_topic_always_attemptable() -> None:
    state = gate_state(GRAPH, "mech", {})
    assert state["can_attempt"] is True
    assert state["missing"] == []
    assert state["mastered"] == []


def test_gate_state_partial_mastery_blocks() -> None:
    mastery = {"mech": 0.7}  # calc missing
    state = gate_state(GRAPH, "elec", mastery)
    assert state["can_attempt"] is False
    assert "calc" in state["missing"]
    assert "mech" in state["mastered"]


def test_gate_state_full_mastery_unblocks() -> None:
    mastery = {"mech": 0.9, "calc": 0.85}
    state = gate_state(GRAPH, "elec", mastery)
    assert state["can_attempt"] is True
    assert state["missing"] == []
    assert sorted(state["mastered"]) == ["calc", "mech"]


def test_prereq_depth_foundation_is_zero() -> None:
    assert prereq_depth(GRAPH, "mech") == 0
    assert prereq_depth(GRAPH, "calc") == 0


def test_prereq_depth_chain_is_max_path_length() -> None:
    # ochem -> pchem -> {calc, mech} → depth 2
    assert prereq_depth(GRAPH, "ochem") == 2
    # thermo -> mech → depth 1
    assert prereq_depth(GRAPH, "thermo") == 1
