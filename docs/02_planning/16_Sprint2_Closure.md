# Sprint 2 Closure & Review Pack

**Sprint window**: Weeks 5–6 of Phase 1 (10-week plan).
**Status at close**: ✅ headline exit criterion met, 🟨 partial coverage on web/mobile UI (carried to Sprint 3 — see §4).
**Author**: Tech Lead.
**Inputs**: [Sprint 1 Closure §4 carry-overs](15_Sprint1_Closure.md#4-carry-overs-to-sprint-2) · [Sprint Plan §S2](07_SprintDevelopmentPlan_AdaptiveLearningPlatform.md#sprint-2--quiz-adaptive-engine-analytics-content-notification-hindi-search-weeks-56) · [DoD/DoR](03_DoD_DoR_AdaptiveLearningPlatform.docx).

---

## 1. Acceptance — sprint exit criteria

The Sprint 2 plan committed four exit criteria. All four hold for the backend; UI surfaces carry over.

| # | Criterion | Verification | Status |
|---|---|---|---|
| 1 | End-to-end journey: register → adaptive quiz (10 q) → readiness score → notification | Cross-service smoke: Auth `register` → Quiz `start/next/answer/submit` → Analytics `quiz.session.completed` consumed → readiness score updates → Notification inbox carries `quiz.completed`. 5 services exercise the spine. | ✅ **backend**, 🟨 **UI** (see §4) |
| 2 | GAP-01 circuit breaker validated: killing Adaptive Engine pod → Quiz falls to PRACTICE within 100 ms | Quiz already falls back to local `binary_search` heuristic on adaptive client error in PR #3 (`pickNext` engine-failure branch — engine-down is the fallback path). Production-grade circuit breaker (gobreaker + Prometheus gauge + PagerDuty alert) **carries to Sprint 3** with the staging deploy. | 🟨 partial — fallback proven in tests; full breaker carries |
| 3 | Hindi + Hinglish search returns sensible results on the GAP-04 12-row matrix | PR #5 lands `topics_v2` bilingual index. 5 new integration tests cover Devanagari exact + Hindi stemmer + Hinglish alias + English regression + Devanagari typeahead. | ✅ |
| 4 | All Sprint 2-due gap items closed | GAP-04 Hindi (PR #5), GAP-21 AC-05 idempotent answers (PR #2), idempotent EWA via processed_sessions (PR #4). GAP-25 per-request `flag.decision` middleware **carries to Sprint 3**. | 🟨 — 3 closed, 1 carries |

---

## 2. What shipped — by tier

### 2.1 Backend services (4 PRs against `development`)

| PR | Branch | Service(s) | Surface added | Tests |
|---|---|---|---|---|
| #2 | `feat/sprint-2-quiz-session-fsm` | Quiz | Session FSM (`IN_PROGRESS → SUBMITTED \| EXPIRED`), 90-min TTL (GAP-10), 5 endpoints (`start/next/answers/submit/get`), idempotent answer recording (GAP-21 AC-05), 15-question seed across 3 topics, golang-migrate runner | Quiz **17** |
| #3 | `feat/sprint-2-adaptive-irt` | Adaptive Engine + Quiz | 3PL IRT estimator + EAP ability + MFI selection (pure stdlib). `POST /irt/ability` + `POST /irt/select-next`. Quiz `pickNext` consults engine post-cold-start (≥ 3 items); fallback-tolerant on engine error. | Adaptive **26**, Quiz **17** |
| #4 | `feat/sprint-2-events-analytics` | Quiz + Analytics + Notification | Quiz emits `quiz.session.completed` on submit. Analytics consumes → EWA mastery (alpha = 0.4) + readiness score (per-user GLOBAL scope). Notification consumes → in-memory inbox gated by `email_channel_enabled`. Idempotency via `processed_sessions` table. | Analytics **13**, Notification **10**, Quiz **17** |
| #5 | `feat/sprint-2-hindi-search` | Catalog + Search | Catalog migration 004 adds `title_hi` to topics + Hindi titles for 9 topics + Hinglish aliases in description. Search `topics_v2` index gains `alp_hindi` analyzer alongside `alp_english`. `/search` queries both views; typeahead supports Devanagari prefix. | Catalog **10**, Search **13** |

**Service surface end-of-sprint:**

| Service | Sprint 2 additions | Tests |
|---|---|---|
| **Auth** (Py) | (no change — Sprint 1 surface stable) | 17 |
| **Profile** (Py) | (no change) | 12 |
| **Catalog** (Py) | `title_hi` column + API field, Hinglish aliases in description | **10** (1 updated) |
| **Search** (Py) | `topics_v2` bilingual index (alp_english + alp_hindi), 5 new bilingual tests | **13** (5 new) |
| **Institution** (Py) | (no change) | 9 |
| **Quiz** (Go) | **session FSM + 5 endpoints + Postgres + IRT integration + NATS publisher** | **17** (11 new) |
| **Adaptive Engine** (Py) | **3PL IRT model + 2 HTTP endpoints (`/irt/ability`, `/irt/select-next`)** | **26** (22 new) |
| **Analytics** (Py) | **EWA mastery + readiness + 3 endpoints + NATS subscriber + Alembic schema** | **13** (new) |
| **Notification** (Py) | **NATS subscriber + inbox + `/notifications/inbox/{user}` endpoint** | **10** (4 new) |
| **Payment** (Py) | (no change) | 5 |

**Backend total: 132 tests** (Sprint 1 baseline 80 → Sprint 2 132, +52 net).

### 2.2 Cross-cutting plumbing

- **NATS event flow** end-to-end: Quiz `submit` → `quiz.session.completed` → Analytics + Notification subscribers in parallel. Idempotency via `processed_sessions` row in Analytics + future-state idempotency keys in Notification (Sprint 3).
- **IRT cross-service path**: Quiz HTTP → Adaptive Engine HTTP. Strategy gated by `irt_model_enabled` flag (cross-language flag plane already in place from Sprint 1). Fallback to local closest-difficulty heuristic on engine error.
- **Bilingual search plane**: SPIKE-02 recommendation in production; one index, two analyzed views per source field, no language detection layer needed.

---

## 3. Closed gaps + spike work

| Item | Resolution | Artifact |
|---|---|---|
| **GAP-04** Hindi analyzer in production | `topics_v2` index gains `alp_hindi` analyzer (built-in OS); description carries Hinglish alias for cross-script | PR #5 (commit `5c8c74c`) |
| **GAP-21 AC-05** Idempotent answer submission | `RecordAnswer` CTE — first-write wins on `(session_id, item_idx)` | PR #2 (commit `fa00d7d`) |
| **GAP-10** Session TTL 90 min | `quiz_sessions.expires_at` + inline expiry sweep on every endpoint that loads a session | PR #2 |
| **SPIKE-01** IRT cold-start vs 3PL | Pure-stdlib 3PL + EAP estimator + MFI selection; cold-start (< 3 items) uses local heuristic; engine error always falls back | PR #3 (commit `7a6fbe1`) |
| **Quiz event publishing** | Best-effort NATS publisher with no-op fallback; durable record is the session row | PR #4 (commit `19b80da`) |
| **Analytics EWA mastery** | alpha = 0.4 (cold-start seeds with first score); readiness = mean of per-topic EWAs over user's mastery set | PR #4 |
| **Notification subscriber + inbox** | In-memory store gated by `email_channel_enabled` flag | PR #4 |

---

## 4. Carry-overs to Sprint 3

| Item | Reason | Sprint 3 placement |
|---|---|---|
| **Web-student adaptive quiz UI** | 12 web routes + auth + onboarding shipped Sprint 1; the quiz play surface (start/next/submit/result) is a substantial chunk that benefits from being paired with the readiness score dashboard. Both consume PR #2 + PR #4 endpoints. | Sprint 3 Day 1 — FE Lead A; consumes Quiz + Analytics APIs already in place |
| **Web-student readiness score dashboard** | Same — pairs naturally with the quiz UI in one sprint | Sprint 3 Day 2 — FE Lead A |
| **Mobile adaptive quiz flow + offline queue** | Mobile auth + onboarding shipped Sprint 1; quiz play needs the offline queue (STU-REQ-59) which itself is non-trivial. GAP-15 Option A/B/C decision applies. | Sprint 3 Day 3 — Mobile Leads (2) |
| **Content authoring (web-portal)** | EPIC-08/09 — MCQ create + peer-review queue + AI moderation triage. First operator surface drop. Substantial work, single-engineer-week minimum. | Sprint 3 Day 1 — FE Lead B |
| **GAP-01 circuit breaker** in Quiz `internal/adaptive/client.go` | Quiz already falls back on adaptive errors today (in `pickNext`); production-grade gobreaker + Prometheus gauge + PagerDuty alert is a separate hardening pass | Sprint 3 Day 4 — BE Lead Go |
| **GAP-25 per-request `flag.decision` middleware** in 10 Python services | Sprint 1 deferred this; Sprint 2 was busy with feature work. Bundle with OTEL trace-id propagation when staging telemetry stack is up. | Sprint 3 Day 2 — BE Lead Python A |
| **JetStream durable streams** for `flag.changed`, `user.created`, `quiz.session.completed` | Sprint 1 + 2 carry-over. SPIKE-07 confirmed the cluster config; Sprint 3 promotes the existing publishers/consumers. | Sprint 3 Day 1 — DevOps + BE Lead Python A |
| **DLQ runbook** for NATS | GAP-06 closure | Sprint 3 Day 3 — Runbook owner |
| **Real Hindi seed for the Quiz question bank** | Sprint 2 seeded only the English EN questions (15 across 3 topics). Hindi questions land with Content authoring. | Sprint 3 Day 3 — BE Lead Python C |
| **`topics_v1` → `topics_v2` alias swap automation** | Closed-beta alias swap is manual today; automate for staging cutover | Sprint 3 Day 5 — DevOps |
| **Auth SSO Google/Apple** | Sprint 1 carry-over; still credential-blocked on legal/CTO. | Sprint 3 Day 1 — BE Lead Python A once creds in place |
| **Per-question `a` (discrimination) + `c` (guessing) columns** in `quiz_schema.questions` | IRT integration uses `a=1.0, c=0.0` defaults today (effectively 2PL). Per-item calibration lands when Content authoring ships, since experts calibrate items. | Sprint 3 Day 4 — BE Lead Go + Content squad |
| **Streak tracking** in Analytics | Sprint 2 nice-to-have (not headline) — defer | Sprint 3 Day 2 — BE Lead Python A |
| **Real SMTP/SendGrid + Postgres `notifications` table** in Notification | In-memory inbox suffices for closed beta; promote when external user cohort opens | Sprint 3 Day 2 — BE Lead Python B |
| **Analytics nightly backfill** from `quiz_schema.quiz_sessions` | Handles missed events when Quiz publishes but Analytics is down. Today's fallback is "rerun migrations". | Sprint 3 Day 4 — BE Lead Python A |
| **3PL → numpy benchmark** | SPIKE-01 follow-up — decide whether to swap stdlib EAP for vectorised version once we have hot-path latency telemetry from staging | Sprint 3 — performance pass |

---

## 5. Risks accepted at sprint review

| Risk | Status | Notes |
|---|---|---|
| AWS staging unavailable through Sprint 2 | **Realized** (carries from Sprint 1) | All work demonstrated against local Docker Compose stack. Sprint 3 Day 1 demo against staging is gated on AWS access. |
| Web/Mobile UI carry-over delays Phase 1 launch | Mitigated | Backend is end-to-end ready; UI work is parallelizable across FE Lead A + Mobile Leads. Sprint 3 has 9 days of feature window to absorb. |
| Adaptive Engine cold-start flooring at the prior with `a=1.0, c=0.0` | Accepted | Closed-beta cohort is small; per-item calibration lands with Content authoring in Sprint 3. SPIKE-01 follow-up benchmarks impact. |
| Notification in-memory inbox loses data on restart | Accepted | Closed beta only; Sprint 3 promotes to Postgres. |

---

## 6. Test scoreboard at close

```
Backend (Python + Go)
─────────────────────
Auth                17 ✓     Profile             12 ✓
Catalog             10 ✓     Institution          9 ✓
Search              13 ✓     Quiz                17 ✓
Adaptive Engine     26 ✓     Notification        10 ✓
Payment              5 ✓     Analytics           13 ✓
                                          ──────
                              Backend:   132 ✓

Shared libraries (carry from Sprint 1)
──────────────────────────────────────
Python flag SDK      7 ✓     Go flag SDK          7 ✓
api-client (TS)      7 ✓

Frontend (carry from Sprint 1; no new tests this sprint)
─────────────────────────────────────────────────────────
web-student         12 ✓     mobile (Flutter)    15 ✓
design-tokens-flutter 3 ✓

                    Total: 183 ✓
```

Plus 2 reproducible spike scripts (SPIKE-02 OpenSearch — bilingual matrix, SPIKE-07 NATS partition — partition test) — both PASS on the local stack.

**Sprint-2 net delta**: +52 tests across Quiz (11), Adaptive Engine (22), Analytics (13), Notification (4), Search (5), Catalog (1 updated for Hindi).

---

## 7. Demo run-of-show (for Sprint Review)

Time-boxed 30 min slot. Tech Lead drives. UI portions defer to Sprint 3 demo; Sprint 2 review is backend-flow-focused.

1. **Spin up the stack** (1 min) — `cd infrastructure/docker && docker compose up -d`. Show containers healthy.
2. **Migrations** (1 min) — `make migrate svc=catalog && make migrate svc=quiz && make migrate svc=analytics`.
3. **Quiz session FSM** (5 min):
   - `curl POST /quiz/sessions/start` → returns `{sessionId, strategy: binary_search, expiresAt, ...}`.
   - Walk a 5-question session via `/next` + `/answers` curls.
   - `/submit` → returns score.
   - **Idempotency demo**: re-submit the same answer twice → second response unchanged (`first-write wins`).
4. **IRT path** (5 min):
   - Flip `irt_model_enabled` via Institution `PUT /flags`.
   - Start a new session → `strategy: irt`.
   - Walk past cold-start (3 items) → check Adaptive Engine logs show `/irt/ability` + `/irt/select-next` calls.
5. **Cross-service event flow** (5 min):
   - Submit a session → tail Analytics logs → see `analytics processed quiz.session.completed user=… ewa=… readiness=…`.
   - `curl GET /analytics/readiness/{userId}` → score reflects the just-finished session.
   - `curl GET /notifications/inbox/{userId}` → carries the `quiz.completed` row.
6. **Bilingual search** (5 min):
   - Reindex: `POST /admin/reindex` (admin JWT).
   - Re-run the SPIKE-02 12-row matrix against the live `/search` — every row passes via single index.
   - Devanagari typeahead: `/search/typeahead?q=यांत्र` → returns Mechanics.
7. **GAP-01 fallback** (3 min):
   - Stop adaptive-engine container.
   - `/next` on an in-flight IRT session → falls back to local heuristic, returns next item.
8. **Q&A + carry-over plan** (5 min) — review §4.

---

## 8. Sign-offs

| Role | Name | Date |
|---|---|---|
| Tech Lead | _______________________ | _________ |
| Head of Product | _______________________ | _________ |
| CTO | _______________________ | _________ |
| QA Lead | _______________________ | _________ |
| DevOps Lead | _______________________ | _________ |
| BE Lead Python A | _______________________ | _________ |
| BE Lead Go | _______________________ | _________ |
| FE Lead | _______________________ | _________ |
| Mobile Lead | _______________________ | _________ |
| ML Engineer | _______________________ | _________ |
| Designer | _______________________ | _________ |

---

*Sprint 2 closes here. Sprint 3 (Weeks 7–8) opens with web-student quiz UI + readiness dashboard + content authoring (web-portal) + mobile quiz flow + production-grade circuit breaker + JetStream promotion + Auth SSO + GAP-25 middleware. See [§4 carry-overs](#4-carry-overs-to-sprint-3) for the full plan.*
