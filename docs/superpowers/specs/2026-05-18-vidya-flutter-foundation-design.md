# Vidya Flutter Foundation — Design Spec

**Date:** 2026-05-18
**Status:** Approved (Phase 1 of N — see Sequencing §3)
**Related:** [ADR-0034 Design System v3 — Vidya](../../adr/0034-design-system-v3-vidya.md) (§6 + Open Question §3)
**Branch:** `feature/vidya-foundation`

---

## 1. Context

ADR-0034 cut Aurora over to Vidya on web but **deferred the Flutter migration**: the mobile app consumes ~50 `Aurora*` widget classes across 74 files, and Vidya's 14 web primitives don't map 1:1 onto Aurora's Flutter widget surface. Wholesale deletion would brick the mobile build.

The user has uploaded ~24 mobile mockup screens (Onboarding + Auth + Home + Quiz + Study + Practice + Insights + Profile) showing the target Vidya design. Roughly 35 additional Aurora screens in the codebase also need eventual migration, totaling ~60 screens.

This is too large for a single spec. This document covers **Phase 1: Foundation**. Phase 2+ (per-screen-group migration) get their own specs in follow-up conversations.

## 2. Goal of this phase

Build the Flutter design-system infrastructure required to start migrating screens. **No user-facing screens are migrated in this phase.** When this phase ships:

- Vidya widget primitives exist and are importable
- Vidya theme/persona/density notifiers exist and persist independently of Aurora's
- A `VidyaApp` root widget is available (but not yet wired as `runApp` root)
- Aurora continues to compile and ship untouched

## 3. Sequencing (informational)

This spec is Phase 1 of a multi-phase migration. Subsequent phases get separate specs and conversations:

| Phase | Spec | Scope |
|---|---|---|
| **1. Foundation** *(this spec)* | this file | tokens (done) + 14 widget primitives + 3 notifiers + `VidyaApp` |
| 2. Onboarding + Splash + Auth | follow-up | splash, welcome, 3 onboarding cards, exam-select, screening intro, screening result, login, OTP |
| 3. Home + bottom nav shell | follow-up | home dashboard, "More" tab, main_scaffold rewire |
| 4. Quiz | follow-up | live quiz, mock test, mock result, offline quiz |
| 5. Study + Practice | follow-up | study map, AI practice |
| 6. Insights | follow-up | my analysis, your edge, weekly recap |
| 7. Profile + Settings | follow-up | profile, settings cluster |
| 8. Long tail | follow-up | doubts, assignments, marketplace, etc. |

## 4. Existing state

Already in place (do not re-do):

- `packages/design-tokens-flutter/lib/src/vidya/tokens.dart` (420 lines): `VidyaColors`, `VidyaFonts`, `VidyaText`, `VidyaSpacing`, `VidyaRadius`, `VidyaMotion`, `VidyaDensity`, `VidyaPersona`, `VidyaPersonaAccent`, `VidyaThemeData` (`ThemeExtension`), `VidyaTheme.material(...)`.
- Font assets declared in `apps/mobile/pubspec.yaml`: `InstrumentSerif`, `Geist`, `GeistMono`.
- Token barrel export in `packages/design-tokens-flutter/lib/alp_design_tokens.dart` co-exports Vidya and Aurora.

Aurora stays alive (74 files reference `AuroraButton/Card/TextField/Scaffold`). Aurora notifiers in `apps/mobile/lib/aurora/`: `persona.dart`, `density_notifier.dart`, `theme_mode_notifier.dart`.

## 5. Decisions

### 5.1 Coexistence: side-by-side, new namespace

Vidya widgets live in `packages/design-tokens-flutter/lib/src/vidya/widgets/` (package-resident). Aurora widgets stay in `apps/mobile/lib/aurora/widgets/`. Screens migrate one-at-a-time by changing imports in Phase 2+. Two design systems coexist briefly.

**Rejected:** rewriting Aurora widgets internally to use Vidya tokens (mass simultaneous visual regression); shim wrappers (same blast radius, same risk).

### 5.2 Widget catalog: Vidya canonical only (14 primitives)

Match the web Vidya canonical surface. Aurora-specific patterns (e.g., `AuroraAccordion`, `AuroraActionSheet`) are intentionally NOT ported — screen migrations will adopt Vidya patterns instead.

### 5.3 Layout: package-resident widgets, app-resident notifiers

| Lives in | Why |
|---|---|
| `packages/design-tokens-flutter/lib/src/vidya/widgets/` | Pure design code. Reusable. Matches web's `packages/design-system` pattern. |
| `apps/mobile/lib/vidya/` (notifiers + `VidyaApp`) | Touches `flutter_secure_storage` and app lifecycle. Belongs with app-level dependencies. |

