# Vidya Flutter Phase 2b Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the 5 Vidya auth screens (login, register, verify, forgot-password, new-password), wire them into `VidyaRootApp`'s state machine so users can authenticate without ever touching Aurora's auth surface, parse the existing `alp://reset?token=…` deep link, and delete the now-orphaned Aurora `_Splash` widget.

**Architecture:** `VidyaRootApp`'s state machine grows from 7 to **13 states**. New auth states (login, register, verifyOtp, forgotPassword, resetPassword, home) sit alongside the existing onboarding states. `_AuthSession` (a value class wrapping `Session?` + optional pending OTP context) is held in the state. On successful auth, the machine transitions to `home`, which renders `AuroraRoute(builder: (_) => MainScaffold(auth: ..., onSignOut: ...))` — bypassing `AuroraGuestFlow` entirely for the auth path while still using Aurora's main app shell. Deep-link handling reuses `apps/mobile/lib/auth/deep_link.dart` (the parser is already extracted).

**Tech Stack:** Flutter 3.x, `AuthClient` (existing), `flutter_secure_storage` (existing), Vidya primitives from Phase 1 + 2a.

**Spec source:** `docs/superpowers/specs/2026-05-18-vidya-flutter-phase-2a-design.md` lines 378–383 (table of deferred 2b items).

---

## Spec gap: OTP-login (passwordless)

The 2a design spec lists 6 screens including "OTP" but `AuthClient` only exposes `verifyOtp(userId, code, channel)` for **post-register** verification. There's no `requestLoginOtp(email)` / `loginWithOtp(...)` pair. **OTP-login as a standalone passwordless flow is deferred to a future phase** that adds the backend endpoints + `AuthClient` methods. The post-register email OTP is still shipped (Task 3 below — `VidyaVerifyScreen`).

If you want OTP-login in 2b, stop here, define the backend contract, then revise this plan.

---

## File Map

**Create (5 screens + 5 test groups + 1 wiring file):**
- `apps/mobile/lib/vidya/screens/vidya_login_screen.dart`
- `apps/mobile/lib/vidya/screens/vidya_register_screen.dart`
- `apps/mobile/lib/vidya/screens/vidya_verify_screen.dart`
- `apps/mobile/lib/vidya/screens/vidya_forgot_password_screen.dart`
- `apps/mobile/lib/vidya/screens/vidya_new_password_screen.dart`
- `apps/mobile/test/vidya/phase_2b_auth_screens_test.dart` — all 5 screens, harness shared, ~5 groups

**Modify:**
- `apps/mobile/lib/vidya/vidya_root_app.dart` — extend state machine (+6 states, auth handoff, deep-link entry, Session ownership, sign-out reset)
- `apps/mobile/lib/vidya/vidya.dart` — add 5 exports
- `apps/mobile/lib/main.dart` — pass `initialDeepLink` through to `VidyaRootApp`, **DELETE** `_Splash` + `AdaptiveLearningAppLegacy` classes (~120 LOC removal)
- `apps/mobile/test/vidya/vidya_root_app_test.dart` — extend with auth-state transitions
- `apps/mobile/test/widget_test.dart` — adjust/delete the `AdaptiveLearningAppLegacy` smoke test (line 29) since the class is deleted

**File responsibilities:**

| File | Responsibility | Approx. LOC |
|---|---|---|
| `vidya_login_screen.dart` | Email + password form; remember-me; "forgot?" + "sign up" affordances; calls `auth.login`; surfaces 401/423/429 errors via Vidya banner | ~240 |
| `vidya_register_screen.dart` | First/last/email/phone(optional)/password form with strength meter (4-bar like Aurora); ToS checkbox; calls `auth.register`; hands `(userId, otpChannel, email)` to verify | ~280 |
| `vidya_verify_screen.dart` | 6-cell OTP entry; channel-aware messaging ("check your email" vs "check your phone"); resend affordance; calls `auth.verifyOtp` | ~220 |
| `vidya_forgot_password_screen.dart` | Single email field; enumeration-safe confirmation screen on submit (server returns 204 regardless); calls `auth.forgotPassword` | ~160 |
| `vidya_new_password_screen.dart` | New + confirm password fields with strength meter; consumes deep-link token; calls `auth.resetPassword` | ~200 |
| `vidya_root_app.dart` (extended) | +6 states + Session state + deep-link entry + auth handoff to `home` (renders `AuroraRoute` → `MainScaffold`) | +180 (net) |

---

## Existing Vidya primitives (confirmed via Phase 2a discovery)

Use these from `packages/design-tokens-flutter`:
- `VidyaScaffold(appBar:, body:)`, `VidyaAppBar(title:, leading:, actions:)`
- `VidyaButton(label:, onPressed:, disabled:, size:, style:)` — sizes `sm/md/lg`, styles `primary/ghost`
- `VidyaCard(child:, onTap?:, tone?:)` — tones `defaultTone/accent`
- `VidyaBanner(tone:, message:, leadingIcon?:)` — tones `warn/info/success`
- `VidyaTextField(label:, controller:, keyboardType?:, obscureText?:, errorText?:)` — Phase 1 primitive
- `VidyaThemeData.of(context)` — non-nullable; properties `ink`, `ink3` (muted), `accent`, `paper`
- `VidyaFonts.display` (serif), `VidyaFonts.ui` (sans), `VidyaFonts.mono`

**If `VidyaTextField` doesn't exist** with the assumed API (verify via `ls packages/design-tokens-flutter/lib/src/vidya/widgets/`), fall back to Material's `TextFormField` styled with Vidya theme tokens — same as Aurora's auth screens do. Match what exists; do not add new primitives in 2b.

---

## Task 1: `VidyaLoginScreen`

**Files:**
- Create: `apps/mobile/lib/vidya/screens/vidya_login_screen.dart`
- Create: `apps/mobile/test/vidya/phase_2b_auth_screens_test.dart` (new test file, shared `_harness` like 2a)
- Modify: `apps/mobile/lib/vidya/vidya.dart` (add export)

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/test/vidya/phase_2b_auth_screens_test.dart`:

```dart
import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_login_screen.dart';

Widget _harness({
  required Widget child,
  Brightness brightness = Brightness.light,
  VidyaPersona persona = VidyaPersona.aspirant,
  VidyaDensity density = VidyaDensity.regular,
}) {
  return MaterialApp(
    theme: VidyaTheme.material(
      brightness: brightness,
      persona: persona,
      density: density,
    ),
    home: child,
  );
}

AuthClient _authWith({
  required MockClientHandler handler,
}) =>
    AuthClient(baseUrl: 'http://test', httpClient: MockClient(handler));

