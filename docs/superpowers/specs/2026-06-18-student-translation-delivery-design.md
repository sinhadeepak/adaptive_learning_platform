# Student Delivery of Published Translations — Design

**Date:** 2026-06-18
**Branch:** feature/vidya-foundation
**Status:** Approved (design); pending implementation plan
**Builds on:** [2026-06-17-bulk-translation-workbench-design.md](2026-06-17-bulk-translation-workbench-design.md) (the *authoring* half)

## Summary

The Bulk Translation Workbench lets admins author and **PUBLISH** question translations into
`content_schema.content_artifact_translations` (learning DB). However, **student delivery was
never wired to read them** — verified: the quiz service serves questions from `quiz_schema.questions`
and never consults the translations table, so a student who selects Hindi still sees English.

This feature closes that gap: when a student selects a **question/content language**, the questions
they answer and review render in that language, falling back to English per-field where no published
translation exists.

### Two independent language parameters

A core decision: **application UI language** and **question/content language** are *separate*
parameters, stored/validated/consumed independently.

| | Application language | Question/content language (NEW) |
|---|---|---|
| Field | `language_pref` (en/hi/hinglish) — existing | `content_language` (en/hi/ta/te/bn/mr) — new |
| Drives | UI chrome / i18n | translated stem / options / explanation |
| Set where | App Language control (existing) | new "Question language" control in Settings |
| hinglish? | yes (UI-only) | never — not a content language |

A student can run the app UI in Hinglish while answering questions in Hindi or English. Because
`content_language` is constrained to languages the registry can actually serve, the earlier
"hinglish has no content" problem disappears at the content layer entirely.

### Approved decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Where quiz learns the language | **Client sends content language in `POST /sessions/start`**; quiz validates + stores on the session |
| 2 | hinglish content handling | **Fall back to English** (hinglish is app-UI-only; not a content language) |
| 3 | Delivery surfaces | **Active answering + review**: `/next`, `/items`, `/sessions/{id}` via centralized `GetQuestion(language)` |
| 4 | Propagation learning→quiz | **NATS event bridge** (sibling of the existing question bridge) → quiz-side table → local JOIN |
| 5 | content-language management | **New profile preference (`content_language`, default en) + per-session override**; picker offers only enabled content languages |

## Ground truth (verified — do NOT assume otherwise)

- **Existing question bridge:** learning publishes `content.question.published` on the
  `CONTENT_EVENTS` NATS stream (`services/learning/src/learning/content/events.py`); quiz consumes
  it in `services/quiz/internal/events/content_subscriber.go` and upserts
  `quiz_schema.questions`. The event/payload carries only the **primary** `language` — no
  translations.
- **JWT carries no language claim.** Identity's `issue_access_token`
  (`services/identity/src/identity/auth/security.py`) emits `sub/role/onboarding_state/tenant_id`
  only. `language_pref` lives in the identity profile (`profile_schema`, enum en/hi/hinglish).
- **Delivery reads English only.** `GetQuestion` (`services/quiz/internal/store/store.go:870`)
  `SELECT`s from `quiz_schema.questions`; no translation lookup. Student text surfaces:
  `GET /quiz/sessions/{id}/next`, `GET /quiz/sessions/{id}/items`, `GET /quiz/sessions/{id}`
  (review, gated), plus niche `/quiz/questions` and `/per-question-time` (out of scope).
- **`quiz_sessions` has no language column** (`services/quiz/migrations/001_create_quiz_schema.up.sql`).
- **hinglish** is UI-only; not in `supported_languages` (en/hi/ta/te/bn/mr).
- **Databases are separate:** `content_schema` (learning DB) vs `quiz_schema` (quiz DB) — no
  cross-DB JOIN possible; propagation must be via the event bridge.

## Architecture & data flow