### 5.4 Notifiers: three independent, namespaced storage keys

Three `ChangeNotifier`s mirror the Aurora pattern but persist under separate keys:
- `VidyaPersonaNotifier` → key `vidya.persona` (enum `VidyaPersona`: junior/senior/aspirant/pro/lifelong)
- `VidyaDensityNotifier` → key `vidya.density` (enum `VidyaDensity`: compact/regular/comfy)
- `VidyaThemeModeNotifier` → key `vidya.theme` (`ThemeMode`)

**No bridge to Aurora notifiers.** Persona taxonomies actually differ (Vidya `senior`/`pro` vs Aurora `teen`/`learner`); a bridge would be lossy. Phase 2 onboarding writes Vidya's value directly when the user picks.

### 5.5 Root widget: `VidyaApp` available but not wired

`VidyaApp` is built in this phase. `main.dart` continues using `AuroraApp` until Phase 2's first Vidya screen needs to render — at which point a separate decision flips the root.

## 6. Folder structure

```
packages/design-tokens-flutter/lib/src/vidya/
├── tokens.dart                # exists, 420 lines
└── widgets/
    ├── widgets.dart           # barrel
    ├── vidya_button.dart
    ├── vidya_card.dart
    ├── vidya_text_field.dart
    ├── vidya_scaffold.dart
    ├── vidya_app_bar.dart
    ├── vidya_chip.dart
    ├── vidya_badge.dart
    ├── vidya_avatar.dart
    ├── vidya_sheet.dart
    ├── vidya_banner.dart
    ├── vidya_tag.dart
    ├── vidya_ai_tag.dart
    ├── vidya_mastery_bar.dart
    └── vidya_sparkline.dart

packages/design-tokens-flutter/lib/alp_design_tokens.dart
+ export 'src/vidya/widgets/widgets.dart';

apps/mobile/lib/vidya/
├── vidya.dart                 # barrel: re-exports notifiers + VidyaApp
├── persona_notifier.dart
├── density_notifier.dart
├── theme_mode_notifier.dart
└── vidya_app.dart

apps/mobile/lib/screens/
└── vidya_gallery_screen.dart  # debug-only; visual sanity check; gated by const flag
```

## 7. Widget catalog detail

Each widget reads `VidyaThemeData.of(context)` (no hardcoded hex). Density values scale touch targets + padding. Persona accent is read live from the theme extension. Estimated ~60–150 LOC each (~1500 LOC widgets total).

| # | Widget | Purpose | Key variants |
|---|---|---|---|
| 1 | `VidyaButton` | Primary action | `style: primary \| secondary \| ghost`; `size: sm \| md \| lg`; `leadingIcon`, `trailingIcon`, `loading`, `disabled` |
| 2 | `VidyaTextField` | Text input | `label`, `hint`, `helper`, `error`, `prefixIcon`, `suffixIcon`, `obscure`, `multiline`, `keyboardType` |
| 3 | `VidyaCard` | Surface container | `tone: default \| muted \| accent \| dark`; padding from density; optional `onTap` ripple |
| 4 | `VidyaScaffold` | Page chrome | wraps `Scaffold` with `paper` background + safe-area + optional `appBar`, `bottomNav` |
| 5 | `VidyaAppBar` | Top bar | `title` (Instrument Serif), `leading`, `actions`, density-aware height |
| 6 | `VidyaChip` | Compact selector / tag | `selected`, `onTap`, `label`, `leadingIcon`; `tone: neutral \| accent \| mastery` |
| 7 | `VidyaBadge` | Inline status pill | `tone: good \| warn \| bad \| info \| neutral`; `label` |
| 8 | `VidyaAvatar` | Initials/image avatar | `size`, `imageUrl?`, `initials`, fallback color from persona |
| 9 | `VidyaSheet` | Bottom sheet | `title?`, `child`, drag handle, density-aware padding |
| 10 | `VidyaBanner` | Inline notice strip | `tone`, `leadingIcon`, `message`, `action?` |
| 11 | `VidyaTag` | Subject / metadata tag | `tone: subject(VidyaSubject) \| mastery(VidyaMasteryBucket) \| neutral` |
| 12 | `VidyaAiTag` | **AI provenance signal** | `label`; mono uppercase + 6px gold dot. Gold reserved exclusively here per ADR-0034 §4. |
| 13 | `VidyaMasteryBar` | Mastery row | `value 0..1`, `bucket`, `label`, optional `pct` text |
| 14 | `VidyaSparkline` | Inline trend chart | `values: List<double>`, `height`, persona accent stroke, optional `endDotColor` |

