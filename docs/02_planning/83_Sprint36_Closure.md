# Sprint 36 (P4-S36) — Phase 4 closure + cutover prep — CLOSURE

**Closed**: 2026-04-30
**Plan**: [82_Sprint36_Plan.md](82_Sprint36_Plan.md)
**Type**: Documentation-only sprint (no code change).
**Outcome**: ✅ all 4 deliverables shipped. Phase 4 closed in full (15/15 sprints).

---

## Why this sprint exists

S22–S35 closed the technical depth gap to Allen/Vedantu/Unacademy across 14 sprints. Phase 4 needed a documentation-only closing sprint to:

1. Write the retrospective so the work is auditable in the same way Phases 1–3 were.
2. Mark the [strategic gap audit](52_ExamPrep_Strategic_Gap_Audit.md) gaps as closed (or honestly partial).
3. Refresh the staging cutover plan to absorb everything Phase 4 added.
4. Catalogue the standalone Phase-4-Mobile follow-up so it isn't forgotten.

No backend logic. No new endpoints. No migrations. The exam-prep depth gap was technical *and* documentation-shaped — the docs side closes here.

---

## What shipped

| # | Deliverable | Path | Notes |
|---|---|---|---|
| 1 | Phase 4 retrospective | [24_Phase4_Retrospective.md](24_Phase4_Retrospective.md) | Per-sprint table for S22–S36; ~235 new tests; ~25 new HTTP endpoints; 8 schema migrations across 4 schemas; 5 new ADRs; 16 backend modules; 6 web-student pages; 12 TS helpers; 13 named carry-overs routed to staging-cutover or content-W1. |
| 2 | Strategic gap audit close-out | [52_ExamPrep_Strategic_Gap_Audit.md](52_ExamPrep_Strategic_Gap_Audit.md) (appended section) | Status row per gap: 15/16 ✅ closed, 1 🟨 partial (gap 16 = static study plan; S30 + S33 ship pacing primitives but full StudyPlan.tsx v2 wiring is part of cutover G-15). |
| 3 | Cutover addendum | [Phase4_Cutover_Addendum.md](Phase4_Cutover_Addendum.md) | 6 new gates (G-12 cron infra · G-13 exam-mode reliability · G-14 content W1 · G-15 study-plan v2 cross-service · G-16 UI consolidation · G-17 live S35 trigger wiring) + 3 new drills (9–11) + 8 new SLOs + revised 10-day sequencing. Standalone Phase-4-Mobile catalogued as G-18. |
| 4 | Master phase index update | [00_MasterPhaseIndex.md](00_MasterPhaseIndex.md) | Phase 4 row flipped from `❌ DRAFT — gated on 3 strategic decisions` to `✅ all 15 sprints closed (S22–S36)`. Sprint 36 row added. Pending-today text rewritten to reflect AWS cutover as the sole remaining blocker. |

The mobile parity scope ([Phase4_Mobile_Parity_Scope.md](Phase4_Mobile_Parity_Scope.md)) shipped as part of S35 — cross-referenced from the addendum but not modified here.

---

## Tests

None. This sprint touches only `docs/`. Smoke counter unchanged at **66/66**.

---

## Carry-overs

None from S36 itself.

The named carry-overs from S22–S35 that this sprint routed (full list in the retrospective) collapse into the cutover gates G-12..G-18:

