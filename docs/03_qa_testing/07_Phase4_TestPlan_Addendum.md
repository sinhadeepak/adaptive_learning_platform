# Phase 4 Test Plan Addendum — Exam-Prep Depth

**Applies to**: Master Test Plan v1.0
**Date**: 2026-04-28
**Status**: DRAFT — gated on Phase 4 strategic decisions
**Parent doc**: extends [`01_MasterTestPlan_AdaptiveLearningPlatform.docx`](01_MasterTestPlan_AdaptiveLearningPlatform.docx).

This addendum captures the test approach for the 15 Phase 4 sprints (S22 → S36). Builds on existing pyramid (unit + integration + smoke) plus three new test categories specific to exam-prep features.

---

## 1. Test pyramid additions for Phase 4

| Layer | What's added | Owner |
|---|---|---|
| **Unit** | Pure-function helpers per ADR (SM-2 scheduler, error classifier, cohort percentile aggregator, blueprint composer, time-stats aggregator, prereq-graph traverser) | Backend dev |
| **Integration** | DB-backed flow tests for revision queue, syllabus coverage, cohort percentile distribution; HTTP route tests for new endpoints | Backend dev |
| **Smoke** | End-to-end assertions extending [`scripts/smoke_test.sh`](../../scripts/smoke_test.sh) — currently 50 steps, target ~70 by Phase 4 close | Engineering |
| **Exam-mode reliability** (new) | Disconnect / reconnect during a mock; verify state recovery | QA |
| **Anonymity threshold** (new) | Peer-percentile hidden when cohort < 30; rank-prediction labelled when cohort < 50 | QA |
| **Time-stamp integrity** (new) | Server rejects client-submitted `time_spent_ms` overrides | Security QA |

---

## 2. Per-sprint test coverage matrix

| Sprint | Feature | Unit tests | Integration tests | Smoke steps | Special tests |
|---|---|---|---|---|---|
| **S22** | Time-per-Q + per-section analytics | 6 (compute helper, section aggregator) | 4 (submit → engagement consumer → time-stats endpoint) | +2 | Time-stamp integrity (NFR-P4-02) |
| **S23** | Real exam blueprints + exam-mode UI shell | 12 (blueprint validator, paper composer, section-lock state machine) | 6 (mock create → take → submit per blueprint) | +3 | Exam-mode reliability (NFR-P4-01) |
| **S24** | PYQ ingest + frequency view | 8 (ingest schema validator) + 4 (frequency aggregator) | 4 (ingest CLI → Content authoring → Quiz bridge) | +2 | PYQ throughput (NFR-P4-03) |
| **S25** | OMR-style answer sheet + mock series | 6 (mock-series view logic) | 2 (take 2 mocks, see series view) | +2 | UX a11y on OMR sheet |
| **S26** | Prerequisite graph activation | 10 (traversal, gating logic) | 2 (recommend-next-topic prefers prereq-mastered) | +1 | — |
| **S27** | Spaced-repetition revision queue | 12 (SM-2 scheduler, EWA tie-in) | 4 (queue update on session, daily endpoint) | +2 | Revision-queue latency (NFR-P4-05) |
| **S28** | Syllabus coverage audit | 8 (coverage aggregator) | 2 (chapters → coverage view) | +1 | — |
| **S29** | Error-pattern classification | 14 (heuristic per axis, sign-or-unit edges) | 4 (classify on consume, surface endpoint) | +2 | — |
| **S30** | Closed-loop study plan | 12 (recalibration, exam-date pacing) | 2 (target_rank update → plan shift) | +1 | — |
| **S31** | Calibrated rank prediction | 10 (cohort aggregator) + 4 (confidence interval) | 2 (cohort < threshold → fallback labelled) | +1 | Cohort-aggregation latency (NFR-P4-04); honest fallback labelling (NFR-P4-06) |
| **S32** | Peer percentile per topic | 8 (percentile aggregator) | 2 (anonymity threshold) | +1 | Anonymity threshold (NFR-P4-06) |
| **S33** | Goal/target rank + gap analysis | 6 (gap analysis) | 2 (set target → trajectory) | +1 | — |
| **S34** | Reference material integration | 6 (reference list / surface) | 1 (CRUD on references via admin) | +1 | URL safety (no XSS via reference URL) |
| **S35** | Achievements rebalance + mobile parity | 8 (new achievement triggers) | 4 (mobile widget tests for Phase 4 surfaces) | +1 | Mobile a11y per WCAG-AA |
| **S36** | Phase 4 retrospective + cutover prep | — | — | (smoke target hit) | Full regression pass |

