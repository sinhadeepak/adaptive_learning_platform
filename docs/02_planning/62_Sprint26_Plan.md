# Sprint 26 — P4-S26: Concept prerequisite graph activation

**Sprint window:** 2026-04-28 (single working session)
**Theme:** Activate the `prerequisites` JSONB column that has lived on `catalog_schema.topics` since Sprint 1 but never been read. Surface "you're ready / master X first" gating to students; bias the study plan toward prereq-mastered ordering. Closes [GAP-P4-04](../06_gaps_resolution/Phase4_GapClosure_Addendum.md#gap-p4-04--concept-prerequisite-graph-declared-but-unused).

## Why this sprint

Per [`53_Phase4_ExamPrepDepth_SprintPlan.md`](53_Phase4_ExamPrepDepth_SprintPlan.md), S26 turns an inert schema column into an actual learning-progression signal. Without this, the platform has no way to say "you can't attempt rotational dynamics until you've mastered torque and moment-of-inertia" — the strongest learning-science signal exam-prep apps surface.

**Honest scope**: the seeded catalog has only 9 JEE-side topics today (3 Physics + 2 Chem + 2 Maths + 2 Bio). A real JEE Physics syllabus has ~50 topics. S26 ships the structural plumbing (traversal, gating, study-plan integration, UI pill) plus a small but realistic prereq graph over the existing topics. The full topology (~50 topics, ~80 edges) is **content workstream W1**, same channel as the bulk PYQ load.

## Backlog

### S26-A — Catalog migration 010: populate prerequisites

`catalog_schema.topics.prerequisites` JSONB has shipped since migration 001 but is empty for every row. Migration 010 populates a realistic dependency graph across the seeded topics:

| Topic | Prereqs |
|---|---|
| MECH (Mechanics) | (none — foundation) |
| THERMO (Thermodynamics) | MECH |
| ELEC (Electrostatics) | MECH, CALC |
| PCHEM (Physical Chemistry) | CALC, MECH |
| OCHEM (Organic Chemistry) | PCHEM |
| CALC (Calculus) | (none — foundation) |
| COORD (Coordinate Geometry) | (none — foundation) |
| CELL (Cell Biology) | (none — foundation) |
| GEN (Genetics) | CELL |
| MECH_NEET (NEET Mechanics) | (none — separate exam track) |

JSONB shape stays as a flat list of topic_id UUIDs (`["33333333-…0001"]`) — already the existing column type. No schema change.

### S26-B — alp-learning `prereqs` module

New `services/learning/src/learning/prereqs/`:

- `traversal.py` — pure functions over a `{topic_id: prereqs[]}` dict:
  - `direct_prereqs(graph, topic_id)` → list of immediate prereq ids.
  - `transitive_prereqs(graph, topic_id, max_depth=5)` → BFS over the graph.
  - `topological_order(graph, topic_ids)` → Kahn-algorithm sort; raises on cycles.
  - `missing_prereqs(graph, topic_id, mastery)` → list of prereqs where the user's EWA is below the mastery floor (default 0.6).
  - `gate_state(graph, topic_id, mastery, floor=0.6)` → `{"can_attempt": bool, "missing": [...], "mastered": [...]}`.
- `repositories.py` — read helpers over `catalog_schema.topics`:
  - `load_graph(session, exam_id?)` → returns `{topic_id: [prereq_ids]}` for the exam (or all topics if exam_id is None).
- `routes.py` mounted at `/catalog/topics/{id}/prereqs`:
  - `GET /catalog/topics/{topic_id}/prereqs` — returns `{topicId, directPrereqs, transitivePrereqs, suggestedPath}` (no user data).
  - `GET /catalog/topics/{topic_id}/gate?userId=X` — fetches mastery for the user from `alp-engagement` (existing HTTP client) and returns the gate state.

Pure-function traversal lives in `traversal.py` with **no DB/HTTP coupling** so unit tests don't need infra.

### S26-C — Study plan integration

`learning/adaptive/study_plan.py::_heuristic_study_plan` (and the LLM prompt's heuristic ranking) now order weak topics by **prereq depth ascending** — foundational topics scheduled first, derived topics later. The pure-function ordering is a one-call extension, gracefully ignored when the prereq graph is empty (e.g. for legacy non-Phase-4 exam tracks).

No change to the LLM-prompt path other than a sorted-topics input.

### S26-D — Web-student topic-detail prereq pill

Existing topic-detail UI in `apps/web-student` adds a small inline pill:

- "✓ You're ready for this topic" — when `gate.canAttempt` is true.
- "⚠ Master {topicTitle} first" — when prereqs are unmastered. Click → navigate to that prereq topic.
- Hidden when the topic has no prereqs.

The pill is sourced via `GET /catalog/topics/{id}/gate?userId=X` on the topic-detail page mount. Soft-fail: if the gate request errors, the pill is omitted (the page still renders).

Pure helper `apps/web-student/src/lib/prereq_gate.ts::summariseGate(gate)` extracts the display state. Unit-tested.

### S26-E — Tests

| File | Tests | Type |
|---|---|---|
| `services/learning/tests/prereqs/test_traversal.py` | 12 | Python unit (direct + transitive + topological + missing + gate state + cycle detection) |
| `services/learning/tests/prereqs/test_routes.py` | 2 | Python integration (route shapes; mocked engagement client) |
| `apps/web-student/src/lib/prereq_gate.test.ts` | 4 | Vitest |

### S26-F — Smoke extension

1 new assertion:
- `GET /catalog/topics/{MECH}/prereqs` returns shape `{topicId, directPrereqs, transitivePrereqs}`.

Smoke target: **58 steps**.

### S26-G — Closure + master phase index

`docs/02_planning/63_Sprint26_Closure.md`. Master phase index updated with S26 row.

## Out of scope

- **Engagement-side recommendation engine prereq integration** (predictive_recs preferring prereq-mastered topics). The Phase 4 plan calls for it; deferring to S30 stabilisation slot because it touches a cross-service module already shipped in S20 and the marginal lift over the study-plan integration is small.
- **Full JEE Physics topology (~50 topics + ~80 edges)** — content workstream W1.
- **Recommendation engine "bridge topics" upgrade to use prereq edges** — S20's `predictive_recs.py` does heuristic bridging by subject sibling already; prereq-aware bridging is a P5 enhancement.
- **Cycle-resolution authoring tool** — admin tooling for catalog editors to spot cycles. P5.
- **Mobile parity** — S35.

## Definition of done

- catalog migration 010 applied; ≥6 prereq edges populated across the existing JEE topics.
- `learning.prereqs` module ships traversal + repositories + 2 routes.
- Study plan honours prereq depth in topic ordering.
- Web-student topic-detail page renders the prereq pill.
- 18 new tests green (12 + 2 Python + 4 TS).
- `make smoke` 58/58.
- Sprint 26 closure doc + master phase index updated.
