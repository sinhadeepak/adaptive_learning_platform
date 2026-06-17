# Sprint 26 Closure — P4-S26 Concept prerequisite graph activation

**Sprint window:** 2026-04-28 (single working session)
**Plan:** [`docs/02_planning/62_Sprint26_Plan.md`](62_Sprint26_Plan.md)

## Scope delivered

### S26-A — Catalog migration 010 — DONE

`catalog_schema.topics.prerequisites` JSONB has shipped since migration 001 but stayed empty for every row until now. Migration 010 populates a small but realistic dependency graph over the seeded JEE-side topics:

| Topic | Direct prereqs |
|---|---|
| MECH (Mechanics) | (foundation) |
| THERMO (Thermodynamics) | MECH |
| ELEC (Electrostatics) | MECH, CALC |
| PCHEM (Physical Chemistry) | CALC, MECH |
| OCHEM (Organic Chemistry) | PCHEM |
| CALC (Calculus) | (foundation) |
| COORD (Coordinate Geometry) | (foundation) |
| CELL (Cell Biology) | (foundation) |
| GEN (Genetics) | CELL |

Bulk topology (~50 topics × ~80 edges per exam) is parallel content workstream W1.

### S26-B — `learning.prereqs` module — DONE

New `services/learning/src/learning/prereqs/`:

- `traversal.py` — pure-function traversal helpers, no DB or HTTP coupling:
  - `direct_prereqs(graph, topic_id)` → immediate prereq ids
  - `transitive_prereqs(graph, topic_id, max_depth=5)` → BFS the graph (deduped, depth-bounded for cycle safety)
  - `topological_order(graph, topic_ids)` → Kahn-algorithm sort restricted to the input set; raises ValueError on cycles
  - `has_cycle(graph)` → DFS coloring detector
  - `missing_prereqs(graph, topic_id, mastery, floor=0.6)` → direct prereqs below the mastery floor
  - `gate_state(graph, topic_id, mastery, floor=0.6)` → `{can_attempt, missing[], mastered[]}`
  - `prereq_depth(graph, topic_id)` → longest-path depth from foundation; used by the study plan
- `repositories.py` — SQL reads over `catalog_schema.topics.prerequisites`:
  - `load_graph(session, exam_id?)` → returns `{topic_id: [prereq_ids]}` for the exam (or all topics)
  - `load_topic_titles(session, ids)` → `{topic_id: title}` for human-readable enrichment
- `routes.py` mounted at `/catalog/topics/{id}/`:
  - `GET /catalog/topics/{topic_id}/prereqs` — pure topology view
  - `GET /catalog/topics/{topic_id}/gate?userId=X` — joins prereq topology with user mastery (fetched from alp-engagement via existing `fetch_mastery` HTTP client) → returns the gate state with topic titles enriched

### S26-C — Study plan integration — DONE

`learning/adaptive/study_plan.py::build_study_plan` now annotates each topic with `prereqDepth` via the new prereq module before passing the enriched list to either the LLM-prompt path or the heuristic path:

- `_annotate_prereq_depth(topics)` — best-effort: loads the catalog graph, calls `prereq_depth(graph, topic_id)` for each topic, falls back to depth=0 on any failure.
- `_heuristic_study_plan` sort key extended to `(ewa, prereqDepth)` so foundational weak topics sort before derived weak topics.

Backward-compatible: when the prereq graph is empty (legacy non-Phase-4 exam tracks), every topic gets depth=0 and the historical EWA-only sort behaviour is preserved.

The LLM-prompt path receives the enriched topics in the same shape, so a future prompt revision can cite prereq depth in the rationale text without further plumbing.

### S26-D — Web-student topic-detail prereq pill — DONE

`apps/web-student/src/pages/TopicDetail.tsx` adds a small inline pill above the topic description, sourced from `GET /catalog/topics/{id}/gate?userId=X`:

- `✓ You're ready for this topic` (green) when `canAttempt` is true and the topic has prereqs (foundation topics show no pill).
- `⚠ Master {topicTitle} first` (amber, click-through to the prereq topic) when prereqs are unmastered. With multiple missing prereqs the label appends "(+N more)".
- Hidden when the topic has no prereqs at all (foundation topic) or the gate fetch fails.

Pure helper at `apps/web-student/src/lib/prereq_gate.ts`:
- `summariseGate(gate)` → `{kind: hidden | ready | blocked}`
- `blockedLabel(state)` → display string for the blocked pill

