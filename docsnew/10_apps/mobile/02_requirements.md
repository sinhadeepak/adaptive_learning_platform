# Requirements Catalogue — mobile (Vidya Mobile, Flutter)

**Anchored to:** [BRD §6 Functional Areas](./01_brd.md#6-functional-areas) · [Master BRD §5.1.4](../../00_platform/02_master_brd/master_brd.md#514-mobile-vidya-mobile-flutter)

**ID convention:** `FR-MB-<FA>-<NN>` (functional) · `NFR-MB-<NN>` (in [BRD §7](./01_brd.md#7-non-functional-requirements-surface-specific))

**Priority:** P0 / P1 / P2 / P3 · **Phase:** 1 / 2 / 3

---

## FA-01 — Auth & Account

| ID | Requirement | Priority | Phase | Source |
|----|-------------|----------|-------|--------|
| FR-MB-01-01 | Sign up with email + password | P0 | 1 | identity |
| FR-MB-01-02 | Sign up with phone + OTP | P0 | 1 | identity |
| FR-MB-01-03 | Sign in with Google (native Google Sign-In SDK) | P0 | 1 | identity |
| FR-MB-01-04 | Sign in with Apple (iOS only) | P0 | 1 | identity |
| FR-MB-01-05 | OTP via email (10 min) and SMS (5 min) | P0 | 1 | identity |
| FR-MB-01-06 | Forgot/reset password | P0 | 1 | identity |
| FR-MB-01-07 | **Biometric unlock** — Face ID / Touch ID / Android biometric | P0 | 1 | identity + Keystore/Keychain |
| FR-MB-01-08 | Silent token refresh on app foreground | P0 | 1 | identity |
| FR-MB-01-09 | Sign out (revokes refresh token server-side) | P0 | 1 | identity |
| FR-MB-01-10 | Device list & revoke | P1 | 1 | identity |
| FR-MB-01-11 | TOTP MFA | P2 | 2 | identity |
| FR-MB-01-12 | Account deletion | P0 | 1 | identity |
| FR-MB-01-13 | Login rate-limit reflects 429 from server | P0 | 1 | identity + edge |
| FR-MB-01-14 | Cert pinning on auth endpoints | P0 | 1 | local |

## FA-02 — Onboarding

| ID | Requirement | P | Phase | Source |
|----|-------------|---|-------|--------|
| FR-MB-02-01 | Exam selection (NEET/JEE/UPSC/CBSE-N) | P0 | 1 | identity |
| FR-MB-02-02 | Baseline screening (12-item adaptive) | P0 | 1 | learning |
| FR-MB-02-03 | Resume onboarding on next app launch | P0 | 1 | local |
| FR-MB-02-04 | Skip screening | P1 | 1 | learning |
| FR-MB-02-05 | Profile completion meter | P1 | 1 | identity |
| FR-MB-02-06 | First-run permissions ask (notif + storage) — in-context | P0 | 1 | local |
| FR-MB-02-07 | Change exam later from Settings | P0 | 1 | identity + learning |

## FA-03 — Home & Today's Mission

| ID | Requirement | P | Phase | Source |
|----|-------------|---|-------|--------|
| FR-MB-03-01 | Today's Mission card | P0 | 1 | learning |
| FR-MB-03-02 | Readiness summary card | P0 | 1 | learning |
| FR-MB-03-03 | Continue last quiz tile | P0 | 1 | quiz |
| FR-MB-03-04 | Streak widget | P1 | 1 | engagement |
| FR-MB-03-05 | Weak-areas list (top 3) | P0 | 1 | learning |
| FR-MB-03-06 | Mock test reminder banner | P1 | 1 | learning |
| FR-MB-03-07 | Pull-to-refresh | P0 | 1 | local |
| FR-MB-03-08 | Skeleton state ≤ 200 ms | P0 | 1 | local |

## FA-04 — Study & Offline Content

| ID | Requirement | P | Phase | Source |
|----|-------------|---|-------|--------|
| FR-MB-04-01 | Subject/Topic/Concept tree browse | P0 | 1 | learning |
| FR-MB-04-02 | Concept view (mastery + last-studied) | P0 | 1 | learning |
| FR-MB-04-03 | Content viewer — text/image/video/interactive | P0 | 1 | learning + S3 |
| FR-MB-04-04 | Bookmark a concept | P1 | 1 | learning |
| FR-MB-04-05 | Private note per concept | P1 | 1 | learning |
| FR-MB-04-06 | **Download concept for offline** | P0 | 1 | local SQLite + file cache |
| FR-MB-04-07 | Manage offline downloads (size, remove) | P0 | 1 | local |
| FR-MB-04-08 | Auto-evict oldest when storage cap hit | P1 | 1 | local |
| FR-MB-04-09 | Visual indicator: which concepts are offline-ready | P0 | 1 | local |

## FA-05 — Practice (Online + Offline)

| ID | Requirement | P | Phase | Source |
|----|-------------|---|-------|--------|
| FR-MB-05-01 | Quick Practice (online) — 10 adaptive items | P0 | 1 | quiz |
| FR-MB-05-02 | Focused Practice (online) | P0 | 1 | quiz |
| FR-MB-05-03 | Mock Test (online, timed) | P0 | 1 | quiz |
| FR-MB-05-04 | PYQ Drill | P0 | 1 | quiz |
| FR-MB-05-05 | Revision (spaced-rep, Phase 1.5) | P1 | 2 | learning + quiz |
| FR-MB-05-06 | **Offline practice on downloaded concepts** | P0 | 1 | local quiz engine + bundled items |
| FR-MB-05-07 | Buffered answer queue persists across app restart | P0 | 1 | local |
| FR-MB-05-08 | Reconnect → sync buffered answers (idempotent) | P0 | 1 | quiz |
| FR-MB-05-09 | Background-safe: resume from same item on foreground | P0 | 1 | quiz + local |
| FR-MB-05-10 | All 22 question types render via type handlers | P0 | 1 | quiz |
| FR-MB-05-11 | Flag/report question | P1 | 1 | engagement |
| FR-MB-05-12 | Detailed results post-quiz | P0 | 1 | quiz |
| FR-MB-05-13 | Mock results: section + topic breakdown | P0 | 1 | quiz + learning |
| FR-MB-05-14 | Rank prediction (Phase 2) | P2 | 2 | learning |

## FA-06 — Battle (Phase 2)

| ID | Requirement | P | Phase | Source |
|----|-------------|---|-------|--------|
| FR-MB-06-01 | Matchmaking + cancel | P1 | 2 | battle |
| FR-MB-06-02 | Real-time question delivery via WS | P1 | 2 | battle |
| FR-MB-06-03 | Disconnect grace + forfeit | P1 | 2 | battle |
| FR-MB-06-04 | Post-battle rating + XP + replay | P1 | 2 | battle + engagement |
| FR-MB-06-05 | Leaderboard | P2 | 2 | battle |
| FR-MB-06-06 | Anti-cheat surfaces (no client answer key) | P0 | 2 | battle |
| FR-MB-06-07 | Background handling: forfeit if > 30s back | P0 | 2 | local |

## FA-07 — Marketplace (Phase 2)

| ID | Requirement | P | Phase | Source |
|----|-------------|---|-------|--------|
| FR-MB-07-01 | Tutor browse with filters | P1 | 2 | marketplace |
| FR-MB-07-02 | Tutor profile | P1 | 2 | marketplace |
| FR-MB-07-03 | Book session | P1 | 2 | marketplace + payment |
| FR-MB-07-04 | Booking confirmation | P1 | 2 | engagement |
| FR-MB-07-05 | Join session via embedded Daily.co | P1 | 2 | marketplace |
| FR-MB-07-06 | Post-session rating | P1 | 2 | marketplace |

## FA-08 — Analytics

| ID | Requirement | P | Phase | Source |
|----|-------------|---|-------|--------|
| FR-MB-08-01 | Readiness panel | P0 | 1 | learning |
| FR-MB-08-02 | Live update post-quiz | P0 | 1 | learning |
| FR-MB-08-03 | Weak-area drill | P0 | 1 | learning |
| FR-MB-08-04 | Time-spent chart | P1 | 1 | learning |
| FR-MB-08-05 | Accuracy trends | P0 | 1 | learning |
| FR-MB-08-06 | Error-pattern breakdown | P1 | 2 | learning |
| FR-MB-08-07 | Rank prediction | P2 | 2 | learning |
| FR-MB-08-08 | Cohort percentile | P2 | 2 | learning |

## FA-09 — Push & In-App Notifications

| ID | Requirement | P | Phase | Source |
|----|-------------|---|-------|--------|
| FR-MB-09-01 | FCM Android push | P0 | 1 | engagement + FCM |
| FR-MB-09-02 | APNS iOS push | P0 | 1 | engagement + APNS |
| FR-MB-09-03 | Push consent — in-context (after first practice) | P0 | 1 | local |
| FR-MB-09-04 | Deep link from push to specific screen | P0 | 1 | local |
| FR-MB-09-05 | In-app notif centre | P0 | 1 | engagement |
| FR-MB-09-06 | Notification preferences (channel × category) | P1 | 1 | engagement |
| FR-MB-09-07 | Quiet hours (TZ-aware) | P1 | 1 | engagement |
| FR-MB-09-08 | Suppress notif while quiz active | P0 | 1 | local |

## FA-10 — Community & Gamification

| ID | Requirement | P | Phase | Source |
|----|-------------|---|-------|--------|
| FR-MB-10-01 | Browse threads by topic | P1 | 2 | engagement |
| FR-MB-10-02 | Post + comment + react | P1 | 2 | engagement |
| FR-MB-10-03 | Report a comment | P1 | 2 | engagement |
| FR-MB-10-04 | XP awarded for events | P1 | 1 | engagement |
| FR-MB-10-05 | Streak tracker + shield | P1 | 1 | engagement |
| FR-MB-10-06 | Badges unlock | P1 | 1 | engagement |

## FA-11 — Payments

| ID | Requirement | P | Phase | Source |
|----|-------------|---|-------|--------|
| FR-MB-11-01 | Subscribe monthly/annual via Stripe Checkout (WebView) — OQ-MB-01 | P0 | 1 | payment |
| FR-MB-11-02 | Receipt verification on return from WebView | P0 | 1 | payment |
| FR-MB-11-03 | Entitlement flip propagates to client < 60 s | P0 | 1 | payment + identity |
| FR-MB-11-04 | Cancel subscription | P0 | 1 | payment |
| FR-MB-11-05 | Invoice list (read-only) | P1 | 1 | payment |
| FR-MB-11-06 | Failed-charge retry banner | P0 | 1 | payment |
| FR-MB-11-07 | Paywall component (consistent with web) | P0 | 1 | local |
| FR-MB-11-08 | iOS StoreKit IAP flow — OQ-MB-01 deferred | P2 | 1 | payment + StoreKit |

## FA-12 — Settings & Storage Management

| ID | Requirement | P | Phase | Source |
|----|-------------|---|-------|--------|
| FR-MB-12-01 | Edit profile | P0 | 1 | identity |
| FR-MB-12-02 | Change exam | P0 | 1 | identity + learning |
| FR-MB-12-03 | Language toggle (en/hi) | P0 | 1 | local |
| FR-MB-12-04 | Notification preferences | P1 | 1 | engagement |
| FR-MB-12-05 | Biometric enable/disable | P0 | 1 | local |
| FR-MB-12-06 | Device list + revoke | P1 | 1 | identity |
| FR-MB-12-07 | Downloads management (size, list, remove) | P0 | 1 | local |
| FR-MB-12-08 | Storage cap configurable (100/200/500 MB) | P1 | 1 | local |
| FR-MB-12-09 | Download my data (DPDPA) | P1 | 1 | identity + learning |
| FR-MB-12-10 | Delete account | P0 | 1 | identity |
| FR-MB-12-11 | App version + diagnostics info (for support) | P0 | 1 | local |

## FA-13 — Camera Question Scan (Phase 3)

| ID | Requirement | P | Phase | Source |
|----|-------------|---|-------|--------|
| FR-MB-13-01 | Capture image of a question | P2 | 3 | local |
| FR-MB-13-02 | Optional in-app crop | P2 | 3 | local |
| FR-MB-13-03 | Upload + invoke AI Gateway vision endpoint | P2 | 3 | learning AI Gateway |
| FR-MB-13-04 | Display extracted question + suggested answer + explanation | P2 | 3 | learning |
| FR-MB-13-05 | Save scan to history | P2 | 3 | learning |

## FA-14 — App Lifecycle & Resilience

| ID | Requirement | P | Phase | Source |
|----|-------------|---|-------|--------|
| FR-MB-14-01 | Backgrounding during quiz preserves state | P0 | 1 | local |
| FR-MB-14-02 | Low-memory handler frees caches gracefully | P0 | 1 | local |
| FR-MB-14-03 | Network handoff (WiFi ↔ 4G) transparent | P0 | 1 | local |
| FR-MB-14-04 | Airplane mode shows "offline" banner; queued ops persist | P0 | 1 | local |
| FR-MB-14-05 | Force-update gate (min supported version) | P0 | 1 | remote config |
| FR-MB-14-06 | App tampered / rooted detection → warn (P1: block payments) | P1 | 1 | local |

## FA-15 — Crash & Telemetry

| ID | Requirement | P | Phase | Source |
|----|-------------|---|-------|--------|
| FR-MB-15-01 | Sentry/Crashlytics capture all uncaught exceptions | P0 | 1 | local |
| FR-MB-15-02 | Performance traces (cold start, key journeys) | P0 | 1 | Firebase Performance |
| FR-MB-15-03 | Custom events (signup, screening_complete, quiz_finish, paywall_view) | P0 | 1 | local |
| FR-MB-15-04 | Opt-out for analytics in Settings | P1 | 1 | local |

---

## Cross-Cutting

| ID | Requirement | P |
|----|-------------|---|
| FR-MB-XC-01 | Vidya design tokens — no hard-coded colours/spacing | P0 |
| FR-MB-XC-02 | Material 3 base + Cupertino overrides for iOS-feel | P0 |
| FR-MB-XC-03 | Auth-guarded routing | P0 |
| FR-MB-XC-04 | Global error boundary (zone-error handler) | P0 |
| FR-MB-XC-05 | Toast / Snackbar pattern consistent | P0 |
| FR-MB-XC-06 | Empty states designed | P0 |
| FR-MB-XC-07 | Pagination/infinite scroll | P0 |
| FR-MB-XC-08 | Image lazy-load + thumbnail | P0 |
| FR-MB-XC-09 | i18n string extraction (en + hi) | P0 |
| FR-MB-XC-10 | Touch targets ≥ 44 dp | P0 |
| FR-MB-XC-11 | Dark mode (system-following) | P1 |
| FR-MB-XC-12 | Haptic feedback on key actions | P1 |
| FR-MB-XC-13 | Deep link router (notif + universal links) | P0 |
| FR-MB-XC-14 | Feature flag client SDK | P0 |

---

## Verification Matrix (NFRs)

| NFR-ID | Verification Method |
|--------|---------------------|
| NFR-MB-04..06 | Firebase Performance + on-device profiling |
| NFR-MB-07..09 | CI artifact size gate; Android Profiler / Instruments memory snapshot |
| NFR-MB-10 | Sentry/Crashlytics crash-free dashboard |
| NFR-MB-11..12 | Manual battery/data audits on reference device |
| NFR-MB-13..14 | `integration_test` with airplane-mode toggle (Patrol) |
| NFR-MB-15..16 | FCM/APNS delivery logs + sample audits |
| NFR-MB-17..19 | Security review + manual pen-test on key flows |
| NFR-MB-20..21 | Manual Talkback/VoiceOver script |
| NFR-MB-22 | Locale switch E2E |
| NFR-MB-23..24 | Pre-submission store-policy checklist |
| NFR-MB-25..26 | Sentry/Crashlytics dashboards live in staging + prod |
| NFR-MB-27..28 | Chaos tests (airplane mode + kill backend) in staging |
| NFR-MB-29..30 | Force-update unit test + manual upgrade test |
