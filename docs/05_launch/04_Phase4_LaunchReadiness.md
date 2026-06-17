# Phase 4 Launch Readiness Addendum

**Applies to**: Go-Live Checklist v1.0, Post-Launch Monitoring Plan v1.0
**Date**: 2026-04-28
**Status**: DRAFT — gated on Phase 4 strategic decisions and on AWS staging access (Phase 1 carry-over)
**Parent docs**: extends [`01_GoLiveChecklist_AdaptiveLearningPlatform.docx`](01_GoLiveChecklist_AdaptiveLearningPlatform.docx) and [`02_PostLaunchMonitoringPlan_AdaptiveLearningPlatform.docx`](02_PostLaunchMonitoringPlan_AdaptiveLearningPlatform.docx).

This addendum captures the launch-readiness considerations specific to Phase 4 (exam-prep depth). Phase 4 ships before the deferred AWS staging cutover; this doc names the items that must roll into the cutover plan.

---

## 1. New launch-readiness items

### LR-P4-01 — PYQ corpus is loaded
The platform shall not be marketed as having "PYQ catalogue" until ≥10 years of JEE Main + Advanced PYQ are loaded, tagged, and verified by the content lead.
**Owner**: Content lead.
**Verification**: `count(*) where pyq_flag = TRUE` ≥ 10,000 across the focus exam.
**Sprint dependency**: parallel content workstream W1 throughout Phase 4.

### LR-P4-02 — Exam blueprints validated by domain expert
Each blueprint (JEE Main, JEE Advanced Paper 1, JEE Advanced Paper 2) must be reviewed against the official exam pattern by a domain expert before being made student-facing.
**Owner**: Content lead.
**Verification**: blueprint review checklist signed off; sample mock paper composition reviewed end-to-end.

### LR-P4-03 — Exam-mode session reliability tested at scale
Exam-mode disconnect/reconnect tested with at least 500 concurrent mock attempts (synthetic + UAT cohort).
**Owner**: QA + DevOps.
**Verification**: load test report; no lost sessions; ≤1 lost answer per disconnect.

### LR-P4-04 — Cohort-percentile aggregation runs nightly
Nightly aggregation job is healthy; staging telemetry shows < 5-min runtime; alarms fire on > 10-min runtime.
**Owner**: DevOps.
**Verification**: 7 consecutive nights of green; runbook entry exists.

### LR-P4-05 — Calibrated rank-prediction surface labels honestly
UI consistently labels predicted-AIR responses as `cohort` vs `fallback`; confidence intervals are surfaced; UAT cohort confirms the labelling is interpretable.
**Owner**: Product + Frontend.
**Verification**: UAT-P4-05 scenario green; design review signed off.

### LR-P4-06 — Anonymity threshold enforced
Peer-percentile endpoint hides results when cohort < 30; manual penetration test confirms no information leak.
**Owner**: Security QA.
**Verification**: TEST-AN-01 through TEST-AN-04 green in regression.

### LR-P4-07 — Time-stamp integrity verified
Server-computed `time_spent_ms` cannot be tampered by client. Penetration test confirms.
**Owner**: Security QA.
**Verification**: TEST-TS-01 through TEST-TS-03 green.

### LR-P4-08 — Reference URL safelist active
`topic_references.url` enforces an allowlist; javascript:, data:, file: URLs rejected at write time.
**Owner**: Security QA.
**Verification**: input-validation tests green; manual XSS attempt fails.

### LR-P4-09 — Revision-queue notification cadence acceptable
`revision.due` notification fires daily; per-user mute toggle works; UAT confirms cadence is helpful, not annoying.
**Owner**: Product.
**Verification**: UAT-P4-02 (7-day usage) feedback ≥ 70% positive.

### LR-P4-10 — Achievements catalogue UX validated
8 new exam-prep achievements unlock cleanly; locked-state preview matches design.
**Owner**: Product + Frontend.
**Verification**: design + UAT review.

