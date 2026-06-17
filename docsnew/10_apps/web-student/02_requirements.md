# Requirements Catalogue — web-student (Vidya)

**Anchored to:** [BRD §6 Functional Areas](./01_brd.md#6-functional-areas-high-level) · [Master BRD §5.1.1](../../00_platform/02_master_brd/master_brd.md#511-web-student-vidya)

**ID convention:** `FR-WS-<FA>-<NN>` for Functional · `NFR-WS-<NN>` already defined in [BRD §7](./01_brd.md#7-non-functional-requirements-surface-specific)

**Priority:** P0 = MVP must-have · P1 = Phase 1 should-have · P2 = Phase 2+ · P3 = nice-to-have / deferrable

**Status:** TBD (planning) · IN-DEV · DONE · DEFERRED

---

## FA-01 — Auth & Account

| ID | Requirement | Priority | Phase | Source Service |
|----|-------------|----------|-------|----------------|
| FR-WS-01-01 | User can sign up with email + password | P0 | 1 | identity |
| FR-WS-01-02 | User can sign up with phone + OTP | P0 | 1 | identity |
| FR-WS-01-03 | User can sign in with Google (OAuth2) | P0 | 1 | identity |
| FR-WS-01-04 | User can sign in with email/phone + password | P0 | 1 | identity |
| FR-WS-01-05 | User receives a 6-digit OTP via email valid for 10 min | P0 | 1 | identity |
| FR-WS-01-06 | User receives a 6-digit OTP via SMS valid for 5 min | P0 | 1 | identity (Twilio) |
| FR-WS-01-07 | User can reset password via email link | P0 | 1 | identity |
| FR-WS-01-08 | Session refresh happens silently 60 s before access-token expiry | P0 | 1 | identity |
| FR-WS-01-09 | User can sign out — invalidates refresh token server-side | P0 | 1 | identity |
| FR-WS-01-10 | User can list and revoke active sessions / devices | P1 | 1 | identity |
| FR-WS-01-11 | User can enable TOTP-based MFA | P2 | 2 | identity |
| FR-WS-01-12 | User can request account deletion (soft delete + 30-day grace) | P0 | 1 | identity (DPDPA) |
| FR-WS-01-13 | Failed-login rate limit: 5 attempts / 15 min per identifier; CAPTCHA after 3 | P0 | 1 | identity + edge |
| FR-WS-01-14 | All auth pages render without third-party tracking scripts | P0 | 1 | web-student |

## FA-02 — Onboarding

| ID | Requirement | Priority | Phase | Source Service |
|----|-------------|----------|-------|----------------|
| FR-WS-02-01 | New user selects target exam (NEET / JEE / UPSC / CBSE-class-8/9/10/11/12) | P0 | 1 | identity (profile) |
| FR-WS-02-02 | User can change target exam later from Settings (re-screens) | P0 | 1 | identity + learning |
| FR-WS-02-03 | User completes baseline screening — 12-item adaptive blueprint | P0 | 1 | learning |
| FR-WS-02-04 | Screening result yields initial θ estimate per subject (heuristic in Phase 1) | P0 | 1 | learning |
| FR-WS-02-05 | User can skip screening — flagged in profile; nudged later | P1 | 1 | learning |
| FR-WS-02-06 | Onboarding can be resumed if abandoned mid-flow | P0 | 1 | web-student (local) |
| FR-WS-02-07 | Profile-completion meter shown until 100% (name, exam, grade, language) | P1 | 1 | web-student |

## FA-03 — Home

| ID | Requirement | Priority | Phase | Source Service |
|----|-------------|----------|-------|----------------|
| FR-WS-03-01 | Home shows Today's Mission (1 primary CTA, per ADR-0024) | P0 | 1 | learning (recommendation) |
| FR-WS-03-02 | Home shows readiness summary (current score + delta this week) | P0 | 1 | learning (analytics) |
| FR-WS-03-03 | Home shows "Continue where you left off" tile when an in-progress quiz exists | P0 | 1 | quiz |
| FR-WS-03-04 | Home shows current streak + longest streak | P1 | 1 | engagement |
| FR-WS-03-05 | Home shows top 3 weak topics with one-tap drill-in | P0 | 1 | learning |
| FR-WS-03-06 | Home shows upcoming mock test reminder when scheduled | P1 | 1 | learning |
| FR-WS-03-07 | Home shows in-app announcement banner when active | P1 | 1 | engagement |
| FR-WS-03-08 | Home loads with skeleton state under 200 ms perceived | P0 | 1 | web-student |

## FA-04 — Study

| ID | Requirement | Priority | Phase | Source Service |
|----|-------------|----------|-------|----------------|
| FR-WS-04-01 | User can browse Subject → Topic → Concept tree | P0 | 1 | learning (catalog) |
| FR-WS-04-02 | Concept view shows mastery score + last-studied date | P0 | 1 | learning |
| FR-WS-04-03 | Content viewer renders text, image, video, interactive widgets | P0 | 1 | learning |
| FR-WS-04-04 | User can bookmark a concept | P1 | 1 | learning |
| FR-WS-04-05 | User can add a private note per concept | P1 | 1 | learning |
| FR-WS-04-06 | "Practice this concept" CTA always visible in content viewer | P0 | 1 | web-student |
| FR-WS-04-07 | Last 5 studied concepts are cached for offline read (Service Worker) | P2 | 1 | web-student |

## FA-05 — Practice

| ID | Requirement | Priority | Phase | Source Service |
|----|-------------|----------|-------|----------------|
| FR-WS-05-01 | **Quick Practice**: 10 adaptive items, no time pressure | P0 | 1 | quiz + learning |
| FR-WS-05-02 | **Focused Practice**: user picks 1–N topics, N items (5–50) | P0 | 1 | quiz + learning |
| FR-WS-05-03 | **Mock Test**: full-length, timed, blueprint-driven | P0 | 1 | quiz + learning |
| FR-WS-05-04 | **PYQ Drill**: filter by exam-year and section | P0 | 1 | quiz + learning |
| FR-WS-05-05 | **Revision**: spaced-rep due-items queue (SM-2 + EWA per ADR-0014) | P1 | 2 | learning + quiz |
| FR-WS-05-06 | **Syllabus Coverage**: progress bars per topic; tap to drill | P1 | 2 | learning |
| FR-WS-05-07 | All 22 question types render with their handler (per ADR-0018) | P0 | 1 | quiz |
| FR-WS-05-08 | Quiz session resumable on disconnect (server-authoritative) | P0 | 1 | quiz |
| FR-WS-05-09 | User can flag a question (report bug, suggest edit) | P1 | 1 | quiz + engagement |
| FR-WS-05-10 | Detailed results: per-item correctness, time spent, explanation reveal | P0 | 1 | quiz + learning |
| FR-WS-05-11 | Mock test result includes section-wise + topic-wise breakdown | P0 | 1 | quiz + learning |
| FR-WS-05-12 | Mock test result includes rank prediction (Phase 2, per ADR-0015) | P2 | 2 | learning |

## FA-06 — Battle

| ID | Requirement | Priority | Phase | Source Service |
|----|-------------|----------|-------|----------------|
| FR-WS-06-01 | User can join 1v1 battle by topic + difficulty band | P1 | 2 | battle |
| FR-WS-06-02 | Matchmaking time visible; abort allowed after 30 s | P1 | 2 | battle |
| FR-WS-06-03 | Real-time question delivery + answer ack < 150 ms p99 | P1 | 2 | battle |
| FR-WS-06-04 | Disconnect → 30 s grace → forfeit | P1 | 2 | battle |
| FR-WS-06-05 | Post-battle: rating update, XP award, replay link | P1 | 2 | battle + engagement |
| FR-WS-06-06 | Daily/weekly leaderboard per exam | P2 | 2 | battle |
| FR-WS-06-07 | Anti-cheat: server-authoritative scoring; no client-side answer key | P0 | 2 | battle |

## FA-07 — Marketplace

| ID | Requirement | Priority | Phase | Source Service |
|----|-------------|----------|-------|----------------|
| FR-WS-07-01 | User can browse tutors with filters (subject, exam, language, price, rating) | P1 | 2 | marketplace |
| FR-WS-07-02 | Tutor profile shows bio, qualifications, availability, reviews | P1 | 2 | marketplace |
| FR-WS-07-03 | User can book a session at available slot | P1 | 2 | marketplace + payment |
| FR-WS-07-04 | Confirmation email + in-app notif on booking | P1 | 2 | engagement |
| FR-WS-07-05 | Pre-session: join button activates T-5 min | P1 | 2 | marketplace |
| FR-WS-07-06 | Live session via Daily.co (per ADR-0009) | P1 | 2 | marketplace |
| FR-WS-07-07 | Post-session: required rating (1–5) + optional review | P1 | 2 | marketplace |
| FR-WS-07-08 | Refund eligibility per policy (cancel ≥ 24h before = full refund) | P1 | 2 | payment + marketplace |

## FA-08 — Analytics

| ID | Requirement | Priority | Phase | Source Service |
|----|-------------|----------|-------|----------------|
| FR-WS-08-01 | Readiness score (0–100) shown with confidence band | P0 | 1 | learning |
| FR-WS-08-02 | Score updates within 60 s of completing any quiz | P0 | 1 | learning |
| FR-WS-08-03 | Weak-area list ranked by impact-on-readiness | P0 | 1 | learning |
| FR-WS-08-04 | Time-spent chart: daily/weekly/monthly | P1 | 1 | learning |
| FR-WS-08-05 | Accuracy trend: by subject and overall | P0 | 1 | learning |
| FR-WS-08-06 | Error-pattern breakdown (per ADR-0016) | P1 | 2 | learning |
| FR-WS-08-07 | Calibrated rank prediction (per ADR-0015) | P2 | 2 | learning |
| FR-WS-08-08 | Cohort percentile (vs all same-exam users) | P2 | 2 | learning |
| FR-WS-08-09 | Export analytics PDF | P3 | 3 | learning |

## FA-09 — Engagement

| ID | Requirement | Priority | Phase | Source Service |
|----|-------------|----------|-------|----------------|
| FR-WS-09-01 | In-app notification centre with unread count | P0 | 1 | engagement |
| FR-WS-09-02 | Email digest weekly (opt-in) | P1 | 1 | engagement |
| FR-WS-09-03 | Community: browse threads by topic | P1 | 2 | engagement |
| FR-WS-09-04 | Community: post thread, comment, react | P1 | 2 | engagement |
| FR-WS-09-05 | XP awarded for streak, quiz completion, perfect score | P1 | 1 | engagement |
| FR-WS-09-06 | Badges (first quiz, 7-day streak, 100 questions, …) | P1 | 1 | engagement |
| FR-WS-09-07 | Streak shield: 1 missed day/month grace | P1 | 1 | engagement |

## FA-10 — Payments

| ID | Requirement | Priority | Phase | Source Service |
|----|-------------|----------|-------|----------------|
| FR-WS-10-01 | User can subscribe to Premium ₹199/mo via Stripe Checkout | P0 | 1 | payment |
| FR-WS-10-02 | User can subscribe annual ₹1,599/yr | P0 | 1 | payment |
| FR-WS-10-03 | Upgrade from monthly to annual prorates correctly | P0 | 1 | payment |
| FR-WS-10-04 | User can cancel subscription — remains active until period end | P0 | 1 | payment |
| FR-WS-10-05 | User can resume cancelled-pending subscription | P0 | 1 | payment |
| FR-WS-10-06 | Invoice history (PDF download) | P1 | 1 | payment |
| FR-WS-10-07 | Failed-charge retry with 3-attempt schedule + in-app banner | P0 | 1 | payment |
| FR-WS-10-08 | Paywalls show free vs premium benefits side-by-side | P0 | 1 | web-student |
| FR-WS-10-09 | Currency: INR only Phase 1; multi-currency Phase 2 | P0 | 1 | payment |
| FR-WS-10-10 | Webhook-driven entitlement: feature flags toggle within 60 s | P0 | 1 | payment + identity |

## FA-11 — Settings

| ID | Requirement | Priority | Phase | Source Service |
|----|-------------|----------|-------|----------------|
| FR-WS-11-01 | Edit profile (name, phone, photo) | P0 | 1 | identity |
| FR-WS-11-02 | Change target exam (re-screens) | P0 | 1 | identity + learning |
| FR-WS-11-03 | Language toggle (en / hi) | P0 | 1 | web-student |
| FR-WS-11-04 | Notification preferences (channel × category matrix) | P1 | 1 | engagement |
| FR-WS-11-05 | A11y: font size, motion-reduce, high-contrast | P0 | 1 | web-student |
| FR-WS-11-06 | Device list + revoke | P1 | 1 | identity |
| FR-WS-11-07 | Download my data (DPDPA) | P1 | 1 | identity + learning |
| FR-WS-11-08 | Delete account | P0 | 1 | identity |

---

## Cross-Cutting (Web Platform)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-WS-XC-01 | All forms validate client-side via Zod + server-echoed errors | P0 |
| FR-WS-XC-02 | All mutations are idempotent (idempotency-key header) | P0 |
| FR-WS-XC-03 | All routes guarded by auth; redirect with `return_to` | P0 |
| FR-WS-XC-04 | Error boundary at route level — never blank screen | P0 |
| FR-WS-XC-05 | Loading state: skeleton ≤ 200 ms; spinner after 200 ms only | P0 |
| FR-WS-XC-06 | Empty state: every list has a designed empty state | P0 |
| FR-WS-XC-07 | Toasts: success (auto-dismiss 4s) / error (sticky w/ retry) | P0 |
| FR-WS-XC-08 | Pagination/infinite-scroll: cursor-based; consistent across lists | P0 |
| FR-WS-XC-09 | Date/time: all displayed in user locale TZ (default IST) | P0 |
| FR-WS-XC-10 | Numbers: Indian number system (lakhs/crores) when locale = hi | P1 |
| FR-WS-XC-11 | Image lazy-load below the fold | P0 |
| FR-WS-XC-12 | All click targets ≥ 44 × 44 px (WCAG) | P0 |
| FR-WS-XC-13 | Focus ring visible on all interactive elements | P0 |
| FR-WS-XC-14 | Print stylesheet for results pages | P3 |

---

## Traceability

| FR-ID | User Story | Test Case | Implementation |
|---|---|---|---|
| (See [03_user_stories.md](./03_user_stories.md)) | | | |

| NFR-ID | Test Case | Verification |
|---|---|---|
| NFR-WS-01..05 | Lighthouse CI on every PR | Automated |
| NFR-WS-06..08 | axe-core + manual NVDA/VoiceOver | Automated + manual |
| NFR-WS-09..10 | Playwright cross-browser matrix | Automated |
| NFR-WS-11..12 | Manual smoke + Playwright | Automated |
| NFR-WS-13..14 | Pen-test + CSP report-only audit | Manual (per release) |
| NFR-WS-15..17 | Sentry dashboards + chaos tests | Automated |