```
Admin approves/publishes translation (learning)
   └─ approve_translation (DRAFT→PUBLISHED)
        └─ emit NATS "content.translation.published"  ──▶  quiz ContentSubscriber (new branch)
                                                              └─ upsert quiz_schema.question_translations

Student sets content_language=hi (Settings) ──▶ identity profile
Student starts session, client sends language=hi ──▶ quiz stores quiz_sessions.content_language

Student answers / reviews
   └─ GetQuestion(id, session.content_language)
        └─ LEFT JOIN quiz_schema.question_translations ON (id, language)
             → COALESCE translated stem/choices/explanation/payload over English (per-field)
```

Mirrors the existing question bridge: translations ride a **sibling event** into a **sibling
quiz-side table**, so delivery stays a fast **local JOIN** with no cross-service call on the hot path.

## Section 1 — Translation propagation (learning → quiz)

- **New event** `content.translation.published` on the existing `CONTENT_EVENTS` stream. Emitted
  whenever a translation transitions DRAFT→PUBLISHED — i.e. inside the `approve_translation` path,
  reached by both the bulk review-queue (`POST /localisation/review-queue/bulk`) and the single-item
  review (`POST /content/questions/{id}/translations/{lang}/review`).
- **Payload mirrors the question event, with translated text + a `language` field:**
  `{ question_id, language, stem, choices, explanation, payload, version }`. The learning side
  extracts these from `payload_translation` using the question type's translatable paths
  (`get_handler(type_id).translatable_fields(...)`), so the **quiz consumer stays dumb** (no type
  knowledge). `choices` is derived from `options[*].text` for legacy-shaped consumers; `payload` is
  the full translated typed payload.
- **New quiz table** `quiz_schema.question_translations`:
  `question_id UUID`, `language TEXT`, `stem TEXT`, `choices JSONB`, `explanation TEXT`,
  `payload JSONB NULL`, `version INT`, `updated_at TIMESTAMPTZ`; **PK `(question_id, language)`**.
  No FK to `questions` required (events may arrive in any order; upsert is keyed independently).
- **New consumer branch** in `ContentSubscriber` (durable `quiz-content-translation`, subject filter
  `content.translation.published`) that upserts the row. Idempotent on `(question_id, language)`;
  newer `version` wins.

## Section 2 — Content-language parameter & capture

- **Identity profile:** add `content_language TEXT NOT NULL DEFAULT 'en'` with
  `CHECK (content_language IN ('en','hi','ta','te','bn','mr'))`. Stored and validated
  **independently of** `language_pref`. Exposed/settable via the existing preferences update
  endpoint (extend its schema with an optional `contentLanguage` field; absence = unchanged).
- **Settings UI (web + mobile):** a **second** control, "Question language", separate from the App
  Language control. Options come from the enabled content languages (registry-sourced; static
  en/hi/ta/te/bn/mr acceptable for v1). Defaults to `en`. Changing it never touches `language_pref`.
- **Practice/mock start:** an optional **per-session override** picker, defaulting to the profile's
  `content_language`.
- **Client → `POST /quiz/sessions/start`:** sends the resolved content language in the body as
  `language`. Quiz **validates** against the enabled set (a small allow-list constant mirroring the
  registry; unknown/absent → `en`), and stores it on a new
  `quiz_sessions.content_language TEXT NOT NULL DEFAULT 'en'` column. `hinglish` is never sent here;
  if it ever arrives, it validates to `en`.

## Section 3 — Delivery substitution

- **Centralize** in the quiz store: change `GetQuestion(ctx, id)` →
  `GetQuestion(ctx, id, language)`. For `language` in the enabled set and `!= 'en'`:
  `LEFT JOIN quiz_schema.question_translations t ON t.question_id = q.id AND t.language = $lang`,
  and `COALESCE(t.stem, q.stem)`, `COALESCE(t.choices, q.choices)`, `COALESCE(t.explanation,
  q.explanation)`, `COALESCE(t.payload, q.payload)`. For `en`/unknown: return English unchanged
  (no join).
- **Per-field fallback:** a partially-translated question shows translated fields where present and
  English elsewhere — never a corrupted half-language field (each field independently COALESCEd).
