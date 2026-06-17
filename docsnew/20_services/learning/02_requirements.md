# Requirements Catalogue — learning (service)

**Anchored to:** [BRD §6](./01_brd.md#6-functional-areas) · [Master BRD §5.2.2](../../00_platform/02_master_brd/master_brd.md#522-learning)

---

## FA-01 — Catalog

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-LR-01-01 | CRUD Subject (admin) | P0 | 1 |
| FR-LR-01-02 | CRUD Topic (admin) | P0 | 1 |
| FR-LR-01-03 | CRUD Concept (admin) | P0 | 1 |
| FR-LR-01-04 | GET catalog tree (cached, etag) | P0 | 1 |
| FR-LR-01-05 | Versioned syllabus changes (effective_from date) | P1 | 2 |
| FR-LR-01-06 | Map syllabus → exam (NEET/JEE/UPSC/CBSE-N) | P0 | 1 |
| FR-LR-01-07 | OpenSearch index on catalog | P1 | 1 |
| FR-LR-01-08 | CBSE class 8 + 9 split per ADR-0025 | P1 | 1 |

## FA-02 — Content Items + Type Handlers

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-LR-02-01 | Implement Type Handler Protocol (Python ABC + Pydantic schemas) | P0 | 1 |
| FR-LR-02-02 | Type Handler — MCQ-single (1 of N) | P0 | 1 |
| FR-LR-02-03 | Type Handler — MCQ-multiple | P0 | 1 |
| FR-LR-02-04 | Type Handler — Numeric (with tolerance) | P0 | 1 |
| FR-LR-02-05 | Type Handler — Fill-in-the-blank | P0 | 1 |
| FR-LR-02-06 | Type Handler — Match-the-following | P0 | 1 |
| FR-LR-02-07 | Type Handlers — remaining 17 types | P1 | 2 |
| FR-LR-02-08 | Gated stub types (6) per ADR-0018 | P2 | 3 |
| FR-LR-02-09 | Resolution contract enforced at boundary (test asserts no `marks` field) | P0 | 1 |
| FR-LR-02-10 | Per-part resolution for multi-part items | P0 | 1 |
| FR-LR-02-11 | Evaluation modes: deterministic / AI-assisted / hybrid / human | P0 | 1 (deterministic) / 2 (rest) |
| FR-LR-02-12 | Item status FSM: draft → submitted → in_moderation → accepted/revise/rejected | P0 | 1 |
| FR-LR-02-13 | Item authoring: shared editor schema for web-portal | P0 | 1 |
| FR-LR-02-14 | Item Bloom level + difficulty tagging | P0 | 1 |
| FR-LR-02-15 | Item concept refs (1..N concepts) | P0 | 1 |

## FA-03 — Blueprints + PYQs

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-LR-03-01 | Blueprint CRUD per ADR-0012 | P0 | 1 |
| FR-LR-03-02 | Blueprint sections + difficulty distribution + topic weights | P0 | 1 |
| FR-LR-03-03 | Blueprint validate (sum of weights = 1) | P0 | 1 |
| FR-LR-03-04 | PYQ ingestion (CSV or JSON) | P0 | 1 |
| FR-LR-03-05 | PYQ metadata: exam, year, paper, section | P0 | 1 |
| FR-LR-03-06 | PYQ → blueprint linking (optional) | P1 | 1 |
| FR-LR-03-07 | Blueprint instance assembly (return ordered items for a session) | P0 | 1 |

## FA-04 — Adaptive Engine

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-LR-04-01 | 9-dim substrate per ADR-0017 (mastery × Bloom × fluency × accuracy × retention × confidence × transfer × procedural × strategic) | P0 | 1 |
| FR-LR-04-02 | Update concept state on every response | P0 | 1 |
| FR-LR-04-03 | Heuristic estimator Phase 1 (no per-concept IRT until threshold) | P0 | 1 |
| FR-LR-04-04 | Snapshot mastery state daily for trend | P1 | 1 |
| FR-LR-04-05 | Difficulty agency per ADR-0022 — user override | P1 | 2 |
| FR-LR-04-06 | Per-concept IRT (Phase 2 — gated by item bank size per ADR-0017) | P2 | 2/3 |
| FR-LR-04-07 | Concept transfer model (across related concepts) | P2 | 3 |

## FA-05 — Screening

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-LR-05-01 | 12-item adaptive blueprint Phase 1 (fixed sequence) | P0 | 1 |
| FR-LR-05-02 | θ heuristic: `(score − 0.5) × 3` per subject | P0 | 1 |
| FR-LR-05-03 | Return subject-level labels ("Foundational" / "Building" / "Strong") | P0 | 1 |
| FR-LR-05-04 | Persist `screening_result` on user learning profile | P0 | 1 |
| FR-LR-05-05 | Resume mid-session | P0 | 1 |
| FR-LR-05-06 | Bayesian θ (Phase 2+) per ADR-0017 — gated | P2 | 2/3 |

## FA-06 — Spaced Repetition

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-LR-06-01 | SM-2 scheduling per ADR-0014 | P1 | 2 |
| FR-LR-06-02 | EWA blend factor | P1 | 2 |
| FR-LR-06-03 | Due queue API for revision mode | P1 | 2 |
| FR-LR-06-04 | Forgetting curve telemetry | P2 | 2 |

## FA-07 — Error Patterns

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-LR-07-01 | Classifier per ADR-0016 | P1 | 2 |
| FR-LR-07-02 | Pattern aggregation per user | P1 | 2 |
| FR-LR-07-03 | Surface common patterns in analytics | P1 | 2 |

## FA-08 — Recommendation + Today's Mission

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-LR-08-01 | Content-based embeddings per ADR-0011 | P0 | 1 |
| FR-LR-08-02 | Embedding refresh daily (new items) | P0 | 1 |
| FR-LR-08-03 | Today's Mission per ADR-0024 — single CTA | P0 | 1 |
| FR-LR-08-04 | Mission selector: weak-area-bias + variety + recent-success | P0 | 1 |
| FR-LR-08-05 | Recommendation explainability (which signals) | P1 | 2 |
| FR-LR-08-06 | Cold-start strategy for new users | P0 | 1 |

## FA-09 — Rank Prediction

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-LR-09-01 | Calibrated rank prediction per ADR-0015 | P2 | 2 |
| FR-LR-09-02 | Confidence interval shown | P2 | 2 |
| FR-LR-09-03 | Per-exam model (NEET / JEE / UPSC) | P2 | 2 |

## FA-10 — AI Gateway

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-LR-10-01 | Provider abstraction (Anthropic / OpenAI / Google / Llama) | P0 | 1 |
| FR-LR-10-02 | Touchpoint: authoring | P1 | 2 |
| FR-LR-10-03 | Touchpoint: quality_check | P1 | 2 |
| FR-LR-10-04 | Touchpoint: evaluation (AI-assisted item grading) | P1 | 2 |
| FR-LR-10-05 | Touchpoint: translation | P2 | 3 |
| FR-LR-10-06 | Touchpoint: vision (camera scan) | P2 | 3 |
| FR-LR-10-07 | Per-touchpoint kappa monitoring | P0 | 1 |
| FR-LR-10-08 | Auto-pause when kappa < 0.7 | P0 | 1 |
| FR-LR-10-09 | Provider failover within 5 s | P0 | 1 |
| FR-LR-10-10 | Per-tenant + per-touchpoint cost caps | P0 | 1 |
| FR-LR-10-11 | PII redaction layer before LLM call | P0 | 1 |
| FR-LR-10-12 | Call log retention | P1 | 1 |
| FR-LR-10-13 | Admin override of auto-pause | P0 | 1 |

## FA-11 — Localisation

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-LR-11-01 | en + hi at launch | P0 | 1 |
| FR-LR-11-02 | Translation touchpoint of AI Gateway | P2 | 3 |
| FR-LR-11-03 | Translation quality gate (kappa) | P2 | 3 |
| FR-LR-11-04 | Per-locale content publication | P2 | 3 |
| FR-LR-11-05 | 5+ languages by Phase 3 | P2 | 3 |

## FA-12 — Analytics

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-LR-12-01 | Readiness score (0–100, confidence band) | P0 | 1 |
| FR-LR-12-02 | Recompute on response or on-demand | P0 | 1 |
| FR-LR-12-03 | Weak-areas list ranked by impact-on-readiness | P0 | 1 |
| FR-LR-12-04 | Accuracy trends (subject + overall) | P0 | 1 |
| FR-LR-12-05 | Time-per-question per ADR-0013 | P1 | 2 |
| FR-LR-12-06 | Cohort percentile (Phase 2) | P2 | 2 |
| FR-LR-12-07 | Daily snapshot for trend lines | P1 | 1 |

## FA-13 — Authoring API

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-LR-13-01 | Save draft | P0 | 1 |
| FR-LR-13-02 | Submit for moderation | P0 | 1 |
| FR-LR-13-03 | Bulk CSV ingest | P0 | 1 |
| FR-LR-13-04 | AI Draft (calls AI Gateway authoring) | P1 | 2 |
| FR-LR-13-05 | Status updates emitted as events | P0 | 1 |

## FA-14 — Moderation API

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-LR-14-01 | Take next item from queue (lock) | P0 | 1 |
| FR-LR-14-02 | Approve | P0 | 1 |
| FR-LR-14-03 | Reject with reason | P0 | 1 |
| FR-LR-14-04 | Request revision | P0 | 1 |
| FR-LR-14-05 | Kappa per criterion | P1 | 2 |
| FR-LR-14-06 | Re-assign | P1 | 2 |

## FA-15 — User Learning Profile

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-LR-15-01 | Profile: exam, grade, locale, screening_result | P0 | 1 |
| FR-LR-15-02 | Mastery snapshot reference | P0 | 1 |
| FR-LR-15-03 | Change exam → re-screen | P0 | 1 |

## FA-16 — Institution Context (Phase 2)

| ID | Requirement | P | Phase |
|----|-------------|---|-------|
| FR-LR-16-01 | Cohort definition | P1 | 2 |
| FR-LR-16-02 | Batch dashboard (read-only for teachers/admins) | P1 | 2 |
| FR-LR-16-03 | Drill into student (within own cohort RBAC) | P1 | 2 |
| FR-LR-16-04 | CSV export | P2 | 2 |

## Cross-Cutting

Standard cross-cutting (health, OTel, idempotency, OpenAPI, versioning, no cross-schema FK, migrations always reversible). 12 FRs.
