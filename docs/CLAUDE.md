# AdaptiveLearn Platform — Claude Project Context

**Last refresh**: 2026-04-30 — Phase 4 closed (S22–S36 all shipped, exam-prep depth gap closed); Phase 5 multi-parameter engine plan locked via [ADR-0017](adr/0017-multi-parameter-assessment-engine.md), [ADR-0018](adr/0018-polymorphic-question-types-and-resolution.md), [ADR-0019](adr/0019-ai-gateway-and-consolidation.md). Architecture + LLD addenda landed: [`01_design/12_Phase5_Architecture_Addendum`](01_design/12_Phase5_Architecture_Addendum.md), [`04_low_level_design/08_Phase5_LLD_Addenda`](04_low_level_design/08_Phase5_LLD_Addenda.md).
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
| Phase 1 — India launch | 4 + 3 emergent | ✅ S1+S2+S3+S4 closed + S5/S6/S7 emergent closed; **staging cutover sprint = AWS-blocked** |
| Phase 2 — Payment + Educator + Realtime + Insights | 5 + 2 emergent | ✅ all 7 sprints closed (S8–S14) |
| Phase 3 — Platform Evolution (Marketplaces) | 6 (S15–S21 = P3-S0..S6) | ✅ all closed |
| Phase 4 — Exam-Prep Depth | 15 (S22–S36 = P4-S22..S36) | ✅ all closed 2026-04-30 |
| Phase 5 — Multi-Parameter Engine | 12 (S37–S48 = P5-S37..S48) | 🟡 DRAFT — 3 ADRs proposed (0017, 0018, 0019); S37 schema + payload contracts next |
| **Final cutover sprint** | 1 | AWS-blocked (gates Phase 1+2+3+4 launch) |
| **Total** | **49 sprints** to staging push | ~13 pending (Phase 5 + cutover) |

Master index: [`docs/02_planning/00_MasterPhaseIndex.md`](02_planning/00_MasterPhaseIndex.md). Per-PR map of what shipped lives in that index too. Phase 5 build plan: [`/home/deepak/.claude/plans/gentle-popping-diffie.md`](../../.claude/plans/gentle-popping-diffie.md). Phase 5 sprint plan in repo: [`docs/02_planning/54_Phase5_MultiParameterEngine_SprintPlan.md`](02_planning/54_Phase5_MultiParameterEngine_SprintPlan.md).

---

## Tech stack (actual ADRs)

ADRs are four-digit-numbered: `docs/adr/0001-*.md`, etc.