void main() {
  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
  });

  group('VidyaLoginScreen', () {
    testWidgets('renders email + password fields + submit', (tester) async {
      final auth = _authWith(handler: (req) async => http.Response('{}', 404));
      await tester.pumpWidget(_harness(
        child: VidyaLoginScreen(
          auth: auth,
          onLoggedIn: (_) {},
          onSignUp: () {},
          onForgotPassword: () {},
        ),
      ));
      expect(find.byKey(const Key('vidya.login.email')), findsOneWidget);
      expect(find.byKey(const Key('vidya.login.password')), findsOneWidget);
      expect(find.byKey(const Key('vidya.login.submit')), findsOneWidget);
    });

    testWidgets('empty submit shows validation', (tester) async {
      final auth = _authWith(handler: (req) async => http.Response('{}', 200));
      await tester.pumpWidget(_harness(
        child: VidyaLoginScreen(
          auth: auth,
          onLoggedIn: (_) {},
          onSignUp: () {},
          onForgotPassword: () {},
        ),
      ));
      await tester.tap(find.byKey(const Key('vidya.login.submit')));
      await tester.pump();
      expect(find.text('Enter your email'), findsOneWidget);
      expect(find.text('Enter your password'), findsOneWidget);
    });

    testWidgets('success calls onLoggedIn with session', (tester) async {
      final auth = _authWith(handler: (req) async {
        if (req.url.path.endsWith('/auth/login')) {
          return http.Response(
            '{"user":{"id":"u1","email":"a@b.com","firstName":"A","lastName":"B","role":"STUDENT","onboardingState":"ONBOARDED"},'
            '"tokens":{"accessToken":"at","refreshToken":"rt","expiresAt":1000}}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('{}', 404);
      });
      Session? captured;
      await tester.pumpWidget(_harness(
        child: VidyaLoginScreen(
          auth: auth,
          onLoggedIn: (s) => captured = s,
          onSignUp: () {},
          onForgotPassword: () {},
        ),
      ));
      await tester.enterText(find.byKey(const Key('vidya.login.email')), 'a@b.com');
      await tester.enterText(find.byKey(const Key('vidya.login.password')), 'SuperSecret123!');
      await tester.tap(find.byKey(const Key('vidya.login.submit')));
      await tester.pumpAndSettle();
      expect(captured, isNotNull);
      expect(captured!.user.firstName, 'A');
    });

    testWidgets('401 surfaces invalid-credentials banner', (tester) async {
      final auth = _authWith(handler: (req) async => http.Response(
            '{"detail":{"code":"invalid_credentials","message":"Wrong email or password."}}',
            401,
            headers: {'content-type': 'application/json'},
          ));
      await tester.pumpWidget(_harness(
        child: VidyaLoginScreen(
          auth: auth,
          onLoggedIn: (_) {},
          onSignUp: () {},
          onForgotPassword: () {},
        ),
      ));
      await tester.enterText(find.byKey(const Key('vidya.login.email')), 'a@b.com');
      await tester.enterText(find.byKey(const Key('vidya.login.password')), 'wrong');
      await tester.tap(find.byKey(const Key('vidya.login.submit')));
      await tester.pumpAndSettle();
      expect(find.textContaining('Wrong email or password'), findsOneWidget);
    });

    testWidgets('Forgot link fires onForgotPassword', (tester) async {
      final auth = _authWith(handler: (req) async => http.Response('{}', 404));
      var taps = 0;
      await tester.pumpWidget(_harness(
        child: VidyaLoginScreen(
          auth: auth,
          onLoggedIn: (_) {},
          onSignUp: () {},
          onForgotPassword: () => taps++,
        ),
      ));
      await tester.tap(find.text('Forgot password?'));
      await tester.pumpAndSettle();
      expect(taps, 1);
    });

    testWidgets('Sign up link fires onSignUp', (tester) async {
      final auth = _authWith(handler: (req) async => http.Response('{}', 404));
      var taps = 0;
      await tester.pumpWidget(_harness(
        child: VidyaLoginScreen(
          auth: auth,
          onLoggedIn: (_) {},
          onSignUp: () => taps++,
          onForgotPassword: () {},
        ),
      ));
      await tester.tap(find.text("Don't have an account? Sign up"));
      await tester.pumpAndSettle();
      expect(taps, 1);
    });
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && flutter test test/vidya/phase_2b_auth_screens_test.dart`
Expected: FAIL — `vidya_login_screen.dart` does not exist.

- [ ] **Step 3: Implement `VidyaLoginScreen`**

Create `apps/mobile/lib/vidya/screens/vidya_login_screen.dart`:

```dart
// VidyaLoginScreen — email + password sign-in.
// Mirrors Aurora's login_screen.dart endpoint contract (POST /auth/login)
// but renders in the Vidya idiom. Error surfaces:
// - 401 → "Wrong email or password" (use AuthException.message)
// - 423 → "Account locked — try again later"
// - 429 → "Too many attempts — wait a minute and retry"
// - other → AuthException.message or a generic fallback.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../auth/auth_client.dart';

class VidyaLoginScreen extends StatefulWidget {
  final AuthClient auth;
  final void Function(Session session) onLoggedIn;
  final VoidCallback onSignUp;
  final VoidCallback onForgotPassword;

  const VidyaLoginScreen({
    super.key,
    required this.auth,
    required this.onLoggedIn,
    required this.onSignUp,
    required this.onForgotPassword,
  });

  @override
  State<VidyaLoginScreen> createState() => _VidyaLoginScreenState();
}

class _VidyaLoginScreenState extends State<VidyaLoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _remember = false;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _error = null;
      _submitting = true;
    });
    try {
      final session = await widget.auth.login(
        email: _email.text.trim(),
        password: _password.text,
        remember: _remember,
      );
      widget.onLoggedIn(session);
    } on AuthException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = "We couldn't reach the server. Check your connection.");
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = VidyaThemeData.of(context);
    final ink = theme.ink;
    final muted = theme.ink3;

    return VidyaScaffold(
      appBar: VidyaAppBar(title: ''),
      body: LayoutBuilder(builder: (ctx, constraints) {
        return SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: IntrinsicHeight(
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SizedBox(height: 24),
                    Text(
                      'Welcome back',
                      style: TextStyle(
                        fontFamily: VidyaFonts.display,
                        fontSize: 32,
                        fontWeight: FontWeight.w500,
                        color: ink,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Sign in to continue.',
                      style: TextStyle(
                        fontFamily: VidyaFonts.ui,
                        fontSize: 14,
                        color: muted,
                      ),
                    ),
                    const SizedBox(height: 24),
                    if (_error != null) ...[
                      VidyaBanner(tone: VidyaBannerTone.warn, message: _error!),
                      const SizedBox(height: 12),
                    ],
                    TextFormField(
                      key: const Key('vidya.login.email'),
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.email],
                      decoration: const InputDecoration(labelText: 'Email'),
                      validator: (v) {
                        if (v == null || v.isEmpty) return 'Enter your email';
                        if (!v.contains('@')) return 'Enter a valid email';
                        return null;
                      },
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      key: const Key('vidya.login.password'),
                      controller: _password,
                      obscureText: true,
                      autofillHints: const [AutofillHints.password],
                      decoration: const InputDecoration(labelText: 'Password'),
                      validator: (v) =>
                          (v == null || v.isEmpty) ? 'Enter your password' : null,
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Checkbox(
                          value: _remember,
                          onChanged: (v) => setState(() => _remember = v ?? false),
                        ),
                        Text(
                          'Keep me signed in',
                          style: TextStyle(
                            fontFamily: VidyaFonts.ui,
                            fontSize: 13,
                            color: muted,
                          ),
                        ),
                        const Spacer(),
                        TextButton(
                          onPressed: _submitting ? null : widget.onForgotPassword,
                          child: const Text('Forgot password?'),
                        ),
                      ],
                    ),
                    const Spacer(),
                    VidyaButton(
                      key: const Key('vidya.login.submit'),
                      label: _submitting ? 'Signing in…' : 'Sign in',
                      onPressed: _submitting ? null : _submit,
                      disabled: _submitting,
                      size: VidyaButtonSize.lg,
                    ),
                    const SizedBox(height: 12),
                    Center(
                      child: TextButton(
                        onPressed: _submitting ? null : widget.onSignUp,
                        child: const Text("Don't have an account? Sign up"),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      }),
    );
  }
}
```

- [ ] **Step 4: Add export to barrel**

In `apps/mobile/lib/vidya/vidya.dart`, add:
```dart
export 'screens/vidya_login_screen.dart';
```

- [ ] **Step 5: Run tests; verify pass + analyze**

Run: `cd apps/mobile && flutter test test/vidya/phase_2b_auth_screens_test.dart`
Expected: PASS — 6 login tests.

Run: `cd apps/mobile && flutter analyze 2>&1 | tail -5`
Expected: no new issues in the new files.

- [ ] **Step 6: Commit**

```bash
cd /home/deepak/projects/adaptive_learning_platform && git add apps/mobile/lib/vidya/screens/vidya_login_screen.dart apps/mobile/lib/vidya/vidya.dart apps/mobile/test/vidya/phase_2b_auth_screens_test.dart && git commit -m "$(cat <<'EOF'
feat(vidya): VidyaLoginScreen — email + password sign-in

Mirrors Aurora's POST /auth/login contract; surfaces 401/423/429 via
VidyaBanner. Forgot + Sign-up affordances; remember-me checkbox.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `VidyaRegisterScreen`

**Files:**
- Create: `apps/mobile/lib/vidya/screens/vidya_register_screen.dart`
- Modify: `apps/mobile/test/vidya/phase_2b_auth_screens_test.dart` (append group)
- Modify: `apps/mobile/lib/vidya/vidya.dart` (add export)

- [ ] **Step 1: Append failing test**

Add import to the test file:
```dart
import 'package:adaptive_learning_mobile/vidya/screens/vidya_register_screen.dart';
```

Append this group inside `main()`:

```dart
  group('VidyaRegisterScreen', () {
    testWidgets('renders all required fields + ToS checkbox', (tester) async {
      final auth = AuthClient(
        baseUrl: 'http://test',
        httpClient: MockClient((_) async => http.Response('{}', 404)),
      );
      await tester.pumpWidget(_harness(
        child: VidyaRegisterScreen(
          auth: auth,
          onRegistered: (_, __) {},
          onBackToLogin: () {},
        ),
      ));
      expect(find.byKey(const Key('vidya.register.firstName')), findsOneWidget);
      expect(find.byKey(const Key('vidya.register.lastName')), findsOneWidget);
      expect(find.byKey(const Key('vidya.register.email')), findsOneWidget);
      expect(find.byKey(const Key('vidya.register.password')), findsOneWidget);
      expect(find.byType(Checkbox), findsOneWidget);
      expect(find.byKey(const Key('vidya.register.submit')), findsOneWidget);
    });

    testWidgets('success hands (RegisterResult, email) to onRegistered',
        (tester) async {
      final auth = AuthClient(
        baseUrl: 'http://test',
        httpClient: MockClient((req) async {
          if (req.url.path.endsWith('/auth/register')) {
            return http.Response(
              '{"userId":"u-9","otpChannel":"email"}',
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          return http.Response('{}', 404);
        }),
      );
      RegisterResult? captured;
      String? capturedEmail;
      await tester.pumpWidget(_harness(
        child: VidyaRegisterScreen(
          auth: auth,
          onRegistered: (r, e) {
            captured = r;
            capturedEmail = e;
          },
          onBackToLogin: () {},
        ),
      ));
      await tester.enterText(find.byKey(const Key('vidya.register.firstName')), 'Rahul');
      await tester.enterText(find.byKey(const Key('vidya.register.lastName')), 'Sharma');
      await tester.enterText(find.byKey(const Key('vidya.register.email')), 'r@example.com');
      await tester.enterText(find.byKey(const Key('vidya.register.password')), 'SuperSecret123!');
      await tester.tap(find.byType(Checkbox));
      await tester.pump();
      await tester.tap(find.byKey(const Key('vidya.register.submit')));
      await tester.pumpAndSettle();
      expect(captured?.userId, 'u-9');
      expect(captured?.otpChannel, 'email');
      expect(capturedEmail, 'r@example.com');
    });

    testWidgets('409 surfaces "already registered" message', (tester) async {
      final auth = AuthClient(
        baseUrl: 'http://test',
        httpClient: MockClient((_) async => http.Response(
              '{"detail":{"code":"email_taken","message":"Email is already registered"}}',
              409,
              headers: {'content-type': 'application/json'},
            )),
      );
      await tester.pumpWidget(_harness(
        child: VidyaRegisterScreen(
          auth: auth,
          onRegistered: (_, __) {},
          onBackToLogin: () {},
        ),
      ));
      await tester.enterText(find.byKey(const Key('vidya.register.firstName')), 'R');
      await tester.enterText(find.byKey(const Key('vidya.register.lastName')), 'S');
      await tester.enterText(find.byKey(const Key('vidya.register.email')), 'r@example.com');
      await tester.enterText(find.byKey(const Key('vidya.register.password')), 'SuperSecret123!');
      await tester.tap(find.byType(Checkbox));
      await tester.pump();
      await tester.tap(find.byKey(const Key('vidya.register.submit')));
      await tester.pumpAndSettle();
      expect(find.textContaining('already registered'), findsOneWidget);
    });

    testWidgets('blocks submit when ToS unchecked', (tester) async {
      final auth = AuthClient(
        baseUrl: 'http://test',
        httpClient: MockClient((_) async => http.Response('{}', 404)),
      );
      var called = 0;
      await tester.pumpWidget(_harness(
        child: VidyaRegisterScreen(
          auth: auth,
          onRegistered: (_, __) => called++,
          onBackToLogin: () {},
        ),
      ));
      await tester.enterText(find.byKey(const Key('vidya.register.firstName')), 'R');
      await tester.enterText(find.byKey(const Key('vidya.register.lastName')), 'S');
      await tester.enterText(find.byKey(const Key('vidya.register.email')), 'r@example.com');
      await tester.enterText(find.byKey(const Key('vidya.register.password')), 'SuperSecret123!');
      // ToS NOT checked
      await tester.tap(find.byKey(const Key('vidya.register.submit')));
      await tester.pumpAndSettle();
      expect(called, 0);
      expect(find.textContaining('accept the Terms'), findsOneWidget);
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && flutter test test/vidya/phase_2b_auth_screens_test.dart`
Expected: FAIL — `vidya_register_screen.dart` not found.

- [ ] **Step 3: Implement `VidyaRegisterScreen`**

Create `apps/mobile/lib/vidya/screens/vidya_register_screen.dart`. Use this structure:

```dart
// VidyaRegisterScreen — create account.
// Mirrors Aurora's POST /auth/register; on success hands the
// (RegisterResult, email) tuple to the caller, which routes to
// VidyaVerifyScreen for OTP entry.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../auth/auth_client.dart';

class VidyaRegisterScreen extends StatefulWidget {
  final AuthClient auth;
  final void Function(RegisterResult result, String email) onRegistered;
  final VoidCallback onBackToLogin;

  const VidyaRegisterScreen({
    super.key,
    required this.auth,
    required this.onRegistered,
    required this.onBackToLogin,
  });

  @override
  State<VidyaRegisterScreen> createState() => _VidyaRegisterScreenState();
}

class _VidyaRegisterScreenState extends State<VidyaRegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _firstName = TextEditingController();
  final _lastName = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _password = TextEditingController();
  bool _tos = false;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _password.addListener(() { if (mounted) setState(() {}); });
  }

  @override
  void dispose() {
    _firstName.dispose();
    _lastName.dispose();
    _email.dispose();
    _phone.dispose();
    _password.dispose();
    super.dispose();
  }

  int _strengthScore(String pw) {
    int s = 0;
    if (pw.length >= 12) s++;
    if (pw.length >= 16) s++;
    if (RegExp(r'[a-z]').hasMatch(pw) && RegExp(r'[A-Z]').hasMatch(pw)) s++;
    if (RegExp(r'\d').hasMatch(pw) && RegExp(r'[^A-Za-z0-9]').hasMatch(pw)) s++;
    return s.clamp(0, 4);
  }

  String _strengthLabel(int s) =>
      s <= 1 ? 'Weak' : s == 2 ? 'OK' : s == 3 ? 'Strong' : 'Excellent';

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    if (!_tos) {
      setState(() => _error = 'Please accept the Terms to continue.');
      return;
    }
    setState(() {
      _error = null;
      _submitting = true;
    });
    try {
      final result = await widget.auth.register(
        firstName: _firstName.text.trim(),
        lastName: _lastName.text.trim(),
        email: _email.text.trim(),
        password: _password.text,
        phone: _phone.text.trim(),
      );
      widget.onRegistered(result, _email.text.trim());
    } on AuthException catch (e) {
      setState(() {
        if (e.statusCode == 409) {
          _error = 'Email is already registered. Try logging in instead.';
        } else if (e.statusCode == 429) {
          _error = 'Too many sign-up attempts. Please wait a moment.';
        } else {
          _error = e.message;
        }
      });
    } catch (_) {
      setState(() => _error = "We couldn't reach the server. Check your connection.");
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = VidyaThemeData.of(context);
    final ink = theme.ink;
    final muted = theme.ink3;
    final accent = theme.accent;
    final score = _strengthScore(_password.text);

    return VidyaScaffold(
      appBar: VidyaAppBar(
        title: '',
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: ink),
          onPressed: widget.onBackToLogin,
        ),
      ),
      body: LayoutBuilder(builder: (ctx, constraints) {
        return SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: IntrinsicHeight(
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      'Create account',
                      style: TextStyle(
                        fontFamily: VidyaFonts.display,
                        fontSize: 30,
                        fontWeight: FontWeight.w500,
                        color: ink,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Just a few details and we’re off.',
                      style: TextStyle(
                        fontFamily: VidyaFonts.ui,
                        fontSize: 14,
                        color: muted,
                      ),
                    ),
                    const SizedBox(height: 20),
                    if (_error != null) ...[
                      VidyaBanner(tone: VidyaBannerTone.warn, message: _error!),
                      const SizedBox(height: 12),
                    ],
                    Row(children: [
                      Expanded(
                        child: TextFormField(
                          key: const Key('vidya.register.firstName'),
                          controller: _firstName,
                          decoration: const InputDecoration(labelText: 'First name'),
                          validator: (v) =>
                              (v == null || v.isEmpty) ? 'Required' : null,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: TextFormField(
                          key: const Key('vidya.register.lastName'),
                          controller: _lastName,
                          decoration: const InputDecoration(labelText: 'Last name'),
                          validator: (v) =>
                              (v == null || v.isEmpty) ? 'Required' : null,
                        ),
                      ),
                    ]),
                    const SizedBox(height: 12),
                    TextFormField(
                      key: const Key('vidya.register.email'),
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.email],
                      decoration: const InputDecoration(labelText: 'Email'),
                      validator: (v) {
                        if (v == null || v.isEmpty) return 'Enter your email';
                        if (!v.contains('@')) return 'Enter a valid email';
                        return null;
                      },
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      key: const Key('vidya.register.phone'),
                      controller: _phone,
                      keyboardType: TextInputType.phone,
                      decoration: const InputDecoration(
                        labelText: 'Phone (optional — for SMS OTP)',
                        hintText: '+91 …',
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      key: const Key('vidya.register.password'),
                      controller: _password,
                      obscureText: true,
                      autofillHints: const [AutofillHints.newPassword],
                      decoration: const InputDecoration(
                        labelText: 'Password (min 12 characters)',
                      ),
                      validator: (v) {
                        if (v == null || v.isEmpty) return 'Enter a password';
                        if (v.length < 12) return 'At least 12 characters';
                        return null;
                      },
                    ),
                    if (_password.text.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Row(children: [
                        for (var i = 0; i < 4; i++) ...[
                          Expanded(
                            child: Container(
                              height: 4,
                              decoration: BoxDecoration(
                                color: i < score ? accent : muted.withValues(alpha: 0.3),
                                borderRadius: BorderRadius.circular(2),
                              ),
                            ),
                          ),
                          if (i < 3) const SizedBox(width: 4),
                        ],
                        const SizedBox(width: 8),
                        Text(
                          _strengthLabel(score),
                          style: TextStyle(
                            fontFamily: VidyaFonts.ui,
                            fontSize: 12,
                            color: muted,
                          ),
                        ),
                      ]),
                    ],
                    const SizedBox(height: 12),
                    Row(children: [
                      Checkbox(
                        value: _tos,
                        onChanged: (v) => setState(() => _tos = v ?? false),
                      ),
                      Expanded(
                        child: Text(
                          'I agree to the Terms and Privacy.',
                          style: TextStyle(
                            fontFamily: VidyaFonts.ui,
                            fontSize: 13,
                            color: ink,
                          ),
                        ),
                      ),
                    ]),
                    const Spacer(),
                    VidyaButton(
                      key: const Key('vidya.register.submit'),
                      label: _submitting ? 'Creating account…' : 'Create account',
                      onPressed: _submitting ? null : _submit,
                      disabled: _submitting,
                      size: VidyaButtonSize.lg,
                    ),
                    const SizedBox(height: 8),
                    Center(
                      child: TextButton(
                        onPressed: _submitting ? null : widget.onBackToLogin,
                        child: const Text('Have an account? Log in'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      }),
    );
  }
}
```

- [ ] **Step 4: Add export**

In `apps/mobile/lib/vidya/vidya.dart`:
```dart
export 'screens/vidya_register_screen.dart';
```

- [ ] **Step 5: Verify pass + analyze**

Run: `cd apps/mobile && flutter test test/vidya/phase_2b_auth_screens_test.dart`
Expected: PASS — 6 login + 4 register tests.

- [ ] **Step 6: Commit**

```bash
cd /home/deepak/projects/adaptive_learning_platform && git add apps/mobile/lib/vidya/screens/vidya_register_screen.dart apps/mobile/lib/vidya/vidya.dart apps/mobile/test/vidya/phase_2b_auth_screens_test.dart && git commit -m "$(cat <<'EOF'
feat(vidya): VidyaRegisterScreen — account creation with strength meter

Mirrors POST /auth/register; surfaces 409/429 via VidyaBanner. On success
hands (RegisterResult, email) to caller for OTP verify routing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `VidyaVerifyScreen` (OTP)

**Files:**
- Create: `apps/mobile/lib/vidya/screens/vidya_verify_screen.dart`
- Modify: `apps/mobile/test/vidya/phase_2b_auth_screens_test.dart` (append group)
- Modify: `apps/mobile/lib/vidya/vidya.dart` (add export)

- [ ] **Step 1: Append failing test**

Import:
```dart
import 'package:adaptive_learning_mobile/vidya/screens/vidya_verify_screen.dart';
```

Append group:

```dart
  group('VidyaVerifyScreen', () {
    testWidgets('renders 6 OTP cells', (tester) async {
      final auth = AuthClient(
        baseUrl: 'http://test',
        httpClient: MockClient((_) async => http.Response('{}', 404)),
      );
      await tester.pumpWidget(_harness(
        child: VidyaVerifyScreen(
          auth: auth,
          userId: 'u-1',
          email: 'a@b.com',
          channel: 'email',
          onVerified: (_) {},
          onBack: () {},
        ),
      ));
      expect(find.byKey(const Key('vidya.verify.cell0')), findsOneWidget);
      expect(find.byKey(const Key('vidya.verify.cell5')), findsOneWidget);
    });

    testWidgets('full 6-digit entry calls verifyOtp + onVerified',
        (tester) async {
      final auth = AuthClient(
        baseUrl: 'http://test',
        httpClient: MockClient((req) async {
          if (req.url.path.endsWith('/auth/otp/verify')) {
            return http.Response(
              '{"user":{"id":"u-1","email":"a@b.com","firstName":"A","lastName":"B","role":"STUDENT","onboardingState":"REGISTERED"},'
              '"tokens":{"accessToken":"at","refreshToken":"rt","expiresAt":1000}}',
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          return http.Response('{}', 404);
        }),
      );
      Session? captured;
      await tester.pumpWidget(_harness(
        child: VidyaVerifyScreen(
          auth: auth,
          userId: 'u-1',
          email: 'a@b.com',
          channel: 'email',
          onVerified: (s) => captured = s,
          onBack: () {},
        ),
      ));
      for (var i = 0; i < 6; i++) {
        await tester.enterText(find.byKey(Key('vidya.verify.cell$i')), '${i + 1}');
      }
      await tester.pumpAndSettle();
      expect(captured, isNotNull);
      expect(captured!.user.id, 'u-1');
    });

    testWidgets('shows email in subtitle when channel == email', (tester) async {
      final auth = AuthClient(
        baseUrl: 'http://test',
        httpClient: MockClient((_) async => http.Response('{}', 404)),
      );
      await tester.pumpWidget(_harness(
        child: VidyaVerifyScreen(
          auth: auth,
          userId: 'u-1',
          email: 'a@b.com',
          channel: 'email',
          onVerified: (_) {},
          onBack: () {},
        ),
      ));
      expect(find.textContaining('a@b.com'), findsOneWidget);
    });

    testWidgets('invalid OTP surfaces error banner', (tester) async {
      final auth = AuthClient(
        baseUrl: 'http://test',
        httpClient: MockClient((_) async => http.Response(
              '{"detail":{"code":"otp_invalid","message":"Code didn’t match. Try again."}}',
              400,
              headers: {'content-type': 'application/json'},
            )),
      );
      await tester.pumpWidget(_harness(
        child: VidyaVerifyScreen(
          auth: auth,
          userId: 'u-1',
          email: 'a@b.com',
          channel: 'email',
          onVerified: (_) {},
          onBack: () {},
        ),
      ));
      for (var i = 0; i < 6; i++) {
        await tester.enterText(find.byKey(Key('vidya.verify.cell$i')), '0');
      }
      await tester.pumpAndSettle();
      expect(find.textContaining('didn’t match'), findsOneWidget);
    });
  });
```

- [ ] **Step 2: Verify test fails**

Run: `cd apps/mobile && flutter test test/vidya/phase_2b_auth_screens_test.dart`
Expected: FAIL — `vidya_verify_screen.dart` not found.

- [ ] **Step 3: Implement `VidyaVerifyScreen`**

Create `apps/mobile/lib/vidya/screens/vidya_verify_screen.dart`:

```dart
// VidyaVerifyScreen — 6-digit OTP entry following registration.
// Mirrors Aurora's POST /auth/otp/verify contract; channel is "email"
// or "sms" — surfaces the destination in the subtitle so users know
// where to look for the code.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../auth/auth_client.dart';

class VidyaVerifyScreen extends StatefulWidget {
  final AuthClient auth;
  final String userId;
  final String email;
  final String channel; // 'email' | 'sms'
  final void Function(Session session) onVerified;
  final VoidCallback onBack;

  const VidyaVerifyScreen({
    super.key,
    required this.auth,
    required this.userId,
    required this.email,
    required this.channel,
    required this.onVerified,
    required this.onBack,
  });

  @override
  State<VidyaVerifyScreen> createState() => _VidyaVerifyScreenState();
}

class _VidyaVerifyScreenState extends State<VidyaVerifyScreen> {
  final List<TextEditingController> _cells =
      List.generate(6, (_) => TextEditingController());
  final List<FocusNode> _focusNodes = List.generate(6, (_) => FocusNode());
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    for (final c in _cells) c.dispose();
    for (final f in _focusNodes) f.dispose();
    super.dispose();
  }

  String get _code => _cells.map((c) => c.text).join();

  Future<void> _maybeSubmit() async {
    if (_code.length != 6 || _submitting) return;
    setState(() {
      _error = null;
      _submitting = true;
    });
    try {
      final session = await widget.auth.verifyOtp(
        userId: widget.userId,
        code: _code,
        channel: widget.channel,
      );
      widget.onVerified(session);
    } on AuthException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = "We couldn't reach the server. Check your connection.");
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = VidyaThemeData.of(context);
    final ink = theme.ink;
    final muted = theme.ink3;
    final accent = theme.accent;
    final dest = widget.channel == 'sms' ? 'your phone' : widget.email;

    return VidyaScaffold(
      appBar: VidyaAppBar(
        title: '',
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: ink),
          onPressed: widget.onBack,
        ),
      ),
      body: Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: 24),
            Text(
              'Verify it’s you',
              style: TextStyle(
                fontFamily: VidyaFonts.display,
                fontSize: 30,
                fontWeight: FontWeight.w500,
                color: ink,
              ),
            ),
            const SizedBox(height: 8),
            Text.rich(
              TextSpan(
                style: TextStyle(
                  fontFamily: VidyaFonts.ui,
                  fontSize: 14,
                  color: muted,
                  height: 1.5,
                ),
                children: [
                  const TextSpan(text: 'We sent a 6-digit code to '),
                  TextSpan(
                    text: dest,
                    style: TextStyle(color: ink, fontWeight: FontWeight.w600),
                  ),
                  const TextSpan(text: '.'),
                ],
              ),
            ),
            const SizedBox(height: 24),
            if (_error != null) ...[
              VidyaBanner(tone: VidyaBannerTone.warn, message: _error!),
              const SizedBox(height: 12),
            ],
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: List.generate(6, (i) {
                return SizedBox(
                  width: 44,
                  height: 56,
                  child: TextField(
                    key: Key('vidya.verify.cell$i'),
                    controller: _cells[i],
                    focusNode: _focusNodes[i],
                    autofocus: i == 0,
                    keyboardType: TextInputType.number,
                    maxLength: 1,
                    textAlign: TextAlign.center,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    style: TextStyle(
                      fontFamily: VidyaFonts.mono,
                      fontSize: 22,
                      fontWeight: FontWeight.w600,
                      color: ink,
                    ),
                    decoration: InputDecoration(
                      counterText: '',
                      enabledBorder: OutlineInputBorder(
                        borderSide: BorderSide(
                          color: muted.withValues(alpha: 0.4),
                        ),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderSide: BorderSide(color: accent, width: 2),
                      ),
                    ),
                    onChanged: (v) {
                      if (v.isNotEmpty && i < 5) _focusNodes[i + 1].requestFocus();
                      if (v.isEmpty && i > 0) _focusNodes[i - 1].requestFocus();
                      setState(() {});
                      _maybeSubmit();
                    },
                  ),
                );
              }),
            ),
            const Spacer(),
            VidyaButton(
              label: _submitting ? 'Verifying…' : 'Verify',
              onPressed: _code.length == 6 && !_submitting ? _maybeSubmit : null,
              disabled: _code.length != 6 || _submitting,
              size: VidyaButtonSize.lg,
            ),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: Add export**