### LR-P4-11 — Mobile parity sign-off
Mobile reaches feature parity with web on all Phase 4 surfaces (P4-S35); mobile widget tests + manual QA pass.
**Owner**: Mobile lead.
**Verification**: full mobile regression pass.

### LR-P4-12 — Phase 4 retrospective signed off
[`24_Phase4_Retrospective.md`](../02_planning/24_Phase4_Retrospective.md) (when written at S36) lists what shipped, what slipped, what carries to the cutover. Signed off by CTO + Head of Product before the cutover plan opens.
**Owner**: Engineering lead.

---

## 2. Updates to existing runbooks

The following runbooks need Phase 4 content. (Runbooks live at `runbook/` per the existing convention referenced in CLAUDE.md.)

| Runbook | Phase 4 update |
|---|---|
| `runbook/rollback.md` | Add Phase 4 services / migrations to the rollback decision tree (no new services, but new migrations need rollback steps) |
| `runbook/nats_dlq.md` | Add `revision.due` subject to the DLQ triage table |
| `runbook/smoke_test.md` | Update step count to ~70 (currently documents 50/50) |
| `runbook/mocks_at_scale.md` (NEW) | Document exam-mode session lifecycle, heartbeat semantics, lost-answer recovery, scale tested concurrent users |
| `runbook/pyq_ingest.md` (NEW) | Document the PYQ ingest CLI, bulk-load process, validation steps, common failures + recovery |
| `runbook/cohort_percentile.md` (NEW) | Document the nightly aggregation job, expected runtime, fallback behaviour when sparse, alerting thresholds |
| `runbook/revision_queue.md` (NEW) | Document SM-2 algorithm parameters, EWA tie-in, debugging "why isn't this topic in my queue", per-user mute |

---

## 3. Updates to monitoring + alerts

Extending [`02_PostLaunchMonitoringPlan_AdaptiveLearningPlatform.docx`](02_PostLaunchMonitoringPlan_AdaptiveLearningPlatform.docx):

### New SLOs

| SLO | Target | Source |
|---|---|---|
| Mock-test session create latency p95 | < 500 ms | NFR-P4-* + ADR-0012 |
| Daily revision queue endpoint p95 | < 200 ms | NFR-P4-05 |
| PYQ frequency view p95 (warm) | < 300 ms | Phase 4 plan |
| Cohort-percentile nightly job runtime | < 5 min | NFR-P4-04 |
| Exam-mode session reliability (5-min disconnect / resume) | ≥ 99% successful resume | NFR-P4-01 |
| Time-per-question coverage | > 95% of new sessions have non-NULL `time_spent_ms` | data-quality SLO |
| Predicted-AIR cohort hit rate | > 60% (vs fallback) within 30 days of launch | calibration health |

### New dashboards

- **Phase 4 — Exam Mode** dashboard: concurrent mock attempts, p95 latency per blueprint, disconnect/resume success rate.
- **Phase 4 — Revision Queue** dashboard: due-today counts, notification fire rate, click-through rate, user mute prevalence.
- **Phase 4 — PYQ** dashboard: ingest job runtime, total PYQ count by exam/year, frequency-view p95.
- **Phase 4 — Cohort Calibration** dashboard: cohort-size distribution per exam/bucket, fallback-rate per exam, aggregation runtime.
- **Phase 4 — Error Patterns** dashboard: classification distribution per exam, top-5 patterns per cohort.

### New alerts

| Alert | Threshold | Severity |
|---|---|---|
| Cohort-aggregation job runtime > 10 min | absolute | P2 |
| Predicted-AIR cohort hit rate < 30% on a launched exam | 7-day rolling | P2 |
| Time-per-question NULL rate > 5% on new sessions | 24-hour rolling | P2 |
| Mock-mode session resume failure rate > 5% | 1-hour rolling | P1 |
| Revision-queue endpoint p99 > 1s | 5-min rolling | P2 |
| `revision.due` notification fan-out drop > 10% day-over-day | daily | P2 |
| PYQ ingest job failure | per run | P3 |

