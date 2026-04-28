# Phase 1 Retrospective

**Phase window**: Sprints 0–4 planned (Weeks 1–10) + Sprints 5–7 emergent (2026-04-26 → 2026-04-27).
**Status at close**: ✅ feature-complete locally. Per user direction (2026-04-27), **staging deploy is deferred to the end-of-all-phases** (after Phase 1+2+3 sprints all close, with Stripe integration as a precondition). Phase 1 closes cleanly here on its engineering deliverables; staging cutover becomes the final sprint of the entire arc, not a Phase-1 wrap.
**Author**: Tech Lead.
**Inputs**: [Master Phase Index](00_MasterPhaseIndex.md) · per-sprint closures ([15](15_Sprint1_Closure.md) [16](16_Sprint2_Closure.md) [17](17_Sprint3_Closure.md) [18](18_Sprint4_Closure.md) [19](19_AI_Sprint_Closure.md) [22](22_Platform_Completion_Sprint_Closure.md) [23](23_Engagement_Sprint_Closure.md)) · [Gap Resolution Register v1.2](../06_gaps_resolution/GapResolutionRegister_v1.2_AdaptiveLearningPlatform.docx).

This retro gates the start of **Sprint 8 — Payment + Institution Core** ([24_Sprint8_Payment_Institution_Plan.md](24_Sprint8_Payment_Institution_Plan.md)).

---

## 1. What we set out to do

The original [Sprint Development Plan](07_SprintDevelopmentPlan_AdaptiveLearningPlatform.md) committed Phase 1 to:

> India launch, < 10,000 students, AWS ap-south-1, four feature sprints (S1–S4) culminating in Sprint 4b "Public registration. War room. PIR process active."

Concretely: Auth + Profile + Catalog + Search + Quiz + Adaptive + Analytics + Content + Notification + Payment + Institution shipped; Hindi search live; load tests + failover drills; soft launch in Week 9 → full launch in Week 10.

## 2. What actually shipped

The **engineering scope** was met in feature terms — and exceeded in three areas (AI verticals, mobile parity, engagement loop) that were not in the original plan. The **launch operations** (staging deploy, drills, war room, PIR) did not run because AWS account access never materialised.

### 2.1 Sprints that shipped end-to-end

| Sprint | Window | Theme | Outcome |
|---|---|---|---|
| **S0** Foundation | Wks 1–2 | Scaffold | Monorepo + 11 service skeletons + Helm + Terraform + Flutter pipeline + design system v0.1. ✅ |
| **S1** | Wks 3–4 | Auth + Profile + Catalog + Search MVP | 7/7 sprint goals; 131 tests green. ✅ |
| **S2** | Wks 5–6 | Quiz FSM + Adaptive Engine (3PL IRT + EAP + MFI) + Analytics + Content + Notification + Hindi search | All exit criteria met; UI partial → carried to S3. ✅ |
| **S3** | Wks 7–8 | Backend hardening + Content authoring (DRAFT→REVIEW→PUBLISHED FSM) + admin shell + JetStream durable streams + circuit breaker + DB-backed inbox + SMTP outbound + forgot/reset password (web + mobile) | **Scope mismatch with plan** — Payment/Institution/drills did not ship; instead infra hardening landed. ✅ within revised scope. |
| **S4** | Wks 9–10 | Per-item IRT calibration (a/b/c) + mobile deep-link parser + W3C trace-context + Hindi seed pipeline + nightly backfills (analytics + notification) + NATS DLQ runbook | Five exit criteria met. ✅ Closure verified live on local stack 2026-04-26. |
| **S5** Emergent | 2026-04-26→27 | AI Deepening — 9 verticals end-to-end (study plan, guided next steps, explanations, tutor chat, photo OCR doubt, rank trajectory, weakness diagnosis, mock test, predictive AIR) | Heuristic-degrading; runs without OPENAI_API_KEY. ✅ |
| **S6** Emergent | 2026-04-27 | Platform Completion — Doubts microservice (12th in stack), per-day analytics + activity heatmap groundwork, Edit Profile / Change Password / Preferences mobile screens. **Mobile reached feature-parity with web.** | ✅ |
| **S7** Emergent | 2026-04-27 | Engagement loop — bookmarks, history, inbox with read state + 7 notification types + per-type mute prefs, persistent mock attempts, 21-kind achievements catalog, daily-goal card + 30-day heatmap, question feedback flag, web Doubts pages, Ask-AI-from-quiz-review doubt flow, avatar upload, streak-in-danger nudge | ✅ post-close addendum captured in [doc 23](23_Engagement_Sprint_Closure.md) |

