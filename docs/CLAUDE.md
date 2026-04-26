# AdaptiveLearn Platform — Claude Project Context

**Last refresh**: 2026-04-25 — reconciled against actual shipped code after Sprints 0–4.
**Authoritative cross-link**: [`docs/02_planning/00_MasterPhaseIndex.md`](02_planning/00_MasterPhaseIndex.md) — phase + sprint state.
**For UI/design work**: [`docs/ui/00_MASTER_README.md`](ui/00_MASTER_README.md) — design tokens, 109 screens, ALP.* component library.

## What this project is

AI-powered competitive exam preparation platform for India (NEET, JEE, UPSC, CBSE).
**Phase 1**: India launch, < 10,000 students, AWS ap-south-1.
**Architecture**: microservices + event-driven on local Docker Compose today; AWS EKS + Helm in staging once access lands.

## My role

Full-stack AI developer. I own the entire codebase — backend services, three web apps, Flutter mobile, AI/ML layer, and DevOps.

---

## Phase + sprint state at a glance

| Phase | Sprints | Status |
|---|---|---|
| Phase 0 — Foundation | 1 | ✅ done |
| Phase 1 — India launch | 4 | S1+S2 done, S3 ~50%, S4 not started (AWS-blocked) |
| Phase 2 — Global expansion (Q4 2026) | 5 | ❌ all pending |
| Phase 3 — Platform evolution (2027) | 6 | ❌ all pending |
| **Total** | **16** | **~12.5 pending** |

Master index: [`docs/02_planning/00_MasterPhaseIndex.md`](02_planning/00_MasterPhaseIndex.md). Per-PR map of what shipped lives in that index too.

---

## Tech stack (actual ADRs)

ADRs are four-digit-numbered: `docs/adr/0001-*.md`, etc.