**Totals**: ~130 new unit tests + ~41 new integration tests across Phase 4. Smoke target: **~70 steps** by close (currently 50 at Phase 3 close).

---

## 3. New test categories (detail)

### 3.1 Exam-mode reliability tests

The mock-test player must survive a 5-minute network drop and resume. Test cases:

- **TEST-EM-01**: Start a 75-Q JEE Main mock; on Q-30, drop network for 30 seconds; reconnect; verify timer + answers preserved + section context intact.
- **TEST-EM-02**: Start mock; on Q-30, hard-close the browser; reopen within 5 minutes; verify resume from server state.
- **TEST-EM-03**: Start mock; on Q-30, drop network for 6 minutes; reconnect; verify graceful expiry (timer continued, time-out enforced).
- **TEST-EM-04**: Start mock; on Q-30, click "Submit"; receive network error; retry submit; verify idempotent (no duplicate session).
- **TEST-EM-05**: Section-locked blueprint: Physics time expires; verify cannot navigate back to Physics from Chem.

### 3.2 Time-stamp integrity tests (security)

Server-computed `time_spent_ms` must reject client tampering:

- **TEST-TS-01**: Submit a quiz session with a client-set `time_spent_ms = 0` payload; verify server overrides with computed value.
- **TEST-TS-02**: Submit with `answered_at` earlier than `served_at`; verify server clamps to 0 or rejects.
- **TEST-TS-03**: Submit twice with the same session_id; verify idempotent (first-write-wins per AP-08).

### 3.3 Anonymity-threshold tests

Peer percentile and rank prediction must honestly disclose low-confidence regimes:

- **TEST-AN-01**: Topic with cohort = 5 students; peer-percentile endpoint returns 404 or `{ "hidden": true, "reason": "cohort_too_small" }`.
- **TEST-AN-02**: Topic with cohort = 50; peer-percentile returns the value with cohort_size displayed.
- **TEST-AN-03**: Rank prediction with cohort < 50 in bucket; response carries `"source": "fallback"` and the UI labels the prediction "based on calibration estimate".
- **TEST-AN-04**: Rank prediction with cohort = 2,400; response carries `"source": "cohort"` and `"cohort_size": 2400`.

### 3.4 PYQ ingest pipeline tests

The ingest CLI must reject malformed PYQ JSON cleanly:

- **TEST-PI-01**: Ingest a 75-Q paper; verify all rows land in Content with `pyq_flag = TRUE` + correct `paper_session`.
- **TEST-PI-02**: Ingest a paper with one duplicate `(stem, choices)`; verify dedup or clean rejection.
- **TEST-PI-03**: Ingest a paper with malformed topic_id; verify the bad row is logged + the rest succeed.
- **TEST-PI-04**: Ingest a paper twice; verify idempotent (no duplicate rows).
- **TEST-PI-05**: Ingest 75-Q paper; verify wall-clock time < 10 minutes (NFR-P4-03).

---

## 4. Performance test additions

Extending [`03_LoadPerformanceTestPlan_AdaptiveLearningPlatform.docx`](03_LoadPerformanceTestPlan_AdaptiveLearningPlatform.docx):

| Test | Target | Sprint |
|---|---|---|
| Daily revision queue endpoint at 100K MAU | p95 < 200 ms | P4-S27 |
| PYQ frequency-by-chapter view at 16K-question corpus | p95 < 300 ms (warm cache) | P4-S24 |
| Cohort percentile aggregation at 100K user, 50 buckets, 100 topics | < 5 min total | P4-S31 |
| Mock-test session create with full blueprint | p95 < 500 ms | P4-S23 |
| Concurrent mock attempts (1,000 users) | session creation succeeds; submission idempotent | P4-S25 |

---

## 5. Security test additions

Extending [`04_SecurityTestPlan_AdaptiveLearningPlatform.docx`](04_SecurityTestPlan_AdaptiveLearningPlatform.docx):

