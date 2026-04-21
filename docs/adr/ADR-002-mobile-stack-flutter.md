# ADR-002 — Adopt Flutter for mobile in place of native Swift / Kotlin

- **Status**: Proposed — awaiting sign-off (Tech Lead + CTO + Mobile Leads + Head of Product)
- **Date**: 2026-04-21
- **Supersedes**: Mobile stack references in [HLD](../01_design/01_HLD_Adaptive_Learning_Platform.docx), [Infrastructure & DevOps Design](../01_design/06_Infrastructure_DevOps_Design_AdaptiveLearningPlatform.docx), [Sprint Development Plan](../02_planning/07_SprintDevelopmentPlan_AdaptiveLearningPlatform.md), [Dev Environment Requirements](../02_planning/08_DevEnvironmentRequirements_AdaptiveLearningPlatform.md)
- **Related**: [GAP-10](../06_gaps_resolution/GapResolutionRegister_AdaptiveLearningPlatform.docx), [GAP-15, GAP-21](../06_gaps_resolution/GapResolutionRegister_v1.1_AdaptiveLearningPlatform.docx) (all three reference iOS + Android as separate platforms — must be amended)

---

## Context

The existing specification calls for **native iOS (Swift 5.9 / Xcode 15.3+)** and **native Android (Kotlin 1.9 / Gradle 8.5)** mobile apps, staffed by two platform-specialist engineers. This reflects the team's initial assumption that native builds would deliver the best performance and access to platform capabilities.

Three facts have since become salient:

1. **Phase 1 timeline is 10 weeks** — Sprint 0 + four feature sprints. Building two parallel native apps for a student audience on a tight clock doubles UI implementation effort with no compensating product-differentiating benefit.
2. **Staff profile** — the team has 2 Mobile engineers. Under the native plan, each engineer owns one OS and the other platform is exposed to a single point of failure (vacation, illness, attrition).
3. **Cross-platform story risk** — [STU-REQ-59](../06_gaps_resolution/GapResolutionRegister_v1.1_AdaptiveLearningPlatform.docx) (mid-quiz offline queue) already showed that two separate native implementations of the same behaviour create correctness risk (AsyncStorage vs SharedPreferences vs Room differences), bugs caught on one platform and missed on the other, and divergent UX.

The quiz UX is primarily declarative rendering, network I/O, and simple local state. It does not require a native-only capability set (no AR, no intensive camera pipelines, no background audio, no Apple Pencil). This is the profile where cross-platform frameworks have historically performed well.

## Decision

**Adopt Flutter (stable channel, 3.19.x at time of writing) with Dart 3.3+ for the Phase 1 mobile apps on iOS and Android.** The web app remains Next.js 14 (no change).

Flutter is chosen over native and over the rejected alternatives (see below) on the basis of:

- **Single codebase** — one codebase for two stores. Halves feature-build effort for Phase 1.
- **One mobile team, not two** — both engineers can own any feature; vacation / attrition risk falls from single-point-of-failure per OS to shared coverage.
- **Maturity in 2026** — Flutter has been production-stable since 2018; Impeller renderer on iOS is default and removes the prior jank criticism; Dart 3 isolates + sound null safety are mature.
- **Faster iteration** — hot reload materially speeds up UI work vs native rebuild loops.
- **Declarative UI model** — closer to React / Next.js than to UIKit or Jetpack Compose XML. Lowers context-switching cost for FE engineers doing cross-team reviews.
- **Plugin ecosystem fit** — every third-party we need has a maintained Flutter plugin (see Consequences § Plugin audit).

## Consequences

### Positive

- **~40–50 % reduction in mobile feature-build effort** for Phase 1 vs the native plan. STU-REQ-59 drops from "iOS 3–4 d + Android 3–4 d" (≈7 d) to one ≈4 d Flutter implementation.
- **Lower QA surface** — one codebase means one set of unit + widget tests and one `integration_test` suite per feature. The two platforms remain tested (Flutter `integration_test` runs on both simulators/emulators and real devices via Firebase Test Lab) but most bugs are found once.
- **Shared mobile UI components** — Flutter widgets map naturally to the design system, reducing duplication in the UI/UX design work.
- **Code review parallelism** — either mobile engineer can review any mobile PR.

### Negative