## 8. Theme provider plumbing

```dart
// apps/mobile/lib/vidya/vidya_app.dart
class VidyaApp extends StatelessWidget {
  final VidyaPersonaNotifier persona;
  final VidyaDensityNotifier density;
  final VidyaThemeModeNotifier themeMode;
  final Widget Function(BuildContext) builder;

  const VidyaApp({
    super.key,
    required this.persona,
    required this.density,
    required this.themeMode,
    required this.builder,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: Listenable.merge([persona, density, themeMode]),
      builder: (context, _) => MaterialApp(
        theme: VidyaTheme.material(
          brightness: Brightness.light,
          persona: persona.persona,
          density: density.density,
        ),
        darkTheme: VidyaTheme.material(
          brightness: Brightness.dark,
          persona: persona.persona,
          density: density.density,
        ),
        themeMode: themeMode.mode,
        builder: (context, child) => Builder(builder: builder),
      ),
    );
  }
}
```

Notifiers follow the exact shape of `apps/mobile/lib/aurora/persona.dart` etc.: `ChangeNotifier`, `flutter_secure_storage`, `bootstrap()` reads from disk, `setX()` writes through.

Bootstrap before `runApp`:
```dart
final persona = VidyaPersonaNotifier();
final density = VidyaDensityNotifier();
final themeMode = VidyaThemeModeNotifier();
await Future.wait([persona.bootstrap(), density.bootstrap(), themeMode.bootstrap()]);
```

## 9. Acceptance criteria

This phase ships when all are true:

1. `cd apps/mobile && flutter analyze` exits 0
2. `cd packages/design-tokens-flutter && flutter analyze` exits 0
3. `cd apps/mobile && flutter test test/vidya/` — 14 widget tests pass (one per primitive), each:
   - renders without exception under light + dark theme
   - renders without exception under all 5 personas
   - renders without exception under all 3 densities
4. `cd apps/mobile && flutter build apk --debug` succeeds
5. `vidya_gallery_screen` reachable behind a debug flag renders one of each primitive in both themes (visual sanity check; not user-visible)
6. No Aurora screen visually changes — `home_screen` smoke test still passes
7. Aurora app continues to run end-to-end (cold start, login, navigate home) — manually verified

## 10. Out of scope

- **No user-facing screens are migrated.** Onboarding, home, auth, quiz — all stay on Aurora until Phase 2+.
- **No `main.dart` swap to `VidyaApp`** — `VidyaApp` is built but not wired as the runApp root. Phase 2 does the swap.
- **No Aurora widget edits.** They keep compiling identically.
- **No Aurora→Vidya codemod or migration tool.** Screen migrations will be hand-written per group.
- **No bridge between Aurora `Persona` enum and `VidyaPersona`.** Onboarding (Phase 2) will write both during the transition window if needed.
- **No web parity audit.** Vidya web has its own bug surface; this work isn't pixel-matching web.
- **No `vidya_gallery_screen` in production builds.** Debug-only.

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Font assets missing or wrong filenames | `pubspec.yaml` already declares them; widget tests assert `fontFamily` resolves on a probe `TextStyle` and fail loud if it falls back to system sans-serif |
| `MaterialApp` `themeMode` doesn't crossfade on persona change | Use `AnimatedBuilder(Listenable.merge([...]))` — persona/density force hard rebuild; theme toggles get framework crossfade |
| `flutter_secure_storage` returns null on first launch | `bootstrap()` handles this — defaults to `aspirant`/`regular`/`dark` per existing Aurora pattern |
| Widget API drift between this spec and what Phase 2 screens need | This section is the contract; Phase 2 starts by stress-testing it on splash + welcome before all 8 onboarding screens |
| `alp_design_tokens` package becoming "design system" while keeping tokens-only name | Accept mismatch for now; rename post-Aurora-deletion |
| Two design systems alive simultaneously increases APK size | Acceptable for migration window; ADR-0034 explicitly chose this path; Aurora deletion in a later phase reclaims the bytes |

## 12. Verification plan

```bash
# from repo root
cd packages/design-tokens-flutter && flutter analyze && cd -
cd apps/mobile && flutter analyze
cd apps/mobile && flutter test test/vidya/
cd apps/mobile && flutter build apk --debug
```

All four must exit 0. Manual: open `vidya_gallery_screen` behind the debug flag, toggle theme/persona/density and confirm all 14 primitives re-render correctly.

## 13. Open questions

None at design time. Open questions surfaced during implementation will be appended here before this spec is closed.
