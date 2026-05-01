# Manual Testing Plan — Adaptive Learning Platform

**Scope**: Phase 1–5 — the full deployable stack.
**Updated**: 2026-05-01
**Audience**: QA, internal testers, content team, partner reviewers.
**Time budget**: 4–6 hours for the full pass; 60–90 minutes for a P0 smoke.

---

## How to use this document

Each test case is a self-contained scenario with: **prerequisites**, **steps**, **expected**, **fail signal**.
- Run **P0** cases on every release.
- Run **P1** cases on every Phase 5 deploy.
- Run **P2** cases monthly + after any AI-config change.

Mark each pass/fail in your own tracker; export a checklist by copying the section headings into a Google Sheet.

URLs (local dev):

| Surface | URL |
|---|---|
| Web student | http://localhost:35173 |
| Web portal (creator/educator) | http://localhost:35174 |
| Web admin | http://localhost:35175 |
| Identity API | http://localhost:38001 |
| Learning API | http://localhost:38101 |
| Engagement API | http://localhost:38100 |
| Quiz API | http://localhost:38011 |
| Mailpit (email capture) | http://localhost:8025 |

Seed accounts (password: `Password123!`):
- `student@alp.dev` (STUDENT)
- `teacher@alp.dev` (TEACHER)
- `expert@alp.dev` (EXPERT — peer reviewer)
- `admin@alp.dev` (PLATFORM_ADMIN)

---

## P0 — Release smoke (60–90 min)

These must pass on every release. They cover the load-bearing user journeys end-to-end.

### A. Authentication & onboarding (P0)

| ID | Steps | Expected | Fail signal |
|---|---|---|---|
| **AUTH-1** | Visit `/login` → enter `student@alp.dev` / `Password123!` → submit. | Lands on `/home`; sidebar shows user name; session token in localStorage. | Login error; redirect loop. |
| **AUTH-2** | Sign out → revisit `/`. | Redirects to `/login`. | Lands on `/home` (stale session). |
| **AUTH-3** | Forgot-password flow: `/forgot-password` → enter email → check Mailpit. | Mailpit shows reset email; clicking link opens `/reset-password?token=...`. | No email; broken link. |
| **AUTH-4** | Onboarding (new user): register → exam select → daily goal → target date. | Lands on `/home` with onboarding banner cleared. | Stuck on onboarding screen. |

### B. Home dashboard (P0)

| ID | Steps | Expected | Fail signal |
|---|---|---|---|
| **HOME-1** | Visit `/home` as student. | Hero card with greeting + readiness %; "For You / Up next" card with **readable text** on dark surface; "Resume practice" tile; exam cards. | Any card with **invisible/illegible text** (this was the contrast bug fixed in S67-followup). |
| **HOME-2** | Click "Continue" on Resume practice. | Lands on Quiz page mid-session OR on Practice page with a fresh session. | Crashes; 404. |
| **HOME-3** | Click any exam card. | Lands on `/exams/:id`. | Crashes. |

### C. Quiz polymorphic flow (P0 — Phase 5)

| ID | Steps | Expected | Fail signal |
|---|---|---|---|
| **QUIZ-1** | Start practice on Mechanics → answer 3 MCQ_SINGLE. | Each answer → feedback (correct/incorrect) → next; counter advances. | No feedback; stuck on item. |
| **QUIZ-2** | If a non-MCQ type appears in a session: verify the **renderer** (numeric input / textarea / matching dropdowns / etc.). | Type-specific UI renders; submit button enabled when answer is provided. | Renderer crashes; can't submit. |
| **QUIZ-3** | Mid-session, refresh the page. | Session resumes from same item index. | Session lost. |
| **QUIZ-4** | Complete a session → land on `/quiz/:id/result`. | Result page shows correct/total + per-item breakdown. | Numbers don't match what you submitted. |

### D. Multi-parameter profile (P0 — Phase 5)