---

## 4. Content workstream coordination (W1)

The Phase 4 plan calls out content as a first-class workstream. Launch readiness depends on it landing on time.

| Milestone | Owner | Deadline relative to engineering |
|---|---|---|
| PYQ ingest pipeline ready (engineering) | Engineering | End of P4-S24 |
| PYQ JSON normaliser ready (content) | Content lead | Start of P4-S24 |
| 1 year of JEE Main PYQ ingested + verified | Content + content lead | End of P4-S24 |
| 5 years of JEE Main PYQ ingested | Content | End of P4-S27 |
| 10 years of JEE Main + Advanced PYQ ingested + verified | Content | End of P4-S30 |
| Topic ↔ syllabus chapter mapping | Content | End of P4-S28 |
| Topic ↔ NCERT / textbook / video references | Content | End of P4-S34 |
| 5 full-length JEE Main mocks + 5 JEE Advanced mocks | Content | End of P4-S25 |

If any milestone slips, the corresponding launch-readiness item (LR-P4-01 etc.) cannot close until the content lands.

---

## 5. Scope reduction protocol

If schedule pressure forces scope reduction, the following are the sanctioned cuts (in order of preference, least-bad first):

1. **Defer LLM v2 in error classification** — heuristic v1 alone is shippable.
2. **Reduce PYQ corpus to 5 years** — rather than 10 years.
3. **Defer reference-material integration (P4-S34)** to Phase 5.
4. **Defer peer-percentile (P4-S32)** to Phase 5 (calibrated rank still ships).
5. **Defer mobile parity sprint (P4-S35)** — split into S35a + S35b.

The following are **not** sanctioned cuts (they break the value proposition of Phase 4):

- Time-per-question (P4-S22) — foundational signal; everything downstream depends on it.
- Real exam blueprints (P4-S23) — without it, the "exam-prep" claim doesn't earn back.
- PYQ ingest pipeline (P4-S24) — even with limited content, the schema must land.
- Spaced repetition (P4-S27) — the highest-value behavioural surface.

---

## 6. Carry-overs to AWS staging cutover

The deferred AWS staging cutover sprint (per [`24_DEPRECATED_Staging_Cutover_Plan`](../02_planning/24_DEPRECATED_Staging_Cutover_Plan.md)) needs Phase 4 additions:

- PYQ corpus storage size + backup strategy (incremental from base seed; PYQ rows are immutable post-ingest)
- Mock-mode session state durability (Postgres replication)
- Cohort-percentile job scheduling (cron / k8s CronJob in staging)
- Revision-queue notification fan-out at scale
- PYQ ingest CLI ops access path (admin-only, audited)
- Time-per-question column backfill strategy (skip; new-only)
- Drills 7 + 8 from Phase 3 carry-over still apply; Phase 4 adds **Drill 9 — exam-mode disconnect chaos** (run 100 concurrent mocks, randomly disconnect 20%, verify resume success)

---

## 7. Sign-off matrix for Phase 4 launch

| Approver | Sign-off on |
|---|---|
| CTO | Architecture (LLD addendum), security (NFR-P4-02, NFR-P4-06), runbook updates |
| Head of Product | Strategic gates 1+2+3 closed; UAT cohort acceptance; calibrated-rank labelling honest |
| Content Lead | PYQ corpus complete; blueprints validated; references curated |
| Engineering Lead | All sprint exit criteria met; smoke 70/70; tests green; mobile parity confirmed |
| QA Lead | Test pyramid green; performance budgets met; security tests pass |
| DevOps Lead | Runbooks updated; new dashboards live; alerts configured; cohort-job operational |

Phase 4 launch (whatever launch means in our deployment story — likely "promote to staging" once AWS unblocks) requires all six approvers green.
