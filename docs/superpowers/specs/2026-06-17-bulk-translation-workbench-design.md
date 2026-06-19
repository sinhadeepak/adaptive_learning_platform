# Bulk Translation Workbench — Design

**Date:** 2026-06-17
**Branch:** feature/vidya-foundation
**Status:** Approved (design); pending implementation plan

## Summary

Enhance the existing admin translation system so an admin can:

1. **Manage which languages exist** via a DB-backed registry (no more hardcoded list).
2. **Batch-translate** selected questions into selected languages through a background job with live progress.
3. **Bulk-verify, inline-edit, and publish** the resulting draft translations from one screen.

This is an *enhancement*, not a greenfield build. The platform already has correct
per-language translation storage, an AI translation pipeline, a single-item review UI,
glossary, analytics, and cultural review. This work adds a **language registry** plus
**batch orchestration** and **bulk verification** layers on top of those primitives.

### Approved decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Language model | **Managed registry** — admin CRUD table, backend reads it |
| 2 | Bulk execution | **Background batch job** with progress UI |
| 3 | Verification unit | **Row = whole (question, language) translation, inline-editable** |
| 4 | Selection UX | **Checkboxes + select-all-matching-filter**, sticky action bar |
| 5 | Publish semantics | **Confirm = Publish, live immediately** (DRAFT→PUBLISHED, one step) |

## Existing system (context — do NOT rebuild)

- **Storage:** `content_schema.content_artifact_translations`, PK `(artifact_id, language)`,
  columns include `payload_translation` JSONB, `status` (DRAFT/IN_REVIEW/PUBLISHED/REJECTED),
  `ai_confidence`, `version`, `cultural_flags`, `cultural_review_status`.
  Migration: `services/learning/alembic/content/versions/013_artifact_translations.py`
  (cultural flags added in `017_cultural_flags.py`).
- **AI pipeline:** `services/learning/src/learning/localisation/translator.py` →
  `translate_artifact(...)` extracts translatable strings via each question type's
  `translatable_fields()` handler (so stem/options/instructions/rubric are all covered
  generically), injects glossary, calls the AI Gateway per field, returns a `TranslationDraft`.
- **Translation cache:** AI Gateway caches the `translation` touchpoint (24h TTL) — repeated
  identical fields are cheap.
- **Persistence:** `localisation/repositories.py` → `upsert_translation_draft` (idempotent on
  `(artifact_id, language)`, bumps `version`, resets to DRAFT), `approve_translation`
  (**DRAFT→PUBLISHED in one step**), `reject_translation`.
- **Routes:** `localisation/routes.py` (`POST /localisation/translate`, glossary, analytics),
  `content/translation_routes.py` (per-question translation list/get/request/review),
  `localisation/cultural_routes.py`, `localisation/staffing_routes.py`.
- **Hardcoded list to replace:** `SUPPORTED_LANGS = ["hi","ta","te","bn","mr"]` in `translator.py`.
- **Admin UI (web-admin, React 18 + Vite + TS):**
  - `pages/TranslationsList.tsx` — `/translation-review`, paginated question list, "Translations →" per row.
  - `pages/TranslationReview.tsx` — `/translation-review/:questionId`, single-item side-by-side `PayloadDiff`, approve/reject.
  - `pages/TranslationAnalytics.tsx`, `pages/CulturalReview.tsx`.
  - API layer: `lib/api.ts` (`auth.fetch`), `lib/phase5-api.ts` (`translation`, `translationAnalytics`, `glossary`).
  - Primitives: `components/primitives.tsx` (`StatCard`, `SectionHeader`, `Pill`, `Banner`),
    `components/stats.tsx` (`DrillDownTable`, `StatTile`), `components/AdminShell.tsx`.
  - Routes: `routes.tsx` via `adminRoute(...)`.

## Section 1 — Language Registry

**New table** `content_schema.supported_languages` (new Alembic migration under
`services/learning/alembic/content/versions/`):

| column | type | notes |
|--------|------|-------|
| `code` | TEXT PK | e.g. `hi`, `ta`, `kn` |
| `name` | TEXT NOT NULL | English name |
| `native_name` | TEXT NOT NULL | endonym, e.g. "हिन्दी" |
| `script` | TEXT NULL | e.g. "Devanagari" |
| `enabled` | BOOLEAN NOT NULL DEFAULT TRUE | gates new batches + delivery |
| `is_source` | BOOLEAN NOT NULL DEFAULT FALSE | exactly one row true (`en`) |
| `sort_order` | INT NOT NULL DEFAULT 100 | UI ordering |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

