# Phase 6 — UX Co-Pilot · Evaluation of UX Recommendations + Sprint Plan (S49–S58)

**Status:** Proposed (2026-05-02). Pending leadership review. ADRs 0020–0024 land alongside this plan.
**Scope:** Translate the UX recommendations review (`docs/additional_requirements/Adaptive_Learning_Platform_UX_Recommendations_Review.docx`) and the original UX recommendations register into 10 sprints of work.
**Prerequisite:** Phase 5 multi-parameter engine must close first (S37–S48) — Phase 6 consumes its concept-grain mastery, Bloom-depth, and AI Gateway as inputs.

> **Headline:** the platform has built the engine; Phase 6 builds the **co-pilot experience** on top of it. Diagnose, sequence, and protect the learning path → AI's job. Control constraints, intensity, and commitment → student's job.

---

## 1. Evaluation of the recommendations

The reviewer's set lands six load-bearing decisions and adds nine recommendations (UX-27 to UX-35) on top of the original 26. We **accept five of the six load-bearing decisions as-is**, **modify one** (information architecture), and **prioritise four of the nine new recommendations** (UX-27, UX-29, UX-32, UX-34) into the spine.

| # | Reviewer's recommendation | Our verdict | Reasoning |
|---|---|---|---|
| **D1** | Hybrid weekly narrative — fixed sections, AI prose, evidence links | **Accept** | Pure-template feels robotic; pure-freeform fails QA. Hybrid maps cleanly onto our existing structured-output discipline (ADR-0019). Locks in `ADR-0021`. |
| **D2** | Cadence — weekly full + event-triggered mini | **Accept** | Matches the "5 meaningful sessions" trigger we already have via NATS `quiz.session.completed`. No new event bus work. |
| **D3** | Difficulty agency — 2 visible + 1 passive (intent / friction / calibration) | **Accept** | The 3-button-pre + 2-button-mid + 3-button-post the original UX register proposed is too control-heavy for mobile. Locks in `ADR-0022`. |
| **D4** | Information architecture — Home / Practice / Insights / Me | **Accept with modifications** | The 4-section split is right for default users. We extend with a global command palette and Quick Actions tray for power users — both already prototyped in `apps/web-student/src/components/`. Locks in `ADR-0020`. |
| **D5** | Plan editability — constrained co-editing with impact preview | **Accept** | Aligns with our "AI never publishes content" principle (ADR-0019) — same posture: AI sequences, student can move/swap/rest/shorten/regenerate but cannot silently delete required work. Locks in `ADR-0023`. |
| **D6** | Add UX-27 — guided reflection + commitment loop | **Accept** | Closes the self-regulated-learning gap. Cheap to ship (one prompt + persistence table). Highest impact for retention. |

### Recommendations we modify or defer

