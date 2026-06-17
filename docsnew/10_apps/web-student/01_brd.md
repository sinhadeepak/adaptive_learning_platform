# Business Requirements Document — web-student (Vidya)

| | |
|---|---|
| **Surface** | `apps/web-student` |
| **Persona** | Aryan (self-driven) · Priya (institution student) |
| **Tech** | Vite + React 18 + TypeScript + Vidya Design System v3 |
| **Doc Version** | 0.1 (DRAFT) |
| **Date** | 2026-05-27 |
| **Anchored to** | [Master BRD §5.1.1](../../00_platform/02_master_brd/master_brd.md#511-web-student-vidya) |

---

## 1. Purpose

The Vidya web-student app is the **primary B2C learning surface** for individual aspirants and institution-enrolled students. It is the canonical implementation of every learner journey — practice, test, mock, battle, marketplace browse, analytics — against which the mobile app maintains functional parity.

It is **not** the authoring or moderation surface (that's web-portal and web-admin).

## 2. Scope

### 2.1 In Scope

| Domain | Capability |
|---|---|
| **Onboarding** | Signup (email/phone), social login (Google), email/phone OTP verification, password reset, exam selection, baseline screening assessment, profile completion |
| **Auth & Account** | Login, logout, session refresh, change password, MFA enrollment (Phase 2), device management, account deletion |
| **Home** | Today's Mission (per ADR-0024), continue-where-left-off, daily streak, readiness summary card, weak-area nudges |
| **Study** | Subject → Topic → Concept browse, content viewer (text, image, video, interactive), notes, bookmarks |
| **Practice** | Quick Practice, Focused Practice, Mock Test, PYQ Drill, Revision (spaced-repetition queue), Syllabus Coverage |
| **Battle** | Matchmaking lobby, real-time battle UI, leaderboard, replay |
| **Marketplace** | Browse tutors (filter by subject/exam/rating/price), tutor profile, book session, attend live session, post-session rating |
| **Analytics** | Readiness Score (0–100), weak-areas breakdown, time-spent, accuracy trends, exam-day prediction (Phase 2), comparative cohort (Phase 2) |
| **Engagement** | Notifications (in-app + email), community threads, comments, XP, streaks, badges |
| **Settings** | Profile, exam selection change, language (en / hi at launch), notification preferences, accessibility (font size, motion reduce) |
| **Payments** | Subscribe (₹199/mo · ₹1,599/yr), upgrade, cancel, invoice history, retry failed charge |

### 2.2 Out of Scope (for this surface)

| Item | Lives In |
|---|---|
| Content authoring | web-portal |
| Question moderation queue | web-admin |
| Institution admin (batch view) | web-admin (or separate Phase 2 app) |
| Tutor profile editing + earnings | web-portal |
| Native push notifications | mobile (FCM/APNS) |

### 2.3 Scope by Phase

| Phase | web-student must ship |
|---|---|
| **Phase 1 (M0–M6)** | Onboarding · Login · Home · Study (read-only) · Practice (Quick + Focused + Mock + PYQ) · Analytics v1 (readiness + weak areas) · Subscribe · Settings |
| **Phase 2 (M6–M12)** | Battle · Marketplace (browse + book + attend) · Community · Revision (spaced-rep) · Syllabus Coverage · Analytics v2 (prediction + cohort) |
| **Phase 3 (M12–M18)** | AI features (doubt resolution, vision-based question scan via web upload) · Parent portal link |

---

## 3. Stakeholders (Surface-Specific)

| Stakeholder | Role for web-student | Decision Authority |
|---|---|---|
| **Student (Aryan/Priya)** | Primary user | Feedback only — drives UX validation |
| **Product Owner** | Functional scope owner | Approves story acceptance |
| **Frontend Lead** | Technical owner | Approves architecture, libraries |
| **Design Lead** | UX owner | Approves screen flows, motion, copy |
| **Backend Squad (identity, learning, quiz, …)** | Contract providers | Approve API shape |
| **QA Lead** | Quality gate | Approves Definition of Done |
| **A11y Champion** | WCAG 2.1 AA conformance | Sign-off on accessibility audit |

## 4. Personas (Surface View)

### 4.1 Aryan — Self-Driven NEET Aspirant

- **Device**: Mobile-first; uses web on desktop only when home (study sessions 90+ min)
- **Frequency**: 5–6 days/week, ~45 min/session
- **Goal**: Score ≥ 600/720 in NEET
- **Frustration with current state**: "I don't know if I'm ready. I waste time on topics I'm already strong in."

### 4.2 Priya — Institution Student

- **Device**: Mostly desktop in computer lab + occasional mobile
- **Frequency**: Daily (assigned by institution) + weekend self-practice
- **Goal**: Match top of her batch
- **Frustration**: "My batch sees my scores but I can't see how I compare. I don't know what to do differently."

## 5. User Journeys (Top 10 by Frequency)

| # | Journey | Frequency | Critical Path |
|---|---------|-----------|---------------|
| 1 | Daily login → home → today's mission → complete it | Daily | Login → Home → Mission CTA → Quiz → Results → Home |
| 2 | Quick Practice (10 questions) | Multiple/day | Home → Practice → Quick → Subject pick → Quiz → Results |
| 3 | Mock Test (full-length) | Weekly | Home → Practice → Mock → Mock Intro → Quiz (timed) → Detailed Results → Analytics |
| 4 | Check Readiness Score | Weekly | Home → Analytics → Readiness drill-down |
| 5 | Review weak topic | 2–3/week | Home → Weak Areas card → Topic → Content → Practice |
| 6 | PYQ Drill | 1–2/week | Home → Practice → PYQ → Year/Exam → Quiz |
| 7 | Subscribe / upgrade | One-time | Any paywall → Plan picker → Stripe → Confirmation |
| 8 | Browse tutor + book (Phase 2) | Occasional | Marketplace → Filter → Tutor profile → Book → Pay → Joined |
| 9 | Join a battle (Phase 2) | Daily for engaged users | Home → Battle → Match → Play → Result |
| 10 | Update profile / change exam | Rare | Settings → Profile → Edit → Save |

Detailed flow diagrams → [03_user_stories.md](./03_user_stories.md) §Flows

## 6. Functional Areas (High-Level)

| Area | Description | Source-of-Truth Service |
|------|-------------|--------------------------|
| FA-01 Auth & Account | Signup, login, OTP, password, sessions, device mgmt, deletion | identity |
| FA-02 Onboarding | Exam selection, baseline screening (12-item adaptive blueprint), profile completion | identity + learning |
| FA-03 Home | Today's Mission, continue, streak, readiness summary, weak-area nudges | learning + quiz (history) |
| FA-04 Study | Subject/topic/concept browse, content viewer, notes, bookmarks | learning |
| FA-05 Practice | Quick / Focused / Mock / PYQ / Revision / Syllabus Coverage modes | quiz (orchestration) + learning (content) |
| FA-06 Battle | Matchmaking, real-time play, leaderboard, replay | battle |
| FA-07 Marketplace | Tutor browse, book, session, rate | marketplace |
| FA-08 Analytics | Readiness Score, weak areas, time-spent, prediction, cohort | learning (analytics module) |
| FA-09 Engagement | Notifications, community, gamification | engagement |
| FA-10 Payments | Subscribe, upgrade, cancel, invoices | payment |
| FA-11 Settings | Profile, language, notifications, a11y, devices, deletion | identity + engagement |

Each FA decomposes into FR-IDs in [02_requirements.md](./02_requirements.md).

---

## 7. Non-Functional Requirements (Surface-Specific)

| ID | Category | Requirement | Target |
|----|----------|-------------|--------|
| NFR-WS-01 | Performance | Time to Interactive (3G simulated) | < 4 s |
| NFR-WS-02 | Performance | Largest Contentful Paint (LCP) | < 2.5 s on 4G |
| NFR-WS-03 | Performance | Quiz question render | < 200 ms after fetch |
| NFR-WS-04 | Performance | First Input Delay (FID) | < 100 ms |
| NFR-WS-05 | Bundle | JS bundle (initial route) | < 200 KB gzipped |
| NFR-WS-06 | A11y | WCAG 2.1 AA | 100% on student-facing routes |
| NFR-WS-07 | A11y | Keyboard nav | All flows reachable without mouse |
| NFR-WS-08 | A11y | Screen reader | NVDA + VoiceOver pass on top 10 journeys |
| NFR-WS-09 | Browser | Supported | Chrome/Edge/Firefox/Safari last 2 majors |
| NFR-WS-10 | Browser | Mobile web | iOS Safari 16+, Chrome Android 110+ |
| NFR-WS-11 | i18n | Languages | English (default) + Hindi at launch |
| NFR-WS-12 | Offline | Read-only content cache | Service Worker for last 5 studied concepts |
| NFR-WS-13 | Security | XSS/CSRF | Strict CSP; SameSite=strict cookies for refresh |
| NFR-WS-14 | Security | PII | No PII in URL/query/local storage logs |
| NFR-WS-15 | Observability | Frontend tracing | Sentry + OpenTelemetry web SDK |
| NFR-WS-16 | Resilience | Network loss | Graceful "you're offline" state on every page |
| NFR-WS-17 | Resilience | API failure | Toast + retry; never silent fail |
| NFR-WS-18 | Cost | LLM-driven features | Per-user rate limits surfaced as soft errors |

---

## 8. Constraints & Assumptions

### 8.1 Constraints

- **C-WS-01** Vidya design system v3 only (no custom components without design review)
- **C-WS-02** No SSR — Vite SPA only (per ADR-0003)
- **C-WS-03** All API calls via shared API client package (no inline fetch)
- **C-WS-04** State management: React Query (server state) + Zustand (client state); no Redux
- **C-WS-05** Routing: react-router v6
- **C-WS-06** Forms: react-hook-form + Zod schemas
- **C-WS-07** Test stack: Vitest (unit) + Playwright (E2E)
- **C-WS-08** No third-party tracking scripts on auth pages

### 8.2 Assumptions

- **A-WS-01** Backend OpenAPI 3.1 published per service; types generated via `openapi-typescript`
- **A-WS-02** Design specs delivered in Figma with Vidya v3 tokens applied
- **A-WS-03** Feature flag system live (per ADR-0001) — gradual rollout supported

## 9. Dependencies

| ID | Depends on | Required for |
|----|-----------|--------------|
| D-WS-01 | identity service: signup, login, OTP, refresh, social login | Onboarding + Auth |
| D-WS-02 | identity service: profile, devices, deletion | Settings |
| D-WS-03 | learning service: catalog, content, screening | Study + Onboarding |
| D-WS-04 | quiz service: session, scoring, history | Practice |
| D-WS-05 | learning service: adaptive (readiness, weak areas) | Analytics + Home |
| D-WS-06 | battle service: matchmaking, ws-session | Battle |
| D-WS-07 | marketplace service: tutor catalog, booking | Marketplace |
| D-WS-08 | payment service: checkout session, invoices, webhook events | Payments |
| D-WS-09 | engagement service: notifications, community, gamification | Notifications + Community |
| D-WS-10 | Vidya design system v3 package | Entire app |

## 10. Risks (Surface-Specific Top 5)

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|------------|
| R-WS-01 | Bundle bloat breaks NFR-WS-05 | High | Med | Route-level code-split; bundle budget in CI |
| R-WS-02 | Design system breaking changes mid-Phase 1 | Med | High | Version-pin design tokens; visual regression CI |
| R-WS-03 | Quiz state desync (user leaves mid-quiz) | High | High | Server-authoritative session; client-side reconciliation |
| R-WS-04 | Auth token race conditions across tabs | Med | High | BroadcastChannel sync + single-flight refresh |
| R-WS-05 | A11y drift over iterations | High | Med | a11y lint + axe CI on every PR |

## 11. Success Criteria

A web-student rebuild is **Done** when:

1. All Phase 1 FRs marked `Implemented` with passing tests
2. NFR-WS-01..18 verified by automated CI gates
3. Top 10 user journeys (§5) pass Playwright E2E in CI on every push
4. Lighthouse score ≥ 90 on Performance / 95 on Accessibility on Home + Quiz routes
5. WCAG 2.1 AA audit passed (manual + automated)
6. p95 server-call latency from app < 500 ms in staging load test
7. Real-user metrics (RUM) instrumented and dashboards live
8. Feature-flag wiring in place for every Phase 2 capability (dark-launch ready)

## 12. Open Questions

| # | Question | Owner | Resolve By |
|---|----------|-------|------------|
| OQ-01 | Will Class 8–9 split (per ADR-0025) ship on web-student in Phase 1? | Product Owner | Before sprint planning |
| OQ-02 | Hindi UI strings — translation source-of-truth (Crowdin?) | Design + Eng | Phase 1 Week 2 |
| OQ-03 | Confirm Stripe checkout: redirect vs embedded | Frontend + Payments | Phase 1 Week 4 |
| OQ-04 | Service Worker scope — offline practice or read-only only? | Frontend + Product | Phase 1 Week 6 |
| OQ-05 | Real-time battle: WebRTC or pure WebSocket? | Battle squad | Per ADR (separate) |

## 13. Sign-Off

| Role | Name | Date | Status |
|------|------|------|--------|
| Product Owner | _Pending_ | | |
| Frontend Lead | _Pending_ | | |
| Design Lead | _Pending_ | | |
| QA Lead | _Pending_ | | |