```dart
export 'screens/vidya_verify_screen.dart';
```

- [ ] **Step 5: Verify pass**

Run: `cd apps/mobile && flutter test test/vidya/phase_2b_auth_screens_test.dart`
Expected: PASS — login(6) + register(4) + verify(4) tests.

- [ ] **Step 6: Commit**

```bash
cd /home/deepak/projects/adaptive_learning_platform && git add apps/mobile/lib/vidya/screens/vidya_verify_screen.dart apps/mobile/lib/vidya/vidya.dart apps/mobile/test/vidya/phase_2b_auth_screens_test.dart && git commit -m "$(cat <<'EOF'
feat(vidya): VidyaVerifyScreen — 6-cell OTP entry after registration

Auto-advance between cells, auto-submit on complete 6-digit code,
channel-aware subtitle (email vs phone). Mirrors POST /auth/otp/verify.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `VidyaForgotPasswordScreen`

**Files:**
- Create: `apps/mobile/lib/vidya/screens/vidya_forgot_password_screen.dart`
- Modify: `apps/mobile/test/vidya/phase_2b_auth_screens_test.dart` (append group)
- Modify: `apps/mobile/lib/vidya/vidya.dart` (add export)

- [ ] **Step 1: Append failing test**

Import:
```dart
import 'package:adaptive_learning_mobile/vidya/screens/vidya_forgot_password_screen.dart';
```

Group:

```dart
  group('VidyaForgotPasswordScreen', () {
    testWidgets('submits email then shows enumeration-safe confirmation',
        (tester) async {
      final auth = AuthClient(
        baseUrl: 'http://test',
        httpClient: MockClient((req) async {
          if (req.url.path.endsWith('/auth/password/forgot')) {
            return http.Response('', 204);
          }
          return http.Response('{}', 404);
        }),
      );
      await tester.pumpWidget(_harness(
        child: VidyaForgotPasswordScreen(
          auth: auth,
          onBackToLogin: () {},
        ),
      ));
      await tester.enterText(
          find.byKey(const Key('vidya.forgot.email')), 'a@b.com');
      await tester.tap(find.byKey(const Key('vidya.forgot.submit')));
      await tester.pumpAndSettle();
      expect(find.textContaining('check your inbox'), findsOneWidget);
    });

    testWidgets('204 vs 200 both show same confirmation (enumeration-safe)',
        (tester) async {
      // 204 case already covered above; this tests the rate-limited path.
      final auth = AuthClient(
        baseUrl: 'http://test',
        httpClient: MockClient((_) async => http.Response('{}', 429)),
      );
      await tester.pumpWidget(_harness(
        child: VidyaForgotPasswordScreen(
          auth: auth,
          onBackToLogin: () {},
        ),
      ));
      await tester.enterText(
          find.byKey(const Key('vidya.forgot.email')), 'a@b.com');
      await tester.tap(find.byKey(const Key('vidya.forgot.submit')));
      await tester.pumpAndSettle();
      expect(find.textContaining('Too many'), findsOneWidget);
    });

    testWidgets('Back to login fires onBackToLogin', (tester) async {
      final auth = AuthClient(
        baseUrl: 'http://test',
        httpClient: MockClient((_) async => http.Response('{}', 404)),
      );
      var taps = 0;
      await tester.pumpWidget(_harness(
        child: VidyaForgotPasswordScreen(
          auth: auth,
          onBackToLogin: () => taps++,
        ),
      ));
      await tester.tap(find.text('Back to login'));
      await tester.pumpAndSettle();
      expect(taps, 1);
    });
  });