- **Information architecture** — accept the 4-section default, but keep the existing `/concept-profile`, `/diagnostic-deep-dive`, `/revision`, `/syllabus`, and `/analysis` routes alive as deep-link drill-downs underneath the new top-level Insights tab. They're not removed; they're reachable as sub-routes plus power-user shortcuts. This avoids breaking bookmarks and the existing R-S2 / Phase-5 surfaces.
- **Mobile quiz redesign** — rather than reskinning Quiz.tsx from scratch (the reviewer's framing), we extract a `QuizPlayer` shared component and ship a mobile-specific variant that's responsive-but-distinct. Same backend, same session contract.
- **Mock test simulator** — already partly built in Phase 4 (S25 + S26). Phase 6 does not rebuild it; it surfaces it correctly through the new Practice tab + the weekly narrative's "one timed mock" prescription.
- **Strategic bets (Mission Mode, exam-day simulator, study buddy matching)** — explicitly out-of-scope for Phase 6. Sponsor-level decisions, separate phase.

### Recommendations we accept into the new register

| ID | Recommendation | Severity | Phase 6 sprint |
|---|---|---|---|
| UX-27 | Guided reflection + commitment loop | P1 | S57 |
| UX-28 | Adaptive trust explainer | P1 | S54 |
| UX-29 | Recovery mode after missed plan | P1 | S57 |
| UX-30 | Confidence calibration layer | P2 | S58 |
| UX-31 | Parent / mentor share card | P2 | Deferred — Phase 7 |
| UX-32 | Low-bandwidth mode | P1 | S57 |
| UX-33 | Error-pattern coaching cards | P1 | S58 |
| UX-34 | UX health instrumentation | P1 | S49 (foundational — must ship first) |
| UX-35 | Doubt-to-practice bridge | P2 | S58 |

UX-31 (parent share card) is deferred because the platform has no parent role today; introducing it is a cross-cutting auth + privacy + product concern that warrants its own phase.

---

## 2. Strategic frame — what Phase 6 changes for users

| User type | Today's experience | Post-Phase-6 experience |
|---|---|---|
| **First-time visitor** | Lands on `/login`; signup is 4-step onboarding before any value | Lands on `/screening`; takes 10–15 questions; sees readiness + topic breakdown; signs up to unlock a plan. **One-step onboarding** afterwards (just exam). |
| **Repeat student (daily login)** | Sees Home dashboard with stats; figures out what to do | Sees **Today's Mission** card above the fold: "Refresh Organic Reactions before it decays · 25 min · 12 questions · Start." One decision instead of five. |
| **Repeat student (Sunday)** | No weekly summary | Reads **90-second weekly narrative**: what improved, what's slipping, hidden pattern, forecast, week ahead. Plan for the new week is pre-drafted; student can edit. |
| **Mobile student mid-quiz** | Quiz UI built for desktop; sidebar crowds the question on small screens | **Question-first mobile layout** with bottom-sheet difficulty agency + offline recovery. |
| **Anxious student** | "Push me" / "Make easier" buttons everywhere risk turning the quiz into a control panel | **Two visible controls** — pre-quiz intent ("Match me / Push me / Build confidence") and post-session calibration ("How did this feel?"). One passive friction prompt mid-quiz. |
| **Student who missed sessions** | Plan silently reschedules; student feels guilt | **Recovery mode**: "You missed 3 sessions. Here's a realistic 4-day catch-up plan." Acknowledged rather than swept under. |

---

## 3. Sprint plan — 10 sprints, 20 weeks

Phase 6 is sequenced in three releases that mirror the reviewer's roadmap (MVP-critical → 90-day → 180-day) plus a polish sprint at the close.

| Sprint | Window | Theme | Key deliverables | Gates |
|---|---|---|---|---|
| **S49** | 2 wk | **Foundation: instrumentation + screening funnel + one-step onboarding** | UX health events table; client SDK; `/screening` end-to-end (guest 10–15 question diagnostic + readiness reveal + signup wall); onboarding compressed to "pick exam" only | UX-34 must ship first — every later sprint reads telemetry from it. |
| **S50** | 2 wk | **Today's Mission + Home redesign** | `mission_engine` module (concept-grain mission picker reusing S39 multi-parameter mastery); `daily_missions` table; new Home with mission card / continue / streak; mobile variant | Phase 5 S39 (concept_mastery) must be live. |
| **S51** | 2 wk | **Mobile quiz redesign + result page simplification** | Extract `QuizPlayer` shared component; mobile-specific bottom-sheet UI; offline-recovery (UX-32 v0); QuizResult page — collapse into 3 zones, defer detail to drawer | — |
| **S52** | 2 wk | **Insights hub** | New `/insights` route consolidating concept-profile, error-patterns, diagnostic-deep-dive, syllabus-coverage, revision into 3-zone IA: My State / What This Means / What To Do | Phase 5 S41 (multi-dim selector + transfer ability) must be live. |
| **S53** | 2 wk | **Hybrid weekly narrative** | `weekly_narratives` table; AI Gateway prompt template `weekly_narrative@1.0.0`; cron + event-triggered job; narrative card on Home; "Why am I seeing this?" data-link drill-down | AI Gateway from S38 must be live. |
| **S54** | 2 wk | **Difficulty agency + adaptive trust explainer** | Pre-quiz intent selector (3 buttons) writing to session metadata; mid-quiz friction prompt fired by selector heuristics; post-session calibration; "how this adapts" explainer card on first quiz | Quiz session schema gets `intent_anchor` + `calibration_feedback` fields. |
| **S55** | 2 wk | **Constrained plan editor** | `study_plans` + `plan_sessions` + `plan_edits` tables; plan editor UI with move/swap/rest/shorten/add/regenerate; impact-preview microcopy generated by AI Gateway | — |
| **S56** | 2 wk | **Topic decay viz + readiness bands + revision ritual** | Topic decay arrows on Insights / Home / Topic detail; readiness bands (Approaching / On track / Behind / At risk) with recovery actions; revision rebuilt as a 5-question "ritual" — recall prompt → set → mastery delta → next due | Phase 5 S27 + S39 must be live. |
| **S57** | 2 wk | **Reflection + commitment + recovery + low-bandwidth** | UX-27 reflection-and-commitment loop after sessions/mocks/weekly; UX-29 recovery-mode FSM after 2+ missed planned sessions; UX-32 low-bandwidth mode (cache, prefetch, animation toggle) | — |
| **S58** | 2 wk | **Polish + power-user + post-launch flagged items** | UX-30 confidence calibration; UX-33 error-pattern coaching cards; UX-35 doubt-to-practice bridge; global command palette + Quick Actions tray; closure docs + retro | — |

**Total: 20 weeks.** Sequential team-of-2 pace. Best-case parallelisation (mission engine alongside narrative; mobile quiz alongside hub) collapses to ~14 weeks.

### Critical paths

```
S49 (instrumentation) ─┬─→ S50 (mission engine) ─→ S51 (mobile)
                       │      ↓
                       │   S55 (plan editor) ─→ S56 (decay/bands/revision)
                       │
                       └─→ S52 (insights hub) ─→ S53 (narrative) ─→ S54 (agency)
                                                                      ↓
                                                                   S57 (reflection/recovery/bandwidth)
                                                                      ↓
                                                                   S58 (polish)
```

---

## 4. Per-sprint deliverables — concrete

### S49 · Foundation

**Backend** (services/engagement)
- `analytics_schema.ux_events` table — append-only, columns: id / user_id / session_id / event_name / properties (jsonb) / occurred_at / route / variant
- `POST /analytics/ux-events` — accepts batched events
- Worker that rolls up daily KPIs into `analytics_schema.ux_kpis_daily`

**Frontend** (web-student)
- Lightweight client SDK at `apps/web-student/src/lib/instrumentation.ts` — debounced batching, automatic page-view tracking, named-event helper
- Wired into every page (one-line `useTrackPage`)

**Backend** (services/learning)
- `/screening/sessions` — anonymous-friendly endpoint (no auth required for `/start` and `/next`; auth required to `/persist`)
- Pulls 10–15 question blueprint from a fixed exam-agnostic Phase-5 type mix
- Caches anonymous results in Redis keyed by a temporary token

**Frontend** (web-student)
- New `/screening` route (guest-friendly via `<GuestRoute>` wrapper)
- 4-step flow: pick exam → answer questions → reveal readiness + topic breakdown → signup wall
- Onboarding state machine collapses: only `/onboarding/exam` remains required (language, target-date, daily-goal moved to Me hub edit)

**Quality gate**: UX-34 KPI dashboard at `/admin/ux-health` shows guest-screening-completion-rate live.

### S50 · Today's Mission + Home redesign

**Backend** (services/learning, new module `learning.mission`)
- `mission_engine.py` — pure function `select_mission(user_id, time_budget, weak_concepts, decay_signals) → Mission`
- `daily_missions` table (mission_id, user_id, generated_at, mission_kind, concept_id, expected_minutes, expected_questions, why_picked, status)
- `POST /missions/today` (generate or fetch existing) and `POST /missions/{id}/start` and `POST /missions/{id}/complete`
- Mission types: `refresh_decay` / `weak_concept_drill` / `bloom_lift` / `revision_set` / `mock_segment`

**Frontend** (web-student)
- New Home layout: mission card top, continue strip, recovery prompt (S57 connects), week preview, streak nudge
- Mission card variants for each mission_kind
- Mobile + desktop responsive via shared component

**Frontend** (web-portal)
- Mission analytics in cohort dashboard: mission start rate / completion rate per cohort

### S51 · Mobile quiz + result simplification

**Frontend** (web-student, refactor)
- Extract `QuizPlayer` shared component from `apps/web-student/src/pages/Quiz.tsx`
- Mobile variant (`< 640 px`): question-first layout, sidebar collapsed to bottom-sheet ("Adjust difficulty?", "End quiz", "Bookmark")
- Desktop variant unchanged (existing Quiz.tsx UX retained)
- Offline-recovery v0: localStorage-backed answer queue replays on reconnect

**Frontend** (web-student, QuizResult.tsx)
- Collapse into 3 zones: Score band → AI insights summary (collapsed by default, single sentence headline) → Question review
- Detail content moves into an expandable drawer (existing rich ExplainCard) — no information loss
- Per-question "Why?" CTAs (existing) re-styled as inline links not full cards

### S52 · Insights hub

**Frontend** (web-student)
- New `/insights` route with 3-zone IA: My State / What This Means / What To Do
- Routes consolidated under it (preserving the originals as deep links):
  - My State → concept-profile, syllabus-coverage, fluency, calibration
  - What This Means → diagnostic-deep-dive, error-patterns, weekly narrative (S53)
  - What To Do → mission queue, revision ritual (S56), plan preview
- Each tile has "Why am I seeing this?" link to the underlying signal

**Backend**
- No new endpoints — Insights hub is purely a re-IA over existing analytics + diagnostic endpoints. New aggregator route `GET /insights/{user_id}/snapshot` that batches calls.

### S53 · Hybrid weekly narrative

**Backend** (services/learning, extends `learning.adaptive`)
- `weekly_narratives` table (user_id, week_start, narrative jsonb, generated_at, source, model, prompt_template_id, prompt_template_version, signals_used jsonb)
- New module `learning.adaptive.weekly_narrative` with structured-output schema:
  - `improved` — 1 sentence + delta evidence
  - `slipping` — 1 sentence + decay evidence
  - `hidden_pattern` — 1 sentence + behavioural signal
  - `forecast` — 1 sentence + projected readiness
  - `week_ahead` — 1 sentence + 3-bullet plan tied to plan_sessions (S55)
- `POST /adaptive/weekly-narrative/generate` (admin / cron)
- Cron job (NATS scheduled stream): every Sunday 23:00 IST per user
- Event-triggered re-generation on: 5+ meaningful sessions / mock test completion / readiness Δ > 5pp

**Frontend** (web-student)
- Narrative card on Home, expandable
- Each section has hover/tap "Why this?" → opens evidence drawer with the signals (sessions, decay, mock results)

### S54 · Difficulty agency + adaptive trust explainer

**Backend** (services/quiz, services/learning)
- `quiz_schema.quiz_sessions` gains `intent_anchor` (text: match / push / build_confidence) and `calibration_feedback` (text: too_easy / right / too_hard, nullable)
- `POST /quiz/sessions/start` accepts `intent_anchor`
- `POST /quiz/sessions/{id}/calibration` accepts post-session feedback
- IRT engine reads intent_anchor to set initial θ̂ offset (±0.4); does NOT modify scoring
- Mid-quiz friction prompt — heuristic in `learning.adaptive.friction_prompt.py` triggers on: 3 consecutive wrong / 3 consecutive < 5s correct / >30s hesitation
- Friction-prompt UI calls `POST /quiz/sessions/{id}/intent-update` (writes a delta to session metadata; doesn't reset session)

**Frontend** (web-student)
- Pre-quiz intent selector (3 buttons + tooltip)
- Mid-quiz "Adjust difficulty?" sheet (appears once per session, dismissable)
- Post-session calibration sheet (1 question)
- "How this adapts" explainer card on first ever quiz (cookie-flag dismiss)

### S55 · Constrained plan editor

**Backend** (services/learning, new module `learning.plans`)
- `study_plans` table (user_id, generated_at, week_start, target_date, daily_minutes_goal, status, source: `ai_initial` / `ai_regenerated` / `student_edited`)
- `plan_sessions` table (plan_id, day_offset, slot, kind, concept_id, expected_minutes, expected_questions, is_required, locked_reason)
- `plan_edits` table (plan_id, user_id, edit_kind: move/swap/rest/shorten/add/regenerate, payload jsonb, occurred_at, impact_preview jsonb)
- Endpoints: `POST /plans/generate` · `GET /plans/{user_id}/active` · `POST /plans/{id}/edit` · `POST /plans/{id}/regenerate`
- Each edit produces an impact_preview synchronously: AI Gateway call (touchpoint=`plan_impact`, prompt template `plan_impact@1.0.0`) → 1-sentence consequence

**Frontend** (web-student)
- New `/plan` route under Insights hub
- Drag-to-reorder weekly board; row actions: move / swap (3 AI alternatives) / rest / shorten / add / regenerate
- Impact-preview pop-over on every action; "delete" disabled for `is_required=true`, replaced with Replace/Postpone/Split

### S56 · Topic decay + readiness bands + revision ritual

**Backend** (services/engagement, extends `engagement.analytics`)
- `topic_decay.py` — pure function computes decay score from (last_attempted_at, current_ewa, n_attempts) → (decay_days, decay_severity)
- Decay arrows surfaced on `GET /analytics/concept-mastery/{user}` response (new `decay` field per concept)
- `readiness_band(readiness_score) → "approaching" | "on_track" | "behind" | "at_risk"` — pure function with config-driven thresholds

**Frontend** (web-student)
- Topic decay arrows on Insights / Home / TopicDetail (red = >30 days no revision)
- Readiness band ribbon at top of Home with band-specific recovery actions
- Revision page rebuilt as a "ritual": recall prompt → 5-question retrieval set → mastery delta animation → next due date

### S57 · Reflection + commitment + recovery + low-bandwidth

**Backend** (services/engagement, new module `engagement.reflection`)
- `reflections_commitments` table (user_id, trigger: session/mock/weekly, prompt_id, response text, commitment text, commitment_due_at, status)
- `POST /reflections` and `POST /commitments/{id}/check-in`
- Cron: nightly scan for due commitments → notification

**Backend** (services/learning, new module `learning.recovery`)
- `recovery_engine.py` — given a study_plan with N missed sessions, output a realistic 3–4 day catch-up plan that preserves required work
- `POST /plans/{id}/recovery` — student opts in
- Triggered automatically when 2+ planned sessions are missed in a 7-day window

**Frontend** (web-student)
- Reflection prompt sheet at end of session/mock and end of weekly narrative
- Commitment input ("I will… by Friday") with notification reminder
- Recovery banner on Home when triggered ("You missed 3 sessions. Here's a 4-day plan." → review + accept)
- Low-bandwidth mode toggle in Me settings:
  - Disables animations
  - Pre-fetches text-only questions
  - Caches latex / formulas / referenced clip thumbnails offline
  - Skips video auto-load — shows poster frame only

### S58 · Polish + power-user + remaining UX

**Frontend** (web-student)
- Global command palette (⌘K / Ctrl+K) — search topics, bookmarks, history, weak topics, mocks, doubts
- Mobile Quick Actions tray (long-press FAB) — start revision, resume, ask doubt, bookmarks, weak topics, mock
- UX-30 confidence calibration: per-question "How confident?" slider on practice; aggregate Brier score on Insights
- UX-33 error-pattern coaching cards: 6-axis error classifier output rendered as per-pattern coaching cards on Insights
- UX-35 doubt-to-practice: after a doubt is resolved, recommend a 3-question set on the same concept

---

## 5. Architecture impact summary

(See `docs/01_design/13_Phase6_Architecture_Addendum.md` for full detail.)

- **No new services.** Every new module lands inside existing consolidated services (`alp-learning`, `alp-engagement`).
- **New modules in alp-learning:** `mission`, `plans`, `recovery`, `adaptive.weekly_narrative`, `adaptive.friction_prompt`.
- **New modules in alp-engagement:** `analytics.ux_events`, `analytics.topic_decay`, `analytics.readiness_bands`, `reflection`.
- **New AI Gateway prompts:** `weekly_narrative@1.0.0`, `plan_impact@1.0.0`, `recovery_plan@1.0.0`, `mission_why@1.0.0`. All structured-output, all read-through-cached per ADR pattern.
- **Quiz Go changes:** session schema gains `intent_anchor` + `calibration_feedback`; `POST /sessions/start` accepts the anchor; `POST /sessions/{id}/calibration` is new. No breaking changes to existing endpoints.
- **NATS:** new subjects `weekly_narrative.due` (cron), `mission.completed`, `plan.edited` (engagement listeners aggregate KPIs).
- **Redis:** anonymous screening-session token cache (S49), narrative-generation lock (S53).

## 6. Schema impact summary

(See `docs/01_design/14_Phase6_DatabaseSchema_Addendum.md` for full DDL.)

| Schema | New tables |
|---|---|
| `analytics_schema` (engagement) | `ux_events`, `ux_kpis_daily`, `reflections_commitments` |
| `learning_schema` (learning, content sub-schema) | `daily_missions`, `study_plans`, `plan_sessions`, `plan_edits`, `weekly_narratives` |
| `quiz_schema` (quiz) | (additive) `intent_anchor`, `calibration_feedback` columns on `quiz_sessions` |

## 7. Quality gates per sprint

| Gate | Target |
|---|---|
| Smoke step count | grows from current ~120 → ~165 by S58 close |
| Unit tests | each new pure-function module ≥ 8 boundary cases |
| KPI dashboard (UX-34) | live-monitored: 11 metrics from §13 of the UX review |
| First-time value loop | guest screening completion ≥ 60% (target landing) |
| Today's Mission start rate | ≥ 50% of returning daily-active students |
| Weekly narrative read rate | ≥ 40% of weekly-active students |
| Mobile quiz disconnect-recovery | ≥ 95% of mid-quiz network drops resume cleanly |
| LLM cost per weekly narrative | ≤ ₹0.30 (cached aggressively, regenerate gated) |
| Plan-edit-to-adherence ratio | adherence after edit ≥ adherence before edit (no worse) |

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Adding a 4-section IA breaks bookmarks for existing students | Old routes (e.g. `/concept-profile`) preserved as deep links; permanent 301 redirect from /home if anyone uses the legacy path |
| LLM-generated weekly narrative drifts in quality over weeks | Cohen's-kappa-style review pipeline (similar to S43 calibration); narrative-quality dashboard with monthly editor review of 5 sampled narratives per cohort |
| Plan editor confuses students with too many controls | Default view is "view only" with one CTA per row; full editor enters via "Customise this week"; impact preview visible on every edit before commit |
| Mobile quiz redesign regresses desktop UX | Shared `QuizPlayer` component with desktop variant identical to today; mobile is additive, not a swap |
| Recovery mode triggers too aggressively (every miss) | 2+ missed sessions in a 7-day window threshold (configurable); student-dismissible per week |
| UX-32 low-bandwidth mode complicates state | Toggle is binary (on/off); when on, only adds caching + animation suppression; doesn't fork the question payload |
| Difficulty agency inflates mastery (student games "Build confidence") | Intent_anchor never modifies the EWA write — only adjusts initial θ̂; ADR-0022 codifies this |
| Reflection prompts feel like more friction than value | Cap at 1 prompt per surface (session / mock / weekly); skippable; never blocks navigation |

## 9. Out of scope (deferred to Phase 7)

- Parent / mentor share card (UX-31) — needs new role + privacy model
- Mission Mode (gamified streaks beyond current UX) — sponsor decision
- Exam-day simulator (full timed mock with proctor sim) — full proctoring stack TBD
- Study buddy matching (peer pairing) — separate marketplace
- Audio-first / accessibility deep-work — needs separate accessibility audit + WCAG specialist

## 10. Decision gates (close before each release)

| Release | Gate to close | Owner |
|---|---|---|
| S49 (MVP-A) | UX KPI dashboard live before any other Phase 6 sprint ships | Eng |
| S50 (MVP-B) | Phase 5 S39 concept_mastery table live | Eng |
| S52 (Release-A) | Phase 5 S41 multi-dim selector live | Eng + Product |
| S53 (Release-B) | Weekly-narrative prompt v1 reviewed by 3 SMEs (1 per exam) | Editorial + Product |
| S54 (Release-C) | Intent-anchor IRT-offset bounds confirmed (±0.4) by ML eng | ML Eng |
| S55 (Long-A) | Plan-edit impact-preview prompt v1 reviewed | Editorial |
| S57 (Long-C) | Recovery FSM thresholds (miss-count, window) validated against pilot | Product + Eng |

## 11. Output deliverables tracking

| Document | Path | Status |
|---|---|---|
| Evaluation + sprint plan (this doc) | `docs/02_planning/55_Phase6_UXCoPilot_Evaluation_and_SprintPlan.md` | ✅ |
| ADR-0020 — UX Co-Pilot scope + 4-section IA | `docs/adr/0020-ux-copilot-scope-and-ia.md` | ✅ |
| ADR-0021 — Hybrid weekly learning narrative | `docs/adr/0021-hybrid-weekly-narrative.md` | ✅ |
| ADR-0022 — Difficulty agency model | `docs/adr/0022-difficulty-agency.md` | ✅ |
| ADR-0023 — Constrained plan co-editing | `docs/adr/0023-constrained-plan-coediting.md` | ✅ |
| ADR-0024 — Today's Mission as primary daily entrypoint | `docs/adr/0024-todays-mission-entrypoint.md` | ✅ |
| Architecture addendum | `docs/01_design/13_Phase6_Architecture_Addendum.md` | ✅ |
| LLD addendum | `docs/04_low_level_design/09_Phase6_LLD_Addenda.md` | ✅ |
| Database schema addendum | `docs/01_design/14_Phase6_DatabaseSchema_Addendum.md` | ✅ |
| Master phase index updated | `docs/02_planning/00_MasterPhaseIndex.md` | ✅ |
