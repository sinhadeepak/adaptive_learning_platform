# Vidya Flutter — Phase 2a (Splash + Welcome + Onboarding + Exam-Select) — Design Spec

**Date:** 2026-05-18
**Status:** Approved
**Phase:** 2a of N (Phase 2 split into 2a / 2b / 2c — see §3)
**Related:**
- [ADR-0034 Design System v3 — Vidya](../../adr/0034-design-system-v3-vidya.md)
- [Phase 1 Foundation spec](2026-05-18-vidya-flutter-foundation-design.md)
- Mockup references: `docs/ui/02_MobileApp/01_splash.html` … `06_exam-select.html` (placeholder shells) + `docs/ui/02_MobileApp/00_README.md`
**Branch:** `feature/vidya-foundation`

---

## 1. Context

Phase 1 (commit `06da8f7`) shipped the Vidya design system infrastructure: 14 widget primitives in `packages/design-tokens-flutter/lib/src/vidya/widgets/`, 3 notifiers (`VidyaPersonaNotifier`, `VidyaDensityNotifier`, `VidyaThemeModeNotifier`) in `apps/mobile/lib/vidya/`, and a `VidyaApp` root widget that is built but **not yet wired** as the `runApp` root. Aurora's 50+ widget classes and 40+ screens continue to render the mobile app today.

Phase 2 was originally scoped as one slab covering splash + onboarding + auth + screening — too large for a single PR/spec. Per a planning sub-decision (this conversation, 2026-05-18), Phase 2 is now split into three increments:

| Sub-phase | Scope | Screens |
|---|---|---|
| **2a** *(this spec)* | First-launch path + runApp flip + Aurora coexistence shim | 01 splash, 02 welcome, 03/04/05 onboarding cards, 06 exam-select (6 screens) |
| 2b | Auth surface | 10 register, 11 email-verify, 12 login, 13 otp-login, 14 reset-password, 15 new-password (6 screens) |
| 2c | Screening | 07 guest-screening intro, 08 diagnostic Theme-wrap reuse, 09 screening-result (3 screens) |

Each sub-phase ships independently and reviewable as one PR (~1200–1800 LOC estimated). Phase 2a is the foundation — it flips the runApp root and stands up the Aurora compatibility shim that 2b/2c will reuse.

## 2. Goal of this phase

When Phase 2a ships:

