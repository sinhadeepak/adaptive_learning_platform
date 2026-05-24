import 'package:flutter/material.dart';
import 'aurora/density_notifier.dart';
import 'aurora/persona.dart';
import 'aurora/system_chrome.dart';
import 'aurora/theme_mode_notifier.dart';
import 'auth/auth_client.dart';
import 'auth/deep_link.dart';
import 'screens/main_scaffold.dart';
import 'screens/login_screen.dart';
import 'screens/onboarding/consent_screen.dart';
import 'screens/onboarding/daily_goal_screen.dart';
import 'screens/onboarding/exam_select_screen.dart';
import 'screens/onboarding/persona_select_screen.dart';
import 'screens/onboarding/welcome_screen.dart';
import 'screens/onboarding/language_screen.dart';
import 'screens/onboarding/target_date_screen.dart';
import 'screens/forgot_password_screen.dart';
import 'screens/register_screen.dart';
import 'screens/reset_password_screen.dart';
import 'screens/verify_screen.dart';
import 'vidya/screens/vidya_splash_screen.dart';
import 'vidya/vidya_root_app.dart';

// Single API base URL — points at the web-student nginx, which proxies
// /api/v1/* to every backend service (auth, profile, quiz, catalog,
// analytics, adaptive, etc.). One port to forward, one URL to configure.
//
// Default points at the dev machine's LAN IP so a real Android/iOS
// device on the same Wi-Fi can reach the stack without any --dart-define.
// Override with --dart-define=ALP_API_BASE_URL=... when needed:
//   Android emulator: --dart-define=ALP_API_BASE_URL=http://10.0.2.2:35173/api/v1
//   iOS simulator:    --dart-define=ALP_API_BASE_URL=http://localhost:35173/api/v1
const _apiBaseUrl = String.fromEnvironment(
  'ALP_API_BASE_URL',
  defaultValue: 'http://192.168.29.85:35173/api/v1',
);

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // Aurora v3 Wave 1: apply dark system chrome before the first frame so the
  // OS status bar matches the splash + dark-locked theme. The notifier
  // listener below re-applies whenever the user toggles theme in Settings.
  AuroraSystemChrome.applyForTheme(ThemeMode.dark);
  // initialDeepLink will be wired in via the deep-link plugin in a follow-up;
  // the constructor accepts it now so tests and future wiring work.
  runApp(VidyaRootApp(auth: AuthClient(baseUrl: _apiBaseUrl)));
}

class AuroraGuestFlow extends StatefulWidget {
  const AuroraGuestFlow({
    super.key,
    required this.auth,
    this.initialDeepLink,
  });

  final AuthClient auth;

  /// Raw URL the OS handed us at cold start (e.g. from `app_links`'
  /// `getInitialAppLink`). Tests inject directly.
  final String? initialDeepLink;

  @override
  State<AuroraGuestFlow> createState() => _AuroraGuestFlowState();
}

enum _GuestScreen { login, register, verify, forgotPassword, resetPassword }

// Onboarding step order (Aurora v3 Wave 2 W2.0).
//
// `persona` is the new first step — it captures Kid / Teen / Aspirant /
// Learner and drives every downstream IA flex. Existing users with a
// persisted persona skip this step; new users always see it. The Welcome
// carousel and exam-prep flow follow as before for Teen / Aspirant.
//
// Kid persona ultimately routes to the Parent Unlock subflow before
// reaching Welcome — that branch lands in Wave 2 W2.6 and currently
// falls through to the standard flow with a TODO marker.
enum _OnboardStep {
  persona,
  consent, // DPDP §5–§7 + §9 — Aurora v3 W2.0.5
  welcome,
  exam,
  language,
  targetDate,
  dailyGoal,
  done,
}

class _AuroraGuestFlowState extends State<AuroraGuestFlow> {
  Session? _session;
  bool _bootstrapped = false;
  _GuestScreen _guestScreen = _GuestScreen.login;
  String? _pendingUserId;
  String? _pendingEmail;
  String? _resetToken;
  _OnboardStep _onboardStep = _OnboardStep.persona;

  // Aurora v2 — theme + density notifiers. Aurora v3 adds the persona
  // notifier. All three bootstrap from secure storage in parallel with
  // the auth client. See docs/02-design/design-system-v2-aurora-mobile.md
  // §4 (persona), §6 (density), §17 (theme).
  final _themeMode = ThemeModeNotifier();
  final _density = DensityNotifier();
  final _persona = PersonaNotifier();

  @override
  void initState() {
    super.initState();
    // Fan out four bootstraps in parallel. The app renders the splash
    // until all settle; then we know auth state + theme + density + persona.
    Future.wait<void>([
      widget.auth.bootstrap(),
      _themeMode.bootstrap(),
      _density.bootstrap(),
      _persona.bootstrap(),
    ]).whenComplete(() {
      if (!mounted) return;
      // After token rehydration, resolve the deep link (if any). A reset
      // link that arrives while the user is already signed in still routes
      // to reset — they asked for it; the active session gets revoked when
      // the new password is set anyway.
      final route = parseDeepLink(widget.initialDeepLink);
      setState(() {
        _bootstrapped = true;
        if (route.kind == DeepLinkRouteKind.resetPassword) {
          _resetToken = route.token;
          _guestScreen = _GuestScreen.resetPassword;
        }
        // Existing users with a saved persona skip the new persona-select
        // step. New users (no persisted choice) start at persona.
        if (_persona.hasChosen) _onboardStep = _OnboardStep.welcome;
      });
    });
    // Listen so MaterialApp rebuilds when the user changes theme, density,
    // or persona via Settings.
    _themeMode.addListener(_onThemeChanged);
    _density.addListener(_onThemeChanged);
    _persona.addListener(_onThemeChanged);
  }