### S26-E — Tests — DONE

| File | Tests | Type | Result |
|---|---|---|---|
| `services/learning/tests/prereqs/test_traversal.py` | 17 | Python unit | 17/17 ✅ |
| `apps/web-student/src/lib/prereq_gate.test.ts` | 6 | Vitest | 6/6 ✅ |

**Total: 23 new tests, all green this session.** The plan estimated 18; pure-function traversal picked up edge cases (cycle detection, depth=0 foundation, cold-start mastery) that warranted explicit coverage.

The integration test for the routes (mocked engagement client) deferred — covered by the smoke step + the pure-function tests on the underlying logic.

### S26-F — Smoke extension — DONE

1 new assertion (step 58):
- `GET /catalog/topics/{THERMO}/prereqs` returns shape `{topicId, directPrereqs, transitivePrereqs}` and `directPrereqs` contains the MECH topic id.

Smoke target: **58 steps**.

### S26-G — Closure + master phase index — DONE

This file. Master phase index updated with the S26 row.

## Stack inventory at Sprint 26 close

- 6 services unchanged.
- alp-learning catalog rev **010**; `topics.prerequisites` populated for 9 topics (~7 edges including transitives).
- alp-learning: new `learning.prereqs` module + 2 routes (`/prereqs`, `/gate`).
- alp-learning study plan annotates topics with `prereqDepth` + sorts the heuristic recommendations by `(ewa, prereqDepth)`.
- web-student: new `prereq_gate.ts` pure helpers + topic-detail prereq pill.

## What surprised us this sprint

- **Test count overshot the plan because traversal pure functions surface real edge cases**. `transitive_prereqs` needs depth-bounding (cycle safety even though DAGs are the contract); `topological_order` needs to handle cycles via raise (not silent truncation); `prereq_depth` needs cycle-safe DFS via `visiting` set even though the catalog should never produce cycles. Each of these got an explicit test rather than a comment.
- **Foundation topics showing a pill would be noise** — students looking at "Mechanics" don't need an "all clear" pill because there's no prereq to clear. `summariseGate` returns `kind: hidden` when both `missing` and `mastered` are empty. Plan's "you're ready" pill is reserved for topics that *have* mastered prereqs (not zero-prereq foundation topics).
- **Best-effort annotation in the study plan** — `_annotate_prereq_depth` swallows any error and defaults to depth=0. This matters because the study plan path is a hot user-facing surface; a transient catalog DB hiccup shouldn't break "show me my plan." The fallback preserves the pre-S26 behaviour exactly.
- **The existing `/catalog/topics/{id}` route already returns `prerequisites` in the response shape** (Topic interface in TopicDetail.tsx). The S26 gate endpoint adds *user-aware* state (mastered/missing) on top of that static topology. We could have computed gate state client-side from the existing fields + mastery, but the dedicated endpoint keeps the gate logic on the backend (where the floor + future enhancements like soft-blocking on partial mastery live).

## Phase 4 strategic gates — still open

S26 is structurally complete with proof-of-pipeline content. The full ~50-topic JEE Physics graph is W1 effort.

## Carry-overs to Sprint 27 (P4-S27 — spaced-repetition revision queue)

| Item | Why deferred | Owner |
|---|---|---|
| Engagement-side recommendation engine prereq integration (`predictive_recs` preferring prereq-mastered topics) | Cross-service module touch; marginal lift over the study-plan integration | P4-S30 stabilisation slot |
| Bulk JEE Physics prereq topology (~50 topics, ~80 edges) | Content effort | W1 |
| Cycle-resolution authoring tool for catalog editors | Admin tooling | P5 |
| Prereq-aware question selection in the adaptive engine itself (refuse to serve a question from a topic with un-mastered prereqs in PRACTICE mode) | UX decision pending — gate on mastery vs let students try | Phase 5 |
| Mobile parity for the topic-detail pill | S35 | P4-S35 |

## Sprint 26 status

**P4-S26 closed.** The `prerequisites` JSONB column that has lived inert since Sprint 1 is now read on every topic-detail page render and on every study-plan recompute. Foundational topics get scheduled before derived topics; students see a "you're ready" or "master X first" pill before they start. The traversal layer is dependency-free and extensively unit-tested — ready for the bulk topology fill from W1.