1. App cold-start lands on a **Vidya splash** (not Aurora's `_Splash`).
2. First-launch users walk a **Vidya onboarding flow**: splash → welcome → 3 onboarding cards → exam-select → Aurora login.
3. `runApp` root is `VidyaApp` (not Aurora's `AdaptiveLearningApp`).
4. Every Aurora screen still renders correctly via an `AuroraRoute` compatibility shim.
5. Returning users (`vidya.onboarding_done == true`) skip onboarding and land directly on Aurora login or Aurora home (existing auth/session logic preserved).
6. Aurora's onboarding screens (`persona_select`, `language`, `daily_goal`, `target_date`, `consent`, Aurora `welcome`, Aurora `exam_select`) become **dead code** — kept compiling, no longer reachable from the new entry path.

## 3. Sequencing (informational)

| Phase | Status | Spec |
|---|---|---|
| **2a. Splash + Welcome + Onboarding + Exam-select** *(this)* | this file | `2026-05-18-vidya-flutter-phase-2a-design.md` |
| 2b. Auth (login + register + OTP + reset) | follow-up | TBD |
| 2c. Screening intro + result + diagnostic wrap | follow-up | TBD |
| 3. Home + bottom nav shell | follow-up | per Phase 1 spec §3 |
| 4–8. Quiz / Study / Insights / Profile / Long tail | follow-up | per Phase 1 spec §3 |

## 4. Existing state

Already in place (do not re-do):

- **Vidya primitives** — 14 widgets in `packages/design-tokens-flutter/lib/src/vidya/widgets/`. Importable today.
- **Vidya notifiers** — `apps/mobile/lib/vidya/{persona_notifier,density_notifier,theme_mode_notifier}.dart`. Storage keys `vidya.persona`, `vidya.density`, `vidya.theme`.
- **`VidyaApp` widget** — `apps/mobile/lib/vidya/vidya_app.dart`. Accepts `builder: Widget Function(BuildContext)`. Not yet wired in `main.dart`.
- **`VidyaGalleryScreen`** — debug-only sanity check.
- **Mockup HTML shells** — `docs/ui/02_MobileApp/01_splash.html` … `06_exam-select.html`. These are placeholder containers; visual design is driven by the Vidya primitives + ADR-0034 tokens + README screen-purpose lines, not the HTML.
- **Aurora `_Splash`** in `main.dart` lines 329–432 — to be replaced by Vidya splash in this phase.
- **Aurora onboarding screens** in `apps/mobile/lib/screens/onboarding/` — all 7 stay on disk; only `welcome_screen.dart` and `exam_select_screen.dart` have Vidya equivalents in this phase. The other five (`persona_select`, `language`, `daily_goal`, `target_date`, `consent`) drop from the entry path.

## 5. Decisions

### 5.1 Coexistence model: `AuroraRoute` shim (nested MaterialApp)

`VidyaApp` becomes the outermost `MaterialApp`. Any Aurora screen that needs to render is wrapped in:

```dart
AuroraRoute(child: <existing Aurora screen widget>)
```

`AuroraRoute` mounts a nested `MaterialApp` configured with Aurora's `theme: AuroraTheme.light(...)` / `darkTheme: AuroraTheme.dark(...)` and Aurora's `themeMode`, density, persona notifiers — so Aurora screens see exactly the `Theme.of(context)` shape they were written for. **Zero edits to Aurora screen code.**

**Rejected:** Option B (dual `ThemeExtension` registration at root) — `ThemeData.colorScheme` properties differ between Aurora and Vidya; can't be merged. Option C (warm-restart between roots) — needs `Phoenix.rebirth()` and breaks deep links.

The cost of Option A is one additional `MaterialApp` frame per Aurora route entry (negligible visually; tested on the existing `home_screen` smoke test). Aurora screens deleted as Vidya equivalents land per phase; `AuroraRoute` deleted in the final Aurora-deletion phase.

### 5.2 runApp root: flip to `VidyaApp`

`main.dart` `runApp(...)` argument changes from `AdaptiveLearningApp` to a new `VidyaRootApp` wrapper that mounts `VidyaApp` and routes between:
- **Vidya onboarding flow** (Phase 2a content) — first-launch users with `vidya.onboarding_done != 'true'`
- **Aurora session/guest flow** — wrapped in `AuroraRoute`, for users who have completed onboarding

Aurora's `AdaptiveLearningApp` widget continues to exist as a class but is **no longer the runApp target**. Its `_GuestScreen` + `_OnboardStep` state machines move *inside* `AuroraRoute`'s child so existing auth/session logic stays intact.

### 5.3 First-launch detection: new key `vidya.onboarding_done`

A new `flutter_secure_storage` key tracks whether the Vidya onboarding has been completed (`'true'` after exam-select Continue). Stored independently of Aurora's onboarding state — Aurora's per-user `session.user.onboardingState == 'ONBOARDED'` (server-side) is unaffected.

The check happens during `VidyaRootApp` bootstrap, alongside the existing parallel bootstrap of auth + notifiers.

| Storage key | Value | Source |
|---|---|---|
| `vidya.onboarding_done` | `'true'` after exam-select Continue | written here |
| `vidya.selected_exam_id` | exam UUID | written by Vidya exam-select |
| `vidya.selected_exam_code` | exam code (NEET/JEE/etc.) | written by Vidya exam-select |

Aurora's `home_screen` already reads server-side exam state via API; the Vidya local keys are *advisory* (used to skip re-prompting if backend later becomes inconsistent), not authoritative.

### 5.4 Routing pattern: state-machine `home:` swap (match existing main.dart)

`main.dart` today uses a setState-driven `home:` swap, not named Navigator routes. Phase 2a matches this pattern — `VidyaRootApp` carries a `_VidyaScreen` enum (`splash | welcome | card1 | card2 | card3 | examSelect | aurora`) and `setState` drives transitions. No `Navigator.pushNamed`, no `go_router`. Reversible; matches what's there.

### 5.5 Onboarding cards: 3 separate screens (not a PageView)

Each of the 3 onboarding cards (03 ai-adapts, 04 readiness, 05 guided) is a separate Vidya screen with its own `_VidyaScreen` enum value and its own Continue/Skip buttons. **Not** a single PageView with 3 pages.

**Why:** matches mockup file structure (3 separate HTML files), each card carries distinct copy + future asset requirements, and back-button semantics are clearer with separate screens. Forward swipe gesture between cards can be added later as a navigation polish; not blocking.

### 5.6 Skip button: present on all 3 cards + welcome, absent from exam-select

Skip jumps to exam-select (the last required step before the post-onboarding handoff). Exam-select has no Skip — exam choice is required. This matches the mockup README line *"onboarding step 4 of 4"*.

### 5.7 Post-exam-select handoff: Aurora `LoginScreen` via `AuroraRoute`

When the user picks an exam and taps Continue:
1. Write `vidya.onboarding_done = 'true'`, `vidya.selected_exam_*`
2. Call existing `POST /profile/exam` via `AuthClient` (preserves Aurora's server-side path; no new backend in 2a)
3. Set `_VidyaScreen.aurora` → renders `AuroraRoute(child: <Aurora's guest+session router>)` — the user sees Aurora `LoginScreen` next (or Aurora `MainScaffold` if already authed)

### 5.8 Aurora `_Splash` deletion: deferred to Phase 2b

Aurora's `_Splash` widget in `main.dart` lines 329–432 stays defined but unreferenced after the runApp flip. Deleted in 2b to keep this PR's diff focused on add-only changes. `AdaptiveLearningAppLegacy` (lines 435–453) also stays for the legacy widget test.

## 6. Folder structure

New files in this phase:

```
apps/mobile/lib/vidya/
├── vidya.dart                      # existing barrel — add new exports
├── vidya_root_app.dart             # NEW — runApp target; carries _VidyaScreen state machine
├── aurora_route.dart               # NEW — AuroraRoute compat shim widget
└── screens/                        # NEW directory
    ├── vidya_splash_screen.dart    # NEW — replaces Aurora's _Splash
    ├── vidya_welcome_screen.dart   # NEW — 02_welcome
    ├── vidya_onboarding_card_screen.dart  # NEW — parameterised; 03/04/05 reuse
    └── vidya_exam_select_screen.dart      # NEW — 06_exam-select

apps/mobile/lib/main.dart           # MODIFIED — runApp argument flips
```

Modified:
- `apps/mobile/lib/main.dart` — `runApp(VidyaRootApp(...))`. `AdaptiveLearningApp` class stays defined; instantiated inside `AuroraRoute` via a small extraction (`_AuroraGuestFlow` widget) to preserve the existing state machine.
- `apps/mobile/lib/vidya/vidya.dart` — barrel adds new exports.

No deletions in this phase. No edits to Aurora screen files.

## 7. Screen catalog detail

Each screen reads `VidyaThemeData.of(context)` and uses only Vidya primitives (`VidyaButton`, `VidyaCard`, `VidyaScaffold`, `VidyaChip`, `VidyaBadge`, etc.) for visual elements. No hardcoded hex; no Aurora widget imports. Estimated LOC per the column.

| # | Screen | Purpose | Key primitives | LOC est. |
|---|---|---|---|---|
| 01 | `VidyaSplashScreen` | Brand splash; shown during root bootstrap | (no primitives — custom gradient + brand mark) | ~120 |
| 02 | `VidyaWelcomeScreen` | Product pitch; 3 feature strips; Get Started + Sign In CTAs | `VidyaScaffold`, `VidyaCard`, `VidyaButton`, `VidyaBadge` | ~180 |
| 03 | `VidyaOnboardingCardScreen` (card 1 = AI adapts) | How adaptive engine works | `VidyaScaffold`, `VidyaCard`, `VidyaButton`, `VidyaAiTag` | ~220 (shared) |
| 04 | `VidyaOnboardingCardScreen` (card 2 = readiness) | Readiness score explanation; live preview | + `VidyaMasteryBar`, `VidyaSparkline` | (shared) |
| 05 | `VidyaOnboardingCardScreen` (card 3 = guided learning) | Live recommendation preview | + `VidyaTag`, `VidyaChip` | (shared) |
| 06 | `VidyaExamSelectScreen` | Choose target exam (NEET/JEE/UPSC/CBSE/…) | `VidyaScaffold`, `VidyaCard`, `VidyaChip` (selectable), `VidyaButton` | ~250 |

**Shared parameterised card screen.** `VidyaOnboardingCardScreen` takes:
- `cardIndex: 1 | 2 | 3`
- `title`, `kicker`, `body` strings
- `previewBuilder: Widget Function(BuildContext)?` — card 2's live readiness preview, card 3's recommendation preview
- `onContinue`, `onSkip`, `onBack: VoidCallback`

This way 03/04/05 are one widget class with three call sites in `VidyaRootApp`, not three near-duplicate files.

**Exam list source.** Reuses the existing `GET /catalog/exams` endpoint via `AuthClient.apiGet('/catalog/exams')` (same as Aurora `exam_select_screen.dart` lines 44–50). On success, write the chosen exam to `vidya.selected_exam_*` AND to the backend via existing `POST /profile/exam`. On API failure, show inline error using `VidyaBanner`.

## 8. `AuroraRoute` shim — mechanics

```dart
// apps/mobile/lib/vidya/aurora_route.dart
class AuroraRoute extends StatefulWidget {
  final Widget Function(BuildContext) builder;
  const AuroraRoute({super.key, required this.builder});

  @override
  State<AuroraRoute> createState() => _AuroraRouteState();
}

class _AuroraRouteState extends State<AuroraRoute> {
  // Aurora notifiers — one instance owned by the shim's lifetime.
  // (Aurora's current AdaptiveLearningApp owns these too; here they
  //  live for as long as the Aurora subtree is mounted.)
  final _auroraTheme = ThemeModeNotifier();
  final _auroraDensity = DensityNotifier();
  final _auroraPersona = PersonaNotifier();
  bool _bootstrapped = false;

  @override
  void initState() {
    super.initState();
    Future.wait<void>([
      _auroraTheme.bootstrap(),
      _auroraDensity.bootstrap(),
      _auroraPersona.bootstrap(),
    ]).whenComplete(() {
      if (mounted) setState(() => _bootstrapped = true);
    });
    _auroraTheme.addListener(_rebuild);
    _auroraDensity.addListener(_rebuild);
    _auroraPersona.addListener(_rebuild);
  }

  void _rebuild() { if (mounted) setState(() {}); }

  @override
  void dispose() {
    _auroraTheme.removeListener(_rebuild);
    _auroraDensity.removeListener(_rebuild);
    _auroraPersona.removeListener(_rebuild);
    _auroraTheme.dispose();
    _auroraDensity.dispose();
    _auroraPersona.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_bootstrapped) return const SizedBox.shrink();
    return MaterialApp(
      // Aurora theme — unchanged from current main.dart.
      theme: AuroraTheme.light(
        density: _auroraDensity.density,
        persona: _auroraPersona.persona,
      ),
      darkTheme: AuroraTheme.dark(
        density: _auroraDensity.density,
        persona: _auroraPersona.persona,
      ),
      themeMode: _auroraTheme.mode,
      debugShowCheckedModeBanner: false,
      home: Builder(builder: widget.builder),
    );
  }
}
```

The nested `MaterialApp` is fine — Flutter supports it; the inner one inherits the outer `Directionality` and locale; only `Theme` is overridden inside. Documented in Flutter API docs for `MaterialApp`.

## 9. `VidyaRootApp` skeleton

```dart
// apps/mobile/lib/vidya/vidya_root_app.dart
enum _VidyaScreen {
  splash, welcome, card1, card2, card3, examSelect, aurora,
}

class VidyaRootApp extends StatefulWidget {
  final AuthClient auth;
  const VidyaRootApp({super.key, required this.auth});

  @override
  State<VidyaRootApp> createState() => _VidyaRootAppState();
}

class _VidyaRootAppState extends State<VidyaRootApp> {
  // Vidya notifiers (from Phase 1)
  final _persona = VidyaPersonaNotifier();
  final _density = VidyaDensityNotifier();
  final _themeMode = VidyaThemeModeNotifier();

  _VidyaScreen _screen = _VidyaScreen.splash;
  bool _bootstrapped = false;
  bool _onboardingDone = false;

  static const _storage = FlutterSecureStorage();
  static const _onboardingDoneKey = 'vidya.onboarding_done';

  @override
  void initState() {
    super.initState();
    Future.wait<void>([
      _persona.bootstrap(),
      _density.bootstrap(),
      _themeMode.bootstrap(),
      widget.auth.bootstrap(),
      _storage.read(key: _onboardingDoneKey).then((v) {
        _onboardingDone = v == 'true';
      }),
    ]).whenComplete(() {
      if (!mounted) return;
      setState(() {
        _bootstrapped = true;
        _screen = _onboardingDone ? _VidyaScreen.aurora : _VidyaScreen.welcome;
      });
    });
  }

  Future<void> _markOnboardingDone() async {
    await _storage.write(key: _onboardingDoneKey, value: 'true');
    if (mounted) setState(() => _screen = _VidyaScreen.aurora);
  }

  @override
  Widget build(BuildContext context) {
    return VidyaApp(
      persona: _persona,
      density: _density,
      themeMode: _themeMode,
      builder: (context) => _currentScreen(),
    );
  }

  Widget _currentScreen() {
    if (!_bootstrapped) return const VidyaSplashScreen();
    switch (_screen) {
      case _VidyaScreen.splash:
        return const VidyaSplashScreen();
      case _VidyaScreen.welcome:
        return VidyaWelcomeScreen(
          onGetStarted: () => setState(() => _screen = _VidyaScreen.card1),
          onSignIn: _markOnboardingDone,        // jumps straight to Aurora login
          onSkip:   _markOnboardingDone,
        );
      case _VidyaScreen.card1:
        return VidyaOnboardingCardScreen(
          cardIndex: 1,
          onContinue: () => setState(() => _screen = _VidyaScreen.card2),
          onSkip:     () => setState(() => _screen = _VidyaScreen.examSelect),
          onBack:     () => setState(() => _screen = _VidyaScreen.welcome),
        );
      case _VidyaScreen.card2:
        return VidyaOnboardingCardScreen(
          cardIndex: 2,
          onContinue: () => setState(() => _screen = _VidyaScreen.card3),
          onSkip:     () => setState(() => _screen = _VidyaScreen.examSelect),
          onBack:     () => setState(() => _screen = _VidyaScreen.card1),
        );
      case _VidyaScreen.card3:
        return VidyaOnboardingCardScreen(
          cardIndex: 3,
          onContinue: () => setState(() => _screen = _VidyaScreen.examSelect),
          onSkip:     () => setState(() => _screen = _VidyaScreen.examSelect),
          onBack:     () => setState(() => _screen = _VidyaScreen.card2),
        );
      case _VidyaScreen.examSelect:
        return VidyaExamSelectScreen(
          auth: widget.auth,
          onContinue: _markOnboardingDone,
          onBack: () => setState(() => _screen = _VidyaScreen.card3),
        );
      case _VidyaScreen.aurora:
        return AuroraRoute(builder: (_) => _AuroraGuestFlow(auth: widget.auth));
    }
  }
}
```

`_AuroraGuestFlow` is the current `AdaptiveLearningApp` widget, renamed and with its outer `MaterialApp` removed (since `AuroraRoute` now provides that). Concretely: rename `AdaptiveLearningApp` → `AuroraGuestFlow`, delete the outer `MaterialApp(...)` from its `build()` and return its current `home:` content directly. Everything else (state machines, `_guestRoute()`, `_onboardingRoute()`, notifier ownership, deep-link parsing) is preserved verbatim. No logic duplication.

## 10. Acceptance criteria

This phase ships when ALL true:

1. `cd packages/design-tokens-flutter && flutter analyze` exits 0
2. `cd apps/mobile && flutter analyze` exits 0
3. `cd apps/mobile && flutter test` — all existing tests pass + 6 new screen tests (one per Vidya screen) each verifying:
   - Renders without exception under light + dark theme
   - Renders without exception under all 5 personas
   - Renders without exception under all 3 densities
   - Continue/Skip/Back wiring triggers the expected `_VidyaScreen` transition (where applicable)
4. `cd apps/mobile && flutter test test/vidya/` (Phase 1 widget tests) still pass — no regression
5. `cd apps/mobile && flutter build apk --debug` succeeds
6. Manual smoke (one Android emulator session, one iOS simulator session):
   - Cold-start: Vidya splash → Vidya welcome (no Aurora splash visible)
   - Walk through cards 1→3 → exam-select → pick exam → tap Continue → Aurora login appears (`AuroraRoute` mounts Aurora MaterialApp; Aurora theme tokens visible)
   - Sign in with seeded test user → Aurora `MainScaffold` renders correctly with full Aurora chrome
   - Kill app, cold-start again: lands on Aurora login directly (skip onboarding because `vidya.onboarding_done == 'true'`)
   - Skip button from welcome and from cards 1/2/3 → behaves per §5.6
7. No Aurora screen visual regression — `home_screen` golden/smoke test still passes
8. Aurora `_Splash` widget no longer referenced (lint: unused but not removed in this phase)

## 11. Out of scope

- **Auth screens** (register, email-verify, login, OTP, reset, new-password) — Phase 2b. Aurora versions remain reachable via `AuroraRoute`.
- **Screening flow** (07 intro, 08 diagnostic Theme-wrap, 09 result) — Phase 2c.
- **Aurora screen deletion.** All Aurora onboarding screens (`persona_select_screen`, `language_screen`, `daily_goal_screen`, `target_date_screen`, `consent_screen`, Aurora `welcome_screen`, Aurora `exam_select_screen`) stay on disk and stay compiling but become unreachable from the new entry path. They get deleted in a post-Phase-2 cleanup once Aurora is fully migrated.
- **Aurora `_Splash` deletion** — Phase 2b.
- **Vidya gallery screen update** — the existing gallery only covers Phase 1 primitives; adding screen previews is nice-to-have.
- **Deep-link handling under VidyaApp** — Aurora's deep-link parser (`auth/deep_link.dart`) is preserved by extracting it into `_AuroraGuestFlow`. New Vidya-targeted deep links are Phase 2b/2c.
- **Onboarding analytics events** — fire-and-forget telemetry on screen advance is out of scope for 2a (no analytics framework constraint in this phase).
- **Backwards-compat for users mid-Aurora-onboarding.** Users who already started Aurora onboarding (have `_session` but `session.user.onboardingState != 'ONBOARDED'`) hit Aurora's `_onboardingRoute()` inside `AuroraRoute` and complete the old flow. New users hit the new Vidya flow. **No data migration.**
- **Persona/Density/ThemeMode bridging between Vidya and Aurora notifiers.** Each storage namespace is independent (per Phase 1 §5.4). Users may experience a one-time persona reset when first signing in post-Vidya-onboarding; acceptable.
- **Sign-out re-running Vidya onboarding.** After sign-out, the user lands on Aurora `LoginScreen`, NOT Vidya onboarding. `vidya.onboarding_done` is per-device, not per-user — once a device has completed onboarding, that's permanent until app data is cleared. This is intentional: onboarding teaches first-time users about the product; returning users don't need re-teaching after a logout.

## 12. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Nested `MaterialApp` causes a one-frame flicker when transitioning into `AuroraRoute` | Acceptable; flickr is < 16 ms in practice. Measured during smoke test. If unacceptable, future fix is `CupertinoPageScaffold`-style inheritance instead of full MaterialApp nesting. |
| `flutter_secure_storage` slow on first read (especially Android cold start) | Bootstrap already parallel; total cold-start time should match Phase 1. Splash stays visible until ALL bootstraps settle (the existing `Future.wait` pattern). |
| Aurora's `_AdaptiveLearningAppState` (now `_AuroraGuestFlow`) listens to its own notifiers — moving it inside `AuroraRoute` may rebuild more aggressively than before | Listeners attach inside `_AuroraRouteState`'s nested tree; rebuild scope is unchanged. Verified by `flutter test` of existing Aurora screens. |
| `vidya.onboarding_done` and Aurora's server-side `onboardingState` go out of sync (e.g. user clears app data on one device) | Vidya key is advisory; server-side state is authoritative. If `vidya.onboarding_done == 'true'` but server returns `onboardingState != 'ONBOARDED'`, Aurora's existing `_onboardingRoute()` takes over inside `AuroraRoute`. No fix needed. |
| Card 2/3 preview widgets need design assets we don't have | Render with stub data using existing `VidyaMasteryBar` / `VidyaSparkline` (e.g. fake topic = "Mechanics", value = 0.62). Annotate with `// TODO: replace stub when real data wiring lands in Phase 3`. |
| Exam list API failure on first launch leaves user stranded | Show `VidyaBanner(tone: warn)` with Retry button; preserve existing Aurora `exam_select_screen.dart` error pattern (lines 44–50). |

## 13. Verification plan

```bash
# from repo root
cd packages/design-tokens-flutter && flutter analyze && cd -
cd apps/mobile && flutter analyze
cd apps/mobile && flutter test
cd apps/mobile && flutter build apk --debug
```

All four must exit 0.

**Manual smoke** (one Android emulator + one iOS simulator):
1. `flutter run --dart-define=ALP_API_BASE_URL=...`
2. Wipe app data
3. Cold-start → assert Vidya splash → Vidya welcome
4. Walk welcome → card1 → card2 → card3 → exam-select → pick "JEE" → Continue
5. Assert Aurora `LoginScreen` renders with Aurora theme
6. Sign in with `student@example.com / Password123!`
7. Assert Aurora `MainScaffold` renders with bottom nav + Aurora chrome
8. Kill app, cold-start again
9. Assert lands on Aurora `LoginScreen` directly (no Vidya onboarding re-shown)
10. Sign out → assert lands on Aurora `LoginScreen` (NOT Vidya onboarding — onboarding is per-device, not per-user, in 2a)
11. Toggle theme (Settings) → assert Aurora screens reflect light/dark; assert Vidya splash (if re-opened) is also independent

## 14. Open questions

None at design time. Open questions surfaced during implementation will be appended here before this spec is closed.
