# Business Requirements Document — quiz (service)

| | |
|---|---|
| **Service** | `services/quiz` |
| **Tech** | Go 1.22 · stdlib `net/http` · `log/slog` · `database/sql` (pgx) · golang-migrate |
| **Schema** | `quiz_schema` (Aurora Postgres 15) + Redis 7 hot state |
| **Doc Version** | 0.1 (DRAFT) |
| **Date** | 2026-05-27 |
| **Anchored to** | [Master BRD §5.2.3](../../00_platform/02_master_brd/master_brd.md#523-quiz) |

---

## 1. Purpose

The `quiz` service is the **low-latency orchestration layer** for every quiz/test session. It:

- Builds sessions from blueprints (Quick / Focused / Mock / PYQ / Revision / Battle delegate)
- Maintains server-authoritative session state (resumable on disconnect)
- Calls `learning` to resolve each response (resolution contract)
- **Computes marks** from the resolution + blueprint scoring profile (this is where marks live — never in learning)
- Tracks time per item + section + total (per ADR-0013)
- Produces detailed results + history
- Enforces basic anti-cheat (server-authoritative item delivery; no client-side answer key)

If quiz lags or loses state, every learner sees it instantly. Latency and durability are the dominant concerns.

## 2. Scope

### 2.1 In Scope

| Domain | Capability |
|---|---|
| **Session lifecycle** | start/pause/resume/submit |
| **Mode handlers** | Quick, Focused, Mock, PYQ, Revision; Battle delegates scoring here |
| **Blueprint assembly** | Calls `learning.blueprints/{id}/instance` → item sequence |
| **Item delivery** | Fetch next item; respect server-authoritative ordering |
| **Answer acceptance** | Idempotent submit; appends to response log |
| **Resolution** | Calls `learning.items/{id}/resolve`; receives 6-field Resolution |
| **Scoring** | Applies blueprint scoring profile to resolution → marks |
| **Time tracking** | Per item, per section, total; server wall-clock sync |
| **History** | Past sessions, completion state, resumable list |
| **Detailed results** | Per-item correctness, time, explanation reveal |
| **Mock detailed results** | Section + topic breakdown |
| **Anti-cheat (basic)** | Server-authoritative item delivery; no answer key on client; per-item timer cross-check |
| **Idempotency** | Idempotency-Key on all mutating endpoints |
| **Disconnect tolerance** | State preserved 24 h |
| **Flag / report a question** | User reports problem; routed to learning |

### 2.2 Out of Scope

| Item | Lives In |
|---|---|
| Question content + answer key + explanation | learning |
| Real-time multiplayer fanout | battle (battle may delegate scoring back to quiz) |
| Recommendation / mastery update | learning |
| Notifications | engagement |

### 2.3 Scope by Phase

| Phase | quiz ships |
|---|---|
| **Phase 1 (M0–M6)** | Quick · Focused · Mock · PYQ session lifecycle · Resolution + scoring · Time tracking · History · Detailed results · Idempotency · Disconnect tolerance · Anti-cheat basics |
| **Phase 2 (M6–M12)** | Revision mode (SM-2 due queue) · Battle scoring delegate endpoint · Advanced anti-cheat (typing rhythm, tab-switch heuristics — flagged as OQ-QZ-04) |
| **Phase 3+** | Adaptive Phase 3 features per ADR-0026 |

---

## 3. Stakeholders

| Stakeholder | Role | Decision Authority |
|---|---|---|
| **Backend Lead (Go)** | Tech owner | Architecture |
| **ML Lead** | Adaptive integration | Resolution caller contract |
| **Content Lead** | Blueprint scoring profile | Marks formula |
| **Product Owner** | Functional scope | AC approval |
| **Consuming squads** | web-student, mobile, battle | API review |

## 4. Top Internal Journeys

| # | Journey | Trigger |
|---|---------|---------|
| 1 | Start Quick Practice | App home/practice |
| 2 | Start Mock Test (timed) | App practice/mock |
| 3 | Submit answer (per item) | App during quiz |
| 4 | Resume after disconnect | App returns to quiz |
| 5 | Submit session | App on finish or timeout |
| 6 | Get detailed results | App after submit |
| 7 | Battle scoring delegate | battle service per response |
| 8 | Get history | App profile/history |

## 5. Functional Areas

| Area | Description |
|------|-------------|
| FA-01 Session Lifecycle | start/pause/resume/submit |
| FA-02 Item Delivery | next-item endpoint; server-authoritative |
| FA-03 Answer Acceptance + Resolution | accept + call learning + store |
| FA-04 Scoring | apply blueprint scoring profile to resolution |
| FA-05 Mock Test Engine | timed, sectional, blueprint-driven |
| FA-06 PYQ Drill | filter by year/section |
| FA-07 Revision Queue Integration | consume `learning.sm2/due` |
| FA-08 History + Detailed Results | past sessions, breakdown |
| FA-09 Time Tracking | per-item, per-section, total |
| FA-10 Anti-Cheat (basic) | server-authoritative; no client answer key |
| FA-11 Battle Scoring Delegate | internal endpoint for battle |
| FA-12 Idempotency + Reliability | exactly-once submit; resumable; durable |
| FA-XC | health/ready, OTel, logs, migrations |

---

## 7. Non-Functional Requirements

| ID | Category | Requirement | Target |
|----|----------|-------------|--------|
| NFR-QZ-01 | Perf | Answer-ack | p95 < 100 ms · p99 < 300 ms |
| NFR-QZ-02 | Perf | Session start | p95 < 300 ms |
| NFR-QZ-03 | Perf | Resume session | p95 < 200 ms |
| NFR-QZ-04 | Perf | Submit session | p95 < 500 ms |
| NFR-QZ-05 | Avail | Service uptime | 99.95% (critical hot-path) |
| NFR-QZ-06 | Reliab | Disconnect tolerance | 24 h state preservation |
| NFR-QZ-07 | Reliab | Exactly-once submit | via idempotency keys |
| NFR-QZ-08 | Reliab | Wall-clock sync | server clock authoritative; client drift ≤ 1 s |
| NFR-QZ-09 | Scale | Concurrent sessions Phase 1 | 10,000 |
| NFR-QZ-10 | Scale | Mock-test load (long-running, 180 items × hours) | 1,000 concurrent mocks |
| NFR-QZ-11 | Security | Anti-cheat — no client-side answer key | enforced |
| NFR-QZ-12 | Security | Idempotency-Key TTL | 24 h |
| NFR-QZ-13 | Security | Item delivery rate-limited per user | yes |
| NFR-QZ-14 | Observability | OTel + RED metrics | per endpoint |
| NFR-QZ-15 | Observability | Anomaly alerts (suspicious answer speed, etc.) | Phase 2 |
| NFR-QZ-16 | Migration | golang-migrate up/down | required |
| NFR-QZ-17 | API | OpenAPI 3.1 | published |
| NFR-QZ-18 | Resilience | learning down → degrade gracefully (deterministic types still resolve locally if cached) | Phase 2 |

---

## 8. Constraints & Assumptions

- **C-QZ-01** **Resolution contract from learning is the strict boundary**: quiz NEVER stores answer keys or evaluates items directly. Always calls learning.
- **C-QZ-02** **Marks computed here** from resolution + blueprint scoring profile. The split is intentional.
- **C-QZ-03** Server-authoritative session state. Redis is hot, Postgres is durable.
- **C-QZ-04** Idempotency-Key required on `POST /answer` and `POST /submit`.
- **C-QZ-05** Wall-clock sync — server issues timestamps; client uses them.
- **C-QZ-06** Anti-cheat baseline: no answer key on client, no client-side scoring.
- **C-QZ-07** Go stdlib HTTP server; no heavy frameworks.
- **C-QZ-08** Database access via pgx; prepared statements.
- **C-QZ-09** Migrations append-only + reversible.

### Assumptions
- **A-QZ-01** learning publishes stable resolution contract.
- **A-QZ-02** Redis 7 cluster available for hot state.
- **A-QZ-03** Aurora multi-AZ for durable state.

## 9. Dependencies

| ID | Depends on | For |
|----|-----------|-----|
| D-QZ-01 | identity (JWT validate) | Auth |
| D-QZ-02 | learning (blueprints, items, resolve, sm2) | Core |
| D-QZ-03 | engagement (events for XP/streak) | Post-quiz events |
| D-QZ-04 | Aurora Postgres + Redis | Storage |

## 10. Risks

| ID | Risk | L | I | Mitigation |
|----|------|---|---|------------|
| R-QZ-01 | Session state desync (user leaves mid-quiz) | High | High | Server-authoritative + 24 h state preservation + idempotent answer log |
| R-QZ-02 | learning down → all quizzes fail | Med | Critical | Caching of resolution for deterministic types Phase 2; circuit breaker; degraded mode |
| R-QZ-03 | Client clock drift inflates time-tracking | High | Med | Server timestamps authoritative |
| R-QZ-04 | Answer-key exfiltration | Low | Critical | Never on client |
| R-QZ-05 | Replay attack on idempotency keys | Low | Med | 24 h TTL + per-user scoping |
| R-QZ-06 | Mock test load spikes | High | High | Horizontal scale + Redis cluster for hot state |

## 11. Success Criteria

quiz Phase 1 is **Done** when:

1. All P0 stories shipped
2. NFR-QZ-* verified
3. 5 question types (with learning Type Handlers) integration-tested end-to-end
4. Disconnect → 30 min → resume same state — chaos test green
5. p95 answer-ack < 100 ms in staging load test (10K concurrent)
6. 1000-concurrent mock-test load test green
7. Resolution-contract boundary test (no marks from learning) green in CI

## 12. Open Questions

| # | Question | Owner | Resolve By |
|---|----------|-------|------------|
| OQ-QZ-01 | Session state storage: Redis hot + Postgres durable, or Postgres-only? | Backend Lead | Phase 1 Week 2 |
| OQ-QZ-02 | Disconnect grace: 30 s vs 5 min vs mode-dependent | Product | Phase 1 Week 4 |
| OQ-QZ-03 | Replay attack window on idempotency keys | Security | Phase 1 Week 3 |
| OQ-QZ-04 | Anti-cheat Phase 2 — typing rhythm, tab-switch detection | Product + ML | Phase 2 Week 1 |
| OQ-QZ-05 | Battle scoring delegate vs battle owns scoring | Architecture | Phase 2 Week 1 |
| OQ-QZ-06 | Caching of resolutions for deterministic types (when learning offline) | Backend + ML | Phase 1 Week 6 |
| OQ-QZ-07 | Wall-clock drift handling (mobile networks variable) | Mobile + Backend | Phase 1 Week 4 |

## 13. Sign-Off

| Role | Name | Date | Status |
|------|------|------|--------|
| Backend Lead (Go) | _Pending_ | | |
| ML Lead | _Pending_ | | |
| Content Lead | _Pending_ | | |
| QA Lead | _Pending_ | | |
