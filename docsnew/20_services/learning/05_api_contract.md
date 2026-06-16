# API Contract — learning (service)

**Base URL:** `https://api.vidya.example/v1/learning`
**Auth:** Bearer JWT (validated via shared lib); admin endpoints require admin role + re-auth.
**Idempotency:** Required on mutating endpoints (`Idempotency-Key` header).

---

## Catalog

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/catalog/tree?exam={exam}&etag={cur}` | user | Subject→Topic→Concept tree (Redis-cached) |
| GET | `/catalog/subjects/{id}` | user | Subject detail |
| GET | `/catalog/topics/{id}` | user | Topic detail |
| GET | `/catalog/concepts/{id}` | user | Concept detail incl mastery (if `?me=true`) |
| POST | `/admin/catalog/subjects` | admin | Create subject |
| PATCH | `/admin/catalog/subjects/{id}` | admin | Edit subject |
| POST | `/admin/catalog/topics` | admin | Create topic |
| POST | `/admin/catalog/concepts` | admin | Create concept |

## Content Items + Type Handlers

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/types/registry` | any | List all registered question types + protocol version |
| GET | `/items/{id}?for=author\|student\|moderator` | user | Get item in role-appropriate shape |
| POST | `/items/draft` | expert | Save draft |
| POST | `/items/{id}/submit` | expert | Submit for moderation |
| POST | `/items/{id}/resolve` | s2s (quiz/battle) | **Resolve answer → Resolution contract** |
| POST | `/items/{id}/flag` | user | Report problem |
| POST | `/admin/items/{id}/moderate` | moderator | Approve/reject/revise |

### `POST /items/{id}/resolve`
**Critical endpoint.** Returns the resolution contract.

**Body:** `{ user_input, session_ctx: { user_id, mode, blueprint_id?, item_seq? } }`

**200 Resolution:**
```json
{
  "status": "correct | partial | incorrect | no_answer | evaluation_pending",
  "matched_count": 0,
  "total_count": 1,
  "per_part": [{ "part_id": "...", "status": "...", "matched": false }],
  "evaluation_mode": "deterministic | ai_assisted | hybrid | human",
  "evaluator_metadata": { "type_id": "mcq_single", "version": "1.0" }
}
```

**Contract:** Response MUST NOT contain `marks`, `score`, `points`, or any per-item scoring value. Marks are computed by `quiz` from the resolution + blueprint scoring profile.

## Blueprints + PYQs

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/blueprints/{id}` | s2s | Blueprint spec (sections, weights, distribution) |
| POST | `/admin/blueprints` | admin | Create blueprint |
| PATCH | `/admin/blueprints/{id}` | admin | Edit |
| POST | `/admin/blueprints/{id}/validate` | admin | Validate weight sums + completeness |
| POST | `/blueprints/{id}/instance` | s2s | Assemble ordered items for a session |
| POST | `/admin/pyqs/ingest` | admin | Upload CSV/JSON PYQ batch |
| GET | `/pyqs?exam={exam}&year={year}` | user | List PYQs |

## Adaptive Engine

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/adaptive/state?concept_id={id}&user_id=me` | user | Concept mastery vector (9-dim) |
| POST | `/adaptive/internal/update` | s2s | Triggered by resolve (internal) |
| GET | `/adaptive/snapshots?from={date}` | user | Trend |

## Screening

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/screening/start` | user | Start screening (returns first item) |
| POST | `/screening/answer` | user | Submit answer + get next |
| POST | `/screening/finalize` | user | Compute result |
| GET | `/screening/sessions/{id}/resume` | user | Resume |

## Recommendation + Today's Mission

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/recommendations/today` | user | Today's Mission CTA |
| GET | `/recommendations/topics?n=3` | user | Top weak topics |
| GET | `/recommendations/items?topic_id={id}&n=10` | user | Adaptive item set |