  void _onThemeChanged() {
    if (!mounted) return;
    // Re-apply system chrome whenever the user toggles theme in Settings or
    // the OS flips while on ThemeMode.system.
    AuroraSystemChrome.applyForTheme(_themeMode.mode);
    setState(() {});
  }

  @override
  void dispose() {
    _themeMode.removeListener(_onThemeChanged);
    _density.removeListener(_onThemeChanged);
    _persona.removeListener(_onThemeChanged);
    _themeMode.dispose();
    _density.dispose();
    _persona.dispose();
    super.dispose();
  }

  Widget _guestRoute() {
    switch (_guestScreen) {
      case _GuestScreen.login:
        return LoginScreen(
          auth: widget.auth,
          onLoggedIn: (s) => setState(() => _session = s),
          onSignUp: () => setState(() => _guestScreen = _GuestScreen.register),
          onForgotPassword: () =>
              setState(() => _guestScreen = _GuestScreen.forgotPassword),
        );
      case _GuestScreen.register:
        return RegisterScreen(
          auth: widget.auth,
          onRegistered: (result, email) => setState(() {
            _pendingUserId = result.userId;
            _pendingEmail = email;
            _guestScreen = _GuestScreen.verify;
          }),
          onBackToLogin: () => setState(() => _guestScreen = _GuestScreen.login),
        );
      case _GuestScreen.verify:
        return VerifyScreen(
          auth: widget.auth,
          userId: _pendingUserId ?? '',
          email: _pendingEmail ?? '',
          onVerified: (s) => setState(() {
            _session = s;
            _pendingUserId = null;
            _pendingEmail = null;
            _guestScreen = _GuestScreen.login; // reset so log-out lands on /login
          }),
          onBack: () => setState(() => _guestScreen = _GuestScreen.register),
        );
      case _GuestScreen.forgotPassword:
        return ForgotPasswordScreen(
          auth: widget.auth,
          onBackToLogin: () => setState(() => _guestScreen = _GuestScreen.login),
        );
      case _GuestScreen.resetPassword:
        return ResetPasswordScreen(
          auth: widget.auth,
          token: _resetToken ?? '',
          onResetCompleted: () => setState(() {
            // Auth has revoked all refresh tokens; force a fresh sign-in.
            _resetToken = null;
            _session = null;
            _guestScreen = _GuestScreen.login;
          }),
          onBackToLogin: () => setState(() {
            _resetToken = null;
            _guestScreen = _GuestScreen.login;
          }),
        );
    }
  }

  Widget _onboardingRoute() {
    switch (_onboardStep) {
      case _OnboardStep.persona:
        return PersonaSelectScreen(
          notifier: _persona,
          onContinue: () {
            // TODO(W2.6): Kid persona should route into the Parent Unlock
            // subflow before reaching Welcome. Until that brief lands the
            // four personas share the same downstream flow. The new
            // [_OnboardStep.consent] step runs immediately after Persona
            // so DPDP consent is captured before any AI surface activates.
            setState(() => _onboardStep = _OnboardStep.consent);
          },
        );
      case _OnboardStep.consent:
        return ConsentScreen(
          persona: _persona.persona,
          // TODO(W2.0.5 backend): replace debugStub with the real
          // ConsentApi backed by alp-identity endpoints once they land.
          api: ConsentApi.debugStub(),
          onContinue: () =>
              setState(() => _onboardStep = _OnboardStep.welcome),
        );
      case _OnboardStep.welcome:
        return WelcomeScreen(
          onContinue: () =>
              setState(() => _onboardStep = _OnboardStep.exam),
        );
      case _OnboardStep.exam:
        return ExamSelectScreen(
          auth: widget.auth,
          onContinue: () => setState(() => _onboardStep = _OnboardStep.language),
        );
      case _OnboardStep.language:
        return LanguageScreen(
          auth: widget.auth,
          onContinue: () => setState(() => _onboardStep = _OnboardStep.targetDate),
          onBack: () => setState(() => _onboardStep = _OnboardStep.exam),
        );
      case _OnboardStep.targetDate:
        return TargetDateScreen(
          auth: widget.auth,
          onContinue: () => setState(() => _onboardStep = _OnboardStep.dailyGoal),
          onBack: () => setState(() => _onboardStep = _OnboardStep.language),
        );
      case _OnboardStep.dailyGoal:
        return DailyGoalScreen(
          auth: widget.auth,
          onCompleted: () => setState(() => _onboardStep = _OnboardStep.done),
          onBack: () => setState(() => _onboardStep = _OnboardStep.targetDate),
        );
      case _OnboardStep.done:
        // Refresh the session state with the now-onboarded user.
        return MainScaffold(
          auth: widget.auth,
          onSignOut: () async {
            await widget.auth.logout();
            if (mounted) {
              setState(() {
                _session = null;
                // Reset to whichever step is appropriate: persona-select
                // for genuinely-new users; welcome for users who have
                // already picked a persona and are just signing in again.
                _onboardStep = _persona.hasChosen
                    ? _OnboardStep.welcome
                    : _OnboardStep.persona;
              });
            }
          },
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    // AuroraRoute provides the enclosing MaterialApp + Aurora theme;
    // this widget just returns the current home content directly.
    return !_bootstrapped
        ? const VidyaSplashScreen()
        : _session == null
            ? _guestRoute()
            : _session!.user.onboardingState == 'ONBOARDED'
                ? MainScaffold(
                    auth: widget.auth,
                    onSignOut: () async {
                      await widget.auth.logout();
                      if (mounted) setState(() => _session = null);
                    },
                  )
                : _onboardingRoute();
  }
}