```

- [ ] **Step 2: Verify test fails**

Run: `cd apps/mobile && flutter test test/vidya/phase_2b_auth_screens_test.dart`
Expected: FAIL.

- [ ] **Step 3: Implement `VidyaForgotPasswordScreen`**

Create `apps/mobile/lib/vidya/screens/vidya_forgot_password_screen.dart`:

```dart
// VidyaForgotPasswordScreen — request password reset email.
// Mirrors Aurora's POST /auth/password/forgot; the server is
// enumeration-safe (204 regardless of email existence) so the UI
// always shows the same "check your inbox" confirmation. 429 is the
// only differentiated case (rate limit).

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../auth/auth_client.dart';

class VidyaForgotPasswordScreen extends StatefulWidget {
  final AuthClient auth;
  final VoidCallback onBackToLogin;

  const VidyaForgotPasswordScreen({
    super.key,
    required this.auth,
    required this.onBackToLogin,
  });

  @override
  State<VidyaForgotPasswordScreen> createState() =>
      _VidyaForgotPasswordScreenState();
}

class _VidyaForgotPasswordScreenState extends State<VidyaForgotPasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  bool _submitting = false;
  bool _submitted = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _error = null;
      _submitting = true;
    });
    try {
      await widget.auth.forgotPassword(email: _email.text.trim());
      setState(() => _submitted = true);
    } on AuthException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = "We couldn't reach the server. Check your connection.");
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = VidyaThemeData.of(context);
    final ink = theme.ink;
    final muted = theme.ink3;

    return VidyaScaffold(
      appBar: VidyaAppBar(
        title: '',
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: ink),
          onPressed: widget.onBackToLogin,
        ),
      ),
      body: Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
        child: _submitted
            ? _ConfirmationBody(email: _email.text.trim(), onBack: widget.onBackToLogin)
            : Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SizedBox(height: 24),
                    Text(
                      'Reset your password',
                      style: TextStyle(
                        fontFamily: VidyaFonts.display,
                        fontSize: 30,
                        fontWeight: FontWeight.w500,
                        color: ink,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Enter the email you signed up with — we’ll send a reset link.',
                      style: TextStyle(
                        fontFamily: VidyaFonts.ui,
                        fontSize: 14,
                        color: muted,
                        height: 1.5,
                      ),
                    ),
                    const SizedBox(height: 24),
                    if (_error != null) ...[
                      VidyaBanner(tone: VidyaBannerTone.warn, message: _error!),
                      const SizedBox(height: 12),
                    ],
                    TextFormField(
                      key: const Key('vidya.forgot.email'),
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.email],
                      decoration: const InputDecoration(labelText: 'Email'),
                      validator: (v) {
                        if (v == null || v.isEmpty) return 'Enter your email';
                        if (!v.contains('@')) return 'Enter a valid email';
                        return null;
                      },
                    ),
                    const Spacer(),
                    VidyaButton(
                      key: const Key('vidya.forgot.submit'),
                      label: _submitting ? 'Sending…' : 'Send reset link',
                      onPressed: _submitting ? null : _submit,
                      disabled: _submitting,
                      size: VidyaButtonSize.lg,
                    ),
                    const SizedBox(height: 8),
                    Center(
                      child: TextButton(
                        onPressed: widget.onBackToLogin,
                        child: const Text('Back to login'),
                      ),
                    ),
                  ],
                ),
              ),
      ),
    );
  }
}

