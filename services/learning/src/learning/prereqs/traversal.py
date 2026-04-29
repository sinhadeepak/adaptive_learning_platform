"""Pure-function prereq traversal (Sprint 26, P4-S26).

The graph shape is a plain dict: `{topic_id: [prereq_topic_id, ...]}`. A
topic with no prereqs maps to an empty list. A topic missing from the dict
is treated as having no prereqs (the routes layer guarantees the dict
covers every topic_id of interest).

Mastery shape: `{topic_id: ewa}` where ewa is in [0, 1]. Topics absent
from the mastery dict are treated as ewa=0 (cold-start).

No DB, no HTTP, no SQLAlchemy. Tests cover each function in isolation.
"""

from __future__ import annotations

from collections import deque
from typing import TypedDict


# Default mastery threshold above which a prereq counts as "mastered" for
# gating purposes. Matches the EWA conventions in S20's predictive_recs.py
# (mastered = EWA >= 0.6).
DEFAULT_MASTERY_FLOOR = 0.6


class GateState(TypedDict):
    can_attempt: bool
    missing: list[str]   # topic_ids the user still needs to master
    mastered: list[str]  # topic_ids the user already mastered (subset of direct prereqs)


def direct_prereqs(graph: dict[str, list[str]], topic_id: str) -> list[str]:
    """Immediate prereqs of a topic, in declaration order. Empty if none."""
    return list(graph.get(topic_id, []))


def transitive_prereqs(
    graph: dict[str, list[str]],
    topic_id: str,
    *,
    max_depth: int = 5,
) -> list[str]:
    """BFS the graph from `topic_id` and return every transitive prereq in
    discovery order (no duplicates). Bounded by `max_depth` so a malformed
    cycle can't run unbounded; a cycle is otherwise tolerated (the visited
    set short-circuits the loop)."""
    visited: set[str] = set()
    out: list[str] = []
    queue: deque[tuple[str, int]] = deque()
    for p in graph.get(topic_id, []):
        queue.append((p, 1))
    while queue:
        node, depth = queue.popleft()
        if node in visited or depth > max_depth:
            continue
        visited.add(node)
        out.append(node)
        for p in graph.get(node, []):
            if p not in visited:
                queue.append((p, depth + 1))
    return out


def has_cycle(graph: dict[str, list[str]]) -> bool:
    """Detect whether the graph contains a directed cycle."""
    WHITE, GRAY, BLACK = 0, 1, 2
    color: dict[str, int] = {n: WHITE for n in graph}

    def dfs(node: str) -> bool:
        color[node] = GRAY
        for nxt in graph.get(node, []):
            if color.get(nxt, WHITE) == GRAY:
                return True
            if color.get(nxt, WHITE) == WHITE and dfs(nxt):
                return True
        color[node] = BLACK
        return False

    return any(color[n] == WHITE and dfs(n) for n in graph)


def topological_order(
    graph: dict[str, list[str]], topic_ids: list[str]
) -> list[str]:
    """Return `topic_ids` reordered so that every prereq comes before the
    topics that depend on it (Kahn's algorithm restricted to the input set).

    Topics with no prereqs (foundation) come first; topics deepest in the
    DAG come last. Ties broken by input order (stable).

    Raises ValueError if the graph (restricted to `topic_ids`) contains a
    cycle — caller should surface the corrupt-catalog error.
    """
    selected = set(topic_ids)
    # In-degree restricted to the input set
    indeg: dict[str, int] = {t: 0 for t in topic_ids}
    for t in topic_ids:
        for p in graph.get(t, []):
            if p in selected:
                indeg[t] += 1

    # Stable order: walk topic_ids, queue ones with indeg 0
    queue: list[str] = [t for t in topic_ids if indeg[t] == 0]
    out: list[str] = []
    visited: set[str] = set()
    while queue:
        node = queue.pop(0)
        if node in visited:
            continue
        visited.add(node)
        out.append(node)
        # Decrement in-degree of any topic that listed `node` as a prereq
        for t in topic_ids:
            if t in visited:
                continue
            if node in graph.get(t, []):
                indeg[t] -= 1
                if indeg[t] == 0:
                    queue.append(t)
    if len(out) != len(set(topic_ids)):
        raise ValueError("topological_order: graph has a cycle restricted to input")
    return out


def missing_prereqs(
    graph: dict[str, list[str]],
    topic_id: str,
    mastery: dict[str, float],
    *,
    floor: float = DEFAULT_MASTERY_FLOOR,
) -> list[str]:
    """Direct prereqs whose user mastery (EWA) is below `floor`. Returns
    them in declaration order so the UI can surface "master {first} first"
    deterministically."""
    out: list[str] = []
    for p in graph.get(topic_id, []):
        if (mastery.get(p) or 0.0) < floor:
            out.append(p)
    return out


def gate_state(
    graph: dict[str, list[str]],
    topic_id: str,
    mastery: dict[str, float],
    *,
    floor: float = DEFAULT_MASTERY_FLOOR,
) -> GateState:
    """Whether the user can attempt `topic_id` given their mastery, and
    which direct prereqs are missing/mastered. A topic with no prereqs is
    always attemptable."""
    direct = direct_prereqs(graph, topic_id)
    if not direct:
        return {"can_attempt": True, "missing": [], "mastered": []}
    missing: list[str] = []
    mastered: list[str] = []
    for p in direct:
        if (mastery.get(p) or 0.0) >= floor:
            mastered.append(p)
        else:
            missing.append(p)
    return {
        "can_attempt": len(missing) == 0,
        "missing": missing,
        "mastered": mastered,
    }


def prereq_depth(graph: dict[str, list[str]], topic_id: str) -> int:
    """Longest path length from `topic_id` back to a foundation topic.
    Used by the study plan to schedule shallow topics first.

    Returns 0 for foundation topics (no prereqs). Cycles short-circuit at
    depth 5 to bound runtime; cycles in production catalogue are an error
    and should be caught by `has_cycle` at ingest time."""
    memo: dict[str, int] = {}

    def dfs(node: str, visiting: set[str]) -> int:
        if node in memo:
            return memo[node]
        if node in visiting:
            return 0  # cycle short-circuit
        prereqs = graph.get(node, [])
        if not prereqs:
            memo[node] = 0
            return 0
        nxt_visiting = visiting | {node}
        depth = 1 + max(dfs(p, nxt_visiting) for p in prereqs)
        memo[node] = depth
        return depth

    return dfs(topic_id, set())
