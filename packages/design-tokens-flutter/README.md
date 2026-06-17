# alp_design_tokens

Dart token package for the ALP mobile app. **Vidya v1 is canonical; Aurora v2 is kept alive for the migration window.**

> **Status (web)**: Vidya v1 shipped — see [ADR-0034](../../docs/adr/0034-design-system-v3-vidya.md).
> **Status (mobile)**: Aurora widget catalog still in use across 30+ screens; Vidya migration is a dedicated follow-up sprint. This package exports both during the window so the mobile build keeps compiling while screens are migrated incrementally.

## Canonical Vidya surface (use this for new code)

```dart
import 'package:alp_design_tokens/alp_design_tokens.dart';

MaterialApp(
  theme: VidyaTheme.material(
    brightness: Brightness.light,
    persona: VidyaPersona.aspirant,
    density: VidyaDensity.regular,
  ),
  darkTheme: VidyaTheme.material(
    brightness: Brightness.dark,
    persona: VidyaPersona.aspirant,
    density: VidyaDensity.regular,
  ),
  themeMode: ThemeMode.system,
  // …
);

// In any widget:
final v = VidyaThemeData.of(context);
Container(
  padding: EdgeInsets.all(VidyaSpacing.sp4),
  decoration: BoxDecoration(
    color: v.card,
    borderRadius: BorderRadius.all(VidyaRadius.lg),
    border: Border.all(color: v.rule),
  ),
  child: Text('Hello', style: VidyaText.bodyLg(v.ink)),
);
```

The Vidya types mirror the web tokens 1:1 — paper / ink / accent / gold / good / warn / bad / info / mastery-5-bucket / 8 subjects / spacing / radius / motion / 5 personas / 3 densities. Full reference: [docs/02-design/design-system/03_tokens.dart](../../docs/02-design/design-system/03_tokens.dart).

## Aurora compatibility (deprecated — for migration only)

The Aurora `Persona` enum (kid/teen/aspirant/learner), `AuroraColors`, `AuroraTheme.build()`, `AuroraSystemChrome`, and ~100 `Aurora*` widgets are re-exported from this package so the existing mobile app keeps compiling. **Don't add new code against Aurora types.** When migrating a screen, swap:

| Aurora | Vidya |
|---|---|
| `AuroraTheme.build(persona: Persona.aspirant)` | `VidyaTheme.material(persona: VidyaPersona.aspirant)` |
| `AuroraColors.brandPrimary` | `VidyaThemeData.of(context).accent` |
| `AuroraTypography.bodyBase` | `VidyaText.body(VidyaThemeData.of(context).ink)` |
| `AuroraSpacing.s4` | `VidyaSpacing.sp4` |
| `AuroraRadius.card` | `VidyaRadius.lg` |
| `Persona.kid / teen / learner` | `VidyaPersona.junior / senior / lifelong` (see mapping note below) |

**Persona mapping note** — the Aurora and Vidya persona vocabularies overlap but don't match 1:1. Aurora used kid/teen/aspirant/learner (4); Vidya uses junior/senior/aspirant/pro/lifelong (5). Aspirant carries across unchanged. Kid → junior, teen → senior, learner → lifelong are the closest matches; the new `pro` persona is web-side professional surfaces (admin/teacher) and has no direct Aurora equivalent on mobile.

## Path dependency

```yaml
# apps/mobile/pubspec.yaml
dependencies:
  alp_design_tokens:
    path: ../../packages/design-tokens-flutter
```

## Fonts

Vidya font assets (Instrument Serif / Geist / Geist Mono) install via the root-level script:

```bash
bash scripts/vidya/install-fonts.sh
```

That populates `apps/mobile/assets/fonts/` (gitignored). `apps/mobile/pubspec.yaml` already declares the `flutter.fonts:` entries.
