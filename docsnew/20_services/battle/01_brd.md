# Business Requirements Document — battle (service)

| | |
|---|---|
| **Service** | `services/battle` |
| **Tech** | Go 1.22 · `nhooyr/websocket` · `log/slog` · `database/sql` (pgx) · Redis 7 (hot state) · golang-migrate |
| **Schema** | `battle_schema` (Aurora Postgres) + Redis (hot state for active matches) |
| **Doc Version** | 0.1 (DRAFT) |
| **Date** | 2026-05-27 |
| **Anchored to** | [Master BRD §5.2.4](../../00_platform/02_master_brd/master_brd.md#524-battle) · ADR-0027 |

---

## 1. Purpose

The `battle` service runs **real-time 1v1 multiplayer quiz battles** (per ADR-0027). The bulk of UX value sits in low-latency answer fan-out, fair race scoring, and resilient disconnect handling.

Battle delegates per-response scoring to `quiz` via `/internal/battle/score` so all marks logic stays consistent across modes.

## 2. Scope

### 2.1 In Scope

| Domain | Capability |
|---|---|
| **Matchmaking** | By topic + difficulty band; widening tolerance over wait |
| **WebSocket session** | Long-lived bidi connection per player |
| **Question fan-out** | Both players get same item simultaneously |
| **Answer ack** | Server-authoritative; < 150 ms p99 |
| **Race scoring** | First correct gets bonus; ties by time |
| **Disconnect handling** | 30 s grace, forfeit thereafter |
| **Anti-cheat** | Server holds answer key; rate limits; tab-switch detection (Phase 2) |
| **Rating system** | Glicko-2 (OQ-BT-01 — vs ELO) |
| **Ladder rankings** | Daily / weekly per exam (Phase 2) |
| **Replay storage** | Battle log for review |
| **XP / badge events** | Emit to engagement post-battle |

### 2.2 Out of Scope

| Item | Lives In |
|---|---|
| Tournament brackets | Phase 3+ (deferred) |
| Team battles (2v2, 5v5) | Deferred |
| Voice / chat during battle | Out of Phase 1–2 scope |
| Spectator mode | Phase 3+ |

### 2.3 Scope by Phase

| Phase | battle ships |
|---|---|
| **Phase 1 (M0–M6)** | Minimal scaffolding only (service skeleton + schema + health/ready); production launch deferred to Phase 2 |
| **Phase 2 (M6–M12)** | Matchmaking · WS session · Fan-out · Race scoring · Disconnect grace · Anti-cheat basics · Rating + ladder · Replay |
| **Phase 3+** | Tournament brackets · Team battles · Spectator |

---

## 3. Stakeholders

| Stakeholder | Role | Decision Authority |
|---|---|---|
| **Backend Lead (Go)** | Tech owner | Architecture |
| **Product Owner** | Functional scope | AC approval |
| **ML Lead** | Item difficulty fairness | Item selection |
| **Quiz squad** | Scoring delegate | API contract |
| **DevOps** | WS infrastructure | Scaling |

## 4. Top Internal Journeys

| # | Journey | Trigger |
|---|---------|---------|
| 1 | Matchmaking | App user clicks Play |
| 2 | WS session open | Match found |
| 3 | Question fanout | Server tick |
| 4 | Answer accepted | Player submit |
| 5 | Disconnect / reconnect within grace | Network blip |
| 6 | Battle end | All questions done or timeout |
| 7 | Rating + XP update | Battle end |

## 5. Functional Areas

| Area | Description |
|------|-------------|
| FA-01 Matchmaking | Pool + matching algorithm |
| FA-02 WebSocket Session | Connection management |
| FA-03 Question Fanout | Simultaneous delivery |
| FA-04 Answer Acceptance + Race Scoring | Server-authoritative |
| FA-05 Disconnect + Reconnect | Grace + forfeit |
| FA-06 Anti-Cheat | Server holds answers; rate limits; tab-switch |
| FA-07 Rating + Ladder | Glicko-2 (or ELO); daily/weekly snapshots |
| FA-08 Replay + History | Stored battle log |
| FA-09 Leaderboards | Per-exam, per-period |
| FA-10 XP/Badge Events to engagement | Outbound NATS |
| FA-11 Spectator (Phase 3 — defer) | — |
| FA-XC | health/ready, OTel, OpenAPI, migrations |

---

## 7. Non-Functional Requirements

| ID | Category | Requirement | Target |
|----|----------|-------------|--------|
| NFR-BT-01 | Perf | Answer-ack | p99 < 150 ms · p95 < 100 ms |
| NFR-BT-02 | Perf | Matchmaking time | p95 < 30 s (low traffic); < 10 s (high) |
| NFR-BT-03 | Perf | Question fanout latency | < 50 ms between players |
| NFR-BT-04 | Avail | Service uptime | 99.9% |
| NFR-BT-05 | Scale | Concurrent battles Phase 2 | 1,000 |
| NFR-BT-06 | Scale | Concurrent WS connections | 5,000 |
| NFR-BT-07 | Reliab | Graceful shutdown — drain active battles | required |
| NFR-BT-08 | Reliab | Scoring exactly-once | required |
| NFR-BT-09 | Reliab | WS reconnect — same session within grace | required |
| NFR-BT-10 | Security | Server holds answer key | required |
| NFR-BT-11 | Security | Rate limit answers per session per player | required |
| NFR-BT-12 | Observability | Per-match latency dashboard | required |
| NFR-BT-13 | Observability | Anti-cheat anomaly alerts | required |
| NFR-BT-14 | Migration | golang-migrate up/down | required |
| NFR-BT-15 | API | OpenAPI + WS protocol spec | required |
| NFR-BT-16 | Cost | Daily.co not used here (battle is text-based) | — |

---

## 8. Constraints & Assumptions

- **C-BT-01** Per ADR-0027, this is its own service (real-time Go for hot path).
- **C-BT-02** Scoring delegated to quiz `/internal/battle/score` — keeps marks logic central.
- **C-BT-03** Items pulled from learning by topic + difficulty (OQ-BT-02 — local pool vs recommender).
- **C-BT-04** Glicko-2 rating chosen (OQ-BT-01).
- **C-BT-05** WebSocket via Go stdlib + `nhooyr/websocket`.
- **C-BT-06** Hot state in Redis; durable in Postgres after match end.

### Assumptions
- **A-BT-01** Redis cluster sized for active-match volume.
- **A-BT-02** Quiz service stable enough to delegate scoring.

## 9. Dependencies

| ID | Depends on | For |
|----|-----------|-----|
| D-BT-01 | identity (JWT validate) | Auth |
| D-BT-02 | learning (items by topic+difficulty) | Item pool |
| D-BT-03 | quiz (`/internal/battle/score`) | Scoring |
| D-BT-04 | engagement (XP/badge events) | Post-match |
| D-BT-05 | Redis + Aurora | Storage |
| D-BT-06 | NATS | Outbound events |

## 10. Risks

| ID | Risk | L | I | Mitigation |
|----|------|---|---|------------|
| R-BT-01 | WS pod restart loses active battles | Med | High | Hot state in Redis; graceful drain on shutdown |
| R-BT-02 | Item difficulty mismatch unfair | Med | High | Use rating-aware item selection |
| R-BT-03 | Cheating via DevTools / external bot | Med | High | Server holds answers; rate-limit; tab-switch detect Phase 2 |
| R-BT-04 | Matchmaking starvation in low traffic | High | Med | Widen tolerance over time; cross-region pooling Phase 3 |
| R-BT-05 | Network jitter inflates p99 | High | Med | Server-authoritative timestamps |
| R-BT-06 | Rating manipulation via collusion | Low | Med | Anomaly detection Phase 2 |

## 11. Success Criteria

battle Phase 2 launch **Done** when:

1. All P0 stories shipped + tests
2. NFR-BT-* verified (esp p99 < 150 ms)
3. 1000-concurrent-battle load test
4. Chaos: kill pod mid-battle → reconnect verified
5. Anti-cheat baseline integration-tested
6. Rating system verified deterministic (replay reproduces same ratings)
7. Phase 2 limited beta → broader rollout via feature flag

## 12. Open Questions

| # | Question | Owner | Resolve By |
|---|----------|-------|------------|
| OQ-BT-01 | Rating: Glicko-2 vs ELO | ML + Product | Phase 2 Week 2 |
| OQ-BT-02 | Item selection: delegate to learning recommender vs local pool | ML + Backend | Phase 2 Week 4 |
| OQ-BT-03 | Cheating heuristics Phase 1 scope | Security + Product | Phase 2 Week 6 |
| OQ-BT-04 | Audio / chat during battle | Product | Out of Phase 2 |
| OQ-BT-05 | Min items per battle: 5 / 10 / configurable | Product | Phase 2 Week 1 |
| OQ-BT-06 | Cross-exam matchmaking (NEET vs JEE on same item) | Product | Phase 2 Week 2 |
| OQ-BT-07 | Scoring: delegate vs own | Architecture | Phase 2 Week 1 |

## 13. Sign-Off

| Role | Name | Date | Status |
|------|------|------|--------|
| Backend Lead (Go) | _Pending_ | | |
| Product Owner | _Pending_ | | |
| ML Lead | _Pending_ | | |
| Security | _Pending_ | | |
| QA Lead | _Pending_ | | |