- **Threaded through the three surfaces** (all already call `GetQuestion`), each passing
  `session.content_language`:
  - `GET /quiz/sessions/{id}/next` (live practice) — `sessions.go` ~line 837/874/895.
  - `GET /quiz/sessions/{id}/items` (pre-served mocks/assignments).
  - `GET /quiz/sessions/{id}` (review; translated explanation when the item is answered/submitted).
- Out of scope: `/quiz/questions` (internal listing) and `/per-question-time` (analytics) — remain
  English; they read from a separate details path and aren't primary reading surfaces.

## Section 4 — Backfill (one-time)

The new event fires only on *future* publishes. Existing PUBLISHED rows in
`content_artifact_translations` (including any published during workbench testing) must be seeded
into the quiz table.

- **A backfill command/route in the learning service** iterates all PUBLISHED
  `content_artifact_translations` and emits `content.translation.published` for each (reusing the
  same emit path). Idempotent (quiz upserts; version-guarded), re-runnable, no schema coupling.
- Operationally run once after deploy (documented in the plan's final verification).

## Section 5 — Error handling & edge cases

- **Event before question:** if a translation event arrives before the question exists in quiz, the
  upsert still lands (no FK); delivery JOIN simply matches once both rows exist.
- **Re-publish / re-edit:** an inline edit sends the translation back to DRAFT; re-approval emits a
  fresh event with an incremented `version` → quiz upsert overwrites. Stale/older `version` is
  ignored.
- **Unpublish/reject after publish:** out of scope for v1 (no current UI path un-publishes a live
  translation). Noted as a follow-up; if added later, a `content.translation.unpublished` event would
  delete the quiz row.
- **NATS unavailable at publish:** the publish itself still succeeds (translation is PUBLISHED in
  learning); the quiz row simply lags until the next event or a backfill run — same durability
  posture as the existing question bridge.
- **Validation:** invalid `content_language` from the client or profile coerces to `en` rather than
  erroring a session start.

## Section 6 — Testing

- **Learning (pytest):**
  - `content.translation.published` emitted on `approve_translation` with the correct payload
    (translated `stem`/`choices`/`explanation`/`payload` extracted via the type's translatable paths).
  - Backfill emits one event per PUBLISHED translation; idempotent.
  - Profile: `content_language` stored + validated independently of `language_pref`; invalid value
    rejected; absence leaves it unchanged.
- **Quiz (Go):**
  - Consumer upserts `question_translations` from the event; newer `version` wins; idempotent.
  - `GetQuestion(hi)` overlays translated fields and falls back per-field to English; `en`/unknown
    returns English; `hinglish` (if it arrives) → English.
  - `POST /sessions/start` stores + validates `content_language` (unknown → en).
  - `/next`, `/items`, `/sessions/{id}` return translated text for a `hi` session and English for an
    `en` session.
- **Frontend (web + mobile):** Settings shows two independent controls; changing Question language
  posts `contentLanguage` without altering app language; practice start sends the resolved language.

## New API / schema surface

| Kind | Item |
|---|---|
| NATS event | `content.translation.published` (CONTENT_EVENTS stream) |
| Migration (quiz) | `quiz_schema.question_translations` (PK question_id+language) |
| Migration (quiz) | `quiz_sessions.content_language` column (default 'en') |
| Migration (identity) | `profile_schema` `content_language` column (default 'en', CHECK) |
| Endpoint (identity) | preferences update accepts optional `contentLanguage` |
| Endpoint (quiz) | `POST /quiz/sessions/start` accepts optional `language` (content) |
| Store (quiz) | `GetQuestion(ctx, id, language)` signature + translation JOIN |
| Command (learning) | one-time translation backfill emit |

## Out of scope (YAGNI)

- Romanized-Hindi (true "hinglish") question content — not generated; hinglish stays UI-only.
- Translating `/quiz/questions` and `/per-question-time`.
- Un-publish/delete propagation (no current un-publish path).
- Per-question language switching mid-session (session language is fixed at start).
- Registry-driven dynamic content-language enum in identity/quiz CHECK constraints (static
  en/hi/ta/te/bn/mr list for v1; widen when a 7th language ships).
