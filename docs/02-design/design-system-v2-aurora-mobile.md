# Design System v2 — "Aurora Mobile" — AdaptiveLearn Flutter App

**Version**: 2.0 (Aurora Mobile)
**Status**: Proposed — under review (not yet implemented)
**Date**: 2026-05-13
**Companion spec**: [`design-system-v2-aurora.md`](design-system-v2-aurora.md) (web)
**ADRs**: [ADR-0002 — Flutter mobile stack](../adr/0002-flutter-mobile-stack.md) · [ADR-0028 — Design System v2 (Aurora)](../adr/0028-design-system-v2-aurora.md) · [ADR-0029 — Component Primitives Package](../adr/0029-component-primitives-package.md)
**Implementation surface**: [`apps/mobile/`](../../apps/mobile/) (Flutter 3.24+, Dart 3.5+) · [`packages/design-tokens-flutter/`](../../packages/design-tokens-flutter/)
**Owners**: Mobile Platform · Design · Product

---

## Table of contents

1. [Why mobile needs its own design system](#1-why-mobile-needs-its-own-design-system)
2. [Audit findings — mobile-specific gaps](#2-audit-findings--mobile-specific-gaps)
3. [Continuity with web Aurora — what's shared, what diverges](#3-continuity-with-web-aurora--whats-shared-what-diverges)
4. [Mobile north-star — "Aurora, in your hand"](#4-mobile-north-star--aurora-in-your-hand)
5. [Platform conventions — Material 3 × Cupertino HIG](#5-platform-conventions--material-3--cupertino-hig)
6. [Persona density on mobile](#6-persona-density-on-mobile)
7. [Design tokens — mobile-adapted](#7-design-tokens--mobile-adapted)
8. [Component primitives library (Flutter widgets)](#8-component-primitives-library-flutter-widgets)
9. [Mobile-specific patterns](#9-mobile-specific-patterns)
10. [Navigation architecture](#10-navigation-architecture)
11. [Gestures, haptics, sound](#11-gestures-haptics-sound)
12. [Engagement architecture — mobile](#12-engagement-architecture--mobile)
13. [Screen redesigns — the 10 anchor mobile flows](#13-screen-redesigns--the-10-anchor-mobile-flows)
14. [Accessibility on mobile (iOS + Android)](#14-accessibility-on-mobile-ios--android)
15. [Internationalization](#15-internationalization)
16. [Responsive — phones, tablets, foldables](#16-responsive--phones-tablets-foldables)
17. [Dark mode — OS-driven](#17-dark-mode--os-driven)
18. [Offline-first patterns](#18-offline-first-patterns)
19. [Push notifications, deep links, app states](#19-push-notifications-deep-links-app-states)
20. [Performance budgets](#20-performance-budgets)
21. [Migration plan & sprints](#21-migration-plan--sprints)
22. [Open questions](#22-open-questions)
23. [Appendix A — Token reference](#appendix-a--token-reference)
24. [Appendix B — Widget × screen composition matrix](#appendix-b--widget--screen-composition-matrix)

---

## 1. Why mobile needs its own design system

The web Aurora system answers "how do we build a calm, confident, density-aware learning experience across Class 5 → professional learners on desktop and tablet?" Mobile inherits the same identity and tokens but the **interaction model is fundamentally different**:

- **Thumbs, not cursors.** Touch targets, reach zones, and gesture conflicts decide success. A 40 × 40 px button that worked on web becomes inaccessible at the top of a 6-inch phone.
- **Two design languages run side-by-side.** iOS users expect Cupertino chrome (back-swipe edge, sheets that drag-to-dismiss, system fonts, modal hierarchy). Android users expect Material 3 (ripple, FAB, snackbars, edge-to-edge, dynamic color). A single brand identity must read native on both.
- **OS owns parts of the system.** Status bar, navigation bar, keyboard, share sheet, system-level dark mode, dynamic type, language, biometric auth — these aren't ours to control. We must compose with them.
- **App states matter.** Foreground / background / terminated / locked-screen / picture-in-picture all change what should render and how state restores.
- **Offline is the default in India.** 4G/5G drops, metro tunnels, school Wi-Fi all interrupt connectivity. Mobile-first means offline-first for the largest persona segment.
- **Engagement levers are different.** Push notifications, lock-screen widgets, app-icon badges, haptics, sound, and the home-screen widget extension are the retention currency mobile has — and web doesn't.
- **Engineering platform is different.** Flutter widgets with `MaterialApp` + `CupertinoApp`-derived themes; no CSS variables; theming via `ThemeData` + `ThemeExtension`; tokens consumed via `Theme.of(context)`.

A mobile-only spec is therefore not a "shrink the web doc"; it's a sibling system that shares **identity** (color, mastery, Aurora gradients, type ramp baseline) but diverges in **layout, components, navigation, motion, gestures, and lifecycle**.

---

## 2. Audit findings — mobile-specific gaps

The existing Flutter app at [`apps/mobile/`](../../apps/mobile/) ships ~50 screens (Home, Catalog, Topic, Quiz, Analysis, Friends, Clans, Settings, Marketplace, Onboarding, Auth, etc.). Aurora-mobile addresses these mobile-specific gaps in the current state:

| # | Gap | Cost to user |
|---|---|---|
| **M1** | **`MaterialApp`-only theming.** Every screen reads from `ThemeData.light/dark` but there's no Aurora `ThemeExtension`, no semantic tokens (`mastery.weak`, `aurora.ai`, `subject.physics`) — colors are looked up by hardcoded `AlpColors.*` constants. | Theme changes (OS dark mode, density mode, A/B brand experiments) require rebuilding every screen. |
| **M2** | **No persona density on mobile.** Web ships Junior / Aspirant / Pro density modes. Mobile uses one density. A Class 5 student gets the same 36-pt touch target as a UPSC adult. | K–10 retention bleeds. |
| **M3** | **No native platform adaptation.** Android users see iOS-style modals on Android (and vice-versa). Back-swipe edge inconsistent. App bar styled identically across platforms. | Feels "ported" rather than native. Mid-market Android phones (the largest install base) lose familiarity. |
| **M4** | **No haptic / sound feedback.** Correct-answer celebration is purely visual. Streak save passes without a single tactile cue. | Engagement plateau — the cheapest retention lever is unused. |
| **M5** | **No offline-first.** Practice sessions hard-fail when connectivity drops mid-quiz. Mastery refresh polls on foreground without caching. | Metro commutes (the prime study window in Mumbai/Delhi) lose practice minutes. |
| **M6** | **No push notification design.** Backend wires `notification.streak.broken` etc.; no mobile payload schema, no rich-notification preview, no action buttons. | The streak-save / mission reminder loop never reaches the lock screen. |
| **M7** | **Mobile keyboard not designed for.** Inputs reflow under the keyboard ungracefully; numeric inputs don't request `TextInputType.number`; submit-on-return missing. | Friction every form. |
| **M8** | **No deep linking spec.** "Share this question" / "Resume from web" / "Open this topic from a notification" all 404 or land on Home. | Cross-channel growth blocked. |
| **M9** | **Tablet + foldable layouts unconsidered.** Single phone-first stack. Tablets get oversized cards on huge whitespace; foldables don't split. | Premium devices underserved. |
| **M10** | **Status bar / safe areas inconsistent.** Some screens use `SafeArea`; some hardcode top padding. Notch / dynamic island / gesture nav bar overlap. | Visual glitches across device generations. |
| **M11** | **System dark mode honored but not designed.** Honored at the `ThemeMode.system` level; specific token values per surface tier aren't audited. | Dark surfaces drift from web Aurora — inconsistent across platforms. |
| **M12** | **No skeleton / shimmer pattern.** Loading states are blank or `CircularProgressIndicator` — neither matches the rich offline-cache + skeleton story Aurora-web ships. | Perceived performance worse than web for the same backend latency. |

Aurora-mobile addresses each as first-class system content — not "future work".

---

## 3. Continuity with web Aurora — what's shared, what diverges

### 3.1 Shared with web (identity layer)

These are the **brand-level invariants** — change them only at the system level, never per-platform:

- **Brand spine** — `--brand-50/100/500/600/700`. Indigo `#5B5BD6` light, `#7C7CE8` dark. Identical to web.
- **Semantic palette** — success / proficient / developing / danger / locked / reward. Identical hex values, identical mastery bucket mapping.
- **Aurora gradients** — `--aurora-ai` (cyan → violet), `--aurora-celebration` (amber → pink), `--aurora-progress` (green → cyan). Identical stops; rendered via `LinearGradient` in Flutter instead of CSS.
- **Subject encoding** — Physics sky / Chemistry orange / Biology emerald / Maths violet / English pink / History amber-brown / Geography teal / GS indigo / CS blue / Hindi red. Identical to web.
- **Mastery scale** — `mastery-0 / weak / dev / strong / mastered`. EWA buckets identical (≥ 0.70 strong, etc.).
- **Three-persona model** — Junior / Aspirant / Pro. Same personas, same default mappings per exam profile.
- **Engagement vocabulary** — streak, mission, AI insight, level-up, milestone. Identical language.

### 3.2 Diverges from web (platform layer)

These adapt per-platform because mobile's constraints are different:

| Aspect | Web | Mobile |
|---|---|---|
| **Implementation** | CSS custom properties + `@alp/ui` React primitives | Flutter `ThemeExtension` + `packages/design-tokens-flutter` Dart tokens + `packages/ui-flutter` widgets (new) |
| **Type scale** | Inter at 11–36 px | Platform sans at 12–28 sp (Android dp-scaled); 11–30 pt (iOS); same hierarchy *intent*, smaller maxima |
| **Default font** | Inter | iOS: SF Pro Text / SF Pro Display (system) — Android: Roboto (system) — fallback to Inter when bundled; Hindi: Noto Sans Devanagari |
| **Touch targets** | 40 / 48 / 36 px (web density) | **44 / 48 / 40 dp minimum** — iOS HIG (44 pt) and Material (48 dp) floors enforced |
| **Spacing** | 4 pt grid, broad scale | 4 dp grid, **denser maxima** (mobile rarely needs 64+ in a single component) |
| **Navigation** | Sidebar + topbar + mobile-tab-bar | Bottom nav bar + app bar + modal stacks + drawers |
| **Motion** | CSS transitions / Framer | Flutter `AnimationController` + `Curves.easeOutCubic`; respects `MediaQuery.disableAnimations` |
| **Surfaces** | Layered cards on a page | Material 3 surface tiers + iOS "grouped inset" lists |
| **Modals** | `<dialog>` + Sheet primitive | `showModalBottomSheet` (Android-canonical), `showCupertinoModalPopup` (iOS-canonical), `showDialog` (both) |
| **Density modes** | `[data-density]` attr on `<html>` | `Theme.of(context).extension<AuroraDensity>()` — runtime switch via `ThemeMode`-style provider |
| **Engagement extras** | Confetti, shimmer, level-up toast | **Haptics + sound + push + app-icon badge + lock-screen widget + notification actions** — all mobile-only levers |
| **Dark mode** | Single `data-theme=dark` toggle | `ThemeMode.system` by default; honors OS toggle live without restart |
| **Offline** | Cache-first via service worker | **Offline-first via Drift / Hive cache + queued mutations + connectivity banner** |

### 3.3 Deprecated by Aurora-mobile

- **Hand-rolled colors** (`AlpColors.brandPrimary` literals scattered through screens) — superseded by `Theme.of(context).extension<AuroraColors>()!.brand600`.
- **`Material(...)` ad-hoc surfaces** — replaced by `AuroraCard` widget.
- **Inline `Padding` constants** — replaced by `AuroraDensity.space(token)`.
- **`MaterialButton` / `TextButton` everywhere** — replaced by `AuroraButton(variant: ...)`.

---

## 4. Mobile north-star — "Aurora, in your hand"

Same identity, refined for the device class:

> *Calm, confident geometry that lights up at the right moments — and feels native in whichever hand it lands.*

Three operating principles unique to mobile:

1. **Native first, brand second.** When iOS HIG and our brand disagree on a small detail (e.g. swipe-back gesture, action sheet location, segmented control shape), HIG wins. Our brand layers on top via color, type, and Aurora moments. Same rule applies to Material 3 on Android.
2. **Thumb-zone respects everything else.** Primary actions sit in the **lower 60%** of the screen wherever possible. The "stretch zone" (top of phones with 6"+ displays) is for status, breadcrumbs, and contextual back affordances only.
3. **One-handed defaults; two-handed flourishes.** Every common task (start practice, answer a question, view rank) must be reachable one-handed. Two-handed flourishes (long-form reading, drag-and-drop matching) are explicitly designed but never required for completion.

---

## 5. Platform conventions — Material 3 × Cupertino HIG

We do **not** ship two parallel apps. We ship **one Flutter app that adopts native chrome per platform** via Flutter's adaptive widgets and selective `Theme.of(context).platform` branches.

### 5.1 What's platform-adapted

These render differently per platform — by design:

| Element | iOS (Cupertino) | Android (Material 3) |
|---|---|---|
| **App bar** | Large titles on iOS 13+, transparent on scroll, system back chevron + label | Surface-tinted Material 3 `AppBar`, hamburger / back arrow |
| **Bottom nav** | `CupertinoTabBar` with SF Symbols, 49 pt tall | `NavigationBar` (Material 3), 80 dp tall, label + icon |
| **Modals** | Sheet drags down to dismiss, top-rounded corners 10 pt, vibrancy backdrop | Material `showModalBottomSheet`, ripple drag handle, drag-to-dismiss |
| **Action sheets** | `CupertinoActionSheet` from the bottom | Material `Dialog` or bottom sheet |
| **Switches** | `CupertinoSwitch` (iOS green when on by default — we override to brand-600) | `Switch` (Material 3 — thumb fills track) |
| **Pull-to-refresh** | `CupertinoSliverRefreshControl` (rubber-band) | `RefreshIndicator` (circular Material spinner) |
| **Back gesture** | Edge swipe from left edge | System back gesture / button |
| **Date/time pickers** | `CupertinoDatePicker` wheel | Material `showDatePicker` modal |
| **Loading spinner** | `CupertinoActivityIndicator` (gray spinner) | `CircularProgressIndicator` (brand-tinted) |
| **Haptics defaults** | iOS Taptic Engine via `HapticFeedback.lightImpact` etc. | Android Vibrator API via same Flutter abstraction |
| **System fonts** | SF Pro Text / SF Pro Display | Roboto |

### 5.2 What's brand-unified (same on both)

These look identical across platforms — they're the brand:

- All token values (color, gradient, mastery scale, subject encoding)
- Card geometry (radius 14, padding scale, shadow)
- Aurora gradient surfaces (AI tutor, celebration, progress)
- StreakChip, StatCard, ProgressRing, MasteryCell — domain organisms
- Mission card hierarchy, AI insight pattern
- Brand wordmark, app icon, splash screen

### 5.3 Adaptive widget catalog

Flutter ships `Cupertino*` and Material widgets. We expose **one widget per pattern** with internal platform adaptation:

```dart
AuroraButton(...)          // Material elevated/filled/outlined OR Cupertino filled/tinted
AuroraAppBar(...)          // Material AppBar OR Cupertino navigation bar
AuroraScaffold(...)        // Material Scaffold OR CupertinoPageScaffold
AuroraNavigationBar(...)   // Material 3 NavigationBar OR CupertinoTabBar
AuroraSheet(...)           // showModalBottomSheet OR showCupertinoModalPopup
AuroraSwitch(...)          // Switch OR CupertinoSwitch (tinted to brand-600 either way)
AuroraSpinner(...)         // CircularProgressIndicator OR CupertinoActivityIndicator
AuroraRefresh(...)         // RefreshIndicator OR CupertinoSliverRefreshControl
```

Callers never branch on `Platform.isIOS`. The widget does it.

---

## 6. Persona density on mobile

Three modes, identical personas to web, but **mobile-scaled** scalars:

| Mode | Default for | Spacing scale | Type scale | Min tap target | Motion scale |
|---|---|---|---|---|---|
| **Junior** | CBSE 5–10, Vedic Maths | 1.20× (more breathing room — fingers are smaller, but parents help; we trade screen-real-estate for clarity) | 1.10× | **48 dp** (iOS) / **48 dp** (Android) | 1.20× (bouncier) |
| **Aspirant** *(default)* | NEET / JEE / UPSC / CAT / Class 11–12 | 1.00× | 1.00× | **44 pt** (iOS) / **48 dp** (Android) — platform floors | 1.00× |
| **Pro** | Working pros, tutors, institution admins | 0.85× (tight; pros tolerate density) | 0.90× | **44 pt** (iOS) / **44 dp** (Android — drop below 48 only here) | 0.70× (snappier) |

**Implementation:** `AuroraDensity` is a `ThemeExtension<AuroraDensity>` on `ThemeData` with four scalar fields (`spaceScale`, `typeScale`, `radiusScale`, `motionScale`). Switched at runtime from Settings via `Provider<DensityNotifier>`. Persists to `flutter_secure_storage` under `alp.density`. Mirrors the web `data-density` attribute pattern.

**Junior-mobile rule:** never compact below the OS-required touch-target floor (44 / 48). The scale **adds** space; it never subtracts. Pro density drops below 48 dp on Android only after a one-time user consent dialog ("Use compact spacing? Touch targets will be smaller than recommended").

---

## 7. Design tokens — mobile-adapted

Lives in [`packages/design-tokens-flutter/lib/src/`](../../packages/design-tokens-flutter/lib/src/). Mirrors the web `tokens.v2.css` semantics; values quantised in **dp** (Android density-pixel) which iOS reads as pt 1:1.

### 7.1 Color (shared with web verbatim)

```dart
class AuroraColors extends ThemeExtension<AuroraColors> {
  final Color brand50, brand100, brand500, brand600, brand700;
  final Color success50, success500, success600;
  final Color developing500, developing600;
  final Color danger500, danger600;
  final Color reward500, reward600;
  final Color locked500;
  final Color aurora500;

  // Aurora gradients — Flutter LinearGradient bundles
  final Gradient auroraAi;          // 135deg cyan → violet
  final Gradient auroraCelebration; // 135deg amber → pink
  final Gradient auroraProgress;    // 135deg green → cyan

  // Subject palette — 10 subjects
  final Color subjPhysics, subjChemistry, subjBiology, subjMaths,
              subjEnglish, subjHistory, subjGeography, subjGs,
              subjCs, subjHindi;

  // Neutral ramp — 12 steps, light + dark resolved
  final List<Color> neutral; // [0, 50, 100, 200, …, 900]

  // Mastery palette
  final Color mastery0, masteryWeak, masteryDev, masteryStrong;
  final Gradient masteryMastered;
}
```

Values are byte-for-byte identical to [tokens.v2.css §6](design-system-v2-aurora.md#62-color--semantic-status--mastery). Dark mode flips the neutral ramp + lifts brand/semantic 5–15% lightness exactly as the web `[data-theme="dark"]` block does.

### 7.2 Typography — mobile-tuned

The web type scale starts at 11 px and tops out at 36 px display. On phones, that maxes too high (display text at 36 looks shouty in 6" viewports) and bottoms too low (11 px hurts on dynamic-type accessibility settings).

**Mobile type scale (Aspirant baseline; sp / pt unified):**

| Token | Size / Line / Weight / Tracking | Use |
|---|---|---|
| `tDisplay` | 30 / 36 / 700 / -0.02 | Hero numbers on first screens (streak count on profile, rank on analysis) — sparingly |
| `tH1` | 24 / 32 / 700 / -0.015 | Page titles |
| `tH2` | 20 / 28 / 600 / -0.01 | Section headings |
| `tH3` | 17 / 24 / 600 / -0.005 | Card headings |
| `tH4` | 15 / 22 / 600 / 0 | Subheadings |
| `tBodyLg` | 16 / 24 / 400 / 0 | Reading content, lesson body, question stems |
| `tBody` | 14 / 22 / 400 / 0 | Default UI body |
| `tBodySm` | 13 / 18 / 400 / 0 | Secondary info |
| `tLabel` | 12 / 16 / 500 / 0.01 | Form labels, captions |
| `tOverline` | 11 / 14 / 600 / 0.08 / upper | Column headers, eyebrows |
| `tButton` | 15 / 20 / 600 / 0 | Button labels (1pt larger than web — fingers, not cursors) |
| `tMono` | 14 / 20 / 500 / 0 / tabular nums | Numbers, IDs, formulas |

**Font selection:**

| Role | iOS | Android | Hindi (Devanagari) |
|---|---|---|---|
| UI / body | SF Pro Text (system) | Roboto (system) | Noto Sans Devanagari (bundled) |
| Display / hero numbers | SF Pro Display (system) | Roboto (system) | Noto Sans Devanagari |
| Mono / formulas | SF Mono (system) | Roboto Mono (Google Fonts bundled) | Noto Sans Mono |
| Math | STIX Two Math via `flutter_math_fork` | same | same |

System fonts are preferred on both platforms — they ship with the OS, they pick up dynamic type, and they match user expectations. Hindi falls back to Noto Sans Devanagari, bundled via `google_fonts` for offline reliability.

**Dynamic type:** iOS Dynamic Type and Android font scale are honored. Our `tDisplay` etc. are *minimums*; `MediaQuery.textScaleFactor` multiplies up. Cap multiplier at 1.3× on Junior, 1.5× on Aspirant, 1.7× on Pro (accessibility default) to prevent layout collapse — never strip the multiplier entirely.

### 7.3 Spacing (4 dp grid, mobile-maxed)

```dart
class AuroraSpacing {
  final double s1 = 4;
  final double s2 = 8;
  final double s3 = 12;
  final double s4 = 16;
  final double s5 = 20;
  final double s6 = 24;
  final double s8 = 32;
  final double s10 = 40;
  final double s12 = 48; // rarely beyond this on mobile
  final double s16 = 64; // hero whitespace only
}
```

Web's `--sp-20: 80` doesn't exist on mobile — there's never a justifiable 80 dp gap on a 360 dp phone width.

### 7.4 Radius

```dart
class AuroraRadius {
  final double sm = 6;
  final double md = 10;
  final double lg = 14;
  final double xl = 20;
  final double xxl = 28;
  final double pill = 9999;
}
```

Identical to web. Density layer scales these too (Junior 1.1×, Pro 0.85×).

### 7.5 Elevation — Material 3 + iOS-tuned

| Token | Material 3 elevation | iOS approach |
|---|---|---|
| `e0` (page) | 0 dp | flat |
| `e1` (card rest) | 1 dp (subtle surface-tint) | subtle hairline border, no shadow |
| `e2` (hover/press) | 3 dp | 1 dp inset hairline |
| `e3` (modal) | 6 dp | corner-cropped sheet, vibrancy backdrop |
| `e4` (toast/snackbar) | 8 dp | floating with shadow + slight scale on entrance |
| `e5` (FAB / popover) | 12 dp | shadow + minor scale |

Dark mode replaces shadow with inset hairline + lightness step (identical to web pattern §12).

### 7.6 Motion

| Token | Duration | Curve | Use |
|---|---|---|---|
| `mFast` | 120 ms | `Curves.easeOutCubic` | hover-equivalent (focus, hover-like state) |
| `mBase` | 220 ms | `Curves.easeOutCubic` | tab switches, sheet present, card expand |
| `mSlow` | 320 ms | `Curves.easeOutCubic` | page transitions, route changes |
| `mPlatformPage` | 350 ms iOS / 250 ms Android | platform curve | route transitions use the OS native curve |
| `mSpring` | spring (mass 1, stiffness 240, damping 22) | spring | celebration moments — milestone confetti, level-up |
| `mPageScale` | 280 ms | `Curves.easeOutQuint` | hero image / shared-element transitions |

Motion is **disabled** when `MediaQuery.disableAnimations == true` (iOS Reduce Motion / Android Animations Off). All celebration motion gates on `MediaQuery.platformBrightness` and `MediaQuery.accessibleNavigation`.

### 7.7 Density scalars

```dart
class AuroraDensity extends ThemeExtension<AuroraDensity> {
  final double spaceScale;
  final double typeScale;
  final double radiusScale;
  final double motionScale;
  final double touchTarget; // 44 / 48 dp floor
}

// Junior:    spaceScale 1.20, typeScale 1.10, radiusScale 1.10, motionScale 1.20, touchTarget 48
// Aspirant:  spaceScale 1.00, typeScale 1.00, radiusScale 1.00, motionScale 1.00, touchTarget 44/48
// Pro:       spaceScale 0.85, typeScale 0.90, radiusScale 0.85, motionScale 0.70, touchTarget 44
```

---

## 8. Component primitives library (Flutter widgets)

New package **`packages/ui-flutter`** (peer to web's `packages/ui`). Built on Flutter's adaptive widgets; consumes `packages/design-tokens-flutter` for all values. Tree-shakable. Golden-tested per platform via `flutter test --update-goldens`.

### 8.1 Atoms (18 widgets)

| Widget | Adapts? | Notes |
|---|---|---|
| **AuroraButton** | iOS: `CupertinoButton.filled` / `CupertinoButton`; Android: Material `FilledButton` / `OutlinedButton` / `TextButton`. Unified `variant` API: primary / secondary / tertiary / ghost / aurora / danger | Replaces every existing `ElevatedButton`. Loading state preserves width with spinner. |
| **AuroraIconButton** | Material `IconButton` with platform-tuned splash | Mandatory `semanticLabel` parameter |
| **AuroraTextField** | iOS: `CupertinoTextField`; Android: Material `TextField`. Unified `state` (default/error/success), `prefix`, `suffix` slots | Auto `TextInputType`, `TextInputAction.next/done`, focus chain awareness |
| **AuroraCheckbox** | iOS: `CupertinoCheckbox`; Android: `Checkbox` (Material 3) | Brand-600 fill on both |
| **AuroraRadio** | `RadioListTile` / `CupertinoListTile` derivative | Used in Settings density picker, onboarding |
| **AuroraSwitch** | `CupertinoSwitch` / `Switch` — both tinted brand-600 | |
| **AuroraSlider** | `CupertinoSlider` / `Slider` | Confidence slider after answer |
| **AuroraTag** | Pill with 7 tones × 3 variants (solid/soft/outline) | Same tone/variant API as web |
| **AuroraBadge** | Number badge or status dot | Used on tab bar items, notifications |
| **AuroraChip** | Selectable filter chip — `FilterChip` on Android, custom on iOS | Catalog filters |
| **AuroraAvatar** | `CircleAvatar` derivative — image OR initials fallback + status dot | 6 sizes (xs/sm/md/lg/xl/2xl) |
| **AuroraDivider** | `Divider` with token color + density-scaled spacing | |
| **AuroraSkeleton** | Shimmer rectangle/circle/text — gates on `disableAnimations` | Replaces blank loading + spinners |
| **AuroraSpinner** | Platform-native: `CupertinoActivityIndicator` / `CircularProgressIndicator` | |
| **AuroraProgressRing** | Custom-painted SVG-equivalent via `CustomPainter` — segmented or continuous | Mastery ring everywhere |
| **AuroraTooltip** | `Tooltip` (Material) with token-styled background | Long-press to show on mobile |
| **AuroraIcon** | `Icon` thin wrapper that auto-selects Cupertino / Material icon when both available | E.g. `AuroraIcon.search` → `CupertinoIcons.search` on iOS, `Icons.search` on Android |
| **AuroraKbd** | Keyboard-shortcut hint badge — rendered only when an external keyboard / Magic Keyboard is attached (iPad/Android tablet/foldable) | |

### 8.2 Molecules (14 widgets)

| Widget | Composes | Purpose |
|---|---|---|
| **AuroraFormField** | `Form` + `AuroraTextField` + label + helper + error | Auto-wires keyboard nav, autofill hints, validation summary |
| **AuroraCard** | `Material(elevation: tokenE1)` or `Container` (iOS) + tokenised radius/padding/tone | Aurora-tone background variants for AI/celebration/progress |
| **AuroraListTile** | Adapts iOS grouped-inset vs Material list pattern | Used in Settings, History, Friends |
| **AuroraTabs** | `TabBar`-equivalent with 3 variants (underlined / pill / segmented) — segmented is iOS-canonical | Topic detail (Learn/Practice/Mastery) |
| **AuroraAccordion** | `ExpansionTile` themed | Syllabus, FAQ |
| **AuroraSheet** | `showModalBottomSheet` (Material) / `showCupertinoModalPopup` (iOS) — unified API | Replaces ad-hoc modals; supports drag handle, max-height clamp |
| **AuroraSnackbar** | `SnackBar` on Material; `CupertinoToast`-equivalent custom on iOS | Streak save, AI moments toasts |
| **AuroraAlertDialog** | `AlertDialog` / `CupertinoAlertDialog` | Destructive confirms (unfriend, delete) |
| **AuroraActionSheet** | `showCupertinoActionSheet` / Material bottom sheet w/ action list | Long-press context menus |
| **AuroraBanner** | Top-of-screen info banner with dismiss | Trial CTA, system status, offline indicator |
| **AuroraEmptyState** | Illustration slot + title + description + actions | Friends empty, Clans empty, etc. |
| **AuroraStepper** | Horizontal stepper for onboarding | 5-step onboarding wizard |
| **AuroraRefreshable** | Wraps `RefreshIndicator` / `CupertinoSliverRefreshControl` | Used on every list / dashboard |
| **AuroraScrollView** | `CustomScrollView` derivative with proper `SafeArea`, scroll-to-top on tab re-tap (iOS HIG), large-title collapse | |

### 8.3 Layout organisms (5 widgets)

| Widget | Purpose |
|---|---|
| **AuroraScaffold** | The mobile equivalent of web's AppShell. Includes app bar slot, body, bottom nav slot, FAB slot. Adapts iOS large-title vs Material toolbar. Auto-handles status bar tint, keyboard avoidance, safe areas, notch + dynamic island, gesture-nav bar. |
| **AuroraAppBar** | Adaptive app bar — large-title on iOS, M3 toolbar on Android. Slots: leading / title / actions. Honors scroll-collapse. |
| **AuroraBottomNav** | 5-slot bottom nav. iOS = `CupertinoTabBar` look; Android = M3 `NavigationBar`. Center slot may be raised FAB-style (Quick practice). Re-tap returns to root of stack (iOS HIG). |
| **AuroraDrawer** | Side drawer for secondary navigation (Profile menu, debug). Mostly retired on mobile in favor of bottom nav + sheets, but retained for the marketplace switcher. |
| **AuroraStatusOverlay** | Connectivity banner, system-status banner, debug-build banner — overlays at the top of every screen when needed. |

### 8.4 Domain organisms (15 widgets)

Same set as web Aurora `packages/ui` but Flutter-native:

| Widget | Powers (mobile screens) |
|---|---|
| **MissionCard** | Home — Today's Mission with `AuroraProgressRing` + Aurora-celebration variant on completion |
| **DailyPlanCard** | Home — today's plan rows |
| **SubjectMasteryGrid** | Exam Detail — heatmap-card grid grouped by subject |
| **TopicCard** | Catalog Topic, Topic recommendations |
| **PrerequisiteMap** | Topic Detail — interactive node graph via `graphview` or custom `CustomPainter` |
| **ReadinessTrajectoryChart** | Analysis — line chart via `fl_chart` |
| **RankCard** | Profile, Analysis — radial gauge + delta |
| **AIInsightCard** | Home, Topic, Analysis — Aurora-gradient surface |
| **PracticeRunnerShell** | Quiz screen — full-screen, hides bottom nav, custom app bar with timer + flag |
| **AITutorPane** | `/doubts/:id`, `/experts` — chat with citations + photo upload |
| **LeaderboardRow** | Leaderboards — virtualised list row |
| **PodiumCard** | Leaderboards top 3 |
| **BattleLobbyCard** | Battle — countdown + ready check + share |
| **StreakChip** | App bar — flame + count + popover on tap |
| **PhotoDoubt** | Snap-a-doubt camera shell |

### 8.5 Composition rules

1. **Atoms know no domain.** AuroraButton doesn't know what mastery is. MasteryCell does.
2. **Adaptation lives in atoms only.** Organisms compose atoms and don't branch on platform.
3. **Tokens via `Theme.of(context)`.** Never hard-coded; never reach into `AlpColors.*` constants in widget code.
4. **No `setState` for theme.** Theme changes flow through `ThemeData` rebuild from a top-level `Provider` so the whole tree picks them up in one frame.
5. **Golden tests per platform.** `flutter test` runs both iOS and Android golden snapshots for every primitive variant; CI fails on visual regression.

---

## 9. Mobile-specific patterns

These are the patterns mobile must do well and web doesn't have to think about:

### 9.1 Bottom-sheet vs centered modal

**Rule of thumb:**

- **Bottom sheet** for content actions (filter Catalog, share a result, pick a difficulty, edit a note). Drags down to dismiss. Multi-step bottom sheets push internally rather than open a new modal.
- **Centered dialog** for destructive confirmations only (unfriend, delete a clan, end an exam mid-way). Two-button alert. Cancel left, destructive right (iOS) or filled-tonal vs filled (Android).
- **Action sheet (iOS) / bottom sheet (Android)** for context actions on a list item (Report, Block, Mute notifications). Long-press to invoke.

### 9.2 Keyboard handling

- Every screen wraps with `Scaffold(resizeToAvoidBottomInset: true)` (Material) or `CupertinoPageScaffold` with `MediaQuery.viewInsets` respect.
- Inputs request the right `TextInputType` (`emailAddress`, `phone`, `number`, `url`, `multiline`).
- `TextInputAction.next` chains fields; `.done` submits the form.
- **Autofill** — `AutofillHints.email`, `password`, `oneTimeCode` (for OTP). iOS Password AutoFill + Android Smart Lock both supported out of the box.
- "Cancel" / "Done" toolbar above the iOS keyboard for numeric / picker fields.
- Scroll-to-focused-input is guaranteed via `KeyboardListener` + `Scrollable.ensureVisible`.

### 9.3 Lists and scroll

- **`ListView.builder` always** — never spread items into a fixed `Column` for known-paginated lists.
- Long lists virtualise via `SliverList` + `Sliver*` headers for sticky section labels (Subjects on Exam Detail, dates on History).
- Pull-to-refresh on every list screen.
- Infinite scroll uses `ScrollController.position.outOfRange` to fetch next page; loading row at bottom = `AuroraSkeleton`.
- Empty state replaces the list, not stacks below it.

### 9.4 Safe areas and edge-to-edge

- Edge-to-edge by default (`SystemUiMode.edgeToEdge`) — content draws under translucent system bars.
- Every top-level screen wraps with `SafeArea`. Custom paint regions (camera, video, full-screen chart) deliberately ignore safe area.
- `MediaQuery.padding` is the canonical source of system inset values; never hardcode `top: 44`.
- Dynamic island and notch overlap tested in every PR (iPhone 14 Pro / Pixel 7 Pro reference devices).

### 9.5 Pull-to-refresh

- iOS: `CupertinoSliverRefreshControl` with native rubber-band feel.
- Android: `RefreshIndicator` with brand-600 spinner color.
- Refresh triggers a **silent re-fetch**: previously cached data stays visible during the fetch; new data swaps in only on completion. No spinner over content.

### 9.6 Snackbars / toasts

- Action chip pattern: `[message] [Action]` with auto-dismiss at 4s default, 6s if there's an action button.
- Streak save → bottom-anchored snackbar with `--aurora-celebration` tint (Junior only adds confetti).
- Network error → bottom-anchored danger-toned snackbar with "Retry" action.
- Mid-question success / wrong → in-quiz inline reveal, not snackbar (would block answer flow).

### 9.7 Sheets with internal navigation

- Multi-step settings (e.g. "Change study language" → picker → confirm) push **inside the sheet** rather than dismiss-and-reopen.
- The sheet retains its drag handle and dismiss gesture at every step.
- Back gesture inside the sheet pops the sheet's internal stack; on the root step, it dismisses the sheet entirely.

---

## 10. Navigation architecture

### 10.1 Top-level — 5 tabs

Bottom nav with 5 slots, identical labels and order to web's MobileTabBar:

| Tab | Icon (Cupertino / Material) | Stack contents |
|---|---|---|
| **Home** | `house.fill` / `home_filled` | Today's plan, Mission, AI insight, weak topics, this week |
| **Study** | `book.fill` / `auto_stories` | Catalog → Exam → Topic → Quiz |
| **Practice** (raised FAB-style) | `bolt.fill` / `flash_on` (gradient bg) | Practice modes → AI suggestions → Mistakes |
| **Battle** | `bolt.shield.fill` / `sports_kabaddi` | Battle lobby → match → result |
| **Me** | `person.fill` / `person` | Profile, Settings, Inbox, Bookmarks, History |

Each tab owns its own navigation stack. Switching tabs preserves the stack; re-tapping the active tab scrolls to top (iOS HIG); long-press shows quick actions (Junior: "Quick practice", "Resume last session" — Pro: also "Switch density").

### 10.2 Modal navigation

Modal screens (Login, Onboarding, Quiz focus mode, Photo Doubt camera) present **over** the tab structure with `Navigator.of(context, rootNavigator: true).push(...)`. They hide the bottom nav and use `fullscreenDialog: true` for iOS-styled "Cancel" top-left.

### 10.3 Deep linking

`go_router` (or `auto_route`) maps URL-style paths to screens:

- `/home`, `/catalog`, `/catalog/exam/:examId`, `/catalog/topic/:topicId`
- `/quiz/:sessionId`, `/quiz/:sessionId/result`
- `/analysis`, `/concept-profile`
- `/friends`, `/clans`, `/clans/:clanId`, `/leaderboards`, `/battle`
- `/profile`, `/settings`, `/inbox`
- `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify`
- `/t/:slug` (shared test link — opens directly into Quiz)
- `/join/:token` (cohort invite)
- `/auth/callback` (OAuth return)

Every URL handles both **cold-start** (app launched from notification / link) and **warm-start** (user already in app). Cold-start routes pop straight to the destination after auth check; warm-start preserves the existing stack and pushes the destination.

### 10.4 Back-stack and gesture

- iOS: left-edge swipe pops the current route. Pages opt into this via `CupertinoPageRoute`.
- Android: system back gesture / button pops.
- Custom back handling (e.g. cancel quiz, dismiss unsaved edits) uses `WillPopScope` (or `PopScope` in 3.16+) to intercept with a confirm dialog.
- A modal in focus mode (Quiz) traps the back button — only the explicit "End quiz" button or pause+exit dismisses.

---

## 11. Gestures, haptics, sound

### 11.1 Gesture vocabulary

| Gesture | Action |
|---|---|
| Tap | Primary action |
| Long-press | Reveal context menu (action sheet on iOS, popup menu on Android) |
| Pan / drag | Drag to dismiss sheets; drag handles on list items (history reorder, planner) |
| Swipe left on list item | Reveal trailing actions (Archive, Delete) — iOS-canonical pattern adopted on both platforms |
| Swipe right on list item | Reveal leading actions (Mark complete, Bookmark) |
| Pinch | Zoom on math equations, image-doubts, video playback |
| Two-finger pan | Scroll list while highlighting selection (rare; advanced view) |
| Edge swipe (left) | Pop route on iOS |
| Pull down | Refresh |
| Pull up at bottom | Load more |
| Shake | Trigger Aurora's "Undo" snackbar (Aspirant + Pro only; off by default in Junior) |

### 11.2 Haptics

Wrap Flutter's `HapticFeedback` so haptics fire on both platforms with platform-correct intensity:

```dart
AuroraHaptics.tap();        // light impact — UI hover-equivalent
AuroraHaptics.select();     // medium impact — discrete choice
AuroraHaptics.success();    // notification.success
AuroraHaptics.warning();    // notification.warning
AuroraHaptics.error();      // notification.error
AuroraHaptics.celebration(); // heavier — streak milestone, level-up
```

**When haptics fire:**

| Moment | Pattern | Default |
|---|---|---|
| Tap a primary button | `tap()` | on |
| Select an answer (before submit) | `tap()` | on |
| Correct answer | `success()` | on |
| Wrong answer | `warning()` | on |
| Streak saved end-of-day | `success()` | on |
| Streak milestone (7/30/100/365) | `celebration()` | on |
| Level-up | `celebration()` | on |
| Pull-to-refresh trigger | `tap()` | on |
| Swipe to delete confirmed | `warning()` | on |
| Long-press to open menu | `select()` | on |
| Error toast appears | `error()` | on |
| Drag handle reaches snap point | `tap()` | on |

User can disable all haptics in Settings → Accessibility → Haptic feedback (defaults respect OS-level setting).

### 11.3 Sound

Sound effects are **opt-in across all personas** (default off) per child-safety guidance. When enabled:

| Moment | File | Volume |
|---|---|---|
| Correct answer | `chime-success.m4a` | 50% |
| Wrong answer | `tick-soft.m4a` | 40% |
| Streak milestone | `fanfare-short.m4a` | 60% |
| Level-up | `fanfare-tier.m4a` | 60% |
| Mission complete | `swoosh-celebrate.m4a` | 55% |

All assets under 8 KB. Played via `audioplayers` with `AudioPool` for low-latency repeated playback. Honors system silent mode (no override).

---

## 12. Engagement architecture — mobile

Mobile has more retention levers than web. Aurora-mobile codifies five:

### 12.1 Streaks (universal)

Same logic as web; visualised in the app bar with `StreakChip`. Tap → `StreakHistoryBottomSheet` with 30-day heatmap + milestone badges. Milestones at 7 / 30 / 100 / 365 days trigger:

- **Junior:** full-screen modal with `canvas-confetti`-equivalent particle animation, Aura mascot illustration, sound (if enabled), `celebration()` haptic, shareable image.
- **Aspirant:** snackbar with `--aurora-celebration` tint, `celebration()` haptic, optional share.
- **Pro:** subtle snackbar, no haptic, no share unless tapped.

**Grace day:** one missed day per 30-day window doesn't reset (Junior + Aspirant). Communicated explicitly in the broken-streak notification.

### 12.2 Push notifications

Schema and copy guidelines for every notification type. **Six core types** map to backend events:

| Backend event | Notification | Copy template | Action |
|---|---|---|---|
| `streak.about_to_break` (after 8 PM local if no activity today) | "🔥 7-day streak about to slip" | "Save it with 5 minutes of practice." | Deep link to `/practice/quick` |
| `streak.broken` | "Your 12-day streak reset" | "Welcome back. Pick up where you left off." | `/home` |
| `mission.ready` (each morning) | "Today's mission is live" | "Quick mock segment · 20 min" | `/home` |
| `quiz.result_ready` (post-session) | "AI graded your last drill" | "85% accuracy on Cell Biology — see what changed." | `/quiz/:id/result` |
| `mastery.milestone` | "🎉 You just mastered {topic}" | "+8% readiness for {exam}." | `/catalog/topic/:id` |
| `doubt.answered` | "Your AI tutor replied" | "{first line of answer truncated to 60 chars}…" | `/doubts/:id` |
| `battle.invite` (clan / friend) | "{name} wants to battle" | "First to 5 questions. 30s each." | `/battle?invite={id}` |
| `assignment.new` | "New assignment from {teacher}" | "{title} · due {date}" | `/assignments/:id` |

**Rich notifications:**

- iOS: notification service extension renders mastery delta + topic icon (subject color) + sparkline.
- Android: `NotificationCompat.BigTextStyle` or `BigPictureStyle` for the celebration types.

**Action buttons:**

- Streak: [ "Practice 5 min" ] [ "Snooze" ]
- Battle invite: [ "Accept" ] [ "Decline" ]
- Doubt answered: [ "View" ] [ "Reply" ]

**Quiet hours:** Notifications suppressed 10 PM – 7 AM local by default (configurable per type in Settings → Notifications). Education-priority channel exempts mission morning ping.

**Permission grant flow:** Soft ask after first quiz completion ("Want a 5-minute mission tomorrow?") before triggering the OS permission dialog. iOS 17.4+ Provisional Authorization for quiet trial.

### 12.3 App-icon badges

Badge count shows **unread inbox messages + un-actioned mission**. Capped at 99+. Tapping the icon deep-links to `/inbox` if any inbox unread, else `/home` mission card.

### 12.4 Home-screen widget extension (Phase 2)

**iOS widget (WidgetKit) + Android widget (App Widgets).** Three sizes:

- **Small (2×2):** Today's streak (🔥 47) + "Tap to save".
- **Medium (4×2):** Streak + today's mission title + progress ring + "Start mission" tap area.
- **Large (4×4):** All of medium + this week's bars + AI insight first sentence.

Widget refreshes every 30 minutes (system-throttled). Tapping any region deep-links into the corresponding app screen with cold-start handling.

### 12.5 Lock-screen widgets (iOS 16+)

Single-line: "🔥 47 — Save before midnight" or "📝 Mission ready — 20 min".

### 12.6 Live Activities (iOS 16.1+) / Foreground Service (Android)

For long-running activities — Battle in progress, Mock Exam in progress — show a Live Activity / persistent foreground notification with elapsed time + question count + opponent / score. Tap to return to the activity.

---

## 13. Screen redesigns — the 10 anchor mobile flows

Ten anchor screens covered in full. The other ~40 inherit the new chrome and primitives.

### 13.1 Splash + cold-start

- **Splash screen** (1.5s max): app icon centered on the `--aurora-ai` gradient with the wordmark fading in 200 ms after icon. iOS: `LaunchScreen.storyboard` matches. Android: `splash_screen` API on Android 12+.
- **Cold-start routing:** check auth → if logged in & onboarded → `/home`; if logged in & not onboarded → `/onboarding/exam`; else → `/login`.
- **Cold-start from notification / deep link:** stash the destination, run auth check, then `pushReplacement` to the destination.

### 13.2 Auth — Login / Register / Forgot / Reset

Single-screen, scrollable forms. Hero section at top with brand mark + welcome copy on a soft Aurora-AI tint band (not full gradient — too loud on mobile). Form below. CTA pinned to bottom in keyboard-visible state via `AnimatedPadding`. Biometric quick-login on second launch (Face ID / Touch ID / fingerprint) — opt-in.

**Mobile-specific additions:**

- "Continue with Google" + "Continue with Apple" (iOS only) as `AuroraButton(variant: secondary, iconLeft: ...)` above the email field.
- OTP for verify is a 6-digit one-time-code input with automatic SMS-fill on Android, paste-from-clipboard on iOS, and per-digit progression.
- Forgot-password success state: prominent inbox-illustration + "Open mail app" CTA that uses `url_launcher` with `mailto:` to bring up the default mail client.

### 13.3 Onboarding (5 steps)

`AuroraStepper` at top, `PageView` body, fixed bottom action bar with "Back" (ghost) + "Next" (primary). Each step is one decision:

1. **Pick your exam** — searchable grid of exam cards (gradient by stream).
2. **Pick your study language** — 3-radio (EN / HI / Hinglish).
3. **Pick your exam date** — `CupertinoDatePicker` (iOS) / `showDatePicker` (Android).
4. **Quick diagnostic** — 10 questions in PracticeRunnerShell (compact). Skippable but flagged.
5. **Set your daily goal** — slider 5/15/30/60/90 min.

After step 5: full-screen celebration with `--aurora-celebration` background, "Your plan is ready" + "Take me to today's mission". Confetti for Junior; subtle for Aspirant; suppressed for Pro.

### 13.4 Home (master dashboard)

```
┌──────────────────────────────────────────┐
│  AdaptiveLearn   🔥 47   🔔3   👤        │  ← AuroraAppBar
├──────────────────────────────────────────┤
│  Hi, Deepak 👋                            │
│  153 days to NEET                         │
│                                            │
│  ┌──────────────────────────────────────┐ │
│  │ TODAY'S MISSION  ~aurora-progress~    │ │
│  │  20 min · Quick mock segment          │ │
│  │  ●●●○○○○○                              │ │
│  │  [ Start mission → ]   Not today ▾    │ │
│  └──────────────────────────────────────┘ │
│                                            │
│  ←── status strip (horizontal scroll) ──→ │
│  ┌──────┐┌──────┐┌──────┐┌──────┐         │
│  │🔥 47 ││ 10%  ││ 153d ││ 3 wk │         │
│  └──────┘└──────┘└──────┘└──────┘         │
│                                            │
│  ┌──────────────────────────────────────┐ │
│  │ AI INSIGHT ✦                          │ │
│  │ Cell Biology is your weakest topic.   │ │
│  │ [ Start a 10-min drill ✦ ]            │ │
│  └──────────────────────────────────────┘ │
│                                            │
│  Today's plan                              │
│  • Mock — full pattern · 30m [Start ▶]    │
│  • Take a short break · 10m ▢             │
│  • Reflection · 5m [Start ▶]              │
│                                            │
│  Resume                                    │
│  ┌──────────────────────────────────────┐ │
│  │ Cell Biology · 5 left · 50% accuracy  │ │
│  │ [ Continue → ]                        │ │
│  └──────────────────────────────────────┘ │
├──────────────────────────────────────────┤
│  🏠   📚   ⚡   ⚔   👤                     │  ← AuroraBottomNav (Practice raised)
└──────────────────────────────────────────┘
```

**Mobile-specific:**

- Status strip horizontally scrolls (web stacks the 4 stat cards vertically below the mission on small).
- Pull-to-refresh refetches all 7 data sources.
- Sticky "Continue" floating action button when in-progress sessions exist and the user scrolls past the mission.
- Tab re-tap (`Home`) scrolls to top.

### 13.5 Catalog

Same content as web but in a vertical scroll: "Continue your exam" hero → enrolled row (horizontal scroll) → stream sections collapsed by default (`AuroraAccordion`). Tap an exam → push `/catalog/exam/:id`.

### 13.6 Exam Detail (SubjectMasteryGrid)

Sticky `AuroraAppBar` with exam name + readiness ring + days-to-exam pill. Body = `SliverList` of subject sections, each with `MasteryCell` widgets in a 2-column grid (1-column on small phones). Pull-to-refresh refetches.

### 13.7 Topic Detail

Two top-level sections:

1. **Hero** — `AuroraCard` with `AuroraProgressRing` (mastery), title, status `AuroraTag`s, primary `AuroraButton(variant: aurora) "Start AI practice"`, secondary "Practice this topic" (opens difficulty picker as `AuroraSheet`).
2. **Tabs** — `AuroraTabs` "Learn / Practice / Mastery" with respective content lanes. PrerequisiteMap inside Mastery tab via `graphview` or custom `CustomPainter`.

Inline AI tutor strip at bottom — tap to expand into `AuroraSheet` chat (Khanmigo-style).

### 13.8 Practice Runner (Quiz)

**Full-screen focus mode** (hides app bar + bottom nav). Top of screen: minimal session bar (back ✕ left, topic + timer center, flag right). Question stem centered; options below; submit pinned at bottom (keyboard-aware).

After submit: inline reveal with `--aurora-ai-soft` background + correct answer + "Why? ✦" CTA (opens AI tutor in sheet). Confidence slider appears between submit and next.

**Question palette** lives in a bottom `AuroraSheet` invoked by a small handle at bottom-right corner ("8/20"). Sheet shows colored cells per question + jump-on-tap.

**End-of-session:** full-screen celebration card → `pushReplacement` to result screen.

**Mobile-specific:**

- Haptics: `tap()` on option select, `success()` on correct, `warning()` on wrong, `celebration()` on session-best accuracy or new mastery threshold.
- Keep-screen-awake (`Wakelock.enable()`) for the duration of the session.
- App-suspend handling: if the user backgrounds the app mid-session, on return show a "Resume?" dialog (preserves IRT state).

### 13.9 Analysis

Sticky header `AuroraAppBar` with exam-scope chips. Body = `SliverList` of sections per the web Analysis spec:

- Where you stand (composite card)
- What changed this week (subject delta cards in horizontal scroll)
- What to do next (action list)
- Subject mastery radar (`fl_chart`)
- AI insights (AuroraInsightCard with bullet list)

### 13.10 Settings

Standard iOS grouped-inset list / Material list. New sections:

- **Theme & Density** — radio cards (Light / Dark / System) and (Junior / Aspirant / Pro).
- **Study language** — picker.
- **Daily goal** — slider in a sheet.
- **Notifications** — per-type toggles + quiet hours picker.
- **Accessibility** — Reduce motion / Haptics / Sound effects / Larger text.
- **Account** — email change / password change / sign out / delete account.

---

## 14. Accessibility on mobile (iOS + Android)

### 14.1 WCAG 2.1 AA + platform-specific

- **Contrast:** every color combo verified at AA in both modes. Golden tests assert.
- **Touch targets:** 44 / 48 dp floors per platform.
- **Screen readers:** every `Semantics` widget has accessible name + role + state. Custom-painted ProgressRing exposes `value`, `min`, `max`.
- **Dynamic type:** all text scales up to platform max (1.5×–1.7×); layouts tested at max.
- **Reduce Motion:** `MediaQuery.disableAnimations` honored — all transitions reduced to 1ms; confetti / spring physics off; shimmer freezes.
- **VoiceOver / TalkBack:** focus order audited screen-by-screen.
- **Keyboard navigation:** external keyboard support (iPad Magic Keyboard, Bluetooth) — Tab / Shift+Tab / Enter / Esc work everywhere.
- **Switch Control / Voice Control:** custom action labels for non-obvious targets ("Submit answer", not "Button").
- **Color is never sole signal:** mastery bucket always paired with text label.

### 14.2 RTL readiness

Hindi is LTR (Devanagari script left-to-right), so RTL isn't an immediate concern. But the widget tree must use logical directional properties (`EdgeInsetsDirectional`, `Alignment.start/end`, `MainAxisAlignment.start/end`) so a future Urdu / Arabic launch doesn't require a rewrite. Lint rule enforces.

---

## 15. Internationalization

Aurora-mobile is i18n-ready from day one. Locale switching uses Flutter's `Intl` + `flutter_localizations`. Wave plan matches backend:

- **EN (en-IN)** — ships v1.
- **HI (hi-IN)** — Phase 5 Localisation wave 1. Devanagari rendered via Noto Sans Devanagari.
- **TA / TE / BN / MR** — Phase 5 wave 2.

**Number formatting:** `NumberFormat.decimalPattern('en-IN')` for "2,10,000" (Indian numbering system); "2,100,000" for en-US.

**Date formatting:** `DateFormat.yMMMd(locale)`.

**Math content:** `flutter_math_fork` renders KaTeX — unaffected by locale.

**Strings under translation:** every user-facing string flows through `S.of(context).keyName` (generated from `lib/l10n/intl_*.arb`).

---

## 16. Responsive — phones, tablets, foldables

### 16.1 Device tiers

| Tier | Width | Layout philosophy |
|---|---|---|
| **Compact** | 320–600 dp | Single column. Sheets and dialogs full-width. Bottom nav 5 slots. |
| **Medium** | 601–839 dp (large phones, small foldables unfolded) | Single column with comfortable padding. Bottom nav remains. |
| **Expanded** | 840–1199 dp (tablets, foldables, half-screen on desktop) | Two-column layout where it makes sense (Catalog list + detail, Topic detail + AI tutor sidecar). Top nav rail option. |
| **Large** | 1200+ dp (large tablets, ChromeOS) | Three-column layout option (rail + list + detail). |

`LayoutBuilder` + `MediaQuery.sizeOf(context)` drive the breakpoint. Don't poll `Platform`.

### 16.2 Foldables (Surface Duo, Galaxy Z Fold)

`DisplayFeature` API exposes the hinge / fold position. Critical screens (Practice Runner, AI Tutor) avoid placing primary content under the hinge by reading `MediaQuery.of(context).displayFeatures`.

### 16.3 Split-screen / Multi-window (Android) / Stage Manager (iPadOS)

When the window width drops below 600 dp (Android split-screen), the app gracefully falls back to compact layout. No fixed-pixel layouts.

### 16.4 Picture-in-Picture (video doubts)

When a video plays full-screen and the user backgrounds the app, PiP kicks in (Android) / `AVPictureInPictureController` (iOS). Floating window with play/pause + close.

---

## 17. Dark mode — OS-driven

Default `ThemeMode.system`. User override in Settings → Theme: Light / Dark / System. Persists to `flutter_secure_storage`.

**Key rule:** never invert. Dark values are designed pair-wise per the web Aurora §12. The Dart `AuroraColors.dark` constructor returns the dark-mode neutral ramp + lifted brand/semantic — identical to web `[data-theme="dark"]`.

**System bar tint:** every screen's status bar / nav bar color is set explicitly via `SystemUiOverlayStyle` from the active theme — never left to the OS default. Quiz focus mode uses dark status bar even in light theme.

**Reload on system theme change:** App listens to `WidgetsBindingObserver.didChangePlatformBrightness` and rebuilds the theme without restart.

---

## 18. Offline-first patterns

### 18.1 Data layer

- **Read path:** repository always returns cached data first (from `drift` SQLite or `hive`), then refreshes from network in background. UI shows a subtle "Updating…" indicator only if cache is older than the screen's freshness budget.
- **Write path:** mutations queue in a local outbox (`drift` table). When connectivity restores, the outbox flushes in FIFO order. Conflicting writes (rare for our use cases) prefer server wins.
- **Connectivity detection:** `connectivity_plus` package emits stream → top-of-app banner appears within 1s of disconnection.

### 18.2 What works offline

| Capability | Offline support |
|---|---|
| Browse Catalog | ✅ — cached exam list |
| Open Topic Detail | ✅ — cached topic data |
| **Start a practice session** | ⚠️ requires network for first 5 questions (IRT engine call); after that, falls back to **pre-cached fallback bank** of 10 mixed-difficulty items per topic for offline practice. Submitted answers queue and replay on reconnect. |
| Take a Mock Exam | ✅ — mock test downloads on start; results queue for upload |
| View Analysis | ✅ — cached metrics (with "last updated" timestamp) |
| Friends / Clans / Leaderboards | ❌ — these need real-time data; show offline empty state |
| AI Tutor | ❌ — server-required; offline shows "Connect to chat with AI" |
| Photo Doubt | ✅ partially — capture works offline; queues for upload when connected |
| Onboarding | ❌ — auth + diagnostic require network |
| Settings (read) | ✅ |
| Settings (write) | ✅ — queues |

### 18.3 Offline UI states

- **Page-level offline banner** ("You're offline — showing cached data") at the top, dismissible per session.
- **Action-level offline state** — buttons that require network show "Connect to {verb}" subtitle in disabled state.
- **Queue indicator** in Settings → Account → "5 actions waiting to sync" with manual "Retry now" button.

---

## 19. Push notifications, deep links, app states

(Covered above in §12.2 for push payloads. This section covers the app-states behaviour.)

### 19.1 App states

- **Foreground:** active session. All notifications suppress system display by default; instead surface as in-app snackbar (`AuroraSnackbar`).
- **Background:** push notifications display in system tray. Deep-link tap restores app to the tapped screen.
- **Terminated (cold start):** push notification deep-link launches the app, performs auth check, navigates to the target after splash.
- **Locked screen:** rich notifications render on lock; sensitive content (doubt answers) blurs until unlock per system policy.

### 19.2 Lifecycle hooks

| Hook | Behaviour |
|---|---|
| `didEnterBackground` | Pause Wakelock; debounce-flush outbox; mark "last active" timestamp |
| `didEnterForeground` | Resume Wakelock if in Quiz; refresh streak + readiness; check connectivity; trigger "welcome back" snackbar if > 8h gap |
| `didChangeAppLifecycleState(detached)` | Persist in-flight quiz state to local storage |
| `didChangeLocales` | Reload localisations + restart heavy widget trees |
| `didChangePlatformBrightness` | Rebuild theme tree |

### 19.3 Resume mid-quiz

If the app is backgrounded mid-quiz, on resume:

- < 30s gap: silent resume.
- 30s – 5 min gap: brief "Resume from question 8?" snackbar with [Resume] / [Restart].
- > 5 min gap: modal dialog "Looks like you stepped away — pick up where you left off?" with [Resume] / [End session] / [Restart].

---

## 20. Performance budgets

| Metric | Budget | Tool |
|---|---|---|
| **Cold start** (first paint) | < 1.5s on Pixel 6 / iPhone 13 | `flutter run --profile` + `flutter symbolize` |
| **App size** | < 25 MB Android APK / < 60 MB iOS IPA | `flutter build apk --analyze-size` |
| **Initial bundle JS-equivalent** | n/a (Flutter compiles AOT to native) | |
| **Frame budget** | 16ms (60fps); < 8ms on 120fps devices | `flutter run --profile` with overlay; `--trace-skia` |
| **Memory** | < 200 MB resident on Pixel 6 home screen | Android Studio Profiler / Xcode Instruments |
| **First Meaningful Paint to Home** (warm) | < 600ms | DevTools timeline |
| **List scroll** | maintain 60fps with 1000+ items via virtualization | `flutter test --enable-experiment=test-api` perf tests |
| **Push notification delivery → display** | < 2s end-to-end (server → device) | Firebase / APNs analytics |
| **Photo doubt capture → upload start** | < 1.5s | custom telemetry span |

CI runs `flutter test --reporter=json` + `--coverage` and gates on:

- Coverage ≥ 70% on `packages/ui-flutter` widgets
- No goldens drift
- App size delta ≤ 5% per PR
- Lint clean (`flutter analyze` + custom Aurora rules)

---

## 21. Migration plan & sprints

Eight sprints — mirror web's plan, scoped to mobile. Each sprint independently shippable to the staging APK / TestFlight.

| Sprint | Deliverable |
|---|---|
| **M1 — Tokens & theme extensions** | `AuroraColors`, `AuroraSpacing`, `AuroraTypography`, `AuroraRadius`, `AuroraMotion`, `AuroraDensity` as `ThemeExtension`s in `packages/design-tokens-flutter`. ThemeProvider + DensityProvider. System dark-mode honoring. Bootstrap from secure storage. |
| **M2 — Atoms** | 18 atoms in `packages/ui-flutter` (AuroraButton/TextField/Tag/etc.). Golden tests per platform. |
| **M3 — Molecules + layout organisms** | Card, FormField, Tabs, Sheet, Snackbar, AlertDialog, AuroraScaffold, AuroraAppBar, AuroraBottomNav. Adaptive widget selection per platform. |
| **M4 — Home + Catalog redesign** | Home dashboard, Catalog browse, Exam Detail. Adopt all primitives. Connectivity banner + pull-to-refresh wired. |
| **M5 — Topic + Quiz redesign** | TopicDetail with 3-tab layout, PracticeRunnerShell full-screen focus mode, AITutorPane sheet. Wakelock + lifecycle handling. Offline fallback bank. |
| **M6 — Analysis + Profile** | Analysis with `fl_chart` trajectory, RankCard, AIInsightCard. Profile with Achievement grid + StreakHistoryBottomSheet. |
| **M7 — Social + Engagement + Notifications** | Friends, Clans, Leaderboards (virtualised), Battle. Push notifications schema + service extension. App-icon badges. Haptics across the app. |
| **M8 — Auth + Onboarding + Settings + Polish** | Auth split-screen, 5-step Onboarding stepper, Settings (Theme/Density/Notifications/Accessibility), Biometric login, deep-link routing, app-icon badge logic, golden test sweep, performance pass. Ready for App Store / Play Store. |

S1+S2 unblock everything. S5+S7+M8 can parallelize across two Flutter engineers.

---

## 22. Open questions

1. **Mascot for Junior.** Same question as web — Aura the bird, or abstract aurora illustrations only? Mobile is the persona where mascots win hardest (Khanmigo, Duolingo). **Recommend:** commission. Budget Sprint M7.
2. **Confetti consent.** Under-13 accounts — confetti default on, sound default off. Match COPPA-friendly defaults.
3. **Biometric on first launch.** Prompt before or after first login? **Recommend:** after first successful password login, offer "Use Face ID next time?" sheet.
4. **Tablet UX:** ship phone-first in M4–M5; do tablet two-pane layouts in M8. Foldables targeted by golden tests but not flagship.
5. **Live Activities (iOS) / Foreground Service (Android):** scope to Battle + Mock Exam in v1; expand to streak countdown in v2.
6. **Charting library:** `fl_chart` (broadly used, gesture-friendly) vs `syncfusion_flutter_charts` (richer, commercial). **Recommend:** `fl_chart` — free, sufficient for Phase 1 charts.
7. **Deep-link routing library:** `go_router` (Flutter team) vs `auto_route`. **Recommend:** `go_router` — official, web-parity URL syntax matches.
8. **Math rendering:** `flutter_math_fork` (KaTeX-equivalent, MIT) vs server-rendered images. **Recommend:** `flutter_math_fork` — offline, accessible, GPU-rasterized.
9. **Offline DB:** `drift` (typed SQL) vs `hive` (NoSQL KV). **Recommend:** `drift` for the relational data (sessions, mastery, queue), `hive` for ephemeral KV (settings, last-used).
10. **State management:** the existing app uses `Provider`. Aurora-mobile codifies that choice — no migration to Riverpod / Bloc unless a future ADR justifies. Avoid mixing.

---

## Appendix A — Token reference

(Same shape as web Appendix A; values mirror tokens.v2.css. Inline here in the DOCX export; categories listed.)

- **Brand:** `brand50 / 100 / 500 / 600 / 700` × {light, dark}
- **Semantic:** `success / proficient / developing / danger / locked / reward / aurora` × `500/600` × {light, dark}
- **Aurora gradients:** `auroraAi`, `auroraCelebration`, `auroraProgress`
- **Subject:** 10 subjects × {light, dark}
- **Neutrals:** `neutral0` through `neutral900` × {light, dark}
- **Mastery:** `mastery0 / weak / dev / strong / mastered`
- **Typography:** 12 tokens (size, line, weight, tracking)
- **Spacing:** `s1` through `s16` (no `s20` — mobile capped)
- **Radius:** `sm/md/lg/xl/xxl/pill`
- **Elevation:** `e0` through `e5`
- **Motion:** `mFast/mBase/mSlow/mPlatformPage/mSpring/mPageScale`
- **Density scalars:** `spaceScale/typeScale/radiusScale/motionScale/touchTarget`

Total tokens: ≈ 210 (slightly fewer than web's 220 — no breakpoint tokens; mobile uses runtime `MediaQuery` directly).

---

## Appendix B — Widget × screen composition matrix

Mobile equivalent of web Appendix B. Every Flutter screen in `apps/mobile/lib/screens/` mapped to its widget composition. **All 50+ screens accounted for.**

| Screen | Layout | Organisms | Molecules | Atoms |
|---|---|---|---|---|
| `splash_screen` | (custom) | – | – | – |
| `login_screen` | (custom, no Scaffold) | – | AuroraFormField, AuroraCard, AuroraAlertDialog | AuroraButton, AuroraTextField, AuroraCheckbox |
| `register_screen` | (custom) | – | AuroraFormField, AuroraCard | AuroraButton, AuroraTextField, AuroraCheckbox |
| `forgot_password_screen` | (custom) | – | AuroraFormField, AuroraCard | AuroraButton, AuroraTextField |
| `reset_password_screen` | (custom) | – | AuroraFormField, AuroraCard | AuroraButton, AuroraTextField |
| `onboarding/exam_select` | OnboardingShell | – | AuroraAccordion, AuroraCard | AuroraChip, AuroraTextField |
| `onboarding/language` | OnboardingShell | – | AuroraCard | AuroraRadio |
| `onboarding/target_date` | OnboardingShell | – | AuroraSheet | AuroraButton, AuroraDate |
| `onboarding/diagnostic` | (focus mode) | PracticeRunnerShell | AuroraCard, AuroraSheet | AuroraButton, AuroraTag |
| `onboarding/daily_goal` | OnboardingShell | – | AuroraSheet | AuroraSlider, AuroraButton |
| `home_screen / home_tab` | AuroraScaffold | MissionCard, AIInsightCard, DailyPlanCard, StreakChip | AuroraCard, StatCard | AuroraButton, AuroraTag, AuroraAvatar |
| `catalog_screen` | AuroraScaffold | – | AuroraCard, AuroraAccordion | AuroraChip, AuroraTextField |
| `catalog_exam_screen` | AuroraScaffold | SubjectMasteryGrid, RankCard, AIInsightCard | MasteryCell, AuroraCard | AuroraTag, AuroraChip |
| `topic_detail_screen` | AuroraScaffold | PrerequisiteMap, AIInsightCard, AITutorPane (inline) | AuroraCard, AuroraTabs, StatCard, AuroraFormField | AuroraButton, AuroraTag, AuroraAvatar |
| `quiz_screen` | AuroraScaffold(focusMode) | PracticeRunnerShell | AuroraSheet, AuroraSnackbar | AuroraButton, AuroraTag, AuroraSlider |
| `quiz_result_screen` | (focus mode) | (celebration card) | AuroraCard, AuroraTabs | AuroraButton, AuroraTag |
| `analysis_screen` | AuroraScaffold | ReadinessTrajectoryChart, RankCard, AIInsightCard | StatCard, AuroraCard, AuroraTabs, MasteryCell | AuroraTag, AuroraChip |
| `concept_profile_screen` | AuroraScaffold | PrerequisiteMap (mini), AIInsightCard | AuroraCard, StatCard | AuroraTag |
| `diagnostic_deep_dive_screen` | AuroraScaffold | AIInsightCard, PlanList | AuroraCard | AuroraButton |
| `friends_screen` | AuroraScaffold | – | AuroraCard, AuroraEmptyState, AuroraFormField | AuroraAvatar, AuroraButton, AuroraChip |
| `clans_screen` | AuroraScaffold | ClanCard | AuroraCard, AuroraEmptyState, AuroraFormField | AuroraButton, AuroraTag |
| `clan_detail_screen` | AuroraScaffold | LeaderboardRow, BattleLobbyCard, AITutorPane (clan chat) | AuroraCard, AuroraTabs | AuroraAvatar, AuroraButton |
| `leaderboards_screen` | AuroraScaffold | PodiumCard, LeaderboardRow | AuroraCard, AuroraTabs | AuroraAvatar, AuroraTag |
| `battle_screen` | AuroraScaffold(focusMode during match) | BattleLobbyCard, LeaderboardRow (recent) | AuroraCard, AuroraTabs | AuroraButton, AuroraTag, AuroraAvatar |
| `rank_screen` | AuroraScaffold | ReadinessTrajectoryChart (per exam), RankCard | AuroraCard, StatCard | AuroraTag |
| `league_screen` | AuroraScaffold | RankCard, LeaderboardRow | AuroraCard, AuroraTabs | AuroraButton, AuroraTag, AuroraAvatar |
| `practice_screen` | AuroraScaffold | (mode picker grid) | AuroraCard, AuroraBanner | AuroraButton, AuroraTag |
| `mistakes_practice_screen` | AuroraScaffold | – | AuroraCard, AuroraChip filters | AuroraButton |
| `mock_test_screen` | AuroraScaffold(focusMode) | PracticeRunnerShell | AuroraSheet | AuroraButton |
| `mock_result_screen` | AuroraScaffold | (celebration + breakdown) | AuroraCard, AuroraTabs | AuroraButton, AuroraTag |
| `study_screen` | AuroraScaffold | TopicCard grid | AuroraCard, AuroraTabs | AuroraButton, AuroraTag |
| `library_screen` | AuroraScaffold | – | AuroraCard, AuroraChip | AuroraButton |
| `bookmarks_screen` | AuroraScaffold | – | AuroraCard, AuroraChip | AuroraButton |
| `history_screen` | AuroraScaffold | – | AuroraCard, AuroraTabs, AuroraChip | AuroraButton |
| `search_screen` | AuroraScaffold | – | AuroraCard, AuroraTabs, AuroraFormField | AuroraButton |
| `assignments_screen` | AuroraScaffold | – | AuroraCard | AuroraButton, AuroraTag |
| `assignment_detail_screen` | AuroraScaffold | – | AuroraCard, AuroraTabs | AuroraButton, AuroraTag |
| `doubts_screen / doubts_tab` | AuroraScaffold | (modes picker) | AuroraCard, AuroraBanner | AuroraButton |
| `doubt_detail_screen` | AuroraScaffold | AITutorPane | AuroraCard | AuroraButton |
| `tutor_history_screen` | AuroraScaffold | AITutorPane (read-only) | AuroraCard | AuroraButton |
| `experts_screen` | AuroraScaffold | (mode picker) | AuroraCard | AuroraButton |
| `profile_screen` | AuroraScaffold | StreakChip popover sheet, (achievement grid) | AuroraCard, AuroraTabs, AuroraAvatar | AuroraTag, AuroraChip |
| `edit_profile_screen` | AuroraScaffold | – | AuroraFormField, AuroraCard | AuroraButton, AuroraTextField |
| `settings_screen` | AuroraScaffold | (theme + density preview) | AuroraCard, AuroraTabs, AuroraFormField, AuroraSwitch, AuroraRadio | AuroraButton |
| `notification_preferences_screen` | AuroraScaffold | – | AuroraCard, AuroraSwitch | – |
| `change_password_screen` | AuroraScaffold | – | AuroraFormField | AuroraButton, AuroraTextField |
| `inbox_screen` | AuroraScaffold | (split list/detail at expanded) | AuroraCard, AuroraTabs | AuroraButton, AuroraTag |
| `billing_screen` | AuroraScaffold | – | AuroraCard, StatCard, AuroraTabs | AuroraButton |
| `marketplace/*` | AuroraScaffold | – | AuroraCard, AuroraAvatar | AuroraButton, AuroraChip |
| `paywall_webview_screen` | (full-screen WebView) | – | – | – |
| `join_cohort_screen` | (custom landing) | – | AuroraCard, AuroraBanner | AuroraButton |
| `help_support_screen` | AuroraScaffold | – | AuroraAccordion, AuroraCard | AuroraButton |
| `about_screen` | AuroraScaffold | – | AuroraCard | – |
| `flashcards_screen` | AuroraScaffold(swipe deck) | – | AuroraCard | AuroraButton |

**Total screens:** 50+. Coverage: 100%.

---

*End of Design System v2 — "Aurora Mobile". Sibling spec to the web Aurora. Same identity, mobile-native execution. Ready for review.*

---

# Part 2 — Aurora v3 addenda

Aurora v3 evolves the v2 design system in three directions:

1. **A four-persona model** (Kid / Teen / Aspirant / Learner) replaces the v2 Junior/Aspirant/Pro density-only mode. Density survives as a fine-grained preference *within* a persona — see [`packages/design-tokens-flutter/lib/src/persona.dart`](../../packages/design-tokens-flutter/lib/src/persona.dart) and [`persona_theme.dart`](../../packages/design-tokens-flutter/lib/src/persona_theme.dart).
2. **A character: Lumi** — a friendly orb-of-light AI companion whose visual presence and voice flex by persona. This document codifies the **coaching contract** (§20.5 below) — what Lumi says, doesn't say, refuses, and routes to escalation.
3. **An end-to-end content safety pipeline** ([content-safety-policy.md](content-safety-policy.md)) that is a release-gate for any Lumi surface.

The numbering below picks up from §22 in Part 1 and uses `§20.5` for the coaching model so cross-references in code (`lumi_coach.dart`, `lumi_context.dart`) match the spec exactly.

---

## §20.5 Lumi Coaching Model

Lumi is not a single AI — it is **four coaching personalities sharing one visual identity.** The right personality is selected automatically from the user's [`Persona`](../../packages/design-tokens-flutter/lib/src/persona.dart). Every Lumi-driven surface (chat, doubts, current-affairs annotations, post-session celebrations) reads through the same coaching contract so the experience is internally consistent.

### §20.5.1 The four coaching modes

| Coach mode | User persona | Voice | Knowledge depth | Hint policy | Refusal posture |
|---|---|---|---|---|---|
| **Encourager** | Kid | Warm, exclamatory, simple vocab (Flesch grade ≤ 4), audio-narrated when active | Concept-level only; never advanced shortcuts | 3 progressive hints before the worked answer | Strictest filter; emoji-friendly refusals |
| **Buddy** | Teen | Cool, peer-tone, exam-references ("Boards-style", "PYQ"), mild humour | Up to JEE-Adv / NEET-PG depth + speed-tricks + common-mistake call-outs | 2 hints then full worked solution + alternate methods | Firm but friendly; minimal emoji |
| **Mentor** | Aspirant | Crisp, respectful, data-forward, no exclamation marks, exam-specific (UPSC: Schedule II / Article-mapping; CAT: LR-DI patterns) | Full syllabus depth + UPSC current-affairs link + standard-reference citations | **1 hint then guided derivation** — never the full answer. For UPSC mains: structure scaffold but not the content. | Composed; cites sources |
| **Coach** | Learner | Professional, peer-of-domain, productivity-language, time-conscious | Domain-deep with industry context; explicit when speaking outside expertise | 1 hint then the full optimal solution + rationale + tradeoffs | Brief and direct |

The mapping is one-to-one and codified in `LumiCoachModeX.forPersona()`. Callers never branch on `Persona` directly — they ask for the coach mode and the right contract follows.

### §20.5.2 HTTP transport contract

| Header / payload field | Value |
|---|---|
| `X-Lumi-Mode` (request header) | `encourager` / `buddy` / `mentor` / `coach` |
| `mode` (request body) | Same string, redundantly. Server picks the prompt template based on this. |
| `history` (request body) | Last `contextWindow` (= 8) turns, oldest first. |
| `locale` (request body) | IETF BCP-47 (`en-IN`, `hi-IN`, `ta-IN`, `te-IN`, `bn-IN`). |
| `topic_id` (request body, optional) | Active topic / concept the conversation hangs off. |
| `hint_level_requested` (request body, optional) | 0–N; must be ≤ `HintPolicy.maxHints` for the mode. |
| `session_id` (request body, optional) | Stable per-session UUID (`lumi-<hex>`); server may stamp its own and echo. |

Backend prompt templates per coach mode land in a separate sub-wave inside `alp-tutor`. The mobile client treats the server as authoritative for content; the client-side coach mode is the input to the server, not a parallel inference path.

### §20.5.3 Dialogue archetypes

Ten archetypes × four modes = 40 first-paint copy templates. The English seed lives in `apps/mobile/lib/aurora/voice.dart` (Wave 2 W2.0) under `AuroraVoice`. Hindi / Tamil / Telugu / Bengali land via the same library at W2.12 / W3.8.

| Archetype | When |
|---|---|
| Greeting | Session start — first message Lumi renders |
| Correct answer | User's answer is right |
| Wrong answer | User's answer is wrong |
| Stuck | User has been idle on a question for >30 s |
| Hint level 1 | First hint requested |
| Hint level 2 | Second hint requested |
| Hint level 3 (Encourager only) | Third hint requested |
| Celebration | Streak / badge / certificate milestone |
| Recovery | Streak <24 h from breaking |
| Farewell | Session ends |

The voice library is locale-aware and persona-aware; a `switch (persona)` expression with exhaustive enum coverage forces every new persona to provide every dialogue slot — translator omissions become build errors, not silent fallbacks.

### §20.5.4 Knowledge-boundary rules

Lumi must refuse confidently and route correctly when:

| Situation | Behaviour |
|---|---|
| **Out-of-syllabus** | Encourager: never go off-syllabus. Buddy / Mentor: ask confirmation. Coach: warn then engage. |
| **Real-time data** | Lumi never claims live market prices, today's news, sports scores. For Aspirant current-affairs, Lumi summarises from indexed sources only with the last-indexed date stamp visible in the citation footer. |
| **Medical / legal / financial advice** | All modes refuse with disclaimer; suggest qualified professional. |
| **Personal info** | Lumi never asks for or stores the user's address, contact, school name, employer beyond what's in profile. |
| **Confidence threshold** | If model confidence on a factual claim is **below `0.7`** ([`kLumiConfidenceThreshold`](../../apps/mobile/lib/aurora/lumi_coach.dart)), Lumi falls back to the `unsureCopy()` template ("I'm not sure — here's the relevant chapter to check"). |

### §20.5.5 Refusal posture per coach mode

Refusal copy is codified in `lumiRefusalCopy(category, mode)` in `lumi_coach.dart`. The full table lives in [content-safety-policy.md §3](content-safety-policy.md). Important contract:

> **`SafetyCategory.selfHarm` always returns `null` from `lumiRefusalCopy(...)`.**
> Self-harm is never a refusal — it triggers the helpline escalation flow ([`AuroraSafetyHelplineSheet`](../../apps/mobile/lib/aurora/widgets/aurora_safety_helpline_sheet.dart)) and locks the AI session. Callers MUST check for `SafetyCategory.selfHarm` before consulting the refusal table; the `null` return is the contract that enforces it.

### §20.5.6 Multi-turn context

Two layers, codified in `LumiCoachContext` ([`lumi_context.dart`](../../apps/mobile/lib/aurora/lumi_context.dart)):

| Layer | Lifetime | What it remembers |
|---|---|---|
| **Session-scoped** (in-memory) | Until `endSession()` or cold start | Last 8 turns; active topic; current hint level; session id |
| **Cross-session profile** (persisted to `flutter_secure_storage` under `alp.lumi.profile`) | Until persona switch, account deletion, or consent withdrawal | Persona; locale; top-3 weak EWA topic ids; last 5 milestone ids; parent-set restriction tags |

**Cross-persona leak prevention** is a hard contract: a user switching persona wipes both layers automatically (`LumiCoachContext.wipeProfile()` runs from the `PersonaNotifier` listener). The same wipe runs on consent withdrawal and account deletion.

### §20.5.7 Telemetry events

Names live in [`LumiEvents`](../../apps/mobile/lib/aurora/lumi_telemetry.dart). Standard envelope (persona + coach_mode + session_id + locale) is auto-attached by `LumiTelemetry.emit(...)`.

| Event | When |
|---|---|
| `lumi_session_started` | Conversation opens |
| `lumi_session_ended` | Conversation closes / safety lock fires |
| `lumi_message_sent` | User message delivered to `alp-tutor` |
| `lumi_message_received` | Lumi response rendered to user |
| `lumi_hint_given` | Hint level N rendered (prop: `hint_level`) |
| `lumi_refused` | Refusal bubble rendered (prop: `category`, `confidence`) — never includes message text per DPDP §6 minimisation |
| `lumi_celebration_triggered` | Milestone celebration fired (prop: `milestone_id`) |
| `safety_self_harm_triggered` | Self-harm flagged + helpline sheet shown |
| `abuse_report_submitted` | User submitted a report against a Lumi message |
| `lumi_confidence_fallback` | `unsureCopy()` shown because model confidence < threshold |
| `lumi_hint_policy_exceeded` | User pushed past `HintPolicy.maxHints` |

### §20.5.8 Acceptance criteria (release-gate)

A new Lumi surface ships only when:

- [ ] `LumiCoachModeX.forPersona` produces the right mode for every `Persona`.
- [ ] `lumiRefusalCopy` returns non-empty English for every `(SafetyCategory ≠ selfHarm, LumiCoachMode)` pair.
- [ ] Self-harm path routes to the helpline sheet without ever passing through `lumiRefusalCopy`.
- [ ] `LumiCoachContext.windowedTurns` caps history at `contextWindow`.
- [ ] Persona switch wipes both in-memory session AND cross-session profile.
- [ ] Telemetry events are emitted with the standard envelope (no message text in payload).
- [ ] Server-side prompt templates per coach mode are reviewed by Trust & Safety + Linguistics before any persona ships in production.

The Dart-side acceptance is covered by `apps/mobile/test/lumi_coach_test.dart` (24 unit tests).
