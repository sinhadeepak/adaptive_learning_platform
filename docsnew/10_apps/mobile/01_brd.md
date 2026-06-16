# Business Requirements Document — mobile (Vidya Mobile, Flutter)

| | |
|---|---|
| **Surface** | `apps/mobile` |
| **Persona** | Aryan (self-driven, mobile-first) · Priya (institution student, mobile-secondary) |
| **Tech** | Flutter 3.x · Material 3 + Cupertino overrides · Vidya Design System v3 (`alp_design_tokens`) |
| **Doc Version** | 0.1 (DRAFT) |
| **Date** | 2026-05-27 |
| **Anchored to** | [Master BRD §5.1.4](../../00_platform/02_master_brd/master_brd.md#514-mobile-vidya-mobile-flutter) |

---

## 1. Purpose

The Vidya mobile app is the **mobile-first B2C learning surface** — for many users in India, this will be their *only* surface. Functional parity goal: top 8 of the 10 web-student journeys must work on mobile, plus mobile-only capabilities (offline practice, push, biometric, daily widget, camera-question-scan in Phase 3).

It is **not** an authoring or moderation surface; those remain web-only.

## 2. Scope

### 2.1 In Scope

| Domain | Capability |
|---|---|
| **Onboarding** | Signup (email/phone OTP), Google sign-in, biometric setup, exam selection, baseline screening |
| **Auth & Account** | Login, logout, silent refresh, biometric unlock, change password, device mgmt, account deletion |
| **Home** | Today's Mission, continue-where-left-off, readiness summary, streak, weak-area nudges, daily widget (Android Phase 2) |
| **Study** | Subject → Topic → Concept browse, content viewer (text/image/video/interactive), notes, bookmarks, **offline download per concept** |
| **Practice** | Quick / Focused / Mock / PYQ; **offline practice** with sync on reconnect |
| **Battle** | Matchmaking, real-time play via WS, replay (Phase 2) |
| **Marketplace** | Browse tutors, book session, join via embedded Daily.co video (Phase 2) |
| **Analytics** | Readiness Score, weak areas, accuracy trends, prediction (Phase 2) |
| **Engagement** | Push notifications (FCM/APNS), in-app notif centre, community (Phase 2), XP/streak/badges |
| **Settings** | Profile, language (en/hi), notification prefs, biometric, device list, downloads/storage mgmt, deletion |
| **Payments** | Subscribe (₹199/mo · ₹1,599/yr) — Stripe via WebView Phase 1; **iOS StoreKit decision deferred (OQ-MB-01)** |
| **Camera-scan question** | Phase 3 — capture image → AI vision → suggested answer/explanation |

### 2.2 Out of Scope

| Item | Lives In |
|---|---|
| Content authoring | web-portal only |
| Moderation queue | web-admin only |
| Tutor profile editing | web-portal |
| Native widgets beyond home-screen mission widget | Phase 3+ |
| Wearable (watchOS / Wear OS) | Phase 4+ |

### 2.3 Scope by Phase

| Phase | Mobile must ship |
|---|---|
| **Phase 1 (M0–M6)** | Onboarding · Login + biometric · Home · Study (with offline cache for last 10 concepts) · Practice (Quick/Focused/Mock/PYQ — online + offline practice for downloaded concepts) · Analytics v1 · Push notif · Subscribe · Settings |
| **Phase 2 (M6–M12)** | Battle · Marketplace · Community · Revision · Daily widget (Android) · Analytics v2 |
| **Phase 3 (M12–M18)** | Camera-scan question (AI vision) · iOS daily widget · Parent companion link |

---

## 3. Stakeholders (Surface-Specific)

| Stakeholder | Role for mobile | Decision Authority |
|---|---|---|
| **Student (Aryan/Priya)** | Primary user | UX validation |
| **Product Owner** | Functional scope | AC approval |
| **Mobile Lead** | Technical owner | Architecture, libraries |
| **Design Lead** | UX owner | Screen flows, motion |
| **Backend Squads** | API contracts | Schema approval |
| **QA Lead** | Quality gate | DoD |
| **Store Reviewers (Apple, Google)** | External gate | App approval |

## 4. Personas (Surface View)

### 4.1 Aryan — Self-Driven NEET Aspirant (Mobile-First)

- **Device**: Android (~70% likelihood — sub-₹20K range), iPhone (~30%). Daily-active.
- **Network**: 4G predominantly; intermittent in tier-2/3 cities. Patchy WiFi at home.
- **Session pattern**: 6–8 short sessions/day (15–25 min each) + 1–2 long sessions (60+ min) on weekends.
- **Goal**: Use commute + bedtime + waiting-time for practice.
- **Frustrations**: "App eats my data." "Quiz dies when I lose signal." "Why does it crash on Mock?"

### 4.2 Priya — Institution Student (Mobile-Secondary)

- **Device**: Mostly desktop in computer lab; mobile in evenings + weekends.
- **Network**: WiFi (home) + 4G (school commute).
- **Goal**: Mobile for quick practice + notification check; deep study on desktop.

## 5. User Journeys (Top 10 Mobile-Specific)

| # | Journey | Frequency | Critical Path |
|---|---------|-----------|---------------|
| 1 | App open → biometric → home → mission | Daily | Splash → biometric → Home → Mission CTA |
| 2 | Push notif → tap → quiz → finish | Daily | Notif → deep link → quiz screen |
| 3 | Quick Practice (online) | Multiple/day | Home → Practice tab → Quick → Subject pick → Quiz |
| 4 | Offline practice (downloaded concept) | Variable | Practice → Offline tab → Concept → Quiz (no net) → Sync on reconnect |
| 5 | Mock Test (timed, online) | Weekly | Practice → Mock → Confirm → Quiz (timed) → Results |
| 6 | Backgrounded during quiz | Frequent | Quiz → Background (call/notif) → Foreground → Resume same state |
| 7 | Network loss mid-quiz | Frequent | Quiz → Net loss → Banner → Buffered answers → Reconnect → Sync |
| 8 | Subscribe via mobile | One-time | Paywall → Plan picker → Stripe WebView → Confirmation → Entitlement flip |
| 9 | Manage downloads | Weekly | Settings → Downloads → See storage used → Remove old |
| 10 | Battle on mobile (Phase 2) | Daily for engaged users | Home → Battle → Matchmaking → Play → Result |

## 6. Functional Areas

| Area | Description | Source Service |
|------|-------------|----------------|
| FA-01 Auth & Account | Signup, login, biometric, OTP, sessions, deletion | identity |
| FA-02 Onboarding | Exam selection, screening, profile | identity + learning |
| FA-03 Home & Today's Mission | Mission, readiness, streak, continue, weak areas | learning + quiz |
| FA-04 Study & Offline Content | Browse, viewer, bookmark, notes, **download for offline** | learning + S3 |
| FA-05 Practice (Online + Offline) | Quick/Focused/Mock/PYQ, offline mode, sync | quiz + learning |
| FA-06 Battle | Matchmaking, WS play, replay | battle |
| FA-07 Marketplace | Browse, book, attend via Daily.co | marketplace |
| FA-08 Analytics | Readiness, weak areas, trends | learning |
| FA-09 Push & In-App Notifications | FCM/APNS, deep links, notif centre | engagement |
| FA-10 Community & Gamification | Threads, XP, streak, badges | engagement |
| FA-11 Payments | Subscribe via Stripe WebView; OQ on iOS StoreKit | payment |
| FA-12 Settings & Storage Mgmt | Profile, language, prefs, biometric, downloads/cache | identity + local |
| FA-13 Camera Question Scan (Phase 3) | Capture → AI vision → explanation | learning (AI Gateway) |
| FA-14 App Lifecycle & Resilience | Backgrounding, low-memory, net handoff | local |
| FA-15 Crash & Telemetry | Sentry/Crashlytics, RUM | local + observability |

---

## 7. Non-Functional Requirements (Surface-Specific)

| ID | Category | Requirement | Target |
|----|----------|-------------|--------|
| NFR-MB-01 | Platform | Flutter SDK | 3.16+ (Dart 3.2+) |
| NFR-MB-02 | Platform | Min Android | API 24 (Android 7.0) |
| NFR-MB-03 | Platform | Min iOS | 14.0 |
| NFR-MB-04 | Performance | Cold start (P50 mid-tier Android) | < 2.0 s |
| NFR-MB-05 | Performance | Warm start | < 800 ms |
| NFR-MB-06 | Performance | Quiz item render after fetch | < 200 ms |
| NFR-MB-07 | Size | APK release (universal) | < 30 MB |
| NFR-MB-08 | Size | IPA release | < 40 MB |
| NFR-MB-09 | Memory | Steady-state RSS | < 220 MB |
| NFR-MB-10 | Memory | Crash-free sessions | ≥ 99.5% |
| NFR-MB-11 | Battery | Screen-on session drain | ≤ 8%/hr typical use |
| NFR-MB-12 | Network | Mobile-data per 30-min Quick Practice | ≤ 5 MB (image content cached) |
| NFR-MB-13 | Offline | Content download cap (user-configurable) | default 200 MB |
| NFR-MB-14 | Offline | Offline-practice sync delay (after reconnect) | < 30 s |
| NFR-MB-15 | Push | FCM delivery success | ≥ 95% (24 hr window) |
| NFR-MB-16 | Push | APNS delivery success | ≥ 95% |
| NFR-MB-17 | Security | Biometric storage | Keystore (Android) / Keychain (iOS) — never exported |
| NFR-MB-18 | Security | Root/jailbreak detection | Warn-only Phase 1; block payments Phase 2 |
| NFR-MB-19 | Security | Certificate pinning | Yes (with kill-switch via remote config) |
| NFR-MB-20 | A11y | Talkback (Android) + VoiceOver (iOS) | Pass on top 10 journeys |
| NFR-MB-21 | A11y | Font scaling | Up to 200% without break |
| NFR-MB-22 | i18n | Languages | en + hi Phase 1 |
| NFR-MB-23 | Store policy | Apple App Review | Pass first submission |
| NFR-MB-24 | Store policy | Google Play | Pass with staged rollout (10 → 50 → 100%) |
| NFR-MB-25 | Observability | Crash reporting | Sentry (TBD vs Crashlytics — OQ-MB-05) |
| NFR-MB-26 | Observability | Performance traces | Firebase Performance |
| NFR-MB-27 | Resilience | Backgrounding during quiz | State preserved, server-authoritative resume |
| NFR-MB-28 | Resilience | Network loss tolerance | Buffered answers; resync on reconnect |
| NFR-MB-29 | Update | Min-supported-version gate | Force-update banner; staged enforcement |
| NFR-MB-30 | Update | Code-push (Shorebird) | OQ-MB-04 — pending decision |

---

## 8. Constraints & Assumptions

### 8.1 Constraints

- **C-MB-01** Flutter for both iOS + Android (per ADR-0002). No separate native codebases.
- **C-MB-02** Vidya design system v3 via shared `alp_design_tokens` package (Dart). No ad-hoc widgets.
- **C-MB-03** State management: Riverpod 2.x (chosen; not BLoC). Server state via auto-generated API client.
- **C-MB-04** Local storage: SQLite (via drift) for structured data; secure storage (`flutter_secure_storage`) for tokens; file cache for media.
- **C-MB-05** No platform plugins that require kernel-level access.
- **C-MB-06** All forms validated via shared schema lib (Dart equivalent of Zod).
- **C-MB-07** No reflection / runtime code-gen on hot paths (Flutter restriction).
- **C-MB-08** Test stack: `flutter_test` (unit/widget) + `integration_test` (E2E) + Patrol for native interactions.

### 8.2 Assumptions

- **A-MB-01** Backend OpenAPI 3.1 published — types generated via `openapi-generator` Dart target.
- **A-MB-02** FCM project + APNS keys provisioned by DevOps before Phase 1 Week 6.
- **A-MB-03** Apple Developer + Google Play Console accounts created and bound to platform Apple ID and Google account.
- **A-MB-04** Daily.co Flutter SDK is suitable for embedded video (Phase 2) — if not, fall back to in-app browser.

## 9. Dependencies

| ID | Depends on | Required for |
|----|-----------|--------------|
| D-MB-01 | identity service: signup, login, OTP, refresh, biometric token bind | Auth |
| D-MB-02 | learning service: catalog, content, screening, AI Gateway (camera Phase 3) | Study + Onboarding + Camera |
| D-MB-03 | quiz service: session/answer/submit with offline buffering protocol | Practice |
| D-MB-04 | learning analytics: readiness + weak areas | Home + Analytics |
| D-MB-05 | battle service: matchmaking + WS | Battle |
| D-MB-06 | marketplace service: tutor catalog, booking | Marketplace |
| D-MB-07 | payment service: checkout session + receipt verification | Subscribe |
| D-MB-08 | engagement service: notifications + community + gamification | Push + Community |
| D-MB-09 | FCM + APNS keys provisioned | Push |
| D-MB-10 | `alp_design_tokens` Dart package | Entire app |
| D-MB-11 | Daily.co Flutter SDK (Phase 2) | Marketplace live sessions |

## 10. Risks (Top 5)

| ID | Risk | L | I | Mitigation |
|----|------|---|---|------------|
| R-MB-01 | App Store rejection for IAP bypass (Stripe WebView for digital goods) | High | High | Investigate StoreKit early; OQ-MB-01; have fallback plan with App Store hosted subscriptions |
| R-MB-02 | OS upgrade breaks deep links / push (annual iOS/Android) | High | Med | Continuous OS-beta testing; quarterly compat sweep |
| R-MB-03 | Offline sync conflict on reconnect | Med | High | Server-authoritative; client buffers ordered events; idempotency keys |
| R-MB-04 | Build pipeline (signing, provisioning, store upload) brittle | High | High | Fastlane pipeline + CI-managed signing; documented runbook |
| R-MB-05 | Flutter / dependency churn breaks builds | Med | Med | Pin SDK; renovate dependencies; quarterly upgrade window |

## 11. Success Criteria

The mobile rebuild is **Done** when:

1. All Phase 1 FRs marked `Implemented`.
2. NFR-MB-01..30 verified by automated CI gates.
3. Top 10 mobile journeys (§5) pass `integration_test` + Patrol on iOS + Android in CI.
4. Crash-free session rate ≥ 99.5% in staged rollout.
5. APK ≤ 30 MB, IPA ≤ 40 MB.
6. First store submission passes (both Apple + Google) without rejection on metadata.
7. Cold-start P50 < 2.0 s on Pixel 4a (mid-tier reference).
8. Offline practice + sync verified on real-device chaos (airplane mode toggling).
9. RUM dashboards live; Sentry/Crashlytics live; Firebase Performance live.
10. Feature flags wired for every Phase 2 capability (dark-launch).

## 12. Open Questions

| # | Question | Owner | Resolve By |
|---|----------|-------|------------|
| OQ-MB-01 | iOS payments — Stripe WebView vs StoreKit IAP. App Store policy says IAP required for digital goods/subscriptions. Risk: 30% Apple fee on subs vs Stripe's 2.9%. | Product + Legal + Finance | Phase 1 Week 4 |
| OQ-MB-02 | Offline sync conflict resolution — server-wins (simpler, may drop user edits) vs CRDT (complex). | Mobile Lead + Backend Lead | Phase 1 Week 6 |
| OQ-MB-03 | Push notification consent UX — request at signup vs at first relevant event. iOS guidance: ask in-context. | Product + Design | Phase 1 Week 4 |
| OQ-MB-04 | Code-push / OTA — Shorebird (allows Dart code-push) vs disabled (only via store updates). Apple policy nuances. | Mobile Lead | Phase 1 Week 6 |
| OQ-MB-05 | Crash reporting — Sentry (one tool web+mobile+backend) vs Firebase Crashlytics (deeper Android integration). | DevOps + Mobile Lead | Phase 1 Week 2 |
| OQ-MB-06 | Min Android API — 24 (Android 7.0, ~92% market) vs 26 (drops ~5%). Lower = larger reach but more polyfills. | Mobile Lead + Product | Phase 1 Week 1 |
| OQ-MB-07 | Daily widget API — Android only Phase 2 (HomeWidget); iOS WidgetKit deferred Phase 3. | Mobile + Design | Phase 2 kickoff |
| OQ-MB-08 | Camera-scan UX — capture-and-send (faster) vs in-app crop+enhance (better OCR) | Product + ML | Phase 3 kickoff |

## 13. Sign-Off

| Role | Name | Date | Status |
|------|------|------|--------|
| Product Owner | _Pending_ | | |
| Mobile Lead | _Pending_ | | |
| Design Lead | _Pending_ | | |
| QA Lead | _Pending_ | | |
