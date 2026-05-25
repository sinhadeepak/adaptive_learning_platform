# Vidya Mobile Design Roadmap

**Date:** 2026-05-25
**Status:** Draft — awaiting user review
**Scope:** Sequenced roadmap from current Phase 2c (screening) through Vidya replacing Aurora as the sole post-auth surface.

---

## Strategic decisions baked into this roadmap

1. **Vidya replaces Aurora entirely.** Aurora's `MainScaffold` (6-tab shell) and its ~40 screens are migrated to a Vidya-native 5-tab shell. Aurora is eventually deleted. This is the most aggressive of the four options considered; lower-risk alternatives (Vidya pre-auth only, Vidya shell wrapping Aurora screens) were declined.
2. **Guest screening is a GTM pillar.** The unauthenticated 5-minute screening funnel ("See where you stand. Before signing up.") is the primary acquisition path. The dark sign-up gate on the result reveal ships with this phase.

These two decisions are load-bearing — every phase below assumes them.

---

## Current state (2026-05-25)

| Surface | Status |
|---|---|
| Splash / Welcome / 3 onboarding cards | Shipped (text-only — design has rich visuals) |
| Auth (login / register / OTP verify / forgot / new-password) | Shipped Phase 2b |
| Exam select | Shipped Phase 2a (basic — no icon badges, no subtitles, no aspirant counts) |
| Authenticated screening (intro / quiz / result) | Shipped Phase 2c |
| Post-auth surface | Routes to Aurora `MainScaffold` |
| Guest screening | Deferred in 2c |
| θ-live quiz overlay | Not built — screening quiz has minimal chrome |
| Vidya post-auth shell + Home / Study / Practice / Insights / More | Not built |
| Weekly Story (Vidya) | Not built (Aurora has analogue: `weekly_narrative_card.dart`) |
| Offline practice (Vidya) | Not built (Aurora has offline-quiz-queue logic in `quiz_offline_queue_test.dart`) |

**Backend that already exists** (verified):

- `weekly_narrative` (alembic 027 + service code + mobile client at `lib/weekly_narrative/`)
- `readiness_client` + `readiness_widgets`
- `session_insights`
- `error_classifier` (6-axis from S29)
- `common_mistakes` aggregation
- `analytics` mistake-pattern endpoints
- Authenticated and anonymous `/screening/*` (Phase 2c verified)

**Backend asks** added below per phase.

---

## Phase decomposition

```
PRE-AUTH POLISH                       POST-AUTH FORK + MIGRATION

Phase 2d  Pre-auth design polish     Phase 3a  Vidya shell + Home (FORK)
Phase 2e  Guest screening funnel ★   Phase 3b  Vidya Study tab
Phase 2f  θ-live quiz overlay        Phase 3c  Vidya Practice + θ-live use
                                     Phase 3d  Vidya Insights + Weekly Story
                                     Phase 3e  Vidya More + Profile
                                     Phase 3f  Vidya offline practice
                                     Phase 3g  Aurora deletion sweep
```

Total mobile effort: ~11–14 weeks across 9 phases. Some phases parallelisable after 3a (the shell fork).

---

## Phase 2d — Pre-auth design polish

**Goal:** Bring shipped pre-auth screens up to design spec without adding new flows or backend asks.

**Effort:** ~1 week.

**Screens touched:**

- `VidyaSplashScreen` — italic "i" accent on logo, "THE ADAPTIVE TUTOR" tagline.
- `VidyaWelcomeScreen` — EN/हि language toggle (top-right), "WELCOME TO VIDYA" eyebrow, headline with italic accent on "adaptive", "I already have an account" text link, terms text below CTAs.
- `VidyaOnboardingCardScreen` — currently text-only. Designs show three card-specific rich illustrations:
  - Card 1: P(correct) vs ability sigmoid with "YOU" marker. Eyebrow "ADAPTIVE ENGINE · 3-PL IRT", headline "Every question, tuned to you."
  - Card 2: Readiness dial 728/900. Eyebrow "READINESS SCORE", headline "One number, every day."
  - Card 3: Weekly topic-allocation bars (Thermodynamics 62%, Organic chemistry 24%, Cell biology 14%). Eyebrow "DAILY PLAN", headline "The shortest path to your rank."
