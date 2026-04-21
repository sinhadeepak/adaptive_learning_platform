# ADR-0002: Flutter for mobile (iOS + Android)

- **Status**: proposed
- **Date**: 2026-04-21
- **Deciders**: Mobile Leads (iOS + Android), FE Lead, Tech Lead
- **Related**: [GAP-15](../06_gaps_resolution/GapResolutionRegister_v1.2_AdaptiveLearningPlatform.docx)

## Context

The MVP requires feature parity between iOS and Android from Week 4 (closed beta). Team has 2 mobile engineers (one iOS, one Android background). Maintaining two native codebases during the 10-week MVP risks divergent UX and doubled effort on every story.

## Decision

We will use **Flutter** (Dart) for a single mobile codebase targeting both platforms. Native modules only where required (push notifications via Firebase + APNs, in-app purchases, biometric auth).

## Alternatives considered

- **Option A — Flutter (chosen)**: single codebase, strong perf, both engineers cross-train on Dart. Risk: less familiar than native; libraries for IAP/biometrics require platform channels.
- **Option B — React Native**: closer to FE stack (React), shared components with web possible. Risk: new-arch migration still churning; perf on lower-end Android (large Indian market segment) weaker than Flutter.
- **Option C — Native (Swift + Kotlin)**: best per-platform UX, but doubles engineering load and risks feature drift during the 10-week push.

## Consequences

### Positive
- One mobile codebase; both engineers contribute to every story.
- Flutter's rendering is consistent across Android device tiers — important for the target demographic.
- Shared design tokens possible with the web FE via export.

### Negative
- Dart is a new language for both engineers — 1 week ramp cost absorbed in Sprint 0.
- Platform-channel work for IAP + biometrics is unavoidable.
- Hot-reload story in CI for Flutter integration tests needs investment.

### Follow-up work
- [ ] Sprint 0: `flutter create apps/mobile` + CI lane (`flutter test`, `flutter build apk --profile`, `flutter build ios --no-codesign`).
- [ ] Sprint 0: Dart ramp session for both mobile engineers.
- [ ] Sprint 1: platform-channel spike for APNs + FCM (tracked under STU-REQ-52).

## Review

Revisit after Sprint 1 retro — if perf or DX is blocking, fall back to native shells for the paid flows only.