| ID | Steps | Expected | Fail signal |
|---|---|---|---|
| **PROF-1** | Visit `/concept-profile` after completing ≥ 1 session. | 9-dim radar renders; concept picker on left lists weakest concepts; Bloom matrix shows per-level EWA. | Empty state with no data despite having submitted sessions. |
| **PROF-2** | Pick a different concept from the picker. | Radar redraws with new values; Bloom matrix swaps. | Stale data. |
| **PROF-3** | Visit `/diagnostic-deep-dive` → enter a primary concept id → paste 1-2 prereq edges → run. | Result shows verdict (drill X / no gap) + path with mastery percentages. | 500 error; no result. |

---

## P1 — Phase 5 substrate (90 min)

Run on every Phase 5 deploy. Validates the multi-parameter engine, AI pipeline, localisation, and admin operator surfaces.

### E. Authoring — multi-type Author (P1)

Login as `teacher@alp.dev`, visit `/questions/new-multi`.

| ID | Steps | Expected | Fail signal |
|---|---|---|---|
| **AUTH-MT-1** | Type picker shows 22+ types from `/content/types`. | Dropdown lists MCQ_SINGLE through ADAPTIVE_DIFFICULTY. Family + evaluation_mode pill renders below. | Empty dropdown; <22 types. |
| **AUTH-MT-2** | Pick MCQ_SINGLE → AI Draft Panel: enter "Newton's laws" topic, MEDIUM, JEE-MAIN → Generate. | Form populates with stem + 4 options + explanation; AI_DRAFT marker chip surfaces. | Generation fails silently; no fields populated. |
| **AUTH-MT-3** | Click "Run quality checks". | Warnings list renders (or "All checks passed" banner). | 500 error. |
| **AUTH-MT-4** | Pick ESSAY → RubricEditor renders → add 2 criteria, "Distribute evenly" → submit invalid (sum != 100). | Sum-to-100 invariant turns red when off; green when balanced. | Submit succeeds with imbalanced rubric. |
| **AUTH-MT-5** | Pick DIAGRAM_HOTSPOT → DiagramAuthoringCanvas → upload image (under 4 MB) → draw a circle. | Canvas renders; circle appears; SVG overlay updates. | Image rejected; canvas blank. |
| **AUTH-MT-6** | Audio/Video families → "Phase 2 family" banner shows instead of fields. | Banner pointing to gated rollout. | Form crashes. |

### F. AI Authoring (P1)

| ID | Steps | Expected | Fail signal |
|---|---|---|---|
| **AI-1** | `POST /content/ai/draft` with type_id=MCQ_SINGLE. | Returns `{draft, marker}` with `ai_origin` populated. | 500 / quota exceeded on first call. |
| **AI-2** | `POST /content/ai/explanation` with stem + answer. | Returns `{explanation, steps[]}`. | Empty steps. |
| **AI-3** | `POST /content/ai/distractors` with stem + correct_answer. | 3-5 distractors returned. | < 3 returned. |
| **AI-4** | Re-call AI-1 with identical inputs (translation/quality_check touchpoint). | Second call hits cache; same response; `ai_gateway_cache_hit_total` counter increments. | Different response; provider hit twice. |
| **AI-5** | Repeatedly call `/content/ai/draft` 50+ times in 24h with same creator id. | After cap, returns 429 with `quota_reset_at`. | No cap enforced. |

### G. Localisation pipeline (P1)

| ID | Steps | Expected | Fail signal |
|---|---|---|---|
| **LOC-1** | Pick a real seeded question id → `POST /content/questions/{id}/translations/hi/request` (sourceLang=en, subject=biology). | Job id returned; `content_artifact_translations` row in DRAFT state appears. | 500 / FK violation. |
| **LOC-2** | `GET /content/questions/{id}/translations` | List includes the new HI row. | Empty. |
| **LOC-3** | `POST /content/questions/{id}/translations/hi/review` with action=approve, reviewerId=u-1. | Status flips to PUBLISHED. | Status unchanged. |
| **LOC-4** | `GET /localisation/glossary/biology/en-hi` → empty list. POST a glossary entry → re-fetch. | New entry appears. | Insert fails; lookup empty. |
| **LOC-5** | `GET /localisation/cultural-review/queue` (admin). | Returns `{items, pendingCount}`. | 500. |
| **LOC-6** | If a translation surfaced cultural_flags: `POST /localisation/cultural-review/{aid}/{lang}/action` with action=APPROVED. | Status updates to APPROVED. | 422 / 500. |

