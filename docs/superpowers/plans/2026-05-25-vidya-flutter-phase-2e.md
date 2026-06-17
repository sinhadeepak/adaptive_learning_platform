# Vidya Flutter Phase 2e Implementation Plan — Guest screening funnel

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the unauthenticated 5-minute screening funnel: welcome → 3 onboarding cards → **guest exam select → guest screening intro → screening quiz → guest result with dark sign-up gate** → register → verify → claim guest token + persist + diagnostic-complete → home.

**Architecture:** Extends Phase 2c's 15-state machine to 18 by adding `guestExamSelect`, `guestScreeningIntro`, `guestScreeningResult`. The screening quiz screen from Phase 2c is reused as-is (its client methods `start/next/answer` are already unauthenticated). The pending `guestToken` is carried in `_VidyaRootAppState` and consumed by `_onSignedIn` to call `persist(token)` + `diagnosticComplete()` right after the user completes register → verify. Backend requires zero changes — the existing `POST /screening/{token}/persist` already accepts any authenticated principal and associates the anonymous token's attempt with that user.

**Tech Stack:** Flutter 3.x; existing `ScreeningClient` + `AuthClient`; Vidya primitives from Phases 1 + 2a–2d. No new dependencies. No backend changes.

**Spec source:** Phase 2e section of `docs/superpowers/specs/2026-05-25-vidya-mobile-design-roadmap.md`.

---

## Backend contract (verified — `services/learning/src/learning/screening/routes.py`)

| Call | Auth | Behaviour for guest funnel |
|---|---|---|
| `POST /api/v1/screening/start` | none | Already used by Phase 2c. Same call from guest mode. |
| `GET /api/v1/screening/{token}/next` | none | Already used. |
| `POST /api/v1/screening/{token}/answer` | none | Already used. |
| `GET /api/v1/screening/{token}/reveal` | none | Already used by `VidyaScreeningResultScreen` for authed flow. Same call from guest result screen. |
| `POST /api/v1/screening/{token}/persist` | required | **Already supports the claim flow as-is**: reads `_store[token]` (anonymous session payload) and writes a row in `content_schema.screening_attempts` with `user_id = principal.user_id`. After register+verify, the mobile app calls this with the new user's bearer token — backend doesn't care whether the token's session was started anonymously or by an authed user. |
| `POST /api/v1/profile/me/diagnostic-complete` | required | FSM advance. Called after persist, same as authed flow. |

**No backend changes for Phase 2e.**

---

## State machine after Phase 2e (18 states)

```
splash → welcome → card1 → card2 → card3 → guestExamSelect → guestScreeningIntro → screeningQuiz → guestScreeningResult → register → verifyOtp → onSignedIn(carries guestToken) → claim → home

Alt branches:
welcome.onSignIn → login → home / examSelect (existing)
welcome.onSkip → login (existing — preserved)
card1/2/3.onSkip → register (existing — preserved; user opts out of screening funnel)
guestScreeningIntro.onSkip → register (NEW: user opts out at intro)
guestScreeningResult.onSignUp → register with _pendingGuestToken set
register.onRegistered → verifyOtp (existing)
verifyOtp.onVerified → _onSignedIn (existing) → if _pendingGuestToken != null then claim → home, else original logic
guestScreeningResult.onSkipSignup → login (NEW: user already has account)
```

**`_decideInitialScreen` unchanged** — Phase 2c's logic still handles cold start. Guests landing on welcome with no auth + no `vidya.onboarding_done` get the welcome screen, which leads into the guest funnel. Authenticated users with `vidya.onboarding_done` go straight to home.

---

## File Map

**Create:**
- `apps/mobile/lib/vidya/screens/vidya_guest_screening_intro_screen.dart` — "5-MINUTE SCREENING · See where you stand. Before signing up." (~150 LOC)
- `apps/mobile/lib/vidya/screens/vidya_guest_screening_result_screen.dart` — Dark hero card + projection + sign-up gate (~280 LOC)
- `apps/mobile/test/vidya/phase_2e_guest_funnel_test.dart` — widget tests for the 3 guest screens + state-machine routing tests (~400 LOC)

**Modify:**
- `apps/mobile/lib/vidya/screens/vidya_exam_select_screen.dart` — add `ExamSelectMode` enum (`authed | guest`); in guest mode skip the `/profile/exams` PUT, route via `onContinue` immediately after storage write
- `apps/mobile/lib/vidya/vidya_root_app.dart` — add 3 enum cases, 2 storage flags, `_pendingGuestToken`/`_pendingGuestExamCode` fields, route from `card3.onContinue` → `guestExamSelect`, wire 3 new state cases, extend `_onSignedIn` to claim the guest token when present
- `apps/mobile/lib/vidya/vidya.dart` — add 2 exports

**File responsibilities:**