- **Reskilling cost** — assuming the team is not already Flutter-fluent, budget **1–2 weeks of ramp** during Sprint 0 and Sprint 1. Mitigation: pair programming, early SPIKE (see below), Flutter codelabs.
- **App size** — Flutter apps are typically 8–15 MB larger than native equivalents (engine bundling). On entry-level Android devices on 2G/3G in rural India this is a real onboarding-funnel cost. Mitigation: build with `--split-per-abi` for Android (drops size ~60 % per arch-specific APK), enable tree-shaking, and ensure `--obfuscate --split-debug-info` is on for release builds.
- **Platform-specific capability access** — anything not covered by a Flutter plugin requires a **platform channel** (Dart ↔ Swift / Kotlin bridge). Unavoidable for e.g. certificate pinning (see SPIKE re-scope) and some deeply native payment flows.
- **Plugin supply-chain risk** — we now depend on community-maintained plugin packages. Each needs a maintainer health check (last commit, issue backlog, maintainers) before adoption. See Plugin audit below.
- **Hiring pool shifts** — future hires need to be Flutter-fluent or have cross-platform interest; this can narrow the senior pool compared to Swift or Kotlin specialists.

### Neutral

- **Tooling overlap remains** — Xcode is still required to build iOS archives and submit to App Store Connect; Android SDK and Gradle are still required under the hood. Engineers don't escape the native toolchains entirely.
- **Distribution channels unchanged** — App Store + Google Play. TestFlight and Firebase App Distribution continue to apply.
- **Push / notifications path unchanged** — FCM for Android, APNs for iOS, consumed via `firebase_messaging` + `flutter_local_notifications`.

## Plugin audit (required before Sprint 1)

Each of the following plugins must be vetted by the Mobile Leads during Sprint 0. A plugin is accepted only if: (a) active maintenance within the last 6 months, (b) > 5 k pub.dev likes or a Flutter-team-maintained publisher, (c) sound-null-safe, (d) a clear path to the native SDK in case we need a platform channel.

| Need | Candidate plugin | Fallback |
|---|---|---|
| Push notifications | `firebase_messaging` + `flutter_local_notifications` | Platform channel to FCM / APNs |
| Secure storage (JWT, refresh) | `flutter_secure_storage` (iOS Keychain + Android Keystore) | Platform channel |
| Local DB / queue (GAP-21 AC-01) | `drift` or `sqflite` | Hive as backup |
| Biometric auth | `local_auth` | Skip in Phase 1 |
| Stripe Checkout / Mobile SDK | `flutter_stripe` | **Web Checkout redirect via `url_launcher` — lower integration risk; recommended for Phase 1** |
| Analytics (crash) | `sentry_flutter` + `firebase_crashlytics` | — |
| HTTP client + cert pinning | `dio` + `dio_certificate_pinning` | Platform channel to OS trust stores |
| Deep linking | `app_links` | Platform channel |

**Recommendation**: Use Stripe **Checkout via a WebView / external browser** for Phase 1 payment rather than the native mobile Stripe SDK. Lower plugin risk, PCI SAQ A posture unchanged, and matches the Payment Service LLD which already expects Stripe Checkout Sessions.

## Impact on existing artifacts (migration checklist)

| Artifact | Change required | Owner |
|---|---|---|
| [HLD §1.1 / §4 "Mobile"](../01_design/01_HLD_Adaptive_Learning_Platform.docx) | Replace native stack references with Flutter + Dart | Tech Lead |
| [Infrastructure & DevOps Design §7 "Mobile CI/CD"](../01_design/06_Infrastructure_DevOps_Design_AdaptiveLearningPlatform.docx) | Build pipeline: `flutter build ios --release` + `flutter build appbundle --release` ; Fastlane lanes updated | DevOps Lead |
| [Security Design — SPIKE-05 iOS certificate pinning](../01_design/05_SecurityDesign_ThreatModel_AdaptiveLearningPlatform.docx) | Re-scope to "Flutter `dio_certificate_pinning` on both platforms"; may remove the iOS-specific SPIKE and add a shorter Flutter-pinning SPIKE (2 d) | Security Lead + Mobile Lead |
| [Technical Spikes](../02_planning/05_TechnicalSpikes_AdaptiveLearningPlatform.docx) | Add **SPIKE-16: Flutter bootstrap + plugin audit** (5 d, Sprint 0). Re-scope SPIKE-05. | Tech Lead |
| [Dev Environment Requirements](../02_planning/08_DevEnvironmentRequirements_AdaptiveLearningPlatform.md) §3 "Mobile" | Replace Swift / Kotlin rows with Flutter SDK 3.19.x + Dart 3.3+. Keep Xcode + Android Studio as required; add `flutter`, `dart`, `fvm` (Flutter Version Manager). | Tech Lead |
| [Sprint Development Plan](../02_planning/07_SprintDevelopmentPlan_AdaptiveLearningPlatform.md) | Sprint 0: add SPIKE-16 + Flutter bootstrap. Re-estimate mobile features in Sprint 1–3 using Flutter single-codebase effort. GAP-15 capacity re-visited — Option A is now likely affordable. | Tech Lead |
| [Gap Register v1.2](../06_gaps_resolution/GapResolutionRegister_v1.2_AdaptiveLearningPlatform.docx) — GAP-10, GAP-15, GAP-21 | Amend platform references: where the text says "iOS (Swift)" or "Android (Kotlin)", replace with "Flutter". GAP-21 AC-01 storage mapping changes from AsyncStorage / SharedPreferences to Flutter `drift` / `sqflite`. | Head of Product + Tech Lead |
| [User Stories v2](../00_requirements/05_UserStories_v2_Adaptive_Learning_Platform.docx) — STU-REQ-59 | AC-01 storage reference updated. Effort estimate drops from "iOS 3–4 d + Android 3–4 d" to "Flutter 4–5 d". | Head of Product |
| [Master Test Plan](../03_qa_testing/01_MasterTestPlan_AdaptiveLearningPlatform.docx) | Mobile test stack: `flutter_test` (unit + widget) + `integration_test` (E2E). Firebase Test Lab for device matrix remains. | QA Lead |
| [UI/UX Wireframe / Design System](../01_design/04_UIUX_Wireframe_DesignSystem_AdaptiveLearningPlatform.docx) | Component library re-framed around Flutter widgets (Material 3 on Android, Cupertino where appropriate on iOS). Design tokens (colours, typography, spacing) unaffected. | Designer + Tech Lead |