class _ConfirmationBody extends StatelessWidget {
  final String email;
  final VoidCallback onBack;
  const _ConfirmationBody({required this.email, required this.onBack});

  @override
  Widget build(BuildContext context) {
    final theme = VidyaThemeData.of(context);
    final ink = theme.ink;
    final muted = theme.ink3;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 24),
        Text(
          'Almost there',
          style: TextStyle(
            fontFamily: VidyaFonts.display,
            fontSize: 30,
            fontWeight: FontWeight.w500,
            color: ink,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'If $email is registered, check your inbox for a reset link. Links expire in 1 hour.',
          style: TextStyle(
            fontFamily: VidyaFonts.ui,
            fontSize: 14,
            color: muted,
            height: 1.5,
          ),
        ),
        const Spacer(),
        VidyaButton(
          label: 'Back to login',
          onPressed: onBack,
          size: VidyaButtonSize.lg,
        ),
      ],
    );
  }
}
```

- [ ] **Step 4: Add export**

```dart
export 'screens/vidya_forgot_password_screen.dart';
```

- [ ] **Step 5: Verify pass**

Expected: 14 tests + 3 forgot tests = 17 total.

- [ ] **Step 6: Commit**

```bash
cd /home/deepak/projects/adaptive_learning_platform && git add apps/mobile/lib/vidya/screens/vidya_forgot_password_screen.dart apps/mobile/lib/vidya/vidya.dart apps/mobile/test/vidya/phase_2b_auth_screens_test.dart && git commit -m "$(cat <<'EOF'
feat(vidya): VidyaForgotPasswordScreen — enumeration-safe reset request

Mirrors POST /auth/password/forgot; 204 + 200 paths show identical
"check your inbox" copy. 429 surfaces a rate-limit banner.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `VidyaNewPasswordScreen` (reset with token)

**Files:**
- Create: `apps/mobile/lib/vidya/screens/vidya_new_password_screen.dart`
- Modify: `apps/mobile/test/vidya/phase_2b_auth_screens_test.dart` (append group)
- Modify: `apps/mobile/lib/vidya/vidya.dart` (add export)

- [ ] **Step 1: Append failing test**

Import:
```dart
import 'package:adaptive_learning_mobile/vidya/screens/vidya_new_password_screen.dart';
```

Group:

