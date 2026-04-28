# alp_design_tokens

Dart mirror of [@alp/design-system](../design-system/) tokens — colours, typography, spacing, shape, elevation, motion, breakpoints, density. Consumed by [apps/mobile](../../apps/mobile/) so the Flutter app matches web brand values.

Values are **placeholders** until Designer locks them in Sprint 0 Day 5 — structure + names are the contract, hex/sizes will change. When updating values, update [packages/design-system/src/tokens/](../design-system/src/tokens/) in the same PR so web + mobile do not drift.

## Usage

```dart
import 'package:alp_design_tokens/alp_design_tokens.dart';

Container(
  padding: EdgeInsets.all(AlpSpacing.s4),
  decoration: BoxDecoration(
    color: AlpColors.surfacePrimary,
    borderRadius: BorderRadius.circular(AlpRadius.card),
  ),
  child: Text('Hello', style: AlpTextStyles.body),
)
```

## Path dependency in apps/mobile/pubspec.yaml

```yaml
dependencies:
  alp_design_tokens:
    path: ../../packages/design-tokens-flutter
```