- **Seed** in the migration: `en` (`is_source=true`), plus current five `hi, ta, te, bn, mr`
  (`enabled=true`) so nothing regresses.
- A partial unique index enforces a single `is_source` row.
- **New repo** `localisation/language_registry.py`: `list_languages(include_disabled)`,
  `upsert_language(...)`, `set_enabled(code, bool)`, `get_enabled_codes()`. In-process cache
  (~60s TTL) with explicit invalidation on writes.
- **Replace** `SUPPORTED_LANGS` constant usage with a registry read. All translate/publish
  paths validate the target against `enabled=true` and reject `is_source` as a target.
- **New routes** `localisation/language_routes.py`:
  - `GET /localisation/languages?includeDisabled=` → list.
  - `POST /localisation/languages` → upsert `{code,name,nativeName,script?,enabled?,sortOrder?}`.
  - `PATCH /localisation/languages/{code}` → enable/disable/reorder.
- Disabling a language **never deletes** translations; it hides the language from new batches
  and from student delivery.

## Section 2 — Batch Translation Engine (backend)

**Two new tables** (same migration family):

`translation_batches`
- `id` UUID PK, `created_by` UUID, `status` TEXT CHECK (QUEUED/RUNNING/DONE/DONE_WITH_ERRORS),
  `total_tasks` INT, `done_tasks` INT, `failed_tasks` INT, `target_langs` TEXT[],
  `subject` TEXT, `overwrite_existing` BOOL, `created_at`, `finished_at` NULL.

`translation_batch_tasks`
- `id` UUID PK, `batch_id` UUID FK, `question_id` UUID, `language` TEXT,
  `status` TEXT CHECK (PENDING/RUNNING/SUCCEEDED/FAILED/SKIPPED), `error` TEXT NULL,
  `version` INT NULL (resulting translation version), `created_at`, `updated_at`.
- UNIQUE `(batch_id, question_id, language)`.

**Flow:**
1. `POST /localisation/batches` body `{ questionIds:[], targetLangs:[], subject?, overwriteExisting?:bool }`.
   - Validate target langs against the registry (`enabled=true`, not source).
   - Fan-out to question×language task rows. Pairs with an existing **PUBLISHED** translation
     are inserted as `SKIPPED` unless `overwriteExisting=true`.
   - Insert batch (`status=QUEUED`, `total_tasks=N`), return `{ batchId }` immediately.
2. **Worker** — FastAPI `BackgroundTasks` for v1, isolated behind a `batch_worker.py` module
   so it can later move to a real queue without touching callers. Drains PENDING tasks:
   load question payload → `translate_artifact()` → `upsert_translation_draft()` →
   set task SUCCEEDED + `version`; on exception set FAILED + `error`. Update batch counters;
   set terminal `status` + `finished_at` when no PENDING remain.
3. `GET /localisation/batches/{id}` → snapshot `{ batch, tasks[] }`.
   `GET /localisation/batches?limit=&offset=` → recent batches.
4. `POST /localisation/batches/{id}/tasks/{taskId}/retry` → reset a FAILED task to PENDING and
   re-drain.

**Idempotency:** task rows are unique per `(batch, question, language)`; a restarted worker
resumes by re-querying PENDING. Re-submitting the same selection with `overwriteExisting=false`
is safe (existing PUBLISHED pairs skip).

## Section 3 — Selection UX (enhance `TranslationsList.tsx`)

- Add a leading **checkbox column**; header checkbox selects all rows on the current page.
- With an active filter, show **"Select all N matching"**. Selection state is held as either an
  explicit id-set or a `{filterDescriptor}` (so large filtered batches don't materialise every id
  client-side). The batch `POST` accepts an explicit `questionIds` array; for "select all
  matching", the frontend resolves ids via the existing list endpoint (paged) before posting,
  OR (preferred) the batch endpoint also accepts a `filter` object and resolves server-side.
  **Decision:** support both `questionIds` and an optional `filter` on the batch endpoint;
  server resolves `filter` to ids at fan-out time.
