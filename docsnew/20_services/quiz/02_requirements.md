# Requirements Catalogue — quiz (service)

**Anchored to:** [BRD §5](./01_brd.md#5-functional-areas) · [Master BRD §5.2.3](../../00_platform/02_master_brd/master_brd.md#523-quiz)

---

## FA-01 — Session Lifecycle

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-QZ-01-01 | Start session with mode (quick/focused/mock/pyq/revision) | P0 | 1 |
| FR-QZ-01-02 | Start session from blueprint id | P0 | 1 |
| FR-QZ-01-03 | Session state machine: created → in_progress → paused → in_progress → submitted/abandoned | P0 | 1 |
| FR-QZ-01-04 | Pause session (mock disallows; quick/focused allow) | P0 | 1 |
| FR-QZ-01-05 | Resume session (returns to same item) | P0 | 1 |
| FR-QZ-01-06 | Submit session — exactly once via idempotency | P0 | 1 |
| FR-QZ-01-07 | Abandon session (mark explicitly) | P1 | 1 |
| FR-QZ-01-08 | Session resumable within 24 h | P0 | 1 |
| FR-QZ-01-09 | Mock auto-submit on time-out | P0 | 1 |
| FR-QZ-01-10 | Confirm dialog protocol (client-side affordance) | P0 | 1 |

## FA-02 — Item Delivery

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-QZ-02-01 | GET next-item: server-authoritative ordering | P0 | 1 |
| FR-QZ-02-02 | Item delivery rate-limited per user (anti-cheat) | P0 | 1 |
| FR-QZ-02-03 | No answer key in client payload | P0 | 1 |
| FR-QZ-02-04 | Pre-fetch optional (1 ahead) | P1 | 1 |
| FR-QZ-02-05 | Item rendering uses learning's GET item with `for=student` | P0 | 1 |

## FA-03 — Answer Acceptance + Resolution

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-QZ-03-01 | POST answer: idempotent | P0 | 1 |
| FR-QZ-03-02 | Calls `learning./items/{id}/resolve` with user_input + session ctx | P0 | 1 |
| FR-QZ-03-03 | Stores raw input + resolution in `quiz_responses` | P0 | 1 |
| FR-QZ-03-04 | Resolution never returns marks (contract assertion) | P0 | 1 |
| FR-QZ-03-05 | On learning timeout, retries with backoff (3 attempts) | P0 | 1 |
| FR-QZ-03-06 | On learning down, returns 503 + queues for replay (Phase 2) | P1 | 2 |
| FR-QZ-03-07 | Allows answer revision before submit (overwrites raw input + resolution) | P0 | 1 |

## FA-04 — Scoring

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-QZ-04-01 | Apply blueprint scoring profile to resolution → marks | P0 | 1 |
| FR-QZ-04-02 | Scoring profile: per-section, per-difficulty multipliers; negative marks if profile permits | P0 | 1 |
| FR-QZ-04-03 | Marks computed server-side only | P0 | 1 |
| FR-QZ-04-04 | Marks audit-stable: same resolution + profile → same marks | P0 | 1 |
| FR-QZ-04-05 | Section-wise totals | P0 | 1 |
| FR-QZ-04-06 | Topic-wise breakdown | P0 | 1 |
| FR-QZ-04-07 | Re-score on profile change is NOT done (historic immutable) | P0 | 1 |

## FA-05 — Mock Test Engine

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-QZ-05-01 | Timed: countdown enforced server-side | P0 | 1 |
| FR-QZ-05-02 | Sectional time limits if blueprint specifies | P1 | 1 |
| FR-QZ-05-03 | No pause allowed | P0 | 1 |
| FR-QZ-05-04 | Auto-submit on time-out (partial answers preserved) | P0 | 1 |
| FR-QZ-05-05 | Navigation: visited/answered/marked-for-review state | P0 | 1 |
| FR-QZ-05-06 | Detailed results: per-item correctness, time, explanation | P0 | 1 |
| FR-QZ-05-07 | Section + topic breakdown | P0 | 1 |
| FR-QZ-05-08 | Rank prediction surface (via learning, Phase 2) | P2 | 2 |

## FA-06 — PYQ Drill

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-QZ-06-01 | Filter by exam + year(s) + section | P0 | 1 |
| FR-QZ-06-02 | Optionally timed | P1 | 1 |
| FR-QZ-06-03 | Mark PYQ status on items in results | P0 | 1 |

## FA-07 — Revision Queue Integration

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-QZ-07-01 | Consume `learning.sm2/due` for due items | P1 | 2 |
| FR-QZ-07-02 | Post-quiz: notify learning's SM-2 for grade | P1 | 2 |

## FA-08 — History + Detailed Results

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-QZ-08-01 | List my past sessions (paginated) | P0 | 1 |
| FR-QZ-08-02 | Filter by mode / date / score | P1 | 1 |
| FR-QZ-08-03 | Continue-where-left-off list (in_progress sessions) | P0 | 1 |
| FR-QZ-08-04 | Detailed results view | P0 | 1 |
| FR-QZ-08-05 | Share/export results PDF | P3 | 3 |

## FA-09 — Time Tracking

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-QZ-09-01 | Per-item time (server-authoritative deltas) | P0 | 1 |
| FR-QZ-09-02 | Per-section time | P0 | 1 |
| FR-QZ-09-03 | Total time | P0 | 1 |
| FR-QZ-09-04 | Tab-switch detection (Phase 2; OQ-QZ-04) | P2 | 2 |
| FR-QZ-09-05 | Emit time analytics events to learning | P1 | 2 |

## FA-10 — Anti-Cheat (Basic)

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-QZ-10-01 | No answer key in client | P0 | 1 |
| FR-QZ-10-02 | No client-side scoring | P0 | 1 |
| FR-QZ-10-03 | Per-item time floor (suspicious < 200 ms flagged) | P1 | 2 |
| FR-QZ-10-04 | Concurrent session per user limit | P0 | 1 |
| FR-QZ-10-05 | Audit log of anomalies | P1 | 2 |

## FA-11 — Battle Scoring Delegate (Phase 2)

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-QZ-11-01 | Internal endpoint `/internal/battle/score` | P1 | 2 |
| FR-QZ-11-02 | Battle-specific scoring profile honoured | P1 | 2 |

## FA-12 — Idempotency + Reliability

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-QZ-12-01 | Idempotency-Key required on POST answer + submit | P0 | 1 |
| FR-QZ-12-02 | Idempotency keys scoped per user; 24 h TTL | P0 | 1 |
| FR-QZ-12-03 | Submit is exactly-once | P0 | 1 |
| FR-QZ-12-04 | Session snapshot to Postgres on every state change | P0 | 1 |
| FR-QZ-12-05 | Redis caches hot session state | P0 | 1 |

## Cross-Cutting

Standard: `/health`, `/ready`, OTel, JSON logs, `/v1/` prefix, OpenAPI 3.1, migrations up/down. ~10 FRs.