### H. Evaluation pipeline (P1)

| ID | Steps | Expected | Fail signal |
|---|---|---|---|
| **EVAL-1** | Submit an ESSAY response via `/grading/grade` with type_id=ESSAY + a valid rubric. | Returns Resolution with status (CORRECT/PARTIAL/INCORRECT/PENDING_HUMAN_REVIEW) + `evaluation_mode=HYBRID`. | 500. |
| **EVAL-2** | Submit a SHORT_TEXT response → AI confidence < 0.75. | Status = PENDING_HUMAN_REVIEW; calibration sample row appears in `calibration_samples`. | Stays as CORRECT despite low confidence. |
| **EVAL-3** | `GET /evaluation/calibration/dashboard` | Returns `{floorKappa: 0.7, autoPausedCriteria, criteria}`. | Crashes. |
| **EVAL-4** | `POST /evaluation/responses/{id}/re-evaluate`. | First two attempts return triggered=true; third returns 409 with `max_auto_reevaluations_reached`. | Cap not enforced. |

### I. Human Grader (P1)

Login as admin, visit `/grader-queue`.

| ID | Steps | Expected | Fail signal |
|---|---|---|---|
| **GRADE-1** | Page loads → 3-item calibration warm-up shows. | First item is the Rayleigh-scattering item. | No warm-up; lands directly on grading view. |
| **GRADE-2** | Score the 3 calibration items → ≥85% gold agreement. | Banner flips to "Calibration passed", session card visible. | False-pass at < 85%. |
| **GRADE-3** | `GET /grading/queue?limit=10` returns pending review + calibration samples. | Both queue sources surface. | One source missing. |
| **GRADE-4** | `POST /grading/responses/{id}/grade` with valid criteria → write a HUMAN evaluation_record. | Returns `evaluation_record_id`. New row in `evaluation_records` with `evaluator_kind=HUMAN`. | No row written. |
| **GRADE-5** | Submit grade with `calibration_sample_id` set → updates `calibration_samples.human_score`. | `calibration_sample_updated=true`. | Field unset. |

---

## P2 — Admin operator surfaces (60 min)

Login as `admin@alp.dev`.

### J. AI cost dashboard (P2)

| ID | Steps | Expected | Fail signal |
|---|---|---|---|
| **COST-1** | Visit `/ai-cost`. | 3 rolling-window cards (today / week / month) with USD totals + per-touchpoint breakdown + top creators. | Cards empty / blank. |
| **COST-2** | After running AI-1..AI-5 (P1 §F), refresh `/ai-cost`. | Authoring touchpoint shows non-zero cost. | Still zero. |
| **COST-3** | Click "Purge audit log (>90 days)". | Returns "Purged N rows older than 90 days" pill. | 500. |
| **COST-4** | Set day budget to $1 in compose env, generate enough usage to breach 80%. | Red banner appears: "80% threshold breached". | No alert. |

### K. Calibration dashboard (P2)

| ID | Steps | Expected | Fail signal |
|---|---|---|---|
| **CALIB-1** | Visit `/calibration-dashboard`. | Floor kappa = 0.70; per-criterion cards. | Crashes. |
| **CALIB-2** | If samples accumulated (P1 §H EVAL-2): kappa cards render with weekly-trend bars. | Trend bars per criterion. | Empty even with samples. |
| **CALIB-3** | If kappa < 0.7 for any criterion: red border + AUTO-PAUSED pill. | Auto-paused criteria surface. | No flag despite kappa drop. |

### L. Translation analytics (P2)

| ID | Steps | Expected | Fail signal |
|---|---|---|---|
| **TXAN-1** | Visit `/translation-analytics`. | Per-language quality table (HI row at minimum). Targets surface at top. | Empty table even when LOC-1..LOC-3 ran. |
| **TXAN-2** | Glossary growth section lists per (subject, lang-pair). | After LOC-4, biology/en-hi shows non-zero count. | Empty after upsert. |
| **TXAN-3** | Change the window selector (4w / 12w / 26w / 52w). | Table re-fetches and updates. | No change. |