| Source sprint | Carry-over | Routed to |
|---|---|---|
| S23 | Heartbeat + state-resume on 5-min disconnect | G-13 (exam-mode reliability) |
| S25 | Server-side section-locks under load | G-13 |
| S26 | Bulk JEE Physics topology | G-14 (content W1) |
| S27 | Daily revision cron + pre-mock sprint mode | G-12 (cron infra) |
| S28 | Bulk chapter mapping (~50 × ~80 assignments) | G-14 |
| S28 | Cohort-level syllabus rollup | G-15 (study-plan v2) |
| S29 | Choice-text in Quiz NATS payload + WeaknessDiagnosis pattern panel | G-16 (UI consolidation) |
| S30 | Full study-plan v2 cross-service wiring + StudyPlan.tsx | G-15 |
| S31 | Cohort-aggregation cron firing + per-topic coaching | G-12 + G-15 |
| S32 | TopicDetail percentile pill + educator drill-down | G-16 |
| S33 | Trajectory HTTP endpoint + Goals.tsx | G-15 + G-16 |
| S34 | TopicDetail reference-panel UI | G-16 |
| S35 | Live trigger wiring + Flutter port | G-17 + G-18 |

13 carry-overs cleanly absorbed by 6 named gates + 1 standalone sprint. Not a single one is orphaned.

---

## What this sprint did NOT do

To keep S36 narrow and predictable:

- **No code change.** Docs only.
- **`docs/CLAUDE.md` patches** are listed in the cutover addendum's "Updated `docs/CLAUDE.md` patches" section but not applied here — that refresh lands during the cutover sprint when service inventory + URL prefixes are also re-verified against running staging.
- **ADRs 0012–0016** stay `proposed`. Acceptance gates the cutover sprint.
- **No migration runs.** All 8 Phase 4 alembic revisions remain ready to deploy; the cutover sprint applies them on staging.

---

## Phase 4 closing snapshot

| Dimension | Count |
|---|---|
| Sprints shipped | 15 (S22–S36) |
| Window | 2026-04-28 → 2026-04-30 |
| New backend modules | 16 (across alp-learning + alp-engagement + alp-identity) |
| New HTTP endpoints | ~25 |
| New schema migrations | 8 (additive, NULL-able defaults; roll-forward only) |
| New ADRs | 5 (0012–0016, all `proposed`) |
| New web-student pages | 6 |
| New TS pure-helper modules | 12 |
| New tests (Python + TS + Go) | ~235 |
| Strategic-audit gaps closed | 15 of 16 (1 partial) |
| Mobile parity | catalogued, deferred to standalone sprint |
| Smoke counter | 60 → 66 |

Engineering is no longer the bottleneck on launch readiness. The remaining blockers are **AWS access** (gating since Phase 1), **content workstream W1** (~16K JEE PYQs + chapter mapping + reference data + 5 full-length mocks), and the **mobile port**. None is engineering-shaped.

---

## Verification

This sprint is documentation-only. Verification is purely link integrity:

1. ✅ [00_MasterPhaseIndex.md](00_MasterPhaseIndex.md) Phase 4 row reads `✅ all 15 sprints closed (S22–S36)`.
2. ✅ Sprint 36 row is appended to the closures table; both `82_Sprint36_Plan.md` and `83_Sprint36_Closure.md` resolve.
3. ✅ [24_Phase4_Retrospective.md](24_Phase4_Retrospective.md), [Phase4_Cutover_Addendum.md](Phase4_Cutover_Addendum.md), and the appended section in [52_ExamPrep_Strategic_Gap_Audit.md](52_ExamPrep_Strategic_Gap_Audit.md) each link back from / forward to the others.
4. ✅ All 6 cutover gates (G-12..G-17) plus G-18 cross-reference the source sprint that produced the carry-over.

---

## Next

There is no Phase 5. The next planned work is the **AWS staging cutover sprint**, currently AWS-blocked. Its scope is the original cutover plan (Drills 1–8, 11 gates G-1..G-11) plus the Phase 4 additions catalogued in [Phase4_Cutover_Addendum.md](Phase4_Cutover_Addendum.md) (6 new gates, 3 new drills, 8 new SLOs).

After the cutover, the standalone **Phase-4-Mobile** sprint runs per [Phase4_Mobile_Parity_Scope.md](Phase4_Mobile_Parity_Scope.md) — 6 Flutter screens + 7 helper ports.

Phase 4 closed.