- **Sticky bottom action bar** (visible when ≥1 selected): "{n} questions selected" +
  **language multi-select** (registry, enabled only) + optional **overwrite existing** checkbox +
  **Translate** button.
- Translate → `POST /localisation/batches` → navigate to `/translation-batches/:id`.

## Section 4 — Batch Progress view (new page `/translation-batches/:id`)

- Polls `GET /localisation/batches/{id}` every 2s; stops at terminal state.
- Header KPIs via `StatCard`: Total / Done / Failed + a % progress bar.
- Task table via `DrillDownTable`: question stem, language, status pill, error tooltip.
  FAILED rows expose a **Retry** action (`POST .../retry`).
- On completion, primary **"Review N drafts →"** button → `/translation-verify?batchId=:id`.
- Also add `/translation-batches` (list of recent batches) for re-entry.

## Section 5 — Bulk Verification screen (new page `/translation-verify`)

The core "bulk verification and confirmation" surface.

- **Filters:** language(s), status (default DRAFT), `batchId`, topic/type, min AI-confidence,
  "low confidence only" quick toggle.
- **New backend** `GET /localisation/review-queue?lang=&status=&batchId=&minConfidence=&limit=&offset=`
  returns each `(question, language)` draft with: source payload, translated payload, confidence,
  cultural flags, version, stem preview. Generalises the existing `list_cultural_pending` query.
- **Row = one (question, language) draft**, expandable to a **side-by-side field diff**.
  Extract `PayloadDiff` from `TranslationReview.tsx` into a shared component
  (`components/PayloadDiff.tsx`) used by both pages.
- **Inline edit:** each translated field is editable. Save calls new
  `PUT /content/questions/{id}/translations/{lang}` `{ payloadTranslation }` which writes the
  edited payload as a **new version** via `upsert_translation_draft` (status stays DRAFT,
  preserving the AI's original for analytics + audit).
- **Bulk action bar:** select rows → **Approve & Publish** / **Reject**. New
  `POST /localisation/review-queue/bulk` `{ decisions:[{questionId,lang,action,rejectionReason?}], reviewerId }`
  applies the existing `approve_translation` (DRAFT→PUBLISHED) / `reject_translation` per row in
  one transaction; returns per-row results.
- Confidence + cultural-flag badges surface risky rows.

## Section 6 — Navigation, scope & testing

**Navigation (AdminShell, Quality group):**
- "Translations" (existing list, now with batch selection).
- "Batches" → `/translation-batches`.
- "Verify queue" → `/translation-verify`.
- "Languages" (registry CRUD) → settings/registry area, new page `/languages`.

**Out of scope (YAGNI):**
- Real message-queue infrastructure (FastAPI `BackgroundTasks` suffices at current volume;
  worker is isolated for a later swap).
- Field-level approval (row-level only).
- Per-exam language scoping (global enable only).
- Changes to student-side delivery — it already serves PUBLISHED translations; the registry's
  `enabled` flag is the only new gate it must respect.

**Testing (TDD throughout):**
- **pytest:** language registry repo (enable/disable + source gating), batch fan-out
  (skip-existing, overwrite, filter→ids resolution), worker success/failure/retry path,
  idempotency, `review-queue` query filters, bulk review transaction, versioned inline-edit.
- **Vitest:** selection store (page-select, select-all-matching, id-set vs filter), batch
  progress polling lifecycle, inline-edit → new-version flow, bulk approve/reject action bar.

## API surface (new)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/localisation/languages` | list registry |
| POST | `/localisation/languages` | upsert language |
| PATCH | `/localisation/languages/{code}` | enable/disable/reorder |
| POST | `/localisation/batches` | create batch (questionIds and/or filter × langs) |
| GET | `/localisation/batches` | recent batches |
| GET | `/localisation/batches/{id}` | batch + tasks snapshot |
| POST | `/localisation/batches/{id}/tasks/{taskId}/retry` | retry failed task |
| GET | `/localisation/review-queue` | filterable draft queue with source+translation |
| PUT | `/content/questions/{id}/translations/{lang}` | versioned inline edit of a draft |
| POST | `/localisation/review-queue/bulk` | bulk approve&publish / reject |

## Data model summary (new tables)

- `content_schema.supported_languages` — language registry.
- `content_schema.translation_batches` — batch header + counters.
- `content_schema.translation_batch_tasks` — per (question, language) task.

All additive migrations; no changes to `content_artifact_translations` schema.