### M. Translation review (P2)

| ID | Steps | Expected | Fail signal |
|---|---|---|---|
| **TXR-1** | Visit `/translation-review` → enter the question id from LOC-1 → "Load translations". | List of language rows; HI row clickable. | 404 on existing artifact. |
| **TXR-2** | Click HI → side-by-side diff renders. | Each translatable field shows source + translation. | Single block of JSON. |
| **TXR-3** | "Approve" → status flips to PUBLISHED. | Reload reflects the new status. | Status unchanged. |

### N. Cultural review (P2)

| ID | Steps | Expected | Fail signal |
|---|---|---|---|
| **CULT-1** | Visit `/cultural-review`. | Rationale card + SLA banner (5 working days). | Banner missing. |

### O. Reviewer staffing (P2)

| ID | Steps | Expected | Fail signal |
|---|---|---|---|
| **STAFF-1** | `GET /localisation/staffing`. | Returns 5 rows seeded: hi (6), ta/te/bn/mr (3 each). | Empty / 500. |
| **STAFF-2** | `GET /localisation/staffing/hi`. | Returns full staffing config + queue depth fields (pending / cultural / breach). | 404 / missing fields. |
| **STAFF-3** | `POST /localisation/staffing/hi` with reviewer_count=8, staffing_model="internal_panel". | Returns `{language: hi, status: upserted}`. Re-fetch shows 8. | No update. |

---

## P2 — Type registry & rendering (60 min)

### P. Type registry routes (P2)

| ID | Steps | Expected | Fail signal |
|---|---|---|---|
| **TYPE-1** | `GET /content/types` | ≥ 22 types. Each has `{type_id, family, evaluation_mode, supports_partial, media_kinds}`. | < 22. |
| **TYPE-2** | `GET /content/types/MCQ_SINGLE/payload-schema` | Valid JSON Schema with stem + options. | 404 / invalid schema. |
| **TYPE-3** | `GET /content/types/ESSAY/translatable-fields` | Includes `rubric.criteria[*].text`. | Missing rubric paths. |
| **TYPE-4** | `GET /content/exams/JEE-MAIN/supported-types` | Returns filtered list per AIM §2.2 coverage matrix. | Returns all types. |

### Q. Per-family rendering (P2)

Open a Quiz with a question of each family in turn (or use the smoke fixtures):

| ID | Family | Expected behaviour |
|---|---|---|
| **REND-1** | Objective (MCQ_SINGLE) | Radio list; Submit only enabled when an option is picked. |
| **REND-2** | Objective (MCQ_MULTI) | Checkboxes; partial-credit hint surfaces. |
| **REND-3** | Numeric (NUMERIC_INTEGER) | Integer-only number input; unit shown if provided. |
| **REND-4** | Fill-in (FILL_BLANK_SINGLE) | Stem renders inline with `___` swapped for an input. |
| **REND-5** | Subjective (ESSAY) | Textarea; word counter; rubric collapsible. |
| **REND-6** | Subjective (CASE_STUDY) | Scenario passage shows; child-question manifest visible. |
| **REND-7** | Visual (DIAGRAM_HOTSPOT) | Image renders; click drops a marker; coords appear below. |
| **REND-8** | Visual (MAP_LOCATION) | **Leaflet map** with OSM tiles; click drops a marker; lat/lng surfaces (full precision). |
| **REND-9** | Audio/Video (LISTENING_COMP) | Phase 2 banner (gated). Submit routes to grader queue with `feature_disabled` note. |

---

## P2 — Mobile parity (45 min)

Open the Flutter app on iOS / Android / Web build.