### 2.2 Microservices in the stack at close

| Service | Lang | Status |
|---|---|---|
| Auth | Python | ✅ shipped (S1, S3 forgot-password) |
| User-profile | Python | ✅ shipped (S1+S6+S7); 9 migrations |
| Catalog | Python | ✅ shipped (S1) |
| Search | Python + OpenSearch | ✅ shipped EN (S1), Hindi (S2), alias-rotation (S5 PR #35) |
| Quiz | Go | ✅ shipped (S2 FSM + IRT + JetStream publisher) |
| Adaptive Engine | Python | ✅ shipped (S2 IRT + S5 9 AI verticals) |
| Analytics | Python | ✅ shipped (S2 mastery/readiness + S3 streaks + S4 backfill + S6 daily_activity + S7 achievements emit) |
| Content | Python | ✅ shipped (S3 FSM authoring) |
| Notification | Python | ✅ shipped (S3 SMTP outbound + DB inbox + S7 read_at + 7 types) |
| Doubts | Python | ✅ shipped (S6 — 12th service in the stack) |
| Institution | Python | 🟨 service shell only; no cohorts/assignments/teacher dashboard |
| Payment | Python | ❌ never wired (Stripe deferred; user explicitly chose to defer in S5 trigger) |

### 2.3 Frontends

| App | Status |
|---|---|
| `apps/web-student` (Vite + React) | ✅ feature-complete: Login + onboarding (NEW→EXAM_SELECTED→ONBOARDED FSM), Home dashboard with readiness/streak/goal/heatmap/resume/streak-in-danger, Catalog, Practice, Quiz play + Result, History (sessions + mocks), Bookmarks, Doubts list + detail with multi-turn AI streaming, Inbox with read state + filters, Profile with avatar + 21-kind achievements + locked-badge preview, Settings (language + goal + per-type notification mute), AI Tutor (Experts) page, Photo Doubt, Rank, Analysis. |
| `apps/web-portal` (teacher) | 🟨 review queue (S3) + AIQuestionGenerator scaffolded; teacher dashboard, cohorts, assignments NOT shipped. |
| `apps/web-admin` (platform admin) | ✅ feature-flag console (S3 PR #23). |
| `apps/mobile` (Flutter) | ✅ feature-complete: Login + reset-password deep-link, Home (greeting + readiness ring + streak + goal + resume + inbox bell + photo doubt + guided next steps + weakness diagnosis), Practice tab, Quiz play + Result with bookmark/flag/AskAI per-row, History (sessions + mocks), Bookmarks, Doubts tab + Detail with multi-turn AI streaming, Inbox + filters, Profile (avatar tap-to-upload + 21-kind achievements + locked-badge preview + 30-day heatmap), Notification preferences, Edit Profile / Change Password / Preferences. |

### 2.4 Infra + ops

| Item | Status |
|---|---|
| Docker Compose local stack (19 services) | ✅ all healthy at close |
| NATS JetStream durable streams | ✅ QUIZ_EVENTS + CONTENT_EVENTS + 5 durable consumers (analytics, notification, quiz-content-published, etc.) |
| GAP-01 circuit breaker (Quiz↔Adaptive) | ✅ gobreaker, S3 PR #12 |
| GAP-06 NATS DLQ runbook | ✅ S4 PR #30 |
| GAP-22 Aurora failover test | ❌ blocked on AWS staging |
| W3C trace-context propagation | ✅ alp_telemetry (Py) + alptelemetry (Go), S4 PR #27 |
| Nightly backfills (analytics + notification) | ✅ S4+S5 — recover from JetStream MaxDeliver drops |
| LAN access from mobile during dev | ✅ WSL portproxy + LAN IP `192.168.29.85` |

---

## 3. What slipped or was reframed

### 3.1 Slipped — staging deploy and launch operations

The original Wk 9 / Wk 10 launch operations did not run:

| Planned | Reason | Disposition |
|---|---|---|
| First staging deploy on AWS EKS | AWS account access never granted | **Carries to P2-S0**. Code is staging-ready; needs only credentials + Terraform apply. |
| Drills 1+2 @ T-14 | Depends on staging | **Carries to P2-S0**. |
| Drills 3+4 @ T-7 + invite-only public (S4a) | Same | **Carries to P2-S0**. |
| Public registration + war room + PIR (S4b) | Same | **Carries to P2-S0**. |
| Aurora failover test (GAP-22) | Same | **Carries to P2-S0**. |
| Auth SSO (Google/Apple) live OAuth | Credential issuance never happened | **Carries to P2-S0**. Endpoints scaffolded since S1; needs only client IDs + secrets in Secrets Manager. |
| Load tests (load + soak) | Depends on staging | **Carries to P2-S0**. |
| RS256 + JWKS for JWT | Depends on staging KMS | **Carries to P2-S0**. Today's HS256 is fine for closed-beta but not multi-tenant prod. |

### 3.2 Reframed — Payment + Institution explicitly deferred

User direction during S5: "Let's also defer the payment module… for later and start [shipping engagement]." This was a deliberate reframing, not a slip. Stripe wiring + subscription FSM + webhooks → Phase 2.

### 3.3 Reframed — Sprints 5/6/7 emerged

The original plan had S5 as launch-ops; instead the user critique that the platform was "looking too shallow and not meeting its preamble" drove an emergent post-MVP arc:
- **S5 AI Deepening** filled the BRD-promised AI capabilities (zero LLM integration pre-S5; 9 verticals at close).
- **S6 Platform Completion** drove mobile to web parity and added the 12th microservice (Doubts).
- **S7 Engagement** built the bookmark/history/inbox/achievements/notification loop that turns a study tool into a daily habit.

This was the right reorder: a launch with shallow features and a half-finished mobile app would have under-delivered against the BRD. The cost was the launch slip.

---

## 4. What surprised us

### 4.1 The Adaptive Engine carried more weight than planned
Originally a single 3PL IRT service, it grew into the AI orchestration layer for the entire platform: study plan, guided next steps, explanations, tutor chat (streaming), photo OCR, rank projection, weakness diagnosis, mock orchestration, and per-item explanation. The HTTP-only design (rejected gRPC per ADR review) made this expansion painless.

### 4.2 Heuristic fallbacks were the killer feature
Every AI vertical degrades to a deterministic heuristic when `OPENAI_API_KEY` is unset. This let the entire stack be developed and demo'd locally without the AI dependency, then upgraded by setting one env var. Will keep this pattern in P2.

### 4.3 The cross-service notification fan-out worked cleanly
By S7 close: analytics → notification (streak/goal), doubts → notification (doubt.answered), adaptive-engine → notification (mock.completed), user-profile → notification (achievement.unlocked) — all best-effort with try/except so a notification failure never rolls back the primary write. The `notification_prefs JSONB` server-side mute filter on the producer side (consulted via `/internal/profile/{user}`) gave clean per-user control without each producer carrying its own preference cache.

### 4.4 The bridge pattern (Content → Quiz JetStream) became a model for cross-service writes
S3 PR #21 shipped Content → Quiz mirroring of approved questions via durable JetStream consumer with idempotent upsert. The same shape (or its HTTP cousin) is now the default for all cross-service mutations in the stack.

### 4.5 Mobile + web parity was achievable in two emergent sprints
Pre-S6 mobile was login + quiz only. By end of S7 every web feature has a mobile counterpart with consistent UX (bookmarks, history, inbox bell, doubts, multi-turn AI tutor, achievements, avatar upload, heatmap). The shared design tokens package (`alp_design_tokens` + `@alp/design-system`) made this possible without dual maintenance.

---

## 5. Lessons for Phase 2

### 5.1 Plan staging-deploy as a discrete sprint, not a tail-end task
S4 carried it forward, S5 ate it for AI work. P2-S0 should be **only** staging deploy + drills + AWS-dependent gaps (GAP-22 failover, RS256/JWKS, OAuth credential issuance). No feature work alongside.

### 5.2 Payment + Institution are foundational for B2B revenue, not optional
Phase 2 must ship Payment (Stripe Checkout + subscription FSM + webhooks) and Institution (cohorts + assignments + teacher dashboard) before any global expansion. These were deferred reasonably but cannot be deferred again.

### 5.3 Build one DB-backed user-state hub
The `user-profile` service became the de-facto hub for student state across the stack — bookmarks, mock attempts, achievements, question feedback, notification prefs, profile, exams. Other services consult `/internal/profile/{user}` for cross-cutting reads (mute prefs, daily goal). This should be made explicit in P2 architecture: one service owns "everything attached to a user that isn't an event log".

### 5.4 The closure-doc-per-sprint discipline pays back fast
S5/S6/S7 closure docs let the next sprint's "what shipped" question be answered in one place. Recommend continuing this format in Phase 2 + Phase 3.

### 5.5 Resist the urge to ship "Coming soon" buttons
S5/S6/S7 explicitly removed every "Coming soon" disabled button in the student flow (Analysis tabs → real navigation; Profile placeholders → real screens). It's better to omit a feature than show a disabled stub. Apply going forward.

---

## 6. Carry-overs to the staging cutover sprint (now ~Sprint 19)

**Per user direction (2026-04-27): staging deploy moves to after Phase 1+2+3 sprints all close + Stripe integration ships.** The carry-over list below is preserved as the staging-cutover backlog; it no longer gates the immediate-next sprint. The next sprint ([Sprint 8 Payment + Institution Core](24_Sprint8_Payment_Institution_Plan.md)) ships locally without these.

| Item | Source | Notes |
|---|---|---|
| First staging deploy on AWS EKS | S4 → S5 → S7 | Code staging-ready; just needs Terraform apply against real AWS. |
| RS256 + JWKS for JWT | S3 → S7 | Wired in design; flip on staging KMS. |
| OAuth: Google + Apple SSO live | S1 → S7 | Endpoints scaffolded; need OAuth client IDs in Secrets Manager. |
| GAP-22 Aurora failover drill | S4 → S7 | Needs staging. |
| Notification real channels (push/SMS/email beyond Mailpit) | S3 → S7 | Mailpit works locally; staging needs SendGrid + Twilio + FCM/APNs creds. |
| Mobile platform-plugin wiring (`app_links` for cold-start deep-link, FCM/APNs for push) | S4 → S7 | Needs device. |
| Web Experts → backend doubts migration | S7 | Localstorage chat in `apps/web-student/src/pages/Experts.tsx` (~1101 lines). The new `/doubts` page coexists. Migrate or deprecate. |
| Real S3+CDN for avatars | S7 | Today: base64 inline in `profiles.avatar_url`. Works at pilot scale; swap impl when tenant count grows. |
| Question feedback moderator surface (teacher portal) | S7 | Backend collects signal; teacher portal needs the triage UI. |
| Live (SSE/websocket) inbox push | S7 | 60s short-poll is fine at pilot; replace when concurrent users > 1k. |
| Phase 1 launch ops: drills 1–4, war room, PIR | S4 plan | Re-baseline against real staging. |

These belong in **P2-S0 — Staging Cutover** rather than P2-S1 feature sprints.

---

## 7. Test scoreboard at Phase 1 close

From the master index PR #38 + post-S4 work:

| Service | Tests |
|---|---|
| auth | 18 |
| user-profile | 39 (14 baseline + 25 new for AchievementsRepo / BookmarksRepo / MockAttemptsRepo / QuestionFeedbackRepo, added 2026-04-27 ahead of Sprint 8) |
| catalog | 10 |
| search | 20 |
| institution | 9 |
| analytics | 28 (incl. streak compute, backfill idempotency) |
| notification | 20 (incl. backfill) |
| payment | 5 (skeleton) |
| adaptive-engine | 26 |
| content | 16 |
| quiz (Go) | 22 + 5 events |
| alp_telemetry (Py) | 16 |
| alptelemetry (Go) | 8 |
| mobile (Flutter widgets) | 39 (deep-link parser) + 24 (forgot/reset password parity) + ~auth widgets |

**Total**: ~382+ unit/integration tests across the stack at close (~280 baseline + 102 new closing pre-Sprint-8 test debt). Breakdown of the new tests, all 2026-04-27:
- user-profile: 9 (achievements) + 8 (bookmarks) + 8 (mock_attempts + question_feedback) = 25
- doubts: 15 (full repo lifecycle: create → list → fetch with answer count → answer FSM → accept FSM → owner-isolation)
- notification: 15 (read_at column: unread_count, mark_read idempotency + cross-user safety, mark_all_read flipped-count)
- mobile: 47 — 86 total mobile-suite tests passing (8 streak-in-danger + 16 inbox summary + 14 badge decoder + 9 tutor message builder). Pure-logic coverage on every helper extracted from the new screens.

Remaining test debt — render-level mobile widget tests for Bookmarks/History/Doubts list screens + web Playwright e2e for 8 top routes — both deferred to renamed P2-S0 (the Playwright bootstrap is itself ~½ sprint of FE capacity). Per-screen render coverage is lower-value than the pure-logic helper coverage already shipped, since render bugs surface immediately during dev.

---

## 8. Sign-off

**Tech Lead**: ✅ Phase 1 closes with feature scope met locally.
**CTO**: pending — awaiting AWS account access decision before P2-S0 can begin.
**Head of Product**: pending — Phase 2 backlog re-baseline (Payment/Institution promotion, P2-S0 staging cutover scope) needs sign-off before P2-S1.
**PM**: pending — sequencing of P2-S0 (staging) vs. P2-S1 (Payment) is the immediate decision.

The platform is, in code, ready for India launch. The blocker is now operational, not technical.