## Spaced Repetition

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/sm2/due?n=30` | user | Due items |
| POST | `/sm2/internal/grade` | s2s | After quiz, update SM-2 state |

## Error Patterns

| GET | `/errors/patterns?user_id=me` | user | Patterns surfaced |

## Rank Prediction

| GET | `/rank/predict?exam={exam}` | premium user | Calibrated rank + CI |

## AI Gateway

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/ai/authoring/draft` | expert | Generate item draft (touchpoint: authoring) |
| POST | `/ai/quality-check` | s2s | Quality screen (touchpoint: quality_check) |
| POST | `/ai/evaluate` | s2s | AI-assisted evaluation (touchpoint: evaluation) |
| POST | `/ai/translate` | s2s | Translate content (touchpoint: translation) |
| POST | `/ai/vision/scan` | user (Phase 3) | Camera scan question |
| GET | `/admin/ai/status` | admin | Per-touchpoint × provider status |
| POST | `/admin/ai/pause/{touchpoint}` | admin | Manually pause |
| POST | `/admin/ai/resume/{touchpoint}` | admin | Resume (overrides auto-pause) |
| GET | `/admin/ai/kappa` | admin | Drift metrics |
| POST | `/admin/ai/cost-cap` | admin | Set per-tenant/touchpoint cap |

## Localisation

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/locales` | any | Supported locales |
| GET | `/items/{id}?locale={loc}` | user | Localized item |
| POST | `/admin/localisation/translate-batch` | admin | Trigger translation |

## Analytics

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/analytics/readiness?user_id=me` | user | 0–100 + confidence band |
| GET | `/analytics/weak-areas?n=3` | user | Top weak topics with impact |
| GET | `/analytics/accuracy-trend?range=30d` | user | Trend lines |
| GET | `/analytics/time-per-question?range=30d` | user | Time analytics |
| GET | `/analytics/cohort-percentile` | premium | Percentile |

## Authoring (for web-portal)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/authoring/items/draft` | expert | Save draft |
| POST | `/authoring/items/{id}/submit` | expert | Submit |
| POST | `/authoring/items/{id}/withdraw` | expert | Withdraw |
| POST | `/authoring/bulk/template?type={t}` | expert | Download CSV template |
| POST | `/authoring/bulk/validate` | expert | Validate CSV (dryrun) |
| POST | `/authoring/bulk/commit` | expert | Commit ingest |
| GET | `/authoring/bulk/{batch_id}` | expert | Batch status |
| GET | `/authoring/me/quality` | expert | My acceptance/revision rates |

## Moderation (for web-admin)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/moderation/next-item?type={t}` | moderator | Take next (acquires lock) |
| POST | `/moderation/items/{id}/approve` | moderator | Approve |
| POST | `/moderation/items/{id}/reject` | moderator | Reject + reason |
| POST | `/moderation/items/{id}/revise` | moderator | Request revision + feedback |
| POST | `/moderation/items/{id}/reassign` | moderator | Re-assign |
| GET | `/moderation/queue?type={t}` | moderator | Queue length + SLA |
| GET | `/admin/moderation/kappa` | admin | Kappa per criterion |

## User Learning Profile

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/me/learning-profile` | user | Exam, grade, screening result |
| PATCH | `/me/learning-profile` | user | Update (e.g. change exam → triggers re-screen) |

## Institution Context (Phase 2)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/institutions/{id}/cohorts` | institution_admin / teacher | Read |
| GET | `/institutions/{id}/cohorts/{cohort_id}/dashboard` | institution_admin / teacher | Read-only batch |
| GET | `/institutions/{id}/cohorts/{cohort_id}/students/{student_id}` | RBAC-scoped | Drill (read-only) |

## Common

- `GET /health` · `GET /ready`
- All endpoints emit OTel spans + standard error shape.
- Pagination: cursor-based.
- Errors: `VALIDATION_FAILED`, `NOT_FOUND`, `FORBIDDEN`, `CONFLICT`, `RATE_LIMITED`, `KAPPA_PAUSED` (AI), `COST_CAP_HIT` (AI), `MODERATION_LOCKED` (item in another moderator's lock).