| ID | Steps | Expected |
|---|---|---|
| **MOB-1** | Login with seed account → home tab loads. | Home dashboard renders. |
| **MOB-2** | Open Concept Profile screen. | 9-dim radar (CustomPainter) renders; Bloom matrix table below. |
| **MOB-3** | Switch UI language to Hindi (Settings). | Tab labels + Concept Profile labels render in Devanagari. |
| **MOB-4** | Open Diagnostic Deep Dive → enter primary concept + edges → Run. | Verdict + path renders. |
| **MOB-5** | Take a quiz with a non-MCQ question. | Polymorphic renderer picks the right family widget. |
| **MOB-6** | Confidence slider on a question. | 4 preset buttons + slider visible. |

---

## P2 — Operations (30 min)

### R. Audit log retention (P2)

| ID | Steps | Expected |
|---|---|---|
| **AUDIT-1** | Trigger ≥ 1 AI Gateway call → check `ai_generation_jobs` has the row. | Row appears with `prompt_template_id`, `prompt_version`, `model`, `status`. |
| **AUDIT-2** | Wait for the audit retention task's first fire (within 1 day default first-delay). | Logs show `audit_log.purged rows=N days=90`. |
| **AUDIT-3** | Manually trigger via `POST /admin/ai-audit-log/purge` `{"days":90}`. | Returns `{"rowsDeleted": N, "days": 90}`. |

### S. Auto-pause runtime gate (P2)

| ID | Steps | Expected |
|---|---|---|
| **PAUSE-1** | Inject 5 calibration samples per criterion with deliberate AI/human disagreement. | Weekly kappa for that criterion drops below 0.7. |
| **PAUSE-2** | Wait for the auto-pause refresh task (5 min default). Submit a HYBRID response with that criterion in its rubric. | Resolution status = PENDING_HUMAN_REVIEW even when AI confidence is high; reason includes `runtime_auto_pause`. |
| **PAUSE-3** | `GET /evaluation/calibration/dashboard` shows the criterion in `autoPausedCriteria`. | Criterion listed. |

### T. Image moderation (P2)

| ID | Steps | Expected |
|---|---|---|
| **MOD-1** | Without AWS creds: every image upload routes to pre-moderation queue. | Stub allows but flags. |
| **MOD-2** | With AWS creds: upload a known-safe image → allowed without flag. | Allowed. |
| **MOD-3** | With AWS creds: upload a known-NSFW image (test fixture) → blocked with reason. | Blocked. |

### U. Whisper transcription (P2)

| ID | Steps | Expected |
|---|---|---|
| **TRANS-1** | `POST /content/ai/transcribe` with a valid 1-second silent WAV. | Returns 200 with text (stub: `[stub transcript ...]`; OpenAI: empty/silence). |
| **TRANS-2** | Send 26 MB file (over Whisper limit). | Returns 413. |
| **TRANS-3** | Send `text/plain` file. | Returns 400 with `bad_content_type`. |

---

## Final checklist before sign-off

- [ ] All P0 cases pass
- [ ] All P1 cases pass
- [ ] At least one rendering test from each family in P2 §Q passes
- [ ] No new contrast/readability bugs in any pages (every text is legible against its background — see HOME-1 fail signal)
- [ ] `make smoke` returns ≥ 98/100 (only step 55 + step 63 are pre-existing Phase 4 acceptable failures)
- [ ] All three web apps' Vitest test suites pass: `cd apps/{web-admin,web-portal,web-student} && npm test`
- [ ] Backend test suite: `cd services/learning && uv run pytest tests/payload_contracts/` — 405 passing

---

## Where to file bugs

- **P0 / P1 / contrast / data correctness**: file as Github issue, label `bug`, assign reproducer steps from above.
- **P2 / nice-to-have**: leave a comment in the relevant Sprint Closure doc.
- **AI-quality issues** (Whisper transcription drift, calibration kappa drop, translation acceptance < 70%): file with prompt template version + provider name in the report. ML Eng owns these.

---

## Smoke vs manual — when to use which

- **`make smoke`** — automated, runs in 30 seconds, hits 100 endpoints. Use after every code change.
- **Manual testing plan** — depth, UX, content correctness. Use weekly + before any release.

The smoke catches regressions. The manual plan catches what the smoke can't see — readability, label quality, AI output sensibility.