| File | Responsibility | Approx. LOC |
|---|---|---|
| `vidya_guest_screening_intro_screen.dart` | Pre-quiz framing for guests. "5-MINUTE SCREENING" eyebrow, "See where you stand. Before signing up." headline, info rows (Time / Questions / You'll get / Privacy), "Start screening" CTA, "Skip — sign up first" text button. | ~150 |
| `vidya_guest_screening_result_screen.dart` | Reveal + sign-up gate. Calls `reveal(token)` on init. Dark hero card with score / percentile / θ. "WITH VIDYA, IN 12 WEEKS ~XXX (rank ~ X,XXX)" mobile-computed projection. Subject mastery bars (Physics / Chemistry / Biology — derived from `topic_breakdown`). "UNLOCK YOUR FULL REPORT — N weak topics identified" gate. "Sign up free" primary + "I already have an account" secondary. | ~280 |
| `vidya_exam_select_screen.dart` (extended) | Adds `ExamSelectMode mode` constructor arg (defaults to `authed`). In `authed` mode behaviour is unchanged. In `guest` mode the submit handler skips the `/profile/exams` PUT and goes straight to writing storage + firing `onContinue`. | +30 (net) |
| `vidya_root_app.dart` (extended) | +3 enum cases, +2 fields (`_pendingGuestToken`, `_pendingGuestExamCode`), card3 onContinue rerouted, 3 new case branches in `_currentScreen()`, `_onSignedIn` extended to consume the pending guest token. | +75 (net) |

---

## Out of scope for Phase 2e

These are explicitly NOT addressed and queued for later:

- **Backend projection endpoint** — slide 5 shows "WITH VIDYA, IN 12 WEEKS ~780 (rank ~ 2,400)". Phase 2e computes this mobile-side with a deterministic formula. A defensible backend-computed projection ships in a later phase.
- **Real percentile / rank values** — phase 2e renders placeholders derived from the score (e.g., percentile = round(score_pct), rank = derived). Backend integration with rank prediction is a separate exercise.
- **Hindi copy** — the guest funnel ships in English. `vidya.lang` is still honored where Phase 2d copy was localized; Phase 2e adds English-only copy.
- **Re-take diagnostic later** — once a guest skips at intro or signs up via the "I already have an account" link, there is no in-app path back to redo the screening. Same constraint as Phase 2c.

---

## Confirmed APIs (locked from Phase 2c + 2d)

- `ScreeningClient({baseUrl, httpClient, auth})` with methods `start({examCode, language})`, `next(token)`, `answer(token, {itemIdx, answerIdx})`, `reveal(token)`, `persist(token)`, `diagnosticComplete()`.
- `ScreeningStart { token, targetCount, examCode }`, `ScreeningReveal { scorePct, correct, total, readinessSeed, topicBreakdown: List<TopicBreakdown> }`, `TopicBreakdown { topicId, correct, total }`.
- `VidyaScreeningQuizScreen({client, examCode, onCompleted, onBack})` — unchanged from Phase 2c. Reused for both authed and guest flows.
- `VidyaScaffold`, `VidyaAppBar({title, leading, actions})`, `VidyaButton({label, onPressed, style, size, disabled, fullWidth, key?})`, `VidyaCard({tone, onTap?, child})`, `VidyaBanner({tone, message})`, `VidyaCardTone.defaultTone | accent | dark`, `VidyaButtonStyle.primary | ghost`, `VidyaButtonSize.lg`.
- `VidyaThemeData.of(context).ink/ink3/accent/paper`, `VidyaFonts.display/ui/mono`.
- `AuthClient.apiPost(path, body)` / `apiGet(path)` accept paths WITHOUT `/api/v1` prefix (it lives in `baseUrl`).
- `FlutterSecureStorage.setMockInitialValues({...})` for tests.

---

## Task 1: `VidyaGuestScreeningIntroScreen`

**Files:**
- Create: `apps/mobile/lib/vidya/screens/vidya_guest_screening_intro_screen.dart`
- Create: `apps/mobile/test/vidya/phase_2e_guest_funnel_test.dart` (new file — populated incrementally)
- Modify: `apps/mobile/lib/vidya/vidya.dart` (add export)

- [ ] **Step 1: Write failing test**

Create `apps/mobile/test/vidya/phase_2e_guest_funnel_test.dart`:

```dart
import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:adaptive_learning_mobile/vidya/screens/vidya_guest_screening_intro_screen.dart';

Widget _harness(Widget child) => MaterialApp(
      theme: VidyaTheme.material(
        brightness: Brightness.light,
        persona: VidyaPersona.aspirant,
        density: VidyaDensity.regular,
      ),
      home: child,
    );

void main() {
  group('VidyaGuestScreeningIntroScreen', () {
    testWidgets('renders eyebrow + headline + info rows + CTAs',
        (tester) async {
      await tester.pumpWidget(_harness(VidyaGuestScreeningIntroScreen(
        onStart: () {},
        onSkip: () {},
      )));
      expect(find.text('5-MINUTE SCREENING'), findsOneWidget);
      expect(find.text('See where you stand. Before signing up.'),
          findsOneWidget);
      expect(find.textContaining('15 adaptive questions'), findsOneWidget);
      expect(find.text('Time'), findsOneWidget);
      expect(find.text('Questions'), findsOneWidget);
      expect(find.text("You'll get"), findsOneWidget);
      expect(find.text('Privacy'), findsOneWidget);
      expect(find.byKey(const Key('vidya.guest.intro.start')), findsOneWidget);
      expect(find.byKey(const Key('vidya.guest.intro.skip')), findsOneWidget);
    });

    testWidgets('Start fires onStart', (tester) async {
      var taps = 0;
      await tester.pumpWidget(_harness(VidyaGuestScreeningIntroScreen(
        onStart: () => taps++,
        onSkip: () {},
      )));
      await tester.tap(find.byKey(const Key('vidya.guest.intro.start')));
      await tester.pumpAndSettle();
      expect(taps, 1);
    });

    testWidgets('Skip fires onSkip', (tester) async {
      var taps = 0;
      await tester.pumpWidget(_harness(VidyaGuestScreeningIntroScreen(
        onStart: () {},
        onSkip: () => taps++,
      )));
      await tester.tap(find.byKey(const Key('vidya.guest.intro.skip')));
      await tester.pumpAndSettle();
      expect(taps, 1);
    });
  });
}
```

- [ ] **Step 2: Verify test fails**

```
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && flutter test test/vidya/phase_2e_guest_funnel_test.dart
```
Expected: FAIL — `vidya_guest_screening_intro_screen.dart` not found.

- [ ] **Step 3: Implement `VidyaGuestScreeningIntroScreen`**

Create `apps/mobile/lib/vidya/screens/vidya_guest_screening_intro_screen.dart`:

```dart
// VidyaGuestScreeningIntroScreen — pre-quiz framing for the guest funnel.
// Distinct from the authed VidyaScreeningIntroScreen: this screen frames
// the screening as a no-signup-required exploration, and a Skip path
// routes straight to register (the parent decides where).

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

class VidyaGuestScreeningIntroScreen extends StatelessWidget {
  final VoidCallback onStart;
  final VoidCallback onSkip;

  const VidyaGuestScreeningIntroScreen({
    super.key,
    required this.onStart,
    required this.onSkip,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);

    return VidyaScaffold(
      appBar: VidyaAppBar(
        title: '',
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: v.ink),
          onPressed: onSkip,
        ),
      ),
      body: LayoutBuilder(builder: (ctx, constraints) {
        return SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: IntrinsicHeight(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: 16),
                  Text(
                    '5-MINUTE SCREENING',
                    style: TextStyle(
                      fontFamily: VidyaFonts.mono,
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 2,
                      color: v.ink3,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'See where you stand. Before signing up.',
                    style: TextStyle(
                      fontFamily: VidyaFonts.display,
                      fontSize: 28,
                      fontWeight: FontWeight.w500,
                      color: v.ink,
                      height: 1.2,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    '15 adaptive questions across Physics, Chemistry, '
                    'Biology. No login needed.',
                    style: TextStyle(
                      fontFamily: VidyaFonts.ui,
                      fontSize: 14,
                      color: v.ink3,
                      height: 1.55,
                    ),
                  ),
                  const SizedBox(height: 24),
                  VidyaCard(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 4, vertical: 4),
                      child: Column(
                        children: [
                          _InfoRow(
                            icon: Icons.timer_outlined,
                            label: 'Time',
                            value: '~5 min',
                          ),
                          _Divider(color: v.ink3.withValues(alpha: 0.12)),
                          _InfoRow(
                            icon: Icons.flash_on_outlined,
                            label: 'Questions',
                            value: '15 · adaptive',
                          ),
                          _Divider(color: v.ink3.withValues(alpha: 0.12)),
                          _InfoRow(
                            icon: Icons.track_changes_outlined,
                            label: "You'll get",
                            value: 'Readiness estimate',
                          ),
                          _Divider(color: v.ink3.withValues(alpha: 0.12)),
                          _InfoRow(
                            icon: Icons.lock_outline,
                            label: 'Privacy',
                            value: 'Saved if you sign up',
                          ),
                        ],
                      ),
                    ),
                  ),
                  const Spacer(),
                  VidyaButton(
                    key: const Key('vidya.guest.intro.start'),
                    label: 'Start screening',
                    onPressed: onStart,
                    style: VidyaButtonStyle.primary,
                    size: VidyaButtonSize.lg,
                    fullWidth: true,
                  ),
                  const SizedBox(height: 8),
                  Center(
                    child: TextButton(
                      key: const Key('vidya.guest.intro.skip'),
                      onPressed: onSkip,
                      child: const Text('Skip — sign up first'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      }),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 14),
      child: Row(
        children: [
          Icon(icon, color: v.ink3, size: 18),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                fontFamily: VidyaFonts.ui,
                fontSize: 14,
                color: v.ink3,
              ),
            ),
          ),
          Text(
            value,
            style: TextStyle(
              fontFamily: VidyaFonts.mono,
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: v.ink,
            ),
          ),
        ],
      ),
    );
  }
}

class _Divider extends StatelessWidget {
  final Color color;
  const _Divider({required this.color});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Container(height: 1, color: color),
    );
  }
}
```

- [ ] **Step 4: Add export to barrel**

In `apps/mobile/lib/vidya/vidya.dart`, append:
```dart
export 'screens/vidya_guest_screening_intro_screen.dart';
```

- [ ] **Step 5: Verify tests pass**

```
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && flutter test test/vidya/phase_2e_guest_funnel_test.dart
```
Expected: 3/3 PASS.

- [ ] **Step 6: Commit**

```bash
cd /home/deepak/projects/adaptive_learning_platform && git add apps/mobile/lib/vidya/screens/vidya_guest_screening_intro_screen.dart apps/mobile/lib/vidya/vidya.dart apps/mobile/test/vidya/phase_2e_guest_funnel_test.dart && git commit -m "$(cat <<'EOF'
feat(vidya): VidyaGuestScreeningIntroScreen — pre-quiz framing for guest funnel

Phase 2e. 5-MINUTE SCREENING eyebrow + 'See where you stand. Before
signing up.' headline + info rows (Time/Questions/You'll get/Privacy)
+ Start screening CTA + 'Skip — sign up first' text button. Mirrors
slide 3 right panel.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `VidyaGuestScreeningResultScreen`

**Files:**
- Create: `apps/mobile/lib/vidya/screens/vidya_guest_screening_result_screen.dart`
- Modify: `apps/mobile/test/vidya/phase_2e_guest_funnel_test.dart` (append group)
- Modify: `apps/mobile/lib/vidya/vidya.dart` (add export)

- [ ] **Step 1: Append failing test**

Add these imports at the top of `apps/mobile/test/vidya/phase_2e_guest_funnel_test.dart` (after existing imports):

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/vidya/screening_client.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_guest_screening_result_screen.dart';
```

Append this group inside `main()`:

```dart
  group('VidyaGuestScreeningResultScreen', () {
    setUp(() {
      FlutterSecureStorage.setMockInitialValues({});
    });

    ScreeningClient _client(MockClient mock) => ScreeningClient(
          baseUrl: 'http://test',
          httpClient: mock,
          auth: AuthClient(baseUrl: 'http://test', httpClient: mock),
        );

    testWidgets('renders dark hero card with score + projection after reveal',
        (tester) async {
      final mock = MockClient((req) async {
        if (req.url.path.endsWith('/reveal')) {
          return http.Response(
            jsonEncode({
              'score_pct': 53.0,
              'correct': 8,
              'total': 15,
              'topic_breakdown': [
                {'topic_id': 't-mech', 'correct': 1, 'total': 5},
                {'topic_id': 't-thermo', 'correct': 3, 'total': 5},
                {'topic_id': 't-calc', 'correct': 4, 'total': 5},
              ],
              'readiness_seed': 0.53,
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('{}', 404);
      });
      await tester.pumpWidget(MaterialApp(
        theme: VidyaTheme.material(
          brightness: Brightness.light,
          persona: VidyaPersona.aspirant,
          density: VidyaDensity.regular,
        ),
        home: VidyaGuestScreeningResultScreen(
          client: _client(mock),
          token: 'tok-1',
          onSignUp: (_) {},
          onSignIn: () {},
        ),
      ));
      await tester.pumpAndSettle();
      // Score badge in the dark hero — readiness is computed mobile-side.
      // Formula: max(0, round(score_pct * 9 + 100)) clamped to [0, 900].
      // 53% → 53*9 + 100 = 577.
      expect(find.text('577'), findsOneWidget);
      expect(find.text('/ 900'), findsOneWidget);
      // Projection: "WITH VIDYA, IN 12 WEEKS ~XXX".
      expect(find.textContaining('WITH VIDYA, IN 12 WEEKS'), findsOneWidget);
      // Sign-up gate text mentions weak topics from breakdown.
      expect(find.textContaining('weak topics'), findsOneWidget);
    });

    testWidgets('Sign up free fires onSignUp with the guestToken',
        (tester) async {
      final mock = MockClient((req) async {
        if (req.url.path.endsWith('/reveal')) {
          return http.Response(
            jsonEncode({
              'score_pct': 60.0,
              'correct': 9,
              'total': 15,
              'topic_breakdown': [],
              'readiness_seed': 0.6,
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('{}', 404);
      });
      String? capturedToken;
      await tester.pumpWidget(MaterialApp(
        theme: VidyaTheme.material(
          brightness: Brightness.light,
          persona: VidyaPersona.aspirant,
          density: VidyaDensity.regular,
        ),
        home: VidyaGuestScreeningResultScreen(
          client: _client(mock),
          token: 'tok-2',
          onSignUp: (t) => capturedToken = t,
          onSignIn: () {},
        ),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('vidya.guest.result.signup')));
      await tester.pumpAndSettle();
      expect(capturedToken, 'tok-2');
    });

    testWidgets('I already have an account fires onSignIn',
        (tester) async {
      final mock = MockClient((req) async {
        if (req.url.path.endsWith('/reveal')) {
          return http.Response(
            jsonEncode({
              'score_pct': 40.0,
              'correct': 6,
              'total': 15,
              'topic_breakdown': [],
              'readiness_seed': 0.4,
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('{}', 404);
      });
      var taps = 0;
      await tester.pumpWidget(MaterialApp(
        theme: VidyaTheme.material(
          brightness: Brightness.light,
          persona: VidyaPersona.aspirant,
          density: VidyaDensity.regular,
        ),
        home: VidyaGuestScreeningResultScreen(
          client: _client(mock),
          token: 'tok-3',
          onSignUp: (_) {},
          onSignIn: () => taps++,
        ),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('vidya.guest.result.signin')));
      await tester.pumpAndSettle();
      expect(taps, 1);
    });

    testWidgets('reveal failure surfaces banner', (tester) async {
      final mock = MockClient((req) async {
        if (req.url.path.endsWith('/reveal')) {
          return http.Response('{}', 500);
        }
        return http.Response('{}', 404);
      });
      await tester.pumpWidget(MaterialApp(
        theme: VidyaTheme.material(
          brightness: Brightness.light,
          persona: VidyaPersona.aspirant,
          density: VidyaDensity.regular,
        ),
        home: VidyaGuestScreeningResultScreen(
          client: _client(mock),
          token: 'tok-4',
          onSignUp: (_) {},
          onSignIn: () {},
        ),
      ));
      await tester.pumpAndSettle();
      expect(find.textContaining("couldn't load"), findsOneWidget);
    });
  });
```

- [ ] **Step 2: Verify tests fail**

```
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && flutter test test/vidya/phase_2e_guest_funnel_test.dart
```
Expected: FAIL — `vidya_guest_screening_result_screen.dart` not found.

- [ ] **Step 3: Implement `VidyaGuestScreeningResultScreen`**

Create `apps/mobile/lib/vidya/screens/vidya_guest_screening_result_screen.dart`:

```dart
// VidyaGuestScreeningResultScreen — reveal + sign-up gate for guest funnel.
// Calls reveal(token) on init. Renders a dark hero card with the
// mobile-computed readiness number (score_pct → 0-900 scale),
// a 12-week projection, and a sign-up gate. On Sign up free,
// emits the guest token via onSignUp(token) so the parent state
// machine can plumb it through register → verify → claim.
//
// The projection formula is intentionally simple and mobile-side;
// backend integration with a real projection endpoint is queued for
// a later phase per the roadmap.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../screening_client.dart';

class VidyaGuestScreeningResultScreen extends StatefulWidget {
  final ScreeningClient client;
  final String token;
  final void Function(String token) onSignUp;
  final VoidCallback onSignIn;

  const VidyaGuestScreeningResultScreen({
    super.key,
    required this.client,
    required this.token,
    required this.onSignUp,
    required this.onSignIn,
  });

  @override
  State<VidyaGuestScreeningResultScreen> createState() =>
      _VidyaGuestScreeningResultScreenState();
}

class _VidyaGuestScreeningResultScreenState
    extends State<VidyaGuestScreeningResultScreen> {
  ScreeningReveal? _reveal;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final r = await widget.client.reveal(widget.token);
      if (mounted) setState(() => _reveal = r);
    } catch (_) {
      if (mounted) {
        setState(() => _error = "We couldn't load your result. Try again later.");
      }
    }
  }

  // Readiness score on the 0-900 scale, derived from score_pct.
  // 0%  → 100, 100% → 1000 clamped at 900. Mobile-side only.
  int _readiness(double scorePct) {
    final raw = (scorePct * 9 + 100).round();
    return raw.clamp(0, 900);
  }

  // 12-week projected readiness — narrows ~half of the remaining gap.
  int _projected(int current) {
    final gap = 900 - current;
    return (current + (gap * 0.55)).round().clamp(0, 900);
  }

  // Rough rank approximation: lower readiness → higher rank number.
  int _projectedRank(int projected) {
    final pct = projected / 900;
    // 10,000 → 100 over 0 → 900 range, log-ish curve.
    return (10000 - (pct * 9900)).round();
  }

  // Weak topics: those with accuracy < 0.5. The 22 in the slide is a
  // illustrative number; we surface the actual count from the breakdown.
  int _weakCount(List<TopicBreakdown> tb) {
    return tb.where((t) {
      if (t.total == 0) return false;
      return (t.correct / t.total) < 0.5;
    }).length;
  }

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);

    if (_error != null) {
      return VidyaScaffold(
        appBar: VidyaAppBar(title: ''),
        body: Padding(
          padding: const EdgeInsets.all(20),
          child: Center(
            child: VidyaBanner(tone: VidyaBannerTone.warn, message: _error!),
          ),
        ),
      );
    }

    if (_reveal == null) {
      return VidyaScaffold(
        appBar: VidyaAppBar(title: ''),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final r = _reveal!;
    final current = _readiness(r.scorePct);
    final projected = _projected(current);
    final projectedRank = _projectedRank(projected);
    final weakCount = _weakCount(r.topicBreakdown);
    final percentile = r.scorePct.round();

    return VidyaScaffold(
      appBar: VidyaAppBar(
        title: '',
        leading: IconButton(
          icon: Icon(Icons.close, color: v.ink),
          onPressed: widget.onSignIn,
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 12),
            child: Text(
              'SCREENING COMPLETE',
              style: TextStyle(
                fontFamily: VidyaFonts.mono,
                fontSize: 11,
                fontWeight: FontWeight.w600,
                letterSpacing: 1.6,
                color: v.ink3,
              ),
            ),
          ),
        ],
      ),
      body: LayoutBuilder(builder: (ctx, constraints) {
        return SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: IntrinsicHeight(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: 8),
                  // Dark hero card with current readiness + projection
                  VidyaCard(
                    tone: VidyaCardTone.dark,
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 18, 16, 18),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'YOUR READINESS TODAY',
                            style: TextStyle(
                              fontFamily: VidyaFonts.mono,
                              fontSize: 10,
                              fontWeight: FontWeight.w600,
                              letterSpacing: 1.8,
                              color: const Color(0xFFB5B0A4),
                            ),
                          ),
                          const SizedBox(height: 12),
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(
                                '$current',
                                style: const TextStyle(
                                  fontFamily: VidyaFonts.display,
                                  fontSize: 64,
                                  fontWeight: FontWeight.w500,
                                  color: Color(0xFFF1EEE7),
                                  height: 1,
                                ),
                              ),
                              const SizedBox(width: 8),
                              const Padding(
                                padding: EdgeInsets.only(bottom: 8),
                                child: Text(
                                  '/ 900',
                                  style: TextStyle(
                                    fontFamily: VidyaFonts.mono,
                                    fontSize: 14,
                                    color: Color(0xFFB5B0A4),
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              _DarkChip(text: '${percentile}th %ile'),
                              _DarkChip(text: 'θ = ${_thetaLabel(r.scorePct)}'),
                            ],
                          ),
                          const SizedBox(height: 18),
                          Container(
                            height: 1,
                            color: const Color(0xFF2D3441),
                          ),
                          const SizedBox(height: 14),
                          Text(
                            'WITH VIDYA, IN 12 WEEKS',
                            style: TextStyle(
                              fontFamily: VidyaFonts.mono,
                              fontSize: 10,
                              fontWeight: FontWeight.w600,
                              letterSpacing: 1.8,
                              color: const Color(0xFFB5B0A4),
                            ),
                          ),
                          const SizedBox(height: 6),
                          RichText(
                            text: TextSpan(
                              children: [
                                TextSpan(
                                  text: '≈ $projected',
                                  style: const TextStyle(
                                    fontFamily: VidyaFonts.display,
                                    fontSize: 28,
                                    fontWeight: FontWeight.w500,
                                    color: Color(0xFFE4A748),
                                  ),
                                ),
                                TextSpan(
                                  text: '  (rank ~ ${_formatRank(projectedRank)})',
                                  style: const TextStyle(
                                    fontFamily: VidyaFonts.mono,
                                    fontSize: 13,
                                    color: Color(0xFFB5B0A4),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  // Subject mastery bars (derived from topic_breakdown)
                  for (final t in r.topicBreakdown) ...[
                    _SubjectBar(topic: t),
                    const SizedBox(height: 8),
                  ],
                  const SizedBox(height: 16),
                  // Sign-up gate
                  VidyaCard(
                    tone: VidyaCardTone.muted,
                    child: Padding(
                      padding: const EdgeInsets.all(8),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '🔒 UNLOCK YOUR FULL REPORT',
                            style: TextStyle(
                              fontFamily: VidyaFonts.mono,
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              letterSpacing: 1.5,
                              color: v.ink3,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            weakCount > 0
                                ? '$weakCount weak topics identified. Sign up to see them all.'
                                : 'Sign up to see your topic-by-topic breakdown.',
                            style: TextStyle(
                              fontFamily: VidyaFonts.ui,
                              fontSize: 14,
                              fontWeight: FontWeight.w500,
                              color: v.ink,
                              height: 1.4,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            'Plus your custom daily plan, mock tests, and '
                            'expert doubt-resolution.',
                            style: TextStyle(
                              fontFamily: VidyaFonts.ui,
                              fontSize: 12,
                              color: v.ink3,
                              height: 1.4,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const Spacer(),
                  const SizedBox(height: 16),
                  VidyaButton(
                    key: const Key('vidya.guest.result.signup'),
                    label: 'Sign up free →',
                    onPressed: () => widget.onSignUp(widget.token),
                    style: VidyaButtonStyle.primary,
                    size: VidyaButtonSize.lg,
                    fullWidth: true,
                  ),
                  const SizedBox(height: 8),
                  Center(
                    child: TextButton(
                      key: const Key('vidya.guest.result.signin'),
                      onPressed: widget.onSignIn,
                      child: const Text('I already have an account'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      }),
    );
  }

  String _thetaLabel(double scorePct) {
    // Same gentle map as the backend persist: theta = (seed-0.5)*3 capped.
    final seed = (scorePct / 100).clamp(0.0, 1.0).toDouble();
    final theta = ((seed - 0.5) * 3.0).clamp(-1.5, 1.5).toDouble();
    final sign = theta >= 0 ? '+' : '';
    return '$sign${theta.toStringAsFixed(2)}';
  }

  String _formatRank(int rank) {
    if (rank >= 1000) {
      final thousands = (rank / 1000).floor();
      final hundreds = ((rank % 1000) / 100).floor();
      return hundreds == 0 ? '${thousands}K' : '$thousands,${hundreds}00';
    }
    return '$rank';
  }
}

class _DarkChip extends StatelessWidget {
  final String text;
  const _DarkChip({required this.text});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0xFF2D3441),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        text,
        style: const TextStyle(
          fontFamily: VidyaFonts.mono,
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: Color(0xFFB5B0A4),
        ),
      ),
    );
  }
}

class _SubjectBar extends StatelessWidget {
  final TopicBreakdown topic;
  const _SubjectBar({required this.topic});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final pct = topic.total == 0 ? 0.0 : (topic.correct / topic.total);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: v.ink3.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              topic.topicId,
              style: TextStyle(
                fontFamily: VidyaFonts.ui,
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: v.ink,
              ),
            ),
          ),
          SizedBox(
            width: 120,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: pct,
                minHeight: 4,
                backgroundColor: v.ink3.withValues(alpha: 0.18),
                valueColor: AlwaysStoppedAnimation<Color>(v.accent),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Text(
            '${(pct * 100).round()}%',
            style: TextStyle(
              fontFamily: VidyaFonts.mono,
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: v.ink3,
            ),
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 4: Add export**

In `apps/mobile/lib/vidya/vidya.dart`, append:
```dart
export 'screens/vidya_guest_screening_result_screen.dart';
```

- [ ] **Step 5: Verify tests pass**

```
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && flutter test test/vidya/phase_2e_guest_funnel_test.dart
```
Expected: 3 intro + 4 result = 7 PASS.

- [ ] **Step 6: Commit**

```bash
cd /home/deepak/projects/adaptive_learning_platform && git add apps/mobile/lib/vidya/screens/vidya_guest_screening_result_screen.dart apps/mobile/lib/vidya/vidya.dart apps/mobile/test/vidya/phase_2e_guest_funnel_test.dart && git commit -m "$(cat <<'EOF'
feat(vidya): VidyaGuestScreeningResultScreen — dark hero + sign-up gate

Phase 2e. Calls reveal(token), renders a dark hero card with the
mobile-computed 0-900 readiness, percentile chip, theta chip, and a
12-week projection ('WITH VIDYA, IN 12 WEEKS ~XXX (rank ~ X,XXX)').
Below: subject mastery bars from topic_breakdown, then an UNLOCK YOUR
FULL REPORT card with the weak-topic count. CTAs: 'Sign up free →'
emits the guest token to the parent; 'I already have an account'
routes to login. Mirrors slide 5.

Projection formula is mobile-side only. Backend projection endpoint
is queued for a later phase.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add `ExamSelectMode` to `VidyaExamSelectScreen`

**Files:**
- Modify: `apps/mobile/lib/vidya/screens/vidya_exam_select_screen.dart` — add `ExamSelectMode` enum, `mode` constructor param, branch in `_submit`
- Modify: `apps/mobile/test/vidya/phase_2e_guest_funnel_test.dart` (append group)

- [ ] **Step 1: Append failing test**

Add import at the top of `apps/mobile/test/vidya/phase_2e_guest_funnel_test.dart`:
```dart
import 'package:adaptive_learning_mobile/vidya/screens/vidya_exam_select_screen.dart';
```

Append this group inside `main()`:

```dart
  group('VidyaExamSelectScreen (guest mode)', () {
    setUp(() {
      FlutterSecureStorage.setMockInitialValues({});
    });

    AuthClient _authWithExams(List<Map<String, dynamic>> exams) {
      final calls = <String>[];
      return AuthClient(
        baseUrl: 'http://test',
        httpClient: MockClient((req) async {
          calls.add('${req.method} ${req.url.path}');
          if (req.url.path.endsWith('/catalog/exams')) {
            return http.Response(
              jsonEncode(exams),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          if (req.url.path.endsWith('/profile/exams')) {
            // Recording the call lets the test assert it was/wasn't made.
            return http.Response('{}', 200);
          }
          return http.Response('{}', 404);
        }),
      );
    }

    testWidgets('guest mode: Continue writes storage + fires onContinue, no /profile/exams call',
        (tester) async {
      final profileCalls = <String>[];
      final auth = AuthClient(
        baseUrl: 'http://test',
        httpClient: MockClient((req) async {
          if (req.url.path.endsWith('/catalog/exams')) {
            return http.Response(
              jsonEncode([
                {
                  'id': 'a-neet',
                  'code': 'NEET',
                  'name': 'National Eligibility Test',
                },
              ]),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          if (req.url.path.endsWith('/profile/exams')) {
            profileCalls.add(req.url.path);
            return http.Response('{}', 200);
          }
          return http.Response('{}', 404);
        }),
      );
      var continueCalls = 0;
      await tester.pumpWidget(MaterialApp(
        theme: VidyaTheme.material(
          brightness: Brightness.light,
          persona: VidyaPersona.aspirant,
          density: VidyaDensity.regular,
        ),
        home: VidyaExamSelectScreen(
          auth: auth,
          onContinue: () => continueCalls++,
          onBack: () {},
          mode: ExamSelectMode.guest,
        ),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.text('National Eligibility Test'));
      await tester.pumpAndSettle();
      await tester.tap(find.textContaining('Continue with NEET'));
      await tester.pumpAndSettle();
      expect(continueCalls, 1);
      expect(profileCalls, isEmpty);
      const storage = FlutterSecureStorage();
      expect(await storage.read(key: 'vidya.selected_exam_code'), 'NEET');
    });

    testWidgets('authed mode (default): Continue still PUTs /profile/exams',
        (tester) async {
      final profileCalls = <String>[];
      final auth = AuthClient(
        baseUrl: 'http://test',
        httpClient: MockClient((req) async {
          if (req.url.path.endsWith('/catalog/exams')) {
            return http.Response(
              jsonEncode([
                {
                  'id': 'a-neet',
                  'code': 'NEET',
                  'name': 'National Eligibility Test',
                },
              ]),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          if (req.url.path.endsWith('/profile/exams')) {
            profileCalls.add(req.url.path);
            return http.Response('{}', 200);
          }
          return http.Response('{}', 404);
        }),
      );
      await tester.pumpWidget(MaterialApp(
        theme: VidyaTheme.material(
          brightness: Brightness.light,
          persona: VidyaPersona.aspirant,
          density: VidyaDensity.regular,
        ),
        home: VidyaExamSelectScreen(
          auth: auth,
          onContinue: () {},
          onBack: () {},
        ),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.text('National Eligibility Test'));
      await tester.pumpAndSettle();
      await tester.tap(find.textContaining('Continue with NEET'));
      await tester.pumpAndSettle();
      expect(profileCalls.length, 1);
    });
  });
```

- [ ] **Step 2: Verify tests fail**

```
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && flutter test test/vidya/phase_2e_guest_funnel_test.dart
```
Expected: FAIL — `ExamSelectMode` undefined.

- [ ] **Step 3: Add `ExamSelectMode` + branch in `_submit`**

Open `apps/mobile/lib/vidya/screens/vidya_exam_select_screen.dart`. Apply these targeted changes:

1. After the existing `_Exam` class, before `class VidyaExamSelectScreen`, add the enum:
```dart
enum ExamSelectMode { authed, guest }
```

2. In the `VidyaExamSelectScreen` constructor, add an optional `mode` field:

Replace this block:
```dart
class VidyaExamSelectScreen extends StatefulWidget {
  const VidyaExamSelectScreen({
    super.key,
    required this.auth,
    required this.onContinue,
    required this.onBack,
  });

  final AuthClient auth;
  final VoidCallback onContinue;
  final VoidCallback onBack;
```
with:
```dart
class VidyaExamSelectScreen extends StatefulWidget {
  const VidyaExamSelectScreen({
    super.key,
    required this.auth,
    required this.onContinue,
    required this.onBack,
    this.mode = ExamSelectMode.authed,
  });

  final AuthClient auth;
  final VoidCallback onContinue;
  final VoidCallback onBack;
  final ExamSelectMode mode;
```

3. In `_submit()`, branch on `widget.mode`. Replace the existing `_submit` method with:
```dart
  Future<void> _submit() async {
    if (_selectedId == null) return;
    setState(() {
      _error = null;
      _submitting = true;
    });
    try {
      if (widget.mode == ExamSelectMode.authed) {
        final res = await widget.auth.apiPut(
          '/profile/exams',
          {'examId': _selectedId},
        );
        if (res.statusCode != 200) {
          setState(() => _error = "We couldn't save your selection. Try again.");
          return;
        }
      }
      await _storage.write(key: 'vidya.selected_exam_id', value: _selectedId);
      await _storage.write(
        key: 'vidya.selected_exam_code',
        value: _selectedCode,
      );
      widget.onContinue();
    } catch (_) {
      setState(() => _error = "We couldn't save your selection. Try again.");
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
```

- [ ] **Step 4: Verify tests pass**

```
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && flutter test test/vidya/phase_2e_guest_funnel_test.dart test/vidya/phase_2a_screens_test.dart
```
Expected: All Phase 2e tests pass + all Phase 2a `VidyaExamSelectScreen` tests still pass (default authed mode preserved).

- [ ] **Step 5: Commit**

```bash
cd /home/deepak/projects/adaptive_learning_platform && git add apps/mobile/lib/vidya/screens/vidya_exam_select_screen.dart apps/mobile/test/vidya/phase_2e_guest_funnel_test.dart && git commit -m "$(cat <<'EOF'
feat(vidya): VidyaExamSelectScreen mode-aware (authed/guest)

Phase 2e. Adds ExamSelectMode enum with optional mode param defaulting
to authed. In authed mode behaviour is unchanged. In guest mode the
submit handler skips the /profile/exams PUT and goes straight to
writing vidya.selected_exam_{id,code} to storage + firing onContinue.
Enables reuse for the guest funnel before sign-up.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Wire `VidyaRootApp` state machine for guest funnel

**Files:**
- Modify: `apps/mobile/lib/vidya/vidya_root_app.dart`
- Modify: `apps/mobile/test/vidya/phase_2e_guest_funnel_test.dart` (append group)

**State machine after this task (18 states):**

```
splash → welcome → card1 → card2 → card3 → guestExamSelect → guestScreeningIntro → screeningQuiz → guestScreeningResult → register → verifyOtp → home (with guest token claimed)

card3 — onContinue used to route to register; now routes to guestExamSelect.
card1/2/3 — onSkip still routes to register (skip the screening funnel).
welcome — onSignIn still routes to login (existing).
guestScreeningResult — onSignUp(token) sets _pendingGuestToken and routes to register.
guestScreeningResult — onSignIn routes to login (user already has account).
verifyOtp — onVerified flows through _onSignedIn which claims _pendingGuestToken if present.
```

- [ ] **Step 1: Append failing test**

Append this group inside `main()` of `apps/mobile/test/vidya/phase_2e_guest_funnel_test.dart`:

```dart
  group('VidyaRootApp guest funnel routing', () {
    setUp(() {
      FlutterSecureStorage.setMockInitialValues({});
    });

    testWidgets('card3 Begin routes to guestExamSelect (not register)',
        (tester) async {
      final auth = AuthClient(
        baseUrl: 'http://test',
        httpClient: MockClient((req) async {
          if (req.url.path.endsWith('/catalog/exams')) {
            return http.Response(
              jsonEncode([
                {
                  'id': 'a-neet',
                  'code': 'NEET',
                  'name': 'National Eligibility Test',
                },
              ]),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          return http.Response('{}', 404);
        }),
      );
      await tester.pumpWidget(_RootHarness(auth: auth));
      await tester.pumpAndSettle();
      // Welcome → Get Started → card 1
      await tester.tap(find.textContaining("Get started"));
      await tester.pumpAndSettle();
      // card 1 → Continue → card 2
      await tester.tap(find.text('Continue').first);
      await tester.pumpAndSettle();
      // card 2 → Continue → card 3
      await tester.tap(find.text('Continue').first);
      await tester.pumpAndSettle();
      // card 3 → Begin → guestExamSelect
      await tester.tap(find.text('Begin').first);
      await tester.pumpAndSettle();
      // We should land on exam-select (STEP 1 / 3 eyebrow visible)
      expect(find.textContaining('STEP 1'), findsOneWidget);
      expect(find.text('Choose your exam'), findsOneWidget);
      expect(find.text('National Eligibility Test'), findsOneWidget);
    });

    testWidgets('guest funnel happy path lands on guestScreeningIntro after exam pick',
        (tester) async {
      final auth = AuthClient(
        baseUrl: 'http://test',
        httpClient: MockClient((req) async {
          if (req.url.path.endsWith('/catalog/exams')) {
            return http.Response(
              jsonEncode([
                {
                  'id': 'a-neet',
                  'code': 'NEET',
                  'name': 'National Eligibility Test',
                },
              ]),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          return http.Response('{}', 404);
        }),
      );
      await tester.pumpWidget(_RootHarness(auth: auth));
      await tester.pumpAndSettle();
      // Drive through the cards quickly
      await tester.tap(find.textContaining("Get started"));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Continue').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Continue').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Begin').first);
      await tester.pumpAndSettle();
      // Exam select → pick NEET → Continue → guest screening intro
      await tester.tap(find.text('National Eligibility Test'));
      await tester.pumpAndSettle();
      await tester.tap(find.textContaining('Continue with NEET'));
      await tester.pumpAndSettle();
      // Guest screening intro headline visible
      expect(find.text('5-MINUTE SCREENING'), findsOneWidget);
      expect(find.text('See where you stand. Before signing up.'),
          findsOneWidget);
    });

    testWidgets('guestScreeningIntro Skip routes to register',
        (tester) async {
      final auth = AuthClient(
        baseUrl: 'http://test',
        httpClient: MockClient((req) async {
          if (req.url.path.endsWith('/catalog/exams')) {
            return http.Response(
              jsonEncode([
                {
                  'id': 'a-neet',
                  'code': 'NEET',
                  'name': 'National Eligibility Test',
                },
              ]),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          return http.Response('{}', 404);
        }),
      );
      await tester.pumpWidget(_RootHarness(auth: auth));
      await tester.pumpAndSettle();
      await tester.tap(find.textContaining("Get started"));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Continue').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Continue').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Begin').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('National Eligibility Test'));
      await tester.pumpAndSettle();
      await tester.tap(find.textContaining('Continue with NEET'));
      await tester.pumpAndSettle();
      // Now on guest screening intro — tap Skip
      await tester.tap(find.byKey(const Key('vidya.guest.intro.skip')));
      await tester.pumpAndSettle();
      // Register screen — heuristic check: the register submit button
      // bears the existing 'Create account' label.
      expect(find.textContaining('Create account'), findsOneWidget);
    });
  });
}

class _RootHarness extends StatelessWidget {
  final AuthClient auth;
  const _RootHarness({required this.auth});

  @override
  Widget build(BuildContext context) {
    return VidyaRootApp(auth: auth);
  }
}
```

Also at the top of the file (with other imports), add:
```dart
import 'package:adaptive_learning_mobile/vidya/vidya_root_app.dart';
```

- [ ] **Step 2: Verify tests fail**

```
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && flutter test test/vidya/phase_2e_guest_funnel_test.dart
```
Expected: FAIL — the card3 → guestExamSelect routing doesn't exist yet (currently goes to register).

- [ ] **Step 3: Extend `VidyaRootApp`**

Open `apps/mobile/lib/vidya/vidya_root_app.dart`. Apply these targeted changes:

1. **Add imports** at the top, after the existing screen imports:
```dart
import 'screens/vidya_guest_screening_intro_screen.dart';
import 'screens/vidya_guest_screening_result_screen.dart';
```

2. **Extend the `_VidyaScreen` enum** — add 3 cases between `screeningResult` (or `home` if no `screeningResult` yet — currently it does exist from Phase 2c) and `home`. The current enum after Phase 2c is:
```
splash, welcome, card1, card2, card3, login, register, verifyOtp,
forgotPassword, newPassword, examSelect, screeningIntro,
screeningQuiz, screeningResult, home
```

Add 3 new cases AFTER `screeningResult` and BEFORE `home`:
```dart
enum _VidyaScreen {
  splash,
  welcome,
  card1, card2, card3,
  login, register, verifyOtp, forgotPassword, newPassword,
  examSelect,
  screeningIntro,
  screeningQuiz,
  screeningResult,
  guestExamSelect,
  guestScreeningIntro,
  guestScreeningResult,
  home,
}
```

3. **Add state fields** in `_VidyaRootAppState` (alongside `_screeningToken`, `_selectedExamCode`):
```dart
  String? _pendingGuestToken;
  String? _pendingGuestExamCode;
```

4. **Re-route `card3.onContinue`** in `_currentScreen()`. Currently:
```dart
      case _VidyaScreen.card3:
        return VidyaOnboardingCardScreen(
          cardIndex: 3,
          onContinue: () => setState(() => _screen = _VidyaScreen.register),
          onSkip: () => setState(() => _screen = _VidyaScreen.register),
          onBack: () => setState(() => _screen = _VidyaScreen.card2),
        );
```
Change to:
```dart
      case _VidyaScreen.card3:
        return VidyaOnboardingCardScreen(
          cardIndex: 3,
          onContinue: () => setState(() => _screen = _VidyaScreen.guestExamSelect),
          onSkip: () => setState(() => _screen = _VidyaScreen.register),
          onBack: () => setState(() => _screen = _VidyaScreen.card2),
        );
```

5. **Add 3 new case branches** in `_currentScreen()` immediately before `case _VidyaScreen.home:`. They reuse `VidyaExamSelectScreen` in guest mode + the two new screens + the existing `VidyaScreeningQuizScreen` for the actual quiz:

```dart
      case _VidyaScreen.guestExamSelect:
        return VidyaExamSelectScreen(
          auth: widget.auth,
          mode: ExamSelectMode.guest,
          onContinue: () async {
            final code = await _storage.read(key: 'vidya.selected_exam_code');
            if (!mounted) return;
            setState(() {
              _pendingGuestExamCode = code;
              _screen = _VidyaScreen.guestScreeningIntro;
            });
          },
          onBack: () => setState(() => _screen = _VidyaScreen.card3),
        );
      case _VidyaScreen.guestScreeningIntro:
        return VidyaGuestScreeningIntroScreen(
          onStart: () => setState(() => _screen = _VidyaScreen.screeningQuiz),
          onSkip: () => setState(() => _screen = _VidyaScreen.register),
        );
      case _VidyaScreen.guestScreeningResult:
        return VidyaGuestScreeningResultScreen(
          client: _screeningClient,
          token: _pendingGuestToken ?? '',
          onSignUp: (token) {
            setState(() {
              _pendingGuestToken = token;
              _screen = _VidyaScreen.register;
            });
          },
          onSignIn: () => setState(() => _screen = _VidyaScreen.login),
        );
```

6. **Reuse `screeningQuiz` for the guest path**. The existing case is:
```dart
      case _VidyaScreen.screeningQuiz:
        return VidyaScreeningQuizScreen(
          client: _screeningClient,
          examCode: _selectedExamCode ?? 'JEE-MAIN',
          onCompleted: (token) => setState(() {
            _screeningToken = token;
            _screen = _VidyaScreen.screeningResult;
          }),
          onBack: () async {
            await _storage.write(key: _screeningSkippedKey, value: 'true');
            if (mounted) setState(() => _screen = _VidyaScreen.home);
          },
        );
```

Replace with a version that branches on whether we're in the guest funnel (`_pendingGuestExamCode != null` indicates guest flow) vs the authed flow:
```dart
      case _VidyaScreen.screeningQuiz:
        final isGuest = _pendingGuestExamCode != null;
        return VidyaScreeningQuizScreen(
          client: _screeningClient,
          examCode: isGuest
              ? _pendingGuestExamCode!
              : (_selectedExamCode ?? 'JEE-MAIN'),
          onCompleted: (token) => setState(() {
            if (isGuest) {
              _pendingGuestToken = token;
              _screen = _VidyaScreen.guestScreeningResult;
            } else {
              _screeningToken = token;
              _screen = _VidyaScreen.screeningResult;
            }
          }),
          onBack: () async {
            if (isGuest) {
              if (mounted) setState(() => _screen = _VidyaScreen.register);
            } else {
              await _storage.write(key: _screeningSkippedKey, value: 'true');
              if (mounted) setState(() => _screen = _VidyaScreen.home);
            }
          },
        );
```

7. **Extend `_onSignedIn`** to claim the guest token when present. Current:
```dart
  void _onSignedIn(Session session) {
    _markOnboardingDone();
    if (mounted) {
      setState(() {
        _screen = session.user.onboardingState == 'ONBOARDED'
            ? _VidyaScreen.home
            : _VidyaScreen.examSelect;
      });
    }
  }
```

Replace with:
```dart
  Future<void> _onSignedIn(Session session) async {
    _markOnboardingDone();
    final token = _pendingGuestToken;
    if (token != null) {
      // Best-effort claim — if persist or diagnostic-complete fails we
      // still route to home; the user can re-take the diagnostic later.
      try {
        await _screeningClient.persist(token);
        await _screeningClient.diagnosticComplete();
        await _storage.write(key: _screeningDoneKey, value: 'true');
      } catch (_) {
        // Swallow — the new user is signed in either way.
      }
      _pendingGuestToken = null;
      _pendingGuestExamCode = null;
      if (mounted) setState(() => _screen = _VidyaScreen.home);
      return;
    }
    if (mounted) {
      setState(() {
        _screen = session.user.onboardingState == 'ONBOARDED'
            ? _VidyaScreen.home
            : _VidyaScreen.examSelect;
      });
    }
  }
```

Make sure the `_onSignedIn` callers compile — `VidyaLoginScreen` calls `onLoggedIn: _onSignedIn` and `VidyaVerifyScreen` calls `onVerified: _onSignedIn`. Both pass `Session session` synchronously; converting `_onSignedIn` to `async`/returning `Future<void>` is compatible with `void Function(Session)` since the callers only invoke it and don't await the result.

- [ ] **Step 4: Verify tests pass**

```
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && flutter test test/vidya/
```
Expected: all Vidya tests pass — the 3 new guest-funnel routing tests + all prior tests.

If existing tests fail, investigate — the only intentional behaviour change is `card3.onContinue` routing and `_onSignedIn` becoming async. No prior Vidya test exercises `card3.onContinue → register` directly (Phase 2a tests check `Continue fires onContinue` callback only), but verify.

- [ ] **Step 5: Commit**

```bash
cd /home/deepak/projects/adaptive_learning_platform && git add apps/mobile/lib/vidya/vidya_root_app.dart apps/mobile/test/vidya/phase_2e_guest_funnel_test.dart && git commit -m "$(cat <<'EOF'
feat(vidya): wire guest screening funnel into VidyaRootApp (18-state machine)

Phase 2e. card3 Begin now routes to guestExamSelect (was register).
guestExamSelect uses VidyaExamSelectScreen in guest mode (no
/profile/exams PUT). guestScreeningIntro is the new pre-quiz framing;
its Skip routes to register. The existing screeningQuiz is reused —
the quiz screen branches on whether _pendingGuestExamCode is set
to decide whether to surface the result as the guest dark-hero card
or the authed lighter one.

After register → verify → _onSignedIn, if _pendingGuestToken is set we
call persist + diagnostic-complete (best-effort) to associate the
anonymous attempt with the new user, then route to home. Backend
needed no changes — POST /screening/{token}/persist already accepts
any authenticated principal.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Verification gate

Verification-only — no code changes.

- [ ] **Step 1: Run analyze + tests**

```
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && flutter analyze 2>&1 | grep -v "info •" | tail -10
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && flutter test 2>&1 | tail -5
```
Expected: 0 new errors/warnings. Test count ~370 (360 prior + ~10 new Phase 2e tests).

- [ ] **Step 2: Build APK**

```
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && flutter build apk --debug
```
Expected: `✓ Built build/app/outputs/flutter-apk/app-debug.apk`.

- [ ] **Step 3: Manual device smoke**

Install on a device on the same network as 10.11.5.166:
```bash
adb install -r apps/mobile/build/app/outputs/flutter-apk/app-debug.apk
```

Walk this checklist on a freshly-installed device (wipe data first):

1. Welcome → "Get started — it's free" → Card 1 (sigmoid) → Continue → Card 2 (radial) → Continue → Card 3 (allocation) → **Begin**.
2. **guestExamSelect** renders with STEP 1/3 eyebrow + the exam list. Pick NEET → tap **Continue with NEET →**.
3. **guestScreeningIntro** renders with "5-MINUTE SCREENING" + "See where you stand. Before signing up." + 4 info rows + "Start screening" + "Skip — sign up first".
4. Tap **Start screening** → screening quiz (Phase 2c surface) loads → cycle through all 15 questions.
5. After the last answer, the **guestScreeningResult** dark hero card renders with the readiness number, percentile chip, θ chip, projection line, subject bars, and the UNLOCK YOUR FULL REPORT gate.
6. Tap **Sign up free →** → land on register. Complete register + verify OTP → **MainScaffold renders** (no further screening prompt).
7. Sign out → sign back in → still goes to MainScaffold (the `vidya.screening_done` flag was set by the claim path).
8. Wipe data, walk to guestScreeningIntro again → tap **Skip — sign up first** → land on register (skip the screening entirely).
9. Wipe data, complete guest screening → on result screen tap **I already have an account** → land on login.
10. Test the 503 path: pick an exam with < 4 published questions (use a test exam if available) → 503 banner + Skip on quiz screen → tap Skip → land on register (since `onBack` in guest mode routes to register, not home).

Record pass/fail next to each. Any failure is a regression.

- [ ] **Step 4: Optional commit**

If any final tweak is needed after manual smoke, ship it as a follow-up commit. Otherwise no commit at this step.

Then invoke the finishing-a-development-branch skill if Phase 2e is the last phase in this dev cycle.

---

## Self-Review Notes

**Spec coverage** (Phase 2e section of the roadmap):

- New state machine routes (welcome → card1/2/3 → guestExamSelect → guestScreeningIntro → screeningQuiz → guestScreeningResult → register → verifyOtp → claim → home) → Task 4 ✓
- VidyaGuestExamSelectScreen — replaced by Task 3 (mode-aware reuse instead of a new screen) — design preference noted in plan ✓
- VidyaGuestScreeningIntroScreen — Task 1 ✓
- Reuse VidyaScreeningQuizScreen — Task 4 wires it for both flows ✓
- VidyaGuestScreeningResultScreen with dark hero + sign-up gate — Task 2 ✓
- Backend guest-token claim — Task 4's `_onSignedIn` calls existing persist + diagnostic-complete; backend already supports it (no backend tasks) ✓
- "I already have an account" CTA on the result — Task 2's button + Task 4's route to login ✓

**Type consistency:**
- `ScreeningClient` methods used in Task 2 + 4 match Phase 2c signatures (`reveal(token)`, `persist(token)`, `diagnosticComplete()`).
- `ExamSelectMode { authed, guest }` defined in Task 3 and referenced in Task 4.
- `_pendingGuestToken` and `_pendingGuestExamCode` field names consistent across Task 4's state and `_onSignedIn` consumer.
- `VidyaGuestScreeningResultScreen({client, token, onSignUp(String), onSignIn})` signature matches between Task 2 definition and Task 4 usage.

**Potential gotchas:**
- `_onSignedIn` becoming `async` while callers expect `void Function(Session)`: Dart allows this — `async` functions returning `Future<void>` can be assigned to a `void Function(...)` slot. Callers fire-and-forget.
- The `_pendingGuestExamCode != null` heuristic in Task 4 step 6 distinguishes guest vs authed flow. If a returning authed user somehow re-enters the funnel (e.g., from a deep-link to a screening URL — not currently supported), the heuristic could mis-route. Acceptable for Phase 2e since there's no such re-entry path.
- Guest screening attempts that the user abandons (no sign-up) live in the in-memory `_store` until expiry. No cleanup needed — `_store` already expires anonymous sessions.
- The Phase 2c authed result screen and Phase 2e guest result screen exist side-by-side. They are reached via different state-machine paths and never overlap.

**Deferred:**
- Backend-computed projection / rank — current mobile formula is a placeholder.
- Re-take diagnostic later — no in-app re-entry point post-skip / post-sign-up. Same as Phase 2c.
- Hindi copy on the new guest screens — English only.
