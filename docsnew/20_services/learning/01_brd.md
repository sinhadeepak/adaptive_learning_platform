# Business Requirements Document — learning (service)

| | |
|---|---|
| **Service** | `services/learning` |
| **Tech** | Python 3.12 · FastAPI · Pydantic v2 · SQLAlchemy 2 · Alembic · OpenSearch · NumPy / scikit-learn for engine |
| **Schemas** | `content_schema`, `adaptive_schema` (and AI Gateway tables within) |
| **Doc Version** | 0.1 (DRAFT) |
| **Date** | 2026-05-27 |
| **Anchored to** | [Master BRD §5.2.2](../../00_platform/02_master_brd/master_brd.md#522-learning) |

---

## 1. Purpose

The `learning` service is the **product's intelligence core**. It owns:
- Content domain (subjects, topics, concepts, items, blueprints, PYQs)
- The 22 question types via the **Type Handler Protocol** (ADR-0018) — including the **resolution contract**: `status × matched_count × total_count × per_part × evaluation_mode × evaluator_metadata`. The learning service **never returns marks**; that's quiz's job.
- Adaptive engine — 9-dimension substrate (ADR-0017) at concept grain
- AI Gateway (ADR-0019) — 5 touchpoints: authoring, quality_check, evaluation, translation, vision — with provider-agnostic routing and Cohen's-kappa auto-pause
- Screening (12-item adaptive blueprint Phase 1; full Bayesian θ Phase 2+)
- Spaced repetition (SM-2 + EWA per ADR-0014)
- Error-pattern classification (ADR-0016)
- Rank prediction (ADR-0015, Phase 2)
- Recommendation algorithm (ADR-0011, content-based embeddings)
- Localisation (translation touchpoint)
- Today's Mission entrypoint (ADR-0024)
- Difficulty agency (ADR-0022)
- Constrained plan co-editing (ADR-0023)
- Analytics module: readiness score, weak areas, accuracy trends, time-per-question (ADR-0013)

Per ADR-0019, the AI Gateway is a **module inside this service**, not a separate service — preserving ADR-0005's service ceiling of 6.

## 2. Scope

### 2.1 In Scope

| Domain | Capability |
|---|---|
| **Catalog** | Subjects, topics, concepts hierarchy CRUD (admin); read APIs for apps |
| **Content items** | 22 question types via Type Handler Protocol; multi-part items; status (`draft / submitted / in_moderation / accepted / revise / rejected`) |
| **Blueprints + PYQs** | Per ADR-0012; PYQ ingestion + year/section metadata |
| **Adaptive engine** | 9-dim substrate update per response; heuristic v1 (per-concept IRT activates at 30+ items/concept) |
| **Type Handlers + Resolution contract** | Per ADR-0018 — the contract is load-bearing |
| **AI Gateway** | Provider-agnostic (Anthropic / OpenAI / Google / Llama). 5 touchpoints. Cohen's kappa auto-pause < 0.7 |
| **Screening** | 12-item blueprint Phase 1 |
| **Spaced repetition** | SM-2 + EWA per ADR-0014 |
| **Error patterns** | Classifier per ADR-0016 |
| **Rank prediction** | Per ADR-0015 (Phase 2) |
| **Recommendation** | Per ADR-0011 (content embeddings) |
| **Today's Mission** | Per ADR-0024 |
| **Difficulty agency** | Per ADR-0022 (user can choose easier/harder) |
| **Constrained plan co-edit** | Per ADR-0023 |
| **Localisation** | en/hi launch; multi-language Phase 3 via translation touchpoint |
| **Analytics** | Readiness, weak areas, accuracy trends, time-per-question per ADR-0013 |
| **Authoring API** | For web-portal expert authoring |
| **Moderation API** | For web-admin moderator queue + kappa drift |
| **User learning profile** | Exam, grade, mastery state, screening result |
| **Institution context (Phase 2)** | Batch dashboards (read-only for institution admins/teachers) |

### 2.2 Out of Scope

| Item | Lives In |
|---|---|
| Quiz session orchestration | quiz |
| Battle session | battle |
| Auth, RBAC | identity |
| Billing | payment |
| Marketplace, tutor profiles, bookings | marketplace |
| Notifications, community | engagement |

### 2.3 Scope by Phase

| Phase | learning ships |
|---|---|
| **Phase 1 (M0–M6)** | Catalog · 5–8 question type handlers (most common) · Blueprint + PYQ · Adaptive engine heuristic v1 · Resolution contract · Screening · Recommendation v1 · Today's Mission · Authoring API (basic) · Moderation API · Analytics v1 (readiness + weak areas + accuracy) |
| **Phase 2 (M6–M12)** | Remaining 14 question type handlers · AI Gateway (all 5 touchpoints) · SM-2 + EWA spaced rep · Error-pattern classifier · Rank prediction · Difficulty agency · Constrained plan · Localisation (en+hi) · Institution batch dashboards · Time-per-question analytics |
| **Phase 3+** | Per-concept IRT activated · 6 gated stub types · Vision + camera scan · Multi-language ≥ 5 · Advanced recommendation |

---

## 3. Stakeholders

| Stakeholder | Role | Decision Authority |
|---|---|---|
| **Backend Lead** | Tech owner | Architecture |
| **ML Lead** | Adaptive engine + recommendation owner | Algorithm decisions |
| **Content Lead** | Editorial standards | Item structure + Bloom |
| **Product Owner** | Functional scope | AC approval |
| **Compliance** | AI Gateway content safety | Sign-off |
| **Consuming squads** | quiz, web-portal, web-admin, web-student, mobile, marketplace | API contract review |

## 4. Personas (Service View)

- **Caller persona 1: quiz** — needs items by blueprint, resolution per response.
- **Caller persona 2: web-student / mobile** — needs catalog browse, content, analytics, recommendations.
- **Caller persona 3: web-portal** — needs authoring API, AI Draft, status tracking.
- **Caller persona 4: web-admin** — needs moderation queue, kappa drift, AI Gateway control.
- **Caller persona 5: battle** — needs items by topic+difficulty.

## 5. Top Internal Journeys

| # | Journey | Triggered by |
|---|---------|--------------|
| 1 | Resolve a response (Type Handler) | quiz on every answer |
| 2 | Update mastery (adaptive engine) | quiz on every answer |
| 3 | Compute readiness score | web-student/mobile on home + post-quiz |
| 4 | Recommend Today's Mission | web-student/mobile on home |
| 5 | Author submits item | web-portal |
| 6 | AI Gateway authoring draft | web-portal |
| 7 | Moderator approves/rejects | web-admin |
| 8 | Translation request | localisation pipeline |
| 9 | Screening session | onboarding |
| 10 | Spaced-rep due items | revision mode in apps |

## 6. Functional Areas

| Area | Description |
|------|-------------|
| FA-01 Catalog | Subject/Topic/Concept tree CRUD + read APIs |
| FA-02 Content Items + Type Handlers | 22 types via Type Handler Protocol; resolution contract |
| FA-03 Blueprints + PYQs | Blueprint CRUD; PYQ ingestion |
| FA-04 Adaptive Engine | 9-dim substrate update per response |
| FA-05 Screening | 12-item blueprint Phase 1; Bayesian Phase 2+ |
| FA-06 Spaced Repetition | SM-2 + EWA; due queue |
| FA-07 Error Patterns | Classifier per ADR-0016 |
| FA-08 Recommendation + Today's Mission | Content-based embeddings; mission selector |
| FA-09 Rank Prediction | ADR-0015 (Phase 2) |
| FA-10 AI Gateway | 5 touchpoints, provider routing, kappa monitor, auto-pause |
| FA-11 Localisation | Translation pipeline; language config |
| FA-12 Analytics | Readiness, weak areas, trends, time-per-Q |
| FA-13 Authoring API | For web-portal |
| FA-14 Moderation API | For web-admin |
| FA-15 User Learning Profile | Exam, grade, screening result, mastery snapshots |
| FA-16 Institution Context | Batch read-only (Phase 2) |
| FA-XC | Cross-cutting (health/ready, OTel, OpenAPI, migrations) |

---

## 7. Non-Functional Requirements

| ID | Category | Requirement | Target |
|----|----------|-------------|--------|
| NFR-LR-01 | Perf | Recommendation (Today's Mission) | p95 < 100 ms |
| NFR-LR-02 | Perf | Readiness compute (on-demand) | p95 < 500 ms |
| NFR-LR-03 | Perf | Type Handler resolution | p95 < 50 ms (deterministic types) |
| NFR-LR-04 | Perf | AI Gateway call (best-of provider) | p95 < 8 s |
| NFR-LR-05 | Perf | Catalog read | p95 < 100 ms (Redis cached) |
| NFR-LR-06 | Perf | Screening item delivery | p95 < 150 ms |
| NFR-LR-07 | Avail | learning service uptime | 99.9% |
| NFR-LR-08 | Avail | AI Gateway graceful degradation | Provider failover within 5 s |
| NFR-LR-09 | Quality | Cohen's kappa per criterion threshold | ≥ 0.7 — auto-pause below |
| NFR-LR-10 | Quality | Item review SLA (moderation) | 24 hr P95 |
| NFR-LR-11 | Cost | LLM cost per published item | < ₹0.20 average (Phase 2 target) |
| NFR-LR-12 | Cost | Per-tenant LLM budget caps | enforced; degrade gracefully when hit |
| NFR-LR-13 | Cost | Embedding refresh cadence | daily for new items; weekly full re-embed |
| NFR-LR-14 | Security | Provider API keys | KMS-encrypted; never logged |
| NFR-LR-15 | Security | PII redaction | scrub before sending to LLM providers |
| NFR-LR-16 | Compliance | Translation auto-publish floor | Per-criterion kappa ≥ 0.75; else human review |
| NFR-LR-17 | Reliability | Idempotency on author + AI Gateway endpoints | required |
| NFR-LR-18 | Reliability | Resolution contract | Never returns marks |
| NFR-LR-19 | Observability | Per-touchpoint kappa metrics | dashboards live |
| NFR-LR-20 | Observability | OTel tracing on critical paths | required |
| NFR-LR-21 | Scalability | Concurrent recommendation calls | 1000 RPS |
| NFR-LR-22 | Scalability | Authoring concurrent | 500 active authors |
| NFR-LR-23 | Migration | Alembic up/down | required |
| NFR-LR-24 | API | OpenAPI 3.1 | required |
| NFR-LR-25 | Backward compat | Type Handler Protocol version | semver; new types additive |

---

## 8. Constraints & Assumptions

### 8.1 Constraints

- **C-LR-01** **Resolution contract is the strict boundary** (per ADR-0018): learning emits `{ status, matched_count, total_count, per_part, evaluation_mode, evaluator_metadata }` — never marks. Quiz/Test orchestration computes marks.
- **C-LR-02** Per ADR-0019, AI Gateway is a module **inside** learning — not a separate service.
- **C-LR-03** Per ADR-0017, per-concept IRT is gated until item bank ≥ 30/concept; Phase 1 uses heuristic substitutes.
- **C-LR-04** Per ADR-0019, Cohen's kappa < 0.7 auto-pauses AI Gateway for that criterion.
- **C-LR-05** AI Gateway must support 4 providers (Anthropic / OpenAI / Google / Llama) with failover.
- **C-LR-06** PII never sent to LLM providers (redaction layer).
- **C-LR-07** Item content + answers stored in `content_schema`, never duplicated in quiz schema.
- **C-LR-08** Authoring submissions go through moderation queue before student exposure.
- **C-LR-09** Migrations append-only.

### 8.2 Assumptions

- **A-LR-01** Provider API contracts for Anthropic / OpenAI / Google secured.
- **A-LR-02** Initial content seed (1000 NEET / 1000 JEE / 500 UPSC items) provided by content team M-2.
- **A-LR-03** OpenSearch cluster provisioned for content search.
- **A-LR-04** Redis cluster for catalog cache + embedding cache.
- **A-LR-05** S3 + CloudFront for media.

## 9. Dependencies

| ID | Depends on | For |
|----|-----------|-----|
| D-LR-01 | identity (JWT validate) | All authenticated endpoints |
| D-LR-02 | Aurora Postgres | Primary store |
| D-LR-03 | Redis | Cache + hot paths |
| D-LR-04 | OpenSearch | Content + author search |
| D-LR-05 | S3 + CloudFront | Media |
| D-LR-06 | LLM provider APIs (Anthropic / OpenAI / Google / Llama) | AI Gateway |
| D-LR-07 | Embedding model API (OpenAI text-embedding-3 or local) | Recommendation |
| D-LR-08 | engagement (notifications) | Mod outcome notif |
| D-LR-09 | quiz (resolution caller) | Type Handler integration test |

## 10. Risks

| ID | Risk | L | I | Mitigation |
|----|------|---|---|------------|
| R-LR-01 | LLM provider outage degrades AI features | Med | High | Multi-provider failover (ADR-0019); cached/heuristic fallback |
| R-LR-02 | Kappa drift → mass mis-evaluation | Med | High | Per ADR-0019 auto-pause + alert |
| R-LR-03 | LLM cost overrun | Med | Med | Per-tenant + per-touchpoint hard caps |
| R-LR-04 | Resolution contract leak (mark returned) | Med | Critical | Contract enforced at API boundary + tests |
| R-LR-05 | Adaptive engine under-performs vs random | Med | High | A/B test against random baseline cohort |
| R-LR-06 | PII sent to LLM accidentally | Low | High | Redaction layer + tests |
| R-LR-07 | Concept tree corruption | Low | High | Daily snapshot + restore drill |
| R-LR-08 | Item authoring backlog jams moderation queue | High | Med | Capacity dashboard + burst-mode |

## 11. Success Criteria

learning Phase 1 is **Done** when:

1. All P0 FRs shipped
2. NFR-LR-* verified
3. 5 question type handlers implemented + integration-tested with quiz
4. Resolution contract test (returning marks → fail) green
5. Catalog seed (M-2 content) loaded + indexed
6. Adaptive engine heuristic v1 producing readiness scores within target SLA
7. Recommendation v1 surfacing Today's Mission
8. Authoring + moderation APIs integrated with web-portal + web-admin
9. AI Gateway scaffolding ready (one touchpoint live; rest Phase 2)
10. Cost telemetry live

## 12. Open Questions

| # | Question | Owner | Resolve By |
|---|----------|-------|------------|
| OQ-LR-01 | Embedding model — OpenAI text-embedding-3 vs Cohere vs local | ML Lead | Phase 1 Week 2 |
| OQ-LR-02 | Per-concept IRT activation threshold validation (≥ 30 items? ≥ 50?) | ML Lead | Phase 2 Week 4 |
| OQ-LR-03 | AI cost cap enforcement: hard-stop vs degrade-to-cheaper-model | Product + Eng | Phase 2 Week 1 |
| OQ-LR-04 | Translation auto-publish quality threshold (kappa floor) | Compliance + ML | Phase 3 Week 1 |
| OQ-LR-05 | Bloom-depth tagging: AI-assisted vs manual only | Content + ML | Phase 2 Week 2 |
| OQ-LR-06 | Adaptive baseline cohort (A/B against random) | ML + Product | Phase 1 Week 4 |
| OQ-LR-07 | Recommendation latency budget — local cache vs live model | ML + DevOps | Phase 1 Week 6 |
| OQ-LR-08 | Content schema cross-references PYQs — link or embed | Backend + Content | Phase 1 Week 3 |
| OQ-LR-09 | Localisation: machine + human review vs MT only | Compliance | Phase 3 Week 2 |
| OQ-LR-10 | Vision OCR provider Phase 3 (Anthropic, OpenAI, Google Cloud Vision) | ML + Compliance | Phase 3 Week 1 |

## 13. Sign-Off

| Role | Name | Date | Status |
|------|------|------|--------|
| Backend Lead | _Pending_ | | |
| ML Lead | _Pending_ | | |
| Content Lead | _Pending_ | | |
| Compliance | _Pending_ | | |
| QA Lead | _Pending_ | | |