- **Time-stamp integrity** (NFR-P4-02): server-side computation, client-input rejection.
- **Anonymity threshold** (NFR-P4-06): peer percentile hidden when cohort too small.
- **Reference URL safety** (P4-S34): URL allowlist on `topic_references.url` to prevent javascript:, data:, file: URLs.
- **Mock-mode session isolation** (P4-S23): a mock-mode session FSM cannot transition to free-practice mode; prevents rate-limit bypass.
- **Admin-only blueprint editing** (P4-S25): blueprint POST/PATCH/DELETE require `PLATFORM_ADMIN` role.
- **PYQ ingest CLI**: requires admin token; rejects ingest from non-admin contexts.

---

## 6. Accessibility test additions

Extending [`05_AccessibilityAuditPlan_AdaptiveLearningPlatform.docx`](05_AccessibilityAuditPlan_AdaptiveLearningPlatform.docx):

- **OMR-style answer sheet** (P4-S25): keyboard-navigable; screen-reader announces "answered / unanswered / marked for review" state.
- **Section-locked timer** (P4-S23): time-remaining announced periodically; expired-section transition announced.
- **Revision queue daily view** (P4-S27): list of due topics is screen-reader-friendly with role + state.
- **Reference panel** (P4-S34): external-URL links carry `rel="noopener noreferrer"` and aria-labels.

---

## 7. UAT additions

Extending [`06_UATplan_AdaptiveLearningPlatform.docx`](06_UATplan_AdaptiveLearningPlatform.docx):

UAT cohort for Phase 4: 30 students preparing for JEE Main 2027 (or the chosen focus exam). UAT scenarios:

- **UAT-P4-01**: Take a full-length 75-Q JEE Main mock; verify exam-mode UX meets expectations of an experienced JEE aspirant.
- **UAT-P4-02**: Use the daily revision queue for 7 consecutive days; verify the queue feels useful (vs. annoying).
- **UAT-P4-03**: Navigate PYQ catalogue; identify the 3 most-frequent Mechanics chapters; verify the frequency view matches student intuition.
- **UAT-P4-04**: Set a target AIR; verify the trajectory + gap-closer view is interpretable.
- **UAT-P4-05**: After 30 days of usage, review predicted AIR vs UAT user's own confidence interval; gather qualitative feedback.

---

## 8. Test environment changes

- **PYQ ingest** requires admin tooling — same dev stack as today.
- **Mock-mode session reliability** requires test infra to simulate network drops — Cypress + chrome-devtools-protocol for web; integration test harness for mobile.
- **Cohort-percentile aggregation** at scale requires seeded fixtures with N=10K synthetic users — fixture builder ships in P4-S31.

---

## 9. Exit criteria for Phase 4 test scoreboard

At Phase 4 close (S36):

| Layer | Target |
|---|---|
| alp-quiz Go tests | 22 (existing) + 8 (Phase 4) = 30+ |
| alp-learning unit | 142 (existing) + 50 (Phase 4) = 190+ |
| alp-engagement unit | 98 (existing) + 80 (Phase 4) = 175+ |
| alp-engagement integration | 22 (existing) + 25 (Phase 4) = 45+ |
| alp-marketplace unit + integration | unchanged |
| Mobile widget tests | +20 for Phase 4 mobile parity |
| Smoke | ~70 steps |
| UAT | 5/5 scenarios passed by ≥ 80% of UAT cohort |
| Performance budgets | all NFR-P4-* targets met |
| Security | time-stamp integrity + anonymity threshold + reference URL safety green |

---

## 10. Risks (test-level)

| Risk | Mitigation |
|---|---|
| 16K-question PYQ corpus stresses test fixtures | Use a subset (1 paper) for unit tests; bulk corpus only loaded for integration + perf tests |
| Cohort-percentile aggregation needs seeded multi-thousand-user fixtures | Build a fixture generator (one-time effort in P4-S31) |
| Mock-mode reliability requires browser-level network simulation | Use Cypress's `cy.intercept` + offline mode; mobile uses platform-native airplane-mode toggle |
| UAT cohort sourcing | Coordinate with content workstream — same channels can supply UAT participants |