The above is a checklist, not a blocker — the ADR can be signed off before any downstream edits are applied, and the downstream edits can land across Sprint 0.

## Rejected alternatives

### Keep native (Swift + Kotlin)

**Pros**: Best-possible platform UX; broadest hiring pool per specialty; no cross-platform abstraction risk.
**Cons (decisive)**: Doubles mobile feature-build effort; two separate implementations of every offline / resilience behaviour; single-point-of-failure per OS at 2-person team size.
**Verdict**: Rejected for Phase 1 given the 10-week timeline and team size. Reconsider at Phase 2 if scale or platform-specific capabilities demand it.

### React Native

**Pros**: Large ecosystem; existing JavaScript fluency from the Next.js team; Meta-backed.
**Cons**: Historically known bridge performance issues for frequent-state UIs like a live quiz (Fabric renderer improves this but is still not industry-default in 2026); more fragmented ecosystem (Expo vs bare RN vs community CLI); Metro build toolchain adds complexity.
**Verdict**: Rejected. Flutter's Impeller renderer and single-toolchain simplicity are a better match for a quiz app with frequent state transitions and animations.

### Kotlin Multiplatform Mobile (KMM)

**Pros**: Share business logic in Kotlin; keep native UIs (Swift for iOS, Compose for Android). Appealing for teams with existing native expertise.
**Cons**: Does not share UI — re-implements screens twice. Partial fix for the duplication problem. Also requires the iOS engineer to be comfortable calling into Kotlin-compiled frameworks, which is an additional learning curve.
**Verdict**: Rejected. Does not meaningfully reduce the UI-duplication cost that is Phase 1's primary pressure.

### PWA only (no native apps for Phase 1)

**Pros**: Zero mobile build cost; single Next.js codebase covers all platforms.
**Cons**: No App Store / Play Store presence; beta users expect a tappable icon and push notifications; iOS PWA push-notification support is limited and Phase 1 depends on re-engagement push. Would break the product story.
**Verdict**: Rejected. Native (even via Flutter) remains a Phase 1 requirement.

## Decision record

| Role | Name | Sign-off | Date |
|---|---|---|---|
| Tech Lead |  | ☐ |  |
| CTO |  | ☐ |  |
| Mobile Lead (consolidated, ex-iOS) |  | ☐ |  |
| Mobile Lead (consolidated, ex-Android) |  | ☐ |  |
| Head of Product |  | ☐ |  |
| DevOps Lead (CI/CD impact) |  | ☐ |  |
| QA Lead (test stack impact) |  | ☐ |  |

Once signed, ADR-002 is immutable. Subsequent changes (e.g. Flutter version upgrades, a hypothetical move back to native for Phase 2) are recorded in a follow-on ADR that supersedes this one.

## Review cadence

- **Sprint 0 end**: ratify the plugin audit outcomes and the SPIKE-16 result; adjust the Dev Env doc and Sprint Plan accordingly.
- **End of Phase 1 (post-launch)**: retrospective on whether Flutter delivered the projected velocity gain; input to Phase 2 scope decisions.
