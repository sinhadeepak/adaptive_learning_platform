import 'package:flutter/material.dart';
import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'auth/auth_client.dart';
import 'auth/deep_link.dart';
import 'screens/main_scaffold.dart';
import 'screens/login_screen.dart';
import 'screens/onboarding/daily_goal_screen.dart';
import 'screens/onboarding/exam_select_screen.dart';
import 'screens/onboarding/language_screen.dart';
import 'screens/onboarding/target_date_screen.dart';
import 'screens/forgot_password_screen.dart';
import 'screens/register_screen.dart';
import 'screens/reset_password_screen.dart';
import 'screens/verify_screen.dart';

// Single API base URL — points at the web-student nginx, which proxies
// /api/v1/* to every backend service (auth, profile, quiz, catalog,
// analytics, adaptive, etc.). One port to forward, one URL to configure.
//
// Defaults:
//   Android emulator: 10.0.2.2 maps to the dev machine.
//   iOS simulator:    use --dart-define=ALP_API_BASE_URL=http://localhost:35173/api/v1
//   Real device:      use --dart-define=ALP_API_BASE_URL=http://<host-LAN-IP>:35173/api/v1
//                     and ensure WSL→LAN forwarding (see docs/local-testing.md).
const _apiBaseUrl = String.fromEnvironment(
  'ALP_API_BASE_URL',
  defaultValue: 'http://10.0.2.2:35173/api/v1',
);

void main() {
  runApp(AdaptiveLearningApp(auth: AuthClient(baseUrl: _apiBaseUrl)));
}

class AdaptiveLearningApp extends StatefulWidget {
  const AdaptiveLearningApp({
    super.key,
    required this.auth,
    this.initialDeepLink,
  });

  final AuthClient auth;

  /// Raw URL the OS handed us at cold start (e.g. from `app_links`'
  /// `getInitialAppLink`). Tests inject directly.
  final String? initialDeepLink;

  @override
  State<AdaptiveLearningApp> createState() => _AdaptiveLearningAppState();
}

enum _GuestScreen { login, register, verify, forgotPassword, resetPassword }

enum _OnboardStep { exam, language, targetDate, dailyGoal, done }

class _AdaptiveLearningAppState extends State<AdaptiveLearningApp> {
  Session? _session;
  bool _bootstrapped = false;
  _GuestScreen _guestScreen = _GuestScreen.login;
  String? _pendingUserId;
  String? _pendingEmail;
  String? _resetToken;
  _OnboardStep _onboardStep = _OnboardStep.exam;

  @override
  void initState() {
    super.initState();
    widget.auth.bootstrap().whenComplete(() {
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
      });
    });
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
                _onboardStep = _OnboardStep.exam;
              });
            }
          },
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Adaptive Learning Platform',
      // Dark theme per docs/ui/02_MobileApp/. Brand seed is the student-blue
      // accent; scaffold uses the canonical bg-base. Surface defaults switch
      // to bgSurface1 so cards/dialogs sit on the correct shade.
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        colorSchemeSeed: AlpColors.brandPrimary,
        scaffoldBackgroundColor: AlpColors.bgBase,
        canvasColor: AlpColors.bgBase,
        cardColor: AlpColors.bgSurface2,
        dialogBackgroundColor: AlpColors.bgSurface1,
        dividerColor: AlpColors.borderDefault,
        textTheme: const TextTheme(
          bodyLarge: AlpTextStyles.body,
          bodyMedium: AlpTextStyles.body,
          titleLarge: AlpTextStyles.pageTitle,
          titleMedium: AlpTextStyles.sectionHeading,
          labelLarge: AlpTextStyles.label,
        ),
      ),
      home: !_bootstrapped
          ? const _Splash()
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
                  : _onboardingRoute(),
    );
  }
}

class _Splash extends StatelessWidget {
  const _Splash();
  @override
  Widget build(BuildContext context) =>
      const Scaffold(body: Center(child: CircularProgressIndicator()));
}

/// Sprint-0 shell preserved for the legacy widget-render test.
class AdaptiveLearningAppLegacy extends StatelessWidget {
  const AdaptiveLearningAppLegacy({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Adaptive Learning Platform',
      theme: ThemeData(useMaterial3: true, colorSchemeSeed: Colors.indigo),
      home: const Scaffold(
        body: Center(
          child: Text(
            'Adaptive Learning Platform\nSprint 0 shell',
            textAlign: TextAlign.center,
          ),
        ),
      ),
    );
  }
}