```dart
  group('VidyaNewPasswordScreen', () {
    testWidgets('rejects mismatched confirm', (tester) async {
      final auth = AuthClient(
        baseUrl: 'http://test',
        httpClient: MockClient((_) async => http.Response('', 204)),
      );
      await tester.pumpWidget(_harness(
        child: VidyaNewPasswordScreen(
          auth: auth,
          token: 'abc-token',
          onCompleted: () {},
        ),
      ));
      await tester.enterText(
          find.byKey(const Key('vidya.newpw.password')), 'SuperSecret123!');
      await tester.enterText(
          find.byKey(const Key('vidya.newpw.confirm')), 'Different!');
      await tester.tap(find.byKey(const Key('vidya.newpw.submit')));
      await tester.pumpAndSettle();
      expect(find.textContaining("match"), findsOneWidget);
    });

    testWidgets('success calls onCompleted', (tester) async {
      final auth = AuthClient(
        baseUrl: 'http://test',
        httpClient: MockClient((req) async {
          if (req.url.path.endsWith('/auth/password/reset')) {
            return http.Response('', 204);
          }
          return http.Response('{}', 404);
        }),
      );
      var done = 0;
      await tester.pumpWidget(_harness(
        child: VidyaNewPasswordScreen(
          auth: auth,
          token: 'abc-token',
          onCompleted: () => done++,
        ),
      ));
      await tester.enterText(
          find.byKey(const Key('vidya.newpw.password')), 'SuperSecret123!');
      await tester.enterText(
          find.byKey(const Key('vidya.newpw.confirm')), 'SuperSecret123!');
      await tester.tap(find.byKey(const Key('vidya.newpw.submit')));
      await tester.pumpAndSettle();
      expect(done, 1);
    });

    testWidgets('410 surfaces expired token banner', (tester) async {
      final auth = AuthClient(
        baseUrl: 'http://test',
        httpClient: MockClient((_) async => http.Response(
              '{"detail":{"code":"reset_token_invalid","message":"Reset link is invalid or has expired."}}',
              410,
            )),
      );
      await tester.pumpWidget(_harness(
        child: VidyaNewPasswordScreen(
          auth: auth,
          token: 'abc-token',
          onCompleted: () {},
        ),
      ));
      await tester.enterText(
          find.byKey(const Key('vidya.newpw.password')), 'SuperSecret123!');
      await tester.enterText(
          find.byKey(const Key('vidya.newpw.confirm')), 'SuperSecret123!');
      await tester.tap(find.byKey(const Key('vidya.newpw.submit')));
      await tester.pumpAndSettle();
      expect(find.textContaining('expired'), findsOneWidget);
    });

    testWidgets('422 surfaces weak-password banner', (tester) async {
      final auth = AuthClient(
        baseUrl: 'http://test',
        httpClient: MockClient((_) async => http.Response(
              '{"detail":{"code":"weak_password","message":"Password is too weak."}}',
              422,
            )),
      );
      await tester.pumpWidget(_harness(
        child: VidyaNewPasswordScreen(
          auth: auth,
          token: 'abc-token',
          onCompleted: () {},
        ),
      ));
      await tester.enterText(
          find.byKey(const Key('vidya.newpw.password')), 'aaaaaaaaaaaa');
      await tester.enterText(
          find.byKey(const Key('vidya.newpw.confirm')), 'aaaaaaaaaaaa');
      await tester.tap(find.byKey(const Key('vidya.newpw.submit')));
      await tester.pumpAndSettle();
      expect(find.textContaining('too weak'), findsOneWidget);
    });
  });
```

- [ ] **Step 2: Verify test fails**

- [ ] **Step 3: Implement `VidyaNewPasswordScreen`**

Create `apps/mobile/lib/vidya/screens/vidya_new_password_screen.dart`:

```dart
// VidyaNewPasswordScreen — set a new password using a reset token
// from the deep link (alp://reset?token=… or https://app.../reset?token=…).
// Mirrors Aurora's POST /auth/password/reset.
// Errors:
// - 410 → token expired/invalid
// - 422 → weak password
// - other → AuthException.message or generic.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../auth/auth_client.dart';

class VidyaNewPasswordScreen extends StatefulWidget {
  final AuthClient auth;
  final String token;
  final VoidCallback onCompleted;

  const VidyaNewPasswordScreen({
    super.key,
    required this.auth,
    required this.token,
    required this.onCompleted,
  });

  @override
  State<VidyaNewPasswordScreen> createState() => _VidyaNewPasswordScreenState();
}

class _VidyaNewPasswordScreenState extends State<VidyaNewPasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _password.addListener(() { if (mounted) setState(() {}); });
  }

  @override
  void dispose() {
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _error = null;
      _submitting = true;
    });
    try {
      await widget.auth.resetPassword(
        token: widget.token,
        newPassword: _password.text,
      );
      widget.onCompleted();
    } on AuthException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = "We couldn't reach the server. Check your connection.");
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = VidyaThemeData.of(context);
    final ink = theme.ink;
    final muted = theme.ink3;

    return VidyaScaffold(
      appBar: VidyaAppBar(title: ''),
      body: LayoutBuilder(builder: (ctx, constraints) {
        return SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: IntrinsicHeight(
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SizedBox(height: 24),
                    Text(
                      'Set new password',
                      style: TextStyle(
                        fontFamily: VidyaFonts.display,
                        fontSize: 30,
                        fontWeight: FontWeight.w500,
                        color: ink,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Use at least 12 characters. Mix letters, numbers, and symbols for a stronger password.',
                      style: TextStyle(
                        fontFamily: VidyaFonts.ui,
                        fontSize: 14,
                        color: muted,
                        height: 1.5,
                      ),
                    ),
                    const SizedBox(height: 24),
                    if (_error != null) ...[
                      VidyaBanner(tone: VidyaBannerTone.warn, message: _error!),
                      const SizedBox(height: 12),
                    ],
                    TextFormField(
                      key: const Key('vidya.newpw.password'),
                      controller: _password,
                      obscureText: true,
                      autofillHints: const [AutofillHints.newPassword],
                      decoration: const InputDecoration(labelText: 'New password'),
                      validator: (v) {
                        if (v == null || v.isEmpty) return 'Enter a password';
                        if (v.length < 12) return 'At least 12 characters';
                        return null;
                      },
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      key: const Key('vidya.newpw.confirm'),
                      controller: _confirm,
                      obscureText: true,
                      decoration: const InputDecoration(labelText: 'Confirm password'),
                      validator: (v) {
                        if (v != _password.text) return 'Passwords don’t match';
                        return null;
                      },
                    ),
                    const Spacer(),
                    VidyaButton(
                      key: const Key('vidya.newpw.submit'),
                      label: _submitting ? 'Updating…' : 'Update password',
                      onPressed: _submitting ? null : _submit,
                      disabled: _submitting,
                      size: VidyaButtonSize.lg,
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      }),
    );
  }
}
```

- [ ] **Step 4: Add export**

```dart
export 'screens/vidya_new_password_screen.dart';
```

- [ ] **Step 5: Verify pass**

Expected: 17 + 4 = 21 tests in `phase_2b_auth_screens_test.dart`.

- [ ] **Step 6: Commit**

```bash
cd /home/deepak/projects/adaptive_learning_platform && git add apps/mobile/lib/vidya/screens/vidya_new_password_screen.dart apps/mobile/lib/vidya/vidya.dart apps/mobile/test/vidya/phase_2b_auth_screens_test.dart && git commit -m "$(cat <<'EOF'
feat(vidya): VidyaNewPasswordScreen — set new password with reset token

Mirrors POST /auth/password/reset; 410 (token invalid) and 422 (weak)
surface dedicated banner copy.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Wire `VidyaRootApp` state machine for auth

**Files:**
- Modify: `apps/mobile/lib/vidya/vidya_root_app.dart` (extend enum + state + handoff)
- Modify: `apps/mobile/test/vidya/vidya_root_app_test.dart` (append auth-flow tests)
- Modify: `apps/mobile/lib/main.dart` (pass optional `initialDeepLink` to `VidyaRootApp`)

**State machine target (13 states):**

```
splash → (post-bootstrap)
  ├─ home (if auth.isAuthenticated + onboardingState == 'ONBOARDED')
  ├─ examSelect (if auth.isAuthenticated + onboardingState != 'ONBOARDED')
  ├─ newPassword (if deep-link token captured)
  └─ welcome (otherwise — first launch)

welcome →
  ├─ Get started → card1
  ├─ Sign in → login
  └─ Skip → login

card1/2/3 → Continue → next card OR (card3) → register
            Skip → register
            Back → previous (card1 back → welcome)

register →
  ├─ success → verifyOtp(userId, channel, email)
  ├─ Have an account? Log in → login

verifyOtp → success (Session) → examSelect

login →
  ├─ success (Session) →
  │     onboardingState == 'ONBOARDED' → home
  │     else → examSelect
  ├─ Sign up → register
  └─ Forgot password? → forgotPassword

forgotPassword → Back to login → login

newPassword → success → login

examSelect → success → home

