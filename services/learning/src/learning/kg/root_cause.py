"""Diagnostic root-cause walker — pure function.

Given a wrong answer's primary concept + per-user concept mastery + the
prereq edges of the concept graph, find the deepest concept whose
mastery is below the weak-threshold along any prereq chain reaching
the question's primary concept.

Pure-stdlib. The repository / HTTP layer hands in pre-loaded mastery +
edges; this function does graph DFS + threshold check only.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# Default threshold below which a concept counts as "weak" for the
# diagnostic. Slightly under the prereq-gating mastery floor (0.6 from
# learning.prereqs.traversal) so the walker surfaces emerging gaps
# that aren't yet hard blockers.
DEFAULT_WEAK_THRESHOLD = 0.4


@dataclass(frozen=True)
class Edge:
    """One directed prereq edge: `from_concept_id` is a prerequisite
    of `to_concept_id`. weight is optional and currently unused."""

    from_concept_id: str
    to_concept_id: str
    weight: float | None = None


@dataclass
class RootCauseResult:
    """Output of `root_cause_concept`."""

    primary_concept_id: str
    root_cause_concept_id: str | None
    path: list[str]                 # primary → ... → root_cause
    weak_concepts: list[str]        # all concepts encountered with mastery < threshold
    notes: list[str] = field(default_factory=list)


def root_cause_concept(
    *,
    primary_concept_id: str,
    user_concept_mastery: dict[str, float],
    edges: list[Edge],
    weak_threshold: float = DEFAULT_WEAK_THRESHOLD,
    max_depth: int = 6,
) -> RootCauseResult:
    """Find the deepest weak prereq along the chain rooted at the
    question's primary concept.

    Mastery semantics:
    - `user_concept_mastery[c]` is the user's EWA on concept `c` in [0, 1].
    - Concepts absent from the dict are treated as ewa=0 (cold-start) —
      they count as weak.

    Algorithm:
    - DFS along `is_prerequisite_of` edges (edge.to_concept_id is a
      successor in the chain question→prereq→deeper-prereq).
    - Track depth from the primary concept; deepest weak wins.
    - Cycles are detected via a visited set (depth-bounded fallback).
    - When the primary concept itself is weak, it's surfaced too — the
      caller surfaces this as "the question is just hard, no deeper
      gap" or "you need to revisit X first" depending on whether the
      walker found a deeper weak concept.

    Returns RootCauseResult; `root_cause_concept_id is None` means no
    weak concept was found along the chain (the student has the
    prereqs; the wrong answer reflects a slip rather than a gap).
    """
    # Build adjacency map keyed by from_concept_id → list of successor
    # concept ids. The "prereq chain" we walk goes outward from the
    # question's primary concept toward its prereqs (deeper = earlier
    # in the dependency order).
    successors: dict[str, list[str]] = {}
    for e in edges:
        successors.setdefault(e.from_concept_id, []).append(e.to_concept_id)

    notes: list[str] = []
    weak: list[str] = []
    deepest_weak: str | None = None
    deepest_depth = -1
    deepest_path: list[str] = []

    visited: set[str] = set()

    def is_weak(c: str) -> bool:
        return user_concept_mastery.get(c, 0.0) < weak_threshold

    def dfs(node: str, depth: int, path: list[str]) -> None:
        nonlocal deepest_weak, deepest_depth, deepest_path
        if depth > max_depth:
            notes.append(f"truncated_at_max_depth depth={max_depth} node={node}")
            return
        if node in visited:
            notes.append(f"cycle_short_circuit node={node}")
            return
        visited.add(node)
        if is_weak(node):
            weak.append(node)
            if depth > deepest_depth:
                deepest_weak = node
                deepest_depth = depth
                deepest_path = path[:]
        for nxt in successors.get(node, []):
            dfs(nxt, depth + 1, path + [nxt])

    # The primary concept is the entry point; record its weakness
    # before recursing so a slip-vs-gap distinction is preserved.
    dfs(primary_concept_id, depth=0, path=[primary_concept_id])

    return RootCauseResult(
        primary_concept_id=primary_concept_id,
        root_cause_concept_id=deepest_weak,
        path=deepest_path,
        weak_concepts=weak,
        notes=notes,
    )
