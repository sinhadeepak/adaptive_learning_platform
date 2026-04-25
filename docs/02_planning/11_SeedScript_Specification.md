# Seed Script Specification (GAP-09)

**Status**: Specification — implementation is a Sprint 1 deliverable.
**Owner (spec)**: QA Lead.
**Owner (impl)**: QA Lead + BE Lead Python (Institution) + DevOps Lead.
**Gate**: this specification must be signed off by QA Lead before Sprint 1 kick-off per [GAP-24 row 6](09_SprintOne_StartGateSheet.md).

---

## 1. Purpose

Provide a repeatable, idempotent way to populate a fresh staging environment (or a developer's local Docker Compose stack) with enough data to:

- Exercise every P0 user flow end-to-end without manual data entry.
- Run load tests against realistic data volumes.
- Support contract tests in CI that need stable known-good fixtures.
- Give the closed-beta programme (Sprint 1 Wk 2, ~20 internal users) a usable catalog on Day 1.

Explicitly out of scope: production seeding (production data comes from real users + content pipeline), destructive operations against non-ephemeral environments, and PII generation that could be mistaken for real student data.

---

## 2. Execution contexts

| Context | Invocation | Frequency | Reset policy |
|---|---|---|---|
| Local dev (Docker Compose) | `make dev-seed` | On demand | Wipes + reseeds |
| Staging EKS | `kubectl exec` into a one-off Job pod, or `scripts/seed_staging.py --env=staging` from a DevOps laptop with SSO | Nightly at 02:00 IST via CronJob | **Upserts only**, never wipes (beta users' data must survive) |
| CI contract tests | GitHub Actions job `contract-tests` invokes `scripts/seed_staging.py --env=ci --profile=minimal` against the ephemeral Compose stack | Every PR | Wipes + reseeds |

A single entry point (`scripts/seed_staging.py`) with `--env` and `--profile` flags. No separate scripts per environment — divergence is the root cause this specification prevents.

---

## 3. Data profiles

Three named profiles. The script selects one via `--profile`.

### 3.1 `minimal` (CI contract tests)

Smallest data set that lets every endpoint return a non-empty, deterministic response.

- 1 tenant (`tenant_ci`).
- 2 users: one student, one teacher. Deterministic UUIDs.
- 1 exam (NEET), 2 subjects (Physics, Chemistry), 3 topics per subject.
- 6 MCQs, 2 per topic, one easy + one hard. All approved, all published.
- 1 feature flag: `irt_model_enabled=false` (global default).
- 0 quiz sessions, 0 payments, 0 notifications.

Target runtime: < 5s.

### 3.2 `beta` (staging, closed-beta cohort)

Mirrors the closed-beta programme shape described in the Release Plan.

- 3 tenants (`internal`, `pilot_school_A`, `pilot_school_B`).
- 25 users: 20 students, 3 teachers, 1 moderator, 1 admin. Emails `@adaptivelearn.in` only.
- 4 exams (NEET, JEE, UPSC, CBSE-12), all four at full subject/topic breadth per the Catalog LLD.
- 250 MCQs — 60 per exam for NEET/JEE, 80 for UPSC, 50 for CBSE. Mix of approved/pending to exercise moderation queue.
- Feature flags: all 7 GAP-16 flags defined with safe defaults (see §7 below).
- 0 active subscriptions (payments are Sprint 3).
- 0 pre-existing quiz sessions.

Target runtime: < 60s.

### 3.3 `load` (staging, pre-load-test)

Scaled for LT-SEARCH-03 and LT-PIPELINE-01 (per [Gap Register v1.2](../06_gaps_resolution/GapResolutionRegister_v1.2_AdaptiveLearningPlatform.docx) GAP-14 and GAP-31).

- 20 tenants.
- 10,000 synthetic users (no real PII; names from a deterministic Faker seed).
- 4 exams, full breadth.
- 50,000 MCQs across all exams, English + Hindi (for SPIKE-02 Hindi analyzer tests).
- 500 historical quiz sessions per exam, with realistic response patterns for EWA mastery validation.

Target runtime: < 10 minutes. Acceptable to run once per week, not nightly.

---

## 4. Idempotency and determinism

**Hard requirements:**

1. Running the script twice in a row with the same `--profile` and the same environment state must produce the same final state. No duplicate rows, no version drift.
2. Every row seeded has a **deterministic UUID** derived from `uuid5(SEED_NAMESPACE, f"{profile}:{entity_type}:{logical_key}")`. The namespace UUID is a fixed constant committed to the repo.
3. `INSERT ... ON CONFLICT (id) DO UPDATE` semantics across every table. The script never issues a bare `INSERT`.
4. The script does not rely on auto-increment IDs for anything externally referenced.

**Soft requirements:**

5. Seeded data timestamps use a fixed epoch base (`2026-01-01T00:00:00Z`) plus logical offsets. Real-clock seeding is forbidden — it makes test oracles non-reproducible.
6. Randomised fields (Faker names, quiz answer patterns) use a fixed seed per profile. Same profile → same Faker output every run.

---

## 5. Wipe vs upsert modes

- `--profile=minimal` and `--profile=load`: **wipe-then-seed**. Every table within scope is TRUNCATEd (except Postgres system tables and migration history) before seeding. Wipe scope is the Institution + Content + Catalog + Search + Analytics + Quiz + Auth + UserProfile + Notification schemas.
- `--profile=beta` in staging: **upsert-only**. Never wipe. If a beta user has taken a quiz, that session persists.
- `--env=prod` is **rejected** unconditionally. The script checks `os.environ["ENV"]` and refuses to run if the value is `prod` or unset. This is a hardcoded guard, not a flag — no way to override without editing the source.

---

## 6. CLI contract

```
scripts/seed_staging.py [-h]
  --env {local,ci,staging}          required
  --profile {minimal,beta,load}     required
  [--dry-run]                        plan only; no writes
  [--verify]                         after seed, run assertions and exit non-zero if any fail
  [--report FILE]                    write a JSON summary to FILE
  [--only TABLE[,TABLE...]]          seed only a subset (for incremental dev)
  [--skip TABLE[,TABLE...]]          inverse of --only
```

Exit codes:
- `0` — seeded successfully and (if `--verify`) assertions passed.
- `1` — transient DB error. Retryable.
- `2` — hard guard violation (e.g. `ENV=prod`). Not retryable.
- `3` — `--verify` assertion failure. Data seeded but not matching spec.

---

## 7. Feature-flag seed set (GAP-16 linkage)

The `beta` and `load` profiles seed the following flag definitions. This is the authoritative list for Sprint 1 GAP-16 PRs.

| Flag name | Default | Service that reads it | Purpose |
|---|---|---|---|
| `irt_model_enabled` | `false` | Adaptive Engine | Allows fallback to binary-search cold-start if SPIKE-01 fails |
| `push_channel_enabled` | `true` | Notification | Kill switch for FCM + APNs |
| `sms_channel_enabled` | `true` | Notification | Kill switch for Twilio SMS |
| `email_channel_enabled` | `true` | Notification | Kill switch for SendGrid (never expected to disable; provided for symmetry and drills) |
| `checkout_enabled` | `false` | Payment | Master switch for Stripe checkout (Sprint 3 only) |
| `premium_tier_enforcement` | `false` | Auth / Catalog | Whether premium-only content returns 402 for free users (Sprint 4 pre-launch toggle) |
| `assignments_enabled` | `false` | Institution | Teacher assignment feature (Sprint 3) |

Sprint 1 seeds these definitions at `default_value` only. Per-tenant overrides are seeded empty. The Sprint 3 Super Admin UI allows overrides from the panel (see [ADR-0001](../adr/0001-feature-flag-platform.md)).

---

## 8. Verification assertions (`--verify` mode)

After seeding, the script runs the following assertions and exits non-zero if any fail. This is the "the seed worked" contract the nightly CronJob watches.

1. Row count per table matches the profile's expected count within ±0 (exact match).
2. Every user has a `tenant_id` that resolves to a seeded tenant.
3. Every MCQ has a `topic_id` that resolves to a seeded topic.
4. Every feature flag named in §7 exists with the specified default.
5. No row has `created_at` later than `2026-01-01T00:00:00Z` + 90 days (catches accidental real-clock writes).
6. OpenSearch `questions_en` index document count equals the DB MCQ count.

---

## 9. Operational integration

- **Nightly CronJob** runs the `beta` profile in staging at 02:00 IST. Success/failure is a Grafana alert; failure pages the DevOps on-call.
- **Makefile target** `make dev-seed` is a thin wrapper around `scripts/seed_staging.py --env=local --profile=minimal --verify`.
- **CI job** `contract-tests` invokes `--profile=minimal --verify` against the PR's ephemeral Compose stack before running contract tests.
- **Load test prep** is a manual one-liner run by DevOps Lead: `scripts/seed_staging.py --env=staging --profile=load --verify`.

---

## 10. Out of scope (explicit)

- Seeding realistic user-authored content (that comes from the Content service's authoring flow in Sprint 2).
- Simulating real-time NATS event streams (load tests use dedicated k6 producers, not the seed script).
- Seeding Stripe test-mode subscriptions (handled by Payment service's own fixtures in Sprint 3).
- Seeding OpenSearch Hindi index (Sprint 2 work, depends on SPIKE-02 analyzer decision).

---

## 11. Sign-off

| Role | Name | Signature / Slack ack | Date |
|---|---|---|---|
| QA Lead | _______________________ | _______________________ | _________ |
| BE Lead Python (Institution) | _______________________ | _______________________ | _________ |
| DevOps Lead | _______________________ | _______________________ | _________ |

Specification is considered signed off when QA Lead signature is recorded — the other two are implementation collaborators, not gate signatories.
