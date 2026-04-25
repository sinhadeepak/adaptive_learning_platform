# mobile

Flutter app for iOS + Android (per [ADR-0002](../../docs/adr/0002-flutter-mobile-stack.md)).

> Platform folders (`ios/`, `android/`) were generated via `flutter create --project-name adaptive_learning_mobile --org in.alp --platforms=android,ios .` and are checked in. Bundle ID / application ID: `in.alp.adaptiveLearningMobile`.
> First-time setup on a new workstation: `flutter pub get`. No additional `flutter create` step is needed.

## Shared packages

- [`alp_design_tokens`](../../packages/design-tokens-flutter/) — Dart mirror of `@alp/design-system` tokens; already wired via path dep in `pubspec.yaml`. Consume with `import 'package:alp_design_tokens/alp_design_tokens.dart';`.

## Run locally

```bash
flutter pub get
flutter run       # requires simulator/device
flutter test
flutter analyze
```