- `VidyaExamSelectScreen` — add icon badge per exam (NEET / JEE / UPSC / CBSE / GATE), sub-category text ("Medical · MBBS / BDS / AYUSH"), aspirant volume ("2.4M aspirants"), selected-state checkmark + accent, exam-aware CTA ("Continue with NEET →").
- `VidyaLoginScreen` — vidya logo at top, floating-label fields, "Forgot password?" inline right of password field, divider, "Continue with OTP instead" button (deferred — backend dependency, see below).

**New primitives needed in `alp_design_tokens`:**

- `VidyaLangToggle` (EN/हि segmented control)
- `VidyaSigmoidIllustration` (3-PL IRT curve with marker — could be a static asset for v1; SVG for accuracy)
- `VidyaReadinessDial` (animated radial 0/900 with current value — already exists in `readiness_widgets`; needs Vidya-themed variant)
- `VidyaTopicBarStack` (named horizontal bars with percent labels)
- `VidyaExamCard` (icon badge + name + subtitle + volume + radio)

Re-using `VidyaCard`, `VidyaButton`, `VidyaScaffold` from existing primitives.

**Backend asks:**

- **Passwordless login endpoints** (`POST /auth/otp/request` + `POST /auth/otp/login`). Listed in Phase 2b deferred items. Blocks the "Continue with OTP instead" button only — Phase 2d can ship without this button if backend slips, leaving a comment.

**Dependencies:** None blocking. Can ship after Phase 2c (current state).

**Risk:** Low. No state machine changes. Pure presentation polish.

**Acceptance:**

- Visual side-by-side against the 9 design slides shows match within tolerance.
- All Phase 2a/2b tests continue to pass.
- New widget tests cover lang-toggle interaction, exam-aware CTA label, onboarding card visuals.

---

## Phase 2e — Guest screening funnel (★ GTM pillar)

**Goal:** Ship the unauthenticated pre-sign-up screening funnel: welcome → guest exam select → guest screening intro → guest quiz → guest result with dark sign-up gate → register → claim-and-persist.

**Effort:** ~1–2 weeks.