home (MainScaffold) → sign out → login
```

- [ ] **Step 1: Update the failing test (extend existing test file)**

Open `apps/mobile/test/vidya/vidya_root_app_test.dart` and APPEND these tests after the existing ones:

```dart
  testWidgets(
      'authenticated returning user (ONBOARDED) lands on home (MainScaffold) — not Vidya welcome',
      (tester) async {
    // Seed an authenticated session in secure storage so AuthClient.bootstrap()
    // restores it. Tokens persisted under 'alp.auth.tokens' as JSON.
    FlutterSecureStorage.setMockInitialValues({
      'alp.auth.tokens':
          '{"accessToken":"at","refreshToken":"rt","expiresAt":99999999999}',
      'vidya.onboarding_done': 'true',
    });
    await tester.pumpWidget(VidyaRootApp(auth: _makeAuth()));
    await tester.pumpAndSettle();
    // Welcome must NOT be shown — authenticated user goes straight to home.
    expect(find.text('Welcome to Vidya'), findsNothing);
    expect(find.text('Welcome back'), findsNothing); // not on login either
  });

  testWidgets('Welcome → Sign in tapped routes to VidyaLoginScreen',
      (tester) async {
    await tester.pumpWidget(VidyaRootApp(auth: _makeAuth()));
    await tester.pumpAndSettle();
    expect(find.text('Welcome to Vidya'), findsOneWidget);
    await tester.tap(find.text('Sign in'));
    await tester.pumpAndSettle();
    expect(find.text('Welcome back'), findsOneWidget);
    expect(find.byKey(const Key('vidya.login.email')), findsOneWidget);
  });

  testWidgets(
      'cold-start with initialDeepLink (?token=…) lands on VidyaNewPasswordScreen',
      (tester) async {
    await tester.pumpWidget(VidyaRootApp(
      auth: _makeAuth(),
      initialDeepLink: 'alp://reset?token=test-token-abc',
    ));
    await tester.pumpAndSettle();
    expect(find.text('Set new password'), findsOneWidget);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && flutter test test/vidya/vidya_root_app_test.dart`
Expected: FAIL — new tests can't find 'Welcome back' / 'Set new password'.

- [ ] **Step 3: Extend `VidyaRootApp`**

Open `apps/mobile/lib/vidya/vidya_root_app.dart`. Replace the entire file with:

```dart
// VidyaRootApp — runApp target for Phase 2a+. Owns the Vidya
// notifiers, bootstraps them in parallel with the AuthClient and
// the vidya.onboarding_done flag, then drives a 13-state machine
// covering onboarding + auth + home.

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../auth/auth_client.dart';
import '../auth/deep_link.dart';
import '../screens/main_scaffold.dart';
import 'aurora_route.dart';
import 'density_notifier.dart';
import 'persona_notifier.dart';
import 'screens/vidya_exam_select_screen.dart';
import 'screens/vidya_forgot_password_screen.dart';
import 'screens/vidya_login_screen.dart';
import 'screens/vidya_new_password_screen.dart';
import 'screens/vidya_onboarding_card_screen.dart';
import 'screens/vidya_register_screen.dart';
import 'screens/vidya_splash_screen.dart';
import 'screens/vidya_verify_screen.dart';
import 'screens/vidya_welcome_screen.dart';
import 'theme_mode_notifier.dart';
import 'vidya_app.dart';

enum _VidyaScreen {
  splash,
  welcome,
  card1,
  card2,
  card3,
  login,
  register,
  verifyOtp,
  forgotPassword,
  newPassword,
  examSelect,
  home,
}

class VidyaRootApp extends StatefulWidget {
  final AuthClient auth;
  final String? initialDeepLink;
  const VidyaRootApp({super.key, required this.auth, this.initialDeepLink});

  @override
  State<VidyaRootApp> createState() => _VidyaRootAppState();
}

class _VidyaRootAppState extends State<VidyaRootApp> {
  static const _storage = FlutterSecureStorage();
  static const _onboardingDoneKey = 'vidya.onboarding_done';

  final _persona = VidyaPersonaNotifier();
  final _density = VidyaDensityNotifier();
  final _themeMode = VidyaThemeModeNotifier();

  _VidyaScreen _screen = _VidyaScreen.splash;
  bool _bootstrapped = false;

  // Pending OTP context — carried from register → verifyOtp.
  String? _pendingUserId;
  String? _pendingEmail;
  String? _pendingChannel;

  // Reset-password token captured from deep link.
  String? _resetToken;

  @override
  void initState() {
    super.initState();
    _bootstrap();
    _persona.addListener(_rebuild);
    _density.addListener(_rebuild);
    _themeMode.addListener(_rebuild);
  }

  Future<void> _bootstrap() async {
    String? onboardingDone;
    await Future.wait<void>([
      _persona.bootstrap(),
      _density.bootstrap(),
      _themeMode.bootstrap(),
      widget.auth.bootstrap(),
      _storage.read(key: _onboardingDoneKey).then((v) => onboardingDone = v),
    ]);
    if (!mounted) return;

    // Deep-link wins over normal routing (handles password-reset emails).
    // parseDeepLink() never throws and returns DeepLinkRoute.ignored for
    // unrecognised input — see apps/mobile/lib/auth/deep_link.dart.
    final dl = parseDeepLink(widget.initialDeepLink);
    if (dl.kind == DeepLinkRouteKind.resetPassword && dl.token != null) {
      _resetToken = dl.token;
      setState(() {
        _bootstrapped = true;
        _screen = _VidyaScreen.newPassword;
      });
      return;
    }

    setState(() {
      _bootstrapped = true;
      _screen = _decideInitialScreen(onboardingDone);
    });
  }

  _VidyaScreen _decideInitialScreen(String? onboardingDone) {
    if (widget.auth.isAuthenticated) {
      // Already logged in — go to home (Aurora MainScaffold).
      return _VidyaScreen.home;
    }
    if (onboardingDone == 'true') {
      // Returning user, not signed in — straight to login.
      return _VidyaScreen.login;
    }
    return _VidyaScreen.welcome;
  }

  void _rebuild() {
    if (mounted) setState(() {});
  }

  Future<void> _markOnboardingDone() async {
    await _storage.write(key: _onboardingDoneKey, value: 'true');
  }

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

  Future<void> _onSignOut() async {
    await widget.auth.logout();
    if (mounted) setState(() => _screen = _VidyaScreen.login);
  }

  @override
  void dispose() {
    _persona.removeListener(_rebuild);
    _density.removeListener(_rebuild);
    _themeMode.removeListener(_rebuild);
    _persona.dispose();
    _density.dispose();
    _themeMode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return VidyaApp(
      persona: _persona,
      density: _density,
      themeMode: _themeMode,
      home: _currentScreen(),
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
          onSignIn: () => setState(() => _screen = _VidyaScreen.login),
          onSkip: () => setState(() => _screen = _VidyaScreen.login),
        );
      case _VidyaScreen.card1:
        return VidyaOnboardingCardScreen(
          cardIndex: 1,
          onContinue: () => setState(() => _screen = _VidyaScreen.card2),
          onSkip: () => setState(() => _screen = _VidyaScreen.register),
          onBack: () => setState(() => _screen = _VidyaScreen.welcome),
        );
      case _VidyaScreen.card2:
        return VidyaOnboardingCardScreen(
          cardIndex: 2,
          onContinue: () => setState(() => _screen = _VidyaScreen.card3),
          onSkip: () => setState(() => _screen = _VidyaScreen.register),
          onBack: () => setState(() => _screen = _VidyaScreen.card1),
        );
      case _VidyaScreen.card3:
        return VidyaOnboardingCardScreen(
          cardIndex: 3,
          onContinue: () => setState(() => _screen = _VidyaScreen.register),
          onSkip: () => setState(() => _screen = _VidyaScreen.register),
          onBack: () => setState(() => _screen = _VidyaScreen.card2),
        );
      case _VidyaScreen.login:
        return VidyaLoginScreen(
          auth: widget.auth,
          onLoggedIn: _onSignedIn,
          onSignUp: () => setState(() => _screen = _VidyaScreen.register),
          onForgotPassword: () =>
              setState(() => _screen = _VidyaScreen.forgotPassword),
        );
      case _VidyaScreen.register:
        return VidyaRegisterScreen(
          auth: widget.auth,
          onRegistered: (r, email) {
            setState(() {
              _pendingUserId = r.userId;
              _pendingChannel = r.otpChannel;
              _pendingEmail = email;
              _screen = _VidyaScreen.verifyOtp;
            });
          },
          onBackToLogin: () => setState(() => _screen = _VidyaScreen.login),
        );
      case _VidyaScreen.verifyOtp:
        return VidyaVerifyScreen(
          auth: widget.auth,
          userId: _pendingUserId ?? '',
          email: _pendingEmail ?? '',
          channel: _pendingChannel ?? 'email',
          onVerified: _onSignedIn,
          onBack: () => setState(() => _screen = _VidyaScreen.register),
        );
      case _VidyaScreen.forgotPassword:
        return VidyaForgotPasswordScreen(
          auth: widget.auth,
          onBackToLogin: () => setState(() => _screen = _VidyaScreen.login),
        );
      case _VidyaScreen.newPassword:
        return VidyaNewPasswordScreen(
          auth: widget.auth,
          token: _resetToken ?? '',
          onCompleted: () => setState(() {
            _resetToken = null;
            _screen = _VidyaScreen.login;
          }),
        );
      case _VidyaScreen.examSelect:
        return VidyaExamSelectScreen(
          auth: widget.auth,
          onContinue: () async {
            await _markOnboardingDone();
            if (mounted) setState(() => _screen = _VidyaScreen.home);
          },
          onBack: () => setState(() => _screen = _VidyaScreen.welcome),
        );
      case _VidyaScreen.home:
        return AuroraRoute(
          builder: (_) => MainScaffold(
            auth: widget.auth,
            onSignOut: _onSignOut,
          ),
        );
    }
  }
}
```

- [ ] **Step 4: Pass `initialDeepLink` from `main.dart`**

In `apps/mobile/lib/main.dart`, find and modify the `main()` function. The current state captures `initialDeepLink` via the platform plugin (S5 work). For 2b's automated tests we only need the constructor to accept the param. Update the `runApp` line:

Find:
```dart
runApp(VidyaRootApp(auth: AuthClient(baseUrl: _apiBaseUrl)));
```

Replace with:
```dart
// initialDeepLink will be wired in via the deep-link plugin in a follow-up;
// the constructor accepts it now so tests and future wiring work.
runApp(VidyaRootApp(auth: AuthClient(baseUrl: _apiBaseUrl)));
```

(Same line — comment added to clarify intent. Plugin wiring is out of scope for 2b unit tests.)

- [ ] **Step 5: Run all vidya tests**

Run: `cd apps/mobile && flutter test test/vidya/`
Expected: PASS — Phase 1 + 2a + 2b screens + root app (~80+ tests).

Run: `cd apps/mobile && flutter test test/widget_test.dart`
Expected: PASS (existing legacy tests, may need adjustment in Task 7).

Run: `cd apps/mobile && flutter analyze 2>&1 | tail -5`
Expected: no new issues in changed files.

- [ ] **Step 6: Commit**

```bash
cd /home/deepak/projects/adaptive_learning_platform && git add apps/mobile/lib/vidya/vidya_root_app.dart apps/mobile/lib/main.dart apps/mobile/test/vidya/vidya_root_app_test.dart && git commit -m "$(cat <<'EOF'
feat(vidya): extend VidyaRootApp state machine — auth + deep-link wiring

13 states: splash + welcome + 3 cards + login + register + verifyOtp +
forgotPassword + newPassword + examSelect + home. Authenticated users
skip onboarding to MainScaffold via AuroraRoute. alp://reset?token=…
deep links route straight to VidyaNewPasswordScreen on cold start.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Delete Aurora `_Splash` + `AdaptiveLearningAppLegacy` cleanup

**Files:**
- Modify: `apps/mobile/lib/main.dart` (delete `_Splash` class + `AdaptiveLearningAppLegacy` class + unused imports)
- Modify: `apps/mobile/test/widget_test.dart` (delete or update the line-29 smoke test that references `AdaptiveLearningAppLegacy`)

- [ ] **Step 1: Inventory current usage**

Run:
```
grep -n "_Splash\|AdaptiveLearningAppLegacy" /home/deepak/projects/adaptive_learning_platform/apps/mobile/lib/main.dart /home/deepak/projects/adaptive_learning_platform/apps/mobile/test/widget_test.dart
```

Expected:
- `main.dart`: `class _Splash extends StatelessWidget` (around line 329, with `// ignore: unused_element` from T1) + `class AdaptiveLearningAppLegacy` (around line 435)
- `widget_test.dart`: one test "renders Sprint-0-style splash via legacy app shell" (around line 29) that calls `tester.pumpWidget(const AdaptiveLearningAppLegacy())`

- [ ] **Step 2: Delete `_Splash` from `main.dart`**

Use Edit to remove the entire `class _Splash extends StatelessWidget { … }` block (and its preceding `// ignore: unused_element` comment if present). The class is referenced nowhere after T1; deleting it should not break anything.

- [ ] **Step 3: Delete `AdaptiveLearningAppLegacy` from `main.dart`**

Use Edit to remove the entire `class AdaptiveLearningAppLegacy` block. This is a Sprint-0 placeholder, no production code path uses it.

- [ ] **Step 4: Delete the legacy smoke test in `widget_test.dart`**

Use Edit to remove the entire `testWidgets('renders Sprint-0-style splash via legacy app shell', …)` block (around lines 29–32). It tested a placeholder that no longer exists.

- [ ] **Step 5: Clean up any imports in `main.dart` orphaned by the deletes**

Run: `cd apps/mobile && flutter analyze lib/main.dart 2>&1 | tail -10`
If there are "unused import" warnings, remove the corresponding `import` lines.

- [ ] **Step 6: Run full test suite + verify**

Run: `cd apps/mobile && flutter test`
Expected: all tests pass. Test count drops by 1 (deleted legacy test).

Run: `cd apps/mobile && flutter analyze 2>&1 | tail -5`
Expected: no new errors in main.dart or widget_test.dart.

- [ ] **Step 7: Commit**

```bash
cd /home/deepak/projects/adaptive_learning_platform && git add apps/mobile/lib/main.dart apps/mobile/test/widget_test.dart && git commit -m "$(cat <<'EOF'
chore(vidya): delete Aurora _Splash + AdaptiveLearningAppLegacy

Both classes are orphaned post Phase 2a runApp flip. _Splash was kept
behind ignore:unused_element during T1; both are now safe to remove.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Manual smoke + acceptance gate

Verification-only — no code changes.

- [ ] **Step 1: Run automated suite**

```bash
cd /home/deepak/projects/adaptive_learning_platform/packages/design-tokens-flutter && flutter analyze
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && flutter analyze
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && flutter test
cd /home/deepak/projects/adaptive_learning_platform/apps/mobile && flutter build apk --debug
```

All four must exit 0 with no new errors.

- [ ] **Step 2: Manual smoke on Android device or emulator**

Install the APK on a device on the same Wi-Fi as the dev machine:

```bash
adb install -r build/app/outputs/flutter-apk/app-debug.apk
```

Walk this checklist:

1. Wipe app data → cold start.
2. Vidya splash visible → welcome screen.
3. Tap "Sign in" → `VidyaLoginScreen` loads.
4. Enter wrong creds → 401 banner shows "Wrong email or password" (or similar).
5. Tap "Forgot password?" → `VidyaForgotPasswordScreen`.
6. Enter email, submit → confirmation screen.
7. Tap "Back to login" → returns to `VidyaLoginScreen`.
8. Tap "Don't have an account? Sign up" → `VidyaRegisterScreen`.
9. Fill form, accept ToS, submit → `VidyaVerifyScreen` shows 6 OTP cells + subtitle with email.
10. Enter the 6-digit code from the dev OTP endpoint/email → routes to `VidyaExamSelectScreen` (because new user has `onboardingState != 'ONBOARDED'`).
11. Pick exam, Continue → `MainScaffold` (Aurora home).
12. Sign out from MainScaffold → returns to `VidyaLoginScreen` (NOT welcome).
13. Cold-restart with seeded credentials (`student@example.com / Password123!`) → straight to `MainScaffold`.
14. Click a `alp://reset?token=…` deep link (or use `flutter run --dart-define=ALP_INITIAL_DEEP_LINK=alp://reset?token=test`) → `VidyaNewPasswordScreen`.

Record pass/fail next to each step.

- [ ] **Step 3: Final commit (optional)**

If the 2a design spec needs updating to mark 2b items complete:

```bash
git add docs/superpowers/specs/2026-05-18-vidya-flutter-phase-2a-design.md
git commit -m "docs(vidya): mark Phase 2b items shipped"
```

Then invoke the finishing-a-development-branch skill to decide on PR/merge strategy.

---

## Self-Review Notes

**Spec coverage check:**
- Auth screens (register, email-verify=verify, login, OTP=verify post-register, reset=forgot, new-password) — Tasks 1–5 ✓
- Aurora `_Splash` deletion — Task 7 ✓
- Deep-link handling under VidyaApp — Task 6 (initialDeepLink + DeepLink.parse) ✓
- OTP-login as a standalone passwordless flow — explicitly deferred at top of plan, requires backend work

**Type consistency:**
- All 5 screens use Vidya primitives confirmed in Phase 2a (`VidyaScaffold`, `VidyaAppBar`, `VidyaButton(disabled:, size:, style:)`, `VidyaBanner(tone: VidyaBannerTone.warn)`, `VidyaCard`).
- `VidyaThemeData.of(context)` non-nullable; `theme.ink` / `theme.ink3` / `theme.accent` (no `theme.colors.ink`).
- `VidyaFonts.display` / `VidyaFonts.ui` / `VidyaFonts.mono`.
- `Session` / `RegisterResult` / `AuthException` from `auth/auth_client.dart` — used in screen props.
- `parseDeepLink(String?)` returns `DeepLinkRoute(kind: DeepLinkRouteKind, token: String?)` from `auth/deep_link.dart`. Kind enum: `ignored`, `resetPassword`, `joinCohort`. Confirmed.

**Test viewport (544px in flutter_test):**
- Tasks 1, 2, 5 use the `LayoutBuilder + SingleChildScrollView + ConstrainedBox + IntrinsicHeight` pattern from Phase 2a to avoid overflow with `Spacer` widgets.
- Task 3 (verify) doesn't use `Spacer` aggressively; should fit.
- Task 4 (forgot) uses `Spacer` — apply same pattern if overflow occurs.

**Potential gotchas:**
- `DeepLinkRoute.joinCohort` exists as a third kind (Sprint 12 cohort invites). 2b only handles `resetPassword`; `joinCohort` falls through to default routing.
- `MainScaffold(auth:, onSignOut:)` — confirm constructor matches before Task 6. It's referenced today by `AuroraGuestFlow` so the signature should be unchanged.
- `widget_test.dart` line 29 references `AdaptiveLearningAppLegacy`. Task 7 deletes both the class AND the test in one commit.