**Backend**:
- **Quiz**: Go (per ADR-0001 reasoning — deterministic latency under concurrency)
- **Adaptive Engine + 9 other services**: Python 3.11, FastAPI, Pydantic v2, async/await
- **Event bus**: NATS JetStream (durable streams since Sprint 3 PR #11)
- **Storage**: PostgreSQL 15 (separate database per service in compose; same Aurora cluster + per-service schema in staging+), Redis 7 (lockout + flag cache only — **session state lives in Postgres**, NOT Redis), OpenSearch 2.x (`topics_v2` index, alias-rotation supported per PR #35)
- **Deployment**: AWS EKS + Helm (per ADR-0001-foundation-stack); Terraform manages cluster

**Frontend**:
- **Web**: **Vite + React 18** (per ADR-0003 — three-web-app split: `apps/web-student`, `apps/web-portal`, `apps/web-admin`). Not Next.js.
- **Mobile**: **Flutter** (per ADR-0002). Not native Swift/Kotlin.
- **Design system**: `packages/design-system` (TS + CSS tokens), `packages/design-tokens-flutter` (Dart tokens). Source of truth: [`docs/ui/`](ui/).

**AI/ML**:
- **Adaptive Engine**: 3PL IRT (a, b, c per item — calibrated since PR #25) + EAP estimator + MFI selector. Pure stdlib Python, no numpy yet.
- **Mastery model**: EWA with **α = 0.4** (`services/analytics/src/analytics/mastery.py`). Cold-start seeds with first score.
- **Readiness score**: `mean(per-topic EWAs)` over user's mastery set. Range 0–1 (UI may render as 0–100).
- **Streak**: consecutive UTC days of activity, current + longest (PR #34).
- **Predictive (drop-out, recommendations)**: Phase 3 — see [`docs/02_planning/21_Phase3_SprintDevelopmentPlan.md`](02_planning/21_Phase3_SprintDevelopmentPlan.md).
- **LLM**: Anthropic Claude — currently not wired in production code paths; staged for Phase 2+.

---

## Architecture principles (still load-bearing)

- **AP-01**: No shared databases — each service owns exactly one schema.
- **AP-02**: Stateless services — all state in Postgres + NATS JetStream + Redis (the last only for ephemeral lockout / flag cache).
- **AP-03**: Fail gracefully — quiz/content browsing works even if Adaptive Engine is down. **Already enforced**: Quiz falls back to `binary_search` strategy when Adaptive returns error or the GAP-01 circuit breaker is tripped.
- **AP-04**: Async by default — score updates, notifications via NATS events on `quiz.session.completed` (durable consumers in Analytics + Notification).
- **AP-05**: Security at every layer — JWT at service entry (HS256 today; RS256 + JWKS planned for staging), RBAC at endpoint, encryption at DB.
- **AP-08**: Idempotency on mutations — Quiz answer recording is first-write-wins by `(session_id, item_idx)`; Analytics + Notification consumers idempotent via `processed_sessions` / `processed_events` tables; backfill (PRs #29, #33) preserves the same contract.

---

## Critical data flows

**Quiz submit → mastery + notification**:

```
Quiz Service (Go) /quiz/sessions/{id}/submit
  → publishes payload to NATS JetStream
    stream QUIZ_EVENTS, subject quiz.session.completed
  → Analytics durable consumer analytics-quiz-completed
       runs process_session() → updates mastery (EWA), readiness, streak
  → Notification durable consumer notification-quiz-completed
       runs process_quiz_completed() → channel-flag gate → notifications row
       → SMTP dispatcher sends email via Mailpit (local) / SendGrid (staging+)
```

Recovery from JetStream MaxDeliver drops: per-service nightly backfills (`make analytics-backfill`, `make notification-backfill`) read `quiz_schema.quiz_sessions` directly. Documented in [`runbook/nats_dlq.md`](../runbook/nats_dlq.md).

**Content authoring → Quiz bank** (PR #21 bridge):

```
Content Service POST /content/questions/{id}/review (approve)
  → publishes content.question.published to NATS stream CONTENT_EVENTS
  → Quiz subscriber quiz-content-published
       upserts into quiz_schema.questions with full IRT triple (a, b, c)
```

---

## JWT claims structure

```json
{
  "sub": "<user-uuid>",
  "role": "STUDENT|TEACHER|EXPERT|MODERATOR|INSTITUTION_ADMIN|PLATFORM_ADMIN",
  "admin_access_level": "NONE|INSTITUTION|PLATFORM",
  "tenant_id": "<institution-uuid-or-null>",
  "iat": 1700000000,
  "exp": 1700003600,
  "token_type": "access"
}
```

**Today**: HS256, shared `JWT_SECRET`, ~30 min access + 7 day refresh.
**Staging+**: RS256 + JWKS — wired in design but signing key swap is part of the staging deploy carry-over.

W3C trace-id propagation lives separately in the `traceparent` header (`alp_telemetry` Py + `alptelemetry` Go libs, PR #27).

---

## Mastery / strength values

EWA is a float in `[0, 1]`. Render-side bucketing for UIs is done by `docs/ui/` design tokens:

```
STRONG       ewa ≥ 0.70   → color-token --color-green   (#10C47A)
DEVELOPING   0.40–0.69    → color-token --color-blue    (#4F87F6)
WEAK         0.01–0.39    → color-token --color-red     (#F43F5E)
NOT_STARTED  ewa = 0      → color-token --text-faint    (#3E4D6A)
```

Defined in `docs/ui/00_MASTER_README.md`. Implementing screens MUST consume these tokens via `@alp/design-system` (or `alp_design_tokens` for Flutter), never hardcode hex values.

---

## SLOs (HLD §16.1 mapping; current state)

| SLO | Target | Status |
|---|---|---|
| API availability | 99.9% | not measured yet (no staging telemetry) |
| Quiz result latency p95 | < 500ms | local-only; staging needed |
| Auth latency p95 | < 200ms | local-only |
| Readiness update latency p95 | < 1s | within SLO under live JetStream consumer; backfill is async batch |
| 5xx error rate | < 0.1% | not measured yet |
| Recommendation latency p95 | < 800ms | feature is Phase 3 |

---

## Open P1 items (cross-checked against `docs/06_gaps_resolution/GapResolutionRegister_v1.2.docx`)

Original Sprint-1 P1s:
- **GAP-01** (circuit breaker) — ✅ closed by PR #12 (gobreaker on Quiz↔Adaptive).
- **GAP-06** (NATS DLQ) — ✅ closed operationally by PR #30 runbook.
- **GAP-09** (test data seed script) — ✅ Sprint 1; Hindi seed via PR #28.
- **GAP-12** (rollback decision tree) — ✅ in `runbook/rollback.md`.
- **GAP-18** (rollback deputy) — ✅ documented in `docs/05_launch/03_DelegationOrder.md`.
- **GAP-22** (Aurora failover test) — ❌ **blocked** on AWS staging access.
- **GAP-25** (flag.decision logging) — ✅ Python (#13) + Go (#15).

The gating P1 today is **AWS staging access**, not any code-side blocker. Phase 1 launch (S4 soft + full launch) cannot proceed until this lands.

---

## Build order (already executed up to step 6 + 7 partially)

1. ✅ Auth Service (Python) — JWT + lockout + email OTP
2. ✅ Catalog Service (Python) — Exam/Subject/Topic + bilingual
3. ✅ Quiz Service (Go) — session FSM, IRT-aware pickNext, JetStream publisher
4. ✅ Adaptive Engine (Python) — 3PL IRT + EAP + MFI; called via HTTP, not gRPC
5. ✅ Analytics — EWA mastery + readiness + streak; nightly backfill (Recommendation deferred to P3)
6. ✅ Content (S3) — DRAFT→REVIEW→PUBLISHED FSM, Content→Quiz bridge (Moderation deferred)
7. 🟨 Remaining services — Notification ✅, Payment ❌ (Stripe never wired), Community ❌ (P3), Institution ❌ (cohorts/assignments never built)
8. 🟨 Frontend — three React+Vite apps shipped as MVP shells (login + key flows); design-system foundation per `docs/ui/` rolling out

---

## Code conventions

- **Python services**: FastAPI + Pydantic v2, async/await throughout. Project deps via `uv`. Tests via `pytest`. Format/lint via `ruff`.
- **Go services**: standard library + goroutines, no heavy frameworks. Tests via `go test`. Format via `gofmt`.
- **All SQL**: parameterised queries only — checked by `ruff` rule S608 ignore on schema-name interpolation only.
- **All secrets**: env vars in `docker-compose.yml` (local), AWS Secrets Manager SDK (staging+). Never in code.
- **Logging**: structured (structlog Py / slog Go). Every request scope carries `trace_id` (alp_telemetry / alptelemetry). PII scrubbed.
- **Tests**: per-service test minimums (current totals from PR #38 master index):
   - auth 18, profile 14, catalog 10, search 20, institution 9, analytics 28, notification 20, payment 5, adaptive-engine 26, content 16, quiz Go 22 + 5 events. Lib tests: alp_telemetry 16, alptelemetry 8.
- **Error responses**: FastAPI default `{ "detail": { "code": "...", "message": "..." } }` — Quiz Go matches the shape: `{ "code": "...", "message": "..." }` plain.
- **List endpoints**: paginated, max 100 per page (Catalog + Search enforce; Analytics/Notification list endpoints have soft caps).

---

## What CHANGED in this refresh

Earlier versions of this file (now superseded) carried decisions that flipped during Sprints 0–4 and were never written back:

| Old claim | Reality |
|---|---|
| ADR-01, ADR-02, ADR-09 | ADRs are four-digit (ADR-0001, …) |
| Web: Next.js 14 + React 18 (ADR-09) | Vite + React 18 (per ADR-0003 — three-web-app split) |
| Mobile: Swift + Kotlin native (ADR-04) | Flutter (per ADR-0002) — single codebase |
| Recommendation Service exists | Doesn't yet — folded into Adaptive Engine + Analytics for Phase 1; emerges as a thread in Phase 3 |
| EWA α = 0.3, recency decay 5% / 14d | α = 0.4, no decay (decay deliberately deferred — small cohort, signal preserved) |
| Quiz calls Adaptive via gRPC | HTTP (`internal/adaptive/client.go`); gobreaker-wrapped |
| Strength buckets named directly in code | Tokens in `docs/ui/00_design-system.css` only — services emit numeric EWA, UI buckets |
| Sprint-1 GAP numbering (GAP-01 = "co-locate Adaptive?") | Was resolved pre-Sprint 1; current GAP-01 in register is Quiz↔Adaptive circuit breaker |
| Quiz session state in Redis with 7-day TTL | **Postgres** `quiz_schema.quiz_sessions`, 90-min `expires_at` per GAP-10 |
| `POST /quizzes/start` etc. (under `/quizzes/`) | `POST /quiz/sessions/start` etc. (under `/quiz/sessions/`) — see `services/quiz/internal/server/server.go` |

If you (or another agent) plan to write code touching the Quiz, Auth, mobile, or design-system surface, **read this file's "Tech stack" + "Critical data flows" sections first** — they reflect what's deployed.