**New state machine routes in `VidyaRootApp`** (extends Phase 2c's 15-state enum):

```
welcome → "Get started — it's free" → guestExamSelect
guestExamSelect → Continue → guestScreeningIntro
guestScreeningIntro → Start → guestScreeningQuiz
guestScreeningQuiz → onCompleted(guestToken) → guestScreeningResult
guestScreeningResult → "Sign up free" → register (with pending guestToken)
register → onRegistered → verifyOtp → onVerified → claim guestToken → persist → home
```

The "I already have an account" link on welcome routes straight to login (existing).

**Screens:**

- `VidyaGuestExamSelectScreen` (slimmer than authed exam select — same exam cards, but no profile save; just stores selection in memory + secure storage as `vidya.guest_exam_code`).
- `VidyaGuestScreeningIntroScreen` (different from authed intro — copy "5-MINUTE SCREENING · See where you stand. Before signing up.", info rows for Time / Questions / You'll get / Privacy).
- Reuse `VidyaScreeningQuizScreen` from Phase 2c — `ScreeningClient.start/next/answer` are already unauthenticated.
- `VidyaGuestScreeningResultScreen` — dark hero variant of the authed result screen:
  - Black hero card: "YOUR READINESS TODAY" + big number + percentile + θ
  - "WITH VIDYA, IN 12 WEEKS ~780 (rank ~ 2,400)" projection
  - Subject bars (Physics / Chemistry / Biology)
  - "UNLOCK YOUR FULL REPORT — 22 weak topics identified" sign-up gate
  - CTA: "Sign up free →"

**Backend asks:**

- **Guest-token claim endpoint.** When a guest's screening completes, the `guestToken` lives in secure storage. After register+verify, the app needs to associate that token with the new user and trigger persist. Two options:
  - **Option A (recommended):** Extend existing `POST /screening/{token}/persist` (currently requires auth) to also accept an unauthenticated body containing the user-id-just-created plus a verification proof (the verify OTP's success token). Backend already has the token's anonymous attempt history; this just associates it.
  - **Option B:** New endpoint `POST /screening/{token}/claim` accepting an auth header from the newly-registered user; persist is then called normally. Cleaner separation; one extra round-trip.
- **Projection endpoint** for "WITH VIDYA, IN 12 WEEKS ~780". Could be derived in mobile from the readiness_seed in the existing `/reveal` payload via a simple multiplier, but a backend-computed projection is more defensible and testable. Tentative: add `projected_readiness_12w` + `projected_rank` to `/screening/{token}/reveal` response.

**Dependencies:**

- Soft: Phase 2d for design system polish on exam cards (the guest funnel shows them too).
- Hard: backend guest-token claim endpoint before Phase 2e can ship end-to-end. Mobile can build behind a stub.

**Risk:** Medium. The state machine grows again (17–18 states). Two parallel screening flows (guest vs authed) sharing the same quiz screen + client risks divergence. Mitigation: lift screening orchestration into a `VidyaScreeningFlow` controller class that both code paths use, parameterised on `mode: ScreeningMode.guest | ScreeningMode.authed`.

**Acceptance:**

- Cold-start guest can complete screening and see result without ever signing up.
- Tapping "Sign up free" then completing register+verify lands on home with the screening attempt persisted to the new user.
- Tests cover both happy paths and the "guest abandons after seeing result" case (no zombie tokens).

---

## Phase 2f — θ-live quiz overlay

**Goal:** Add the LIVE θ readout box and richer chrome to the quiz screen.

**Effort:** ~3–5 days (mobile) + backend dependency.

**Screens touched:**

- `VidyaScreeningQuizScreen` — add:
  - Header timer (`14:32` countdown from session start) + `X` close icon
  - Progress as filled bar + `7 / 12` counter (already partly there)
  - Question metadata tag row: marks (`4 marks`), difficulty (`b + 0.71`), subject + topic (`Physics · Thermo`)
  - **LIVE θ readout card** below choices: shows current θ, trend arrow, next-question difficulty preview ("Next Q diff ↑ to 0.84"), narrative ("You're answering above your zone.")

The θ card is the key new visual element. It's also the key product differentiator surfacing the adaptive engine to the user.

**Backend asks:**

- **Extend `/screening/{token}/next` response** with: current θ estimate after the previous answer, current θ delta vs start, current standard error, predicted next-question difficulty (b-value of the item being served). The screening pipeline computes these internally; just needs exposure.
- Alternatively, a separate `GET /screening/{token}/theta` endpoint called between questions. Less efficient; not recommended.

**Dependencies:**

- Applies to both authed (Phase 2c) and guest (Phase 2e) quiz screens. Can ship for both simultaneously since both use the same widget after the Phase 2e controller refactor.
- Hard: backend θ-exposure on /next.

**Risk:** Low-to-medium. Backend exposure is small. UX risk: showing θ to a struggling student may be discouraging — copy must frame it positively ("You're answering above your zone" is good; "You're at -1.2 θ" is bad).

**Acceptance:**

- After each answer, the θ readout updates in <300ms (excluding network).
- Copy is positive-framed for all θ ranges (test with mocked θ = -2.0 to +2.0).
- The card collapses gracefully when the backend omits θ fields (forward-compatibility with environments that haven't deployed the new /next yet).

---

## Phase 3a — Vidya shell + Home (the fork point)

**Goal:** Replace `AuroraRoute(MainScaffold)` with `VidyaMainShell` containing the 5-tab Vidya bottom nav. Ship Home tab fully built; stub the other 4 tabs to placeholder screens.

**Effort:** ~2–3 weeks. This is the largest single phase.

**Architecture:**

- New file: `apps/mobile/lib/vidya/shell/vidya_main_shell.dart` — analogous to Aurora's `MainScaffold` but with Vidya nav: Home / Study / Practice / Insights / More.
- New file: `apps/mobile/lib/vidya/shell/vidya_bottom_nav.dart` — 5-tab nav with Vidya icons + active-state styling matching slide 7.
- New file: `apps/mobile/lib/vidya/screens/vidya_home_screen.dart` — full Home implementation per slide 7.
- Stub screens for the other 4 tabs: `VidyaStudyTabPlaceholder`, `VidyaPracticeTabPlaceholder`, `VidyaInsightsTabPlaceholder`, `VidyaMoreTabPlaceholder` — each renders a "Coming soon" card OR temporarily routes to the equivalent Aurora tab via `AuroraRoute` (recommended — keeps features available during migration).
- `VidyaRootApp._VidyaScreen.home` case: switch from `AuroraRoute(MainScaffold)` to `VidyaMainShell`.
- **Soft-rollback flag**: `debug.use_aurora_shell` in secure storage; when `'true'`, `home` still routes to Aurora. Gives an instant rollback path during 3a–3f.

**Home screen content (per slide 7):**

- Header: greeting ("Hi, Aarav.") + date ("WED · MAY 16") + avatar circle + notification bell with badge.
- NEET READINESS card: big number (`728 / 900`) + trend chart (12-week sparkline) + delta pill (`+18`).
- NEXT SESSION card: topic title + predicted readiness gain ("+4 readiness pts predicted") + Start button.
- Stats tile row: STREAK / TODAY (3 / 5) / MOCKS (14).
- TODAY checklist: 3-of-5 items, completed items struck-through.

**Backend asks:**

- **Unified `/home` endpoint** (recommended) — returns greeting context, readiness + trend, next-session, stats, today checklist in one call. Otherwise 5 parallel fetches degrade home cold-start.
- All underlying data exists; this is an aggregation + caching concern, not a new feature.

**Dependencies:**

- Phase 2d for primitives (sigmoid, dial, topic bars get reused on home).
- Soft: Phases 2e / 2f can land before or after 3a — they only touch pre-auth.

**Risk:** High. This is the fork point. Three specific risks:

1. **Test regressions.** The existing root-app tests (`vidya_root_app_test.dart`) currently assert Aurora's MainScaffold behaviours when authenticated. Those tests need updating to assert VidyaMainShell.
2. **InboxBell timer issue.** Aurora's `InboxBellButton` runs a 60s `Timer.periodic` that breaks `pumpAndSettle()`. Vidya's new nav must avoid this pattern or use a similar test-friendly construction.
3. **Feature-parity gap.** While Phase 3a stubs the other 4 tabs, users tapping Study / Practice / etc. either see "Coming soon" (bad UX) or route to Aurora (preserves UX but exposes the visual transition between Vidya and Aurora). Recommendation: route to Aurora during migration; ship a single banner "We're rebuilding this — Vidya version coming soon" on the Aurora-themed tabs.

**Acceptance:**

- Authenticated user lands on `VidyaMainShell` instead of Aurora.
- All 6 existing root-app tests pass (after appropriate updates).
- The `debug.use_aurora_shell = true` flag round-trips to Aurora flawlessly.
- Home screen renders all 5 sections with mock data.

---

## Phase 3b — Vidya Study tab

**Goal:** Replace Aurora's `ProgressTab` with the Vidya Study screen.

**Effort:** ~1 week.

**Screens:**

- `VidyaStudyScreen` per slide 8 (left panel):
  - Subject toggle pills (Physics / Chemistry / Biology — exam-aware).
  - Chapter list rows: number badge + name + mastery progress bar + mastery percentage.
  - Tap chapter → chapter detail screen (Phase 3b includes the detail screen too, or temp-routes to Aurora `concept_profile_screen.dart`).

**Backend asks:** None new. Reuses existing catalog + analytics APIs (`/catalog/topics`, `/analytics/concept-mastery/{userId}`).

**Dependencies:** Phase 3a (shell must exist to host the tab).

**Risk:** Low. Mostly a list view with backend data.

**Acceptance:**

- Subject toggle filters chapter list per exam blueprint.
- Mastery bars match the values in Aurora's `ProgressTab` for the same user (numerical parity check).
- Aurora `ProgressTab` can be deprecated after this lands.

---

## Phase 3c — Vidya Practice tab + θ-live integration

**Goal:** Replace Aurora's `PracticeTab` with the Vidya Practice screen, threading the Phase 2f θ-live quiz UI into authed practice sessions.

**Effort:** ~1.5 weeks.

**Screens:**

- `VidyaPracticeScreen` per slide 8 (right panel):
  - "TUNED TO YOUR θ TODAY" eyebrow.
  - Dark recommended-session card: topic, question count, predicted readiness gain, θ + weakness + stake metrics, Start button.
  - "OR PICK YOUR OWN" divider.
  - 4 alternative session type cards: Quick drill (5 Qs / 10 min), Subject focus (20 Qs / 30 min), Weakness sprint (15 Qs / 25 min), Mixed bag (50 Qs / 60 min).
- `VidyaPracticeSessionScreen` — full-screen quiz reusing `VidyaScreeningQuizScreen` (after Phase 2e controller refactor) with θ-live overlay from Phase 2f.

**Backend asks:**

- **Recommended-session endpoint** (`GET /adaptive/recommended-session/{userId}`) — returns the "Thermodynamics · 12 questions · +18 readiness predicted" payload. The selection logic exists internally in adaptive-engine; needs an HTTP surface.
- Session-type endpoints — likely already exist via `/quiz/sessions/start` with a session-type parameter. Audit during planning.

**Dependencies:** Phase 3a (shell), Phase 2f (θ overlay).

**Risk:** Medium. Practice is the highest-engagement post-auth surface; UX regressions vs Aurora hurt retention.

**Acceptance:**

- Recommended session card surfaces a non-trivial topic per user.
- Each session-type card starts a quiz of the right shape (count + duration).
- Aurora `PracticeTab` can be deprecated.

---

## Phase 3d — Vidya Insights tab + Weekly Story

**Goal:** Replace Aurora's `RankTab` + analytics surfaces with Vidya Insights, plus the immersive Weekly Story screen.

**Effort:** ~1.5 weeks.

**Screens:**

- `VidyaInsightsScreen` per slide 9 (left panel) + slide 10 (left panel):
  - "LAST 30 DAYS · My analysis" header.
  - Mastery Index card with delta + 30-day sparkline.
  - Questions + Avg Time stat tiles.
  - Mistake Patterns horizontal bars (Misreading 32%, Calculation slip 24%, Formula confusion 18%, Concept gap 14%, Out of time 12% — from `error_classifier` 6-axis).
  - "YOUR EDGE" dark callout card.
- `VidyaWeeklyStoryScreen` per slide 10 (right panel) — dark immersive single-screen card:
  - "YOUR WEEK · #18 OF 2026" header
  - "You crushed Genetics." headline (subject is dynamic from `weekly_narrative` service)
  - Body narrative
  - Big delta "+19 pts" mastery-gained
  - Sub-topic chips ("Mendelian inheritance · Dihybrid cross · Pedigree analysis · Sex linkage · Linkage & recombination")
  - Per-day sparkline at bottom

**Backend asks:** None new. `weekly_narrative` + `error_classifier` + `common_mistakes` + `analytics` already exist.

**Dependencies:** Phase 3a (shell).

**Risk:** Low-to-medium. Weekly Story is presentation-heavy (the dark theme + typography is brand-defining); needs design QA pass.

**Acceptance:**

- Insights tab renders identical numbers to Aurora's analytics surfaces.
- Weekly Story renders the current week's narrative pulled from `/adaptive/weekly-narrative/current/{userId}`.
- Aurora `RankTab` + analytics screens can be deprecated.

---

## Phase 3e — Vidya More + Profile

**Goal:** Replace Aurora's `DoubtsTab` + `ProfileTab` with a single Vidya More tab plus a Profile subscreen.

**Effort:** ~1 week.

**Screens:**

- `VidyaMoreScreen` per slide 9 (middle panel):
  - "LEADERBOARD · THIS WEEK" preview (top 3 + current user position) → tap "See all" opens leaderboard detail (likely an Aurora screen re-themed, or a new Vidya screen).
  - SUPPORT section: Expert help (with count + avg reply time), Study groups, Announcements, Achievements, Language.
- `VidyaProfileScreen` per slide 9 (right panel):
  - User card (avatar + name + exam + class + city).
  - Plan card (tier + price + renewal date + status pill).
  - Mentor + Institute rows.
  - SECTIONS list: Account & profile, Notifications, Language, Privacy & security, Appearance, Billing & payments, Help & contact, Terms · Privacy policy.

**Backend asks:** None new. Reuses existing profile + leaderboard + billing + notification endpoints.

**Dependencies:** Phase 3a.

**Risk:** Low. Mostly list/form views.

**Acceptance:**

- All sections from Aurora `ProfileTab` are reachable from Vidya Profile.
- Doubts can be filed and viewed via the "Expert help" entry under More → Support.
- Aurora `DoubtsTab` + `ProfileTab` can be deprecated.

---

## Phase 3f — Vidya offline practice

**Goal:** Vidya-themed offline practice surface that uses Aurora's existing offline-quiz-queue logic.

**Effort:** ~3–5 days.

**Screens:**

- `VidyaOfflinePracticeScreen` per offline-slide:
  - Offline status indicator at top ("Offline · saved to sync queue")
  - Progress bar + counter
  - Question stem + 4 option cards
  - "AI signal unavailable offline · Your θ updates and difficulty adjustments will apply on next sync. Practice continues normally." notice

The orchestration (caching questions while online, queueing answers while offline, replaying on reconnect) is preserved from Aurora's existing `quiz_offline_queue` system — Phase 3f just rebrands the UI.

**Backend asks:** None new.

**Dependencies:** Phase 3a (shell — offline practice is invoked from Vidya Practice tab when network is down). Could ship alongside Phase 3c.

**Risk:** Low-to-medium. Offline correctness is hard; we are reusing already-tested logic.

**Acceptance:**

- Switching device to airplane mode mid-session continues to work end-to-end.
- Offline answers appear in analytics after reconnect.

---

## Phase 3g — Aurora deletion sweep

**Goal:** Delete Aurora `MainScaffold` + Aurora-only screens now that every Vidya tab ships.

**Effort:** ~3–5 days.

**Approach:** Per-screen audit + small per-screen PRs:

1. Inventory which Aurora widgets/screens are still imported anywhere under `apps/mobile/lib/` or `apps/mobile/test/`.
2. For each, decide:
   - **Delete** — Aurora-only, no Vidya consumer.
   - **Keep** — Vidya consumes it via wrapping (e.g., shared low-level widgets).
   - **Migrate** — replace consumer's import to a Vidya analogue, then delete.
3. Delete `MainScaffold`, all `*_tab.dart` Aurora files, the `AuroraRoute` bridge (no longer needed).
4. Remove `debug.use_aurora_shell` flag and any rollback paths.
5. Update root-app tests to drop Aurora references.

**Backend asks:** None.

**Dependencies:** All of Phases 3a–3f must be shipped and stable in production for at least 1 week.

**Risk:** Medium. This is reversible only via git. Recommendation: do it across 5–10 small PRs, each verifiable independently. Do not bundle into one mega-deletion.

**Acceptance:**

- `grep -r 'aurora' apps/mobile/lib/` returns no matches (except history comments if any).
- Bundle size reduction quantified.
- All tests still pass.

---

## Cross-phase concerns

**Test strategy.** Each phase ships with widget tests for new screens, plus root-app integration tests that assert state-machine routing. The Phase 2c TDD pattern (test → impl → verify pass → commit) carries forward.

**Visual QA.** Each phase needs a side-by-side visual review against the design slides before merge. Suggestion: pin each slide to its phase's PR description so reviewers can compare.

**Feature flagging.** Phases 3a–3f ship behind the `debug.use_aurora_shell` rollback flag. After Phase 3g the flag is removed.

**Migrating tests.** Every Aurora tab being replaced has tests; ensure equivalent coverage exists on the Vidya side before deleting Aurora's tests in 3g.

**Backend coordination.** Phases 2d (passwordless login), 2e (guest-token claim + projection), 2f (θ on /next), 3a (/home aggregation), 3c (recommended-session endpoint) have backend asks. Recommendation: open a single backend tracking issue at start of Phase 2d listing all 5 asks with target dates per phase.

**Design system completeness.** Phases 2d + 3a introduce new primitives (lang toggle, sigmoid illustration, exam card, bottom nav, readiness dial variant, topic bar stack). These should land in `packages/design-tokens-flutter` with their own widget tests and Storybook-style gallery entries.

---

## Open questions for future brainstorm sessions

These are tagged for resolution when the relevant phase is planned, not now:

1. **Phase 2e:** Which guest-token claim option (A: extend persist; B: new claim endpoint)?
2. **Phase 2f:** Copy strategy for θ readout across full range (-2.0 to +2.0) — needs UX writer pass.
3. **Phase 3a:** Soft-rollback flag name + lifecycle — auto-clear after a release window, or manual cleanup in 3g?
4. **Phase 3a:** During 3a–3f, do non-Home tabs show "Coming soon" placeholders, or route to Aurora? (Recommended: route to Aurora with a banner.)
5. **Phase 3d:** Weekly Story entry point — is it surfaced from Home (e.g., a "Your week ↗" card) or only from Insights? Or both?
6. **Phase 3e:** Leaderboard detail screen — Vidya-native or themed Aurora?
7. **Phase 3g:** Should we leave a small Aurora-themed debug surface accessible from More → Developer for QA/internal use, even after public deletion?

---

## Suggested execution order

```
Week 1        2d Pre-auth polish
Week 2–3      2e Guest screening funnel  (backend: claim endpoint in parallel)
Week 3.5      2f θ-live overlay          (backend: /next θ exposure)
Week 4–6      3a Vidya shell + Home      (backend: /home aggregation)
Week 7        3b Study tab
Week 8–9      3c Practice + θ-live use   (backend: recommended-session endpoint)
Week 10–11    3d Insights + Weekly Story
Week 12       3e More + Profile
Week 12.5     3f Offline practice
Week 13       3g Aurora deletion sweep
```

This sequence assumes backend asks land on time. If backend slips, 2e/2f/3a/3c can ship visually first against stubbed endpoints, then enable real data later.

---

## Out of scope for this roadmap

- Web (`apps/web-student`, `apps/web-portal`, `apps/web-admin`) — the user confirmed Vidya replacing Aurora is on mobile; web Vidya is a separate planning exercise.
- Parents' weekly email (slide reference) — server-side template, not mobile.
- Hindi i18n — deferred per Phase 2c notes; lands as a separate phase when the Hindi seed pipeline is wired into Vidya copy keys.
- Authoring + content-moderation surfaces — Phase 5 (multi-parameter engine) plan; out of scope here.