**Backend** (per [ADR-0005](adr/0005-service-consolidation.md), the 12 services consolidated into 5):
- **alp-quiz**: Go (per ADR-0001 reasoning — deterministic latency under concurrency)
- **alp-identity**: Python 3.11, FastAPI — absorbs `auth + user-profile + institution` (3 schemas inside one Postgres DB)
- **alp-learning**: Python 3.11, FastAPI — absorbs `catalog + content + doubts + search + adaptive-engine`. Also owns OpenSearch (`topics_v2`) and Redis (adaptive rate-limit / photo-doubt cache)
- **alp-engagement**: Python 3.11, FastAPI — absorbs `analytics + notification`. JetStream durable consumers `analytics-quiz-completed`, `notification-quiz-completed`, `notification-assignment-created`
- **alp-payment**: Python 3.11, FastAPI — Stripe checkout + webhooks (standalone for webhook isolation; reversible — see ADR-0005 trigger conditions)
- **alp-marketplace**: Python 3.11, FastAPI — Phase 3 service (Sprint 15 / P3-S0 stood up the skeleton; tutor profiles + bookings + creator marketplace land in P3-S1+). Port 38110; DB `marketplace`, schema `marketplace_schema`.
- **Event bus**: NATS JetStream (durable streams since Sprint 3 PR #11)
- **Storage**: PostgreSQL 15 (one DB per consolidated service in compose: `identity`, `learning`, `engagement`, `payment`, `quiz` — each absorbed module keeps its own schema with `version_table_schema=<schema>` in alembic). Redis 7 (lockout + flag cache + adaptive rate-limit). OpenSearch 2.x (`topics_v2` alias inside alp-learning).
- **Deployment**: AWS EKS + Helm (per ADR-0001-foundation-stack); Terraform manages cluster

**Frontend**:
- **Web**: **Vite + React 18** (per ADR-0003 — three-web-app split: `apps/web-student`, `apps/web-portal`, `apps/web-admin`). Not Next.js.
- **Mobile**: **Flutter** (per ADR-0002). Not native Swift/Kotlin.
- **Design system**: `packages/design-system` (TS + CSS tokens), `packages/design-tokens-flutter` (Dart tokens). Source of truth: [`docs/ui/`](ui/).

**AI/ML** (today):
- **Adaptive Engine**: 3PL IRT (a, b, c per item — calibrated since PR #25) + EAP estimator + MFI selector. Pure stdlib Python, no numpy yet.
- **Mastery model**: EWA with **α = 0.4** (`services/engagement/src/engagement/analytics/mastery.py`). Cold-start seeds with first score.
- **Readiness score**: `mean(per-topic EWAs)` over user's mastery set. Range 0–1 (UI may render as 0–100).
- **Streak**: consecutive UTC days of activity, current + longest (PR #34).
- **Predictive (drop-out, recommendations)**: Phase 3 (P3-S5) — heuristic v1 in `services/engagement/src/engagement/analytics/predictive*.py`.
- **6-axis error classifier** (S29 / [ADR-0016](adr/0016-error-pattern-classification.md)): silly_mistake / conceptual_gap / time_pressure / formula_error / sign_or_unit_error / unattempted.
- **SM-2 spaced repetition with EWA-clamp** (S27 / [ADR-0014](adr/0014-spaced-repetition-scheduling.md)): per-(user, topic) revision queue.
- **Cohort percentile + peer percentile** (S31, S32 / [ADR-0015](adr/0015-calibrated-rank-prediction.md)): honest fallback signalling — `percentileSource: "cohort" | "fallback"`, anonymity threshold (cohort < 30 → hidden).
- **LLM**: Anthropic Claude — Phase 3 study-plan / weakness diagnosis / tutor chat ship with heuristic-degrade fallback when no API key. Phase 5 wires Claude through the AI Gateway for authoring + quality + evaluation + translation + vision.

**AI/ML — Phase 5 build (DRAFT, S37–S48)** per [ADR-0017](adr/0017-multi-parameter-assessment-engine.md), [ADR-0018](adr/0018-polymorphic-question-types-and-resolution.md), [ADR-0019](adr/0019-ai-gateway-and-consolidation.md):
- **9-dimension multi-parameter assessment** at concept grain — concept mastery, Bloom-level cognitive depth, fluency, accuracy patterns, retention, confidence calibration, transfer ability, procedural skill, strategic test-taking.
- **Knowledge Graph**: `catalog_schema.concepts` + `concept_edges` + `skills` (S37). Topics seed as `kind='topic_root'` concepts (UUID reused). Edge types: `is_prerequisite_of`, `is_specialisation_of`, `is_applied_in`, `is_example_of`, `is_tested_by`, `is_taught_by`, `appears_in_blueprint`, `is_common_mistake_for`.
- **22 question types via Type Handler Protocol** (8 families: objective / numeric / matching / fill-in / subjective / visual / audio-video / interactive). Each type registers in `learning.types.registry`; adding a 23rd type is one new module + one registry line.
- **Resolution contract** (never marks): `{status, matched_count, total_count, per_part, evaluation_mode, evaluator_metadata}`. Marks live in Quiz/Test orchestration only.
- **AI Gateway as module inside alp-learning** (no 7th service per ADR-0005). Provider-agnostic (Anthropic / OpenAI / Google / self-hosted Llama). Routing config per touchpoint (authoring / quality_check / evaluation / translation / vision). Structured-output enforcement, PII scrubbing, per-touchpoint + per-creator quotas, 90-day audit log, cost dashboard.
- **AI Authoring**: `draft_question` / `expand_explanation` / `suggest_distractors` + 6 quality checks (ambiguity / plausibility / duplicate / syllabus / difficulty / tone). AI_DRAFT marker on outputs; never publishes without human review.
- **AI Evaluation**: HYBRID mode for ESSAY / DESCRIPTIVE_LONG / CASE_STUDY / COMPREHENSION_LONG. Confidence-based escalation (≥0.95 auto, 0.75–0.95 sample 5%, < 0.75 to human). Cohen's kappa per criterion; auto-pause at < 0.7.
- **Localisation pipeline**: Hindi at v1; Tamil/Telugu/Bengali/Marathi at Phase 2. Per-type `translatable_fields()` walker + glossary injection + per-language reviewer + cultural review queue. Publish independence per language.
- **Multi-parameter mastery tables** (S39): `analytics_schema.{concept_mastery, bloom_mastery, fluency, confidence_calibration, procedure_attempts}`. process_session fan-out is best-effort try/except per existing pattern.

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
| AI Gateway availability (Phase 5+) | 99.5% | Phase 5 design; not yet built |
| AI authoring draft latency p95 | < 15 s | Phase 5 design |
| AI evaluation latency p95 (AI_ASSISTED) | < 8 s | Phase 5 design |
| AI evaluation kappa per criterion (HYBRID) | ≥ 0.7 | Phase 5 design; auto-pause if below |
| Translation lead time HI p95 | < 36 h | Phase 5 design |
| Cost per published question (authoring + quality + translation) | ≤ ₹0.20 | Phase 5 design |
| Cost per evaluated subjective response | ≤ ₹0.05 | Phase 5 design |

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

## Service inventory (post-ADR-0005 consolidation, 2026-04-28)

The 12 original services collapsed into **5 deployables + 1 reserved P3 slot**. Each consolidated service owns one Postgres database with one schema per absorbed module, and mounts each old service's HTTP routes at the same URL prefix used previously — clients are unaffected.

| Service | Stack | Absorbs | URL prefixes | Postgres DB | NATS edges |
|---|---|---|---|---|---|
| **alp-identity** | Py/FastAPI | auth, user-profile (renamed to `profile` sub-package), institution | `/auth/* /profile/* /institution/* /flags/*` | `identity` (3 schemas) | publishes `user.created`, `flag.changed`; subscribes `payment.subscription.changed` |
| **alp-payment** | Py/FastAPI | payment (standalone, see ADR-0005 triggers) | `/payment/*` | `payment` | publishes `payment.subscription.changed` |
| **alp-learning** | Py/FastAPI | catalog, content, doubts, search, adaptive-engine (renamed to `adaptive`) + Phase 5 modules: `types`, `kg`, `ai_gateway`, `ai_authoring`, `localisation`, `evaluation`, `grading` | `/catalog/* /content/* /doubts/* /search/* /adaptive/* /irt/* /strategy/select /admin/reindex /grading/* /localisation/*` (Phase 5+) | `learning` (3 schemas + Phase 5 additions: concepts, concept_edges, skills, evaluation_rubrics, evaluation_records, ai_generation_jobs, content_artifact_translations, content_media, localisation_glossary, calibration_samples, exam_question_type_support) + OpenSearch + Redis | publishes `content.question.published`, `content.assignment.created`; subscribes `quiz.session.completed` |
| **alp-quiz** | Go | quiz (Phase 5 extends with type-aware grading branch + Go ports of DETERMINISTIC handlers) | `/quiz/*` | `quiz` (1 schema) | publishes `quiz.session.completed` (Phase 5: extends `SessionItemEvent` with `student_response_payload` + `confidence`, both omitempty); subscribes `content.question.published` |
| **alp-engagement** | Py/FastAPI | analytics, notification (Phase 5 extends with concept_mastery, bloom_mastery, fluency, confidence_calibration, procedure_attempts) | `/analytics/* /notifications/*` | `engagement` (2 schemas + Phase 5 additions) | subscribes `quiz.session.completed`, `content.assignment.created` |
| **alp-marketplace** | Py/FastAPI | tutor, creator marketplace, revenue-share | `/marketplace/*` | `marketplace` (1 schema) | publishes `marketplace.*` |

**Service ceiling = 6** (5 today + Marketplace). New domains in Phase 2/3/4/5 land as *modules* inside one of the existing services unless a new ADR justifies a boundary. Phase 5 (per [ADR-0019](adr/0019-ai-gateway-and-consolidation.md)) folds AI Gateway + AI Authoring + Localisation + Evaluation as modules inside `alp-learning` — **no 7th service**.

Frontend (unchanged by consolidation): three React+Vite apps (`apps/web-student`, `apps/web-portal`, `apps/web-admin`) + Flutter mobile (`apps/mobile`).

---

## Code conventions

- **Python services**: FastAPI + Pydantic v2, async/await throughout. Project deps via `uv`. Tests via `pytest`. Format/lint via `ruff`.
- **Go services**: standard library + goroutines, no heavy frameworks. Tests via `go test`. Format via `gofmt`.
- **All SQL**: parameterised queries only — checked by `ruff` rule S608 ignore on schema-name interpolation only.
- **All secrets**: env vars in `docker-compose.yml` (local), AWS Secrets Manager SDK (staging+). Never in code.
- **Logging**: structured (structlog Py / slog Go). Every request scope carries `trace_id` (alp_telemetry / alptelemetry). PII scrubbed.
- **Tests**: per-consolidated-service unit-test minimums after ADR-0005:
   - alp-identity 119 (auth + profile + institution combined)
   - alp-learning 142+ (catalog + content + doubts + search + adaptive combined; ~144 total of which 2 are state-dependent)
   - alp-engagement 92 (analytics + notification combined; integration tests requiring live infra deselected)
   - alp-payment 5
   - alp-quiz: Go 22 + 5 events
   - lib tests: alp_telemetry 16, alptelemetry 8.
- **Error responses**: FastAPI default `{ "detail": { "code": "...", "message": "..." } }` — Quiz Go matches the shape: `{ "code": "...", "message": "..." }` plain.
- **List endpoints**: paginated, max 100 per page (Catalog + Search enforce; Analytics/Notification list endpoints have soft caps).

---

## Sprint 4 — verified live on local Docker Compose (2026-04-26)

Each S4 exit criterion smoke-tested end-to-end against the running stack:

1. **IRT triple flows author → bridge → Quiz**: `POST /content/questions {a:1.4, b:0.3, c:0.22}` → submit → moderator approve → `quiz_schema.questions` row appears with the same triple byte-for-byte. Subscriber log line: `quiz subscribed to content.question.published stream=CONTENT_EVENTS durable=quiz-content-published`.
2. **`make seed-hindi`** runs the full author → submit → review pipeline for 15 Devanagari MCQs (5 each MECH/THERMO/CALC). All 15 land in Quiz bank with `language='hi'` within ~1s.
3. **JetStream drift recovery — three-layer defence**: stop `analytics` + `notification` containers, submit a quiz session during the outage, restart. Live durable consumer replays the queued message; subsequent `make analytics-backfill` and `make notification-backfill` scan the source-of-truth and idempotently skip (counter `skipped=1`). Both layers active.
4. **alp_telemetry / alptelemetry** middlewares wired into all 11 services (Py + Go); request-scope `trace_id` visible in structured logs.
5. **Mobile reset-password deep-link parser** — `apps/mobile/lib/auth/deep_link.dart` shipped; platform-plugin wiring deferred to S5 (needs device).

Take this as the truth-source. If a future audit doubts S4 closure, re-run the three smoke tests above (bridge, hindi seed, drift recovery); they're the actual exit criteria.

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
