import 'package:flutter/material.dart';
import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'auth/auth_client.dart';
import 'screens/login_screen.dart';
import 'screens/onboarding/daily_goal_screen.dart';
import 'screens/onboarding/exam_select_screen.dart';
import 'screens/onboarding/language_screen.dart';
import 'screens/onboarding/target_date_screen.dart';
import 'screens/register_screen.dart';
import 'screens/verify_screen.dart';

const _apiBaseUrl = String.fromEnvironment(
  'ALP_API_BASE_URL',
  defaultValue: 'http://10.0.2.2:38001',
);

void main() {
  runApp(AdaptiveLearningApp(auth: AuthClient(baseUrl: _apiBaseUrl)));
}

class AdaptiveLearningApp extends StatefulWidget {
  const AdaptiveLearningApp({super.key, required this.auth});

  final AuthClient auth;

  @override
  State<AdaptiveLearningApp> createState() => _AdaptiveLearningAppState();
}

enum _GuestScreen { login, register, verify }

enum _OnboardStep { exam, language, targetDate, dailyGoal, done }

class _AdaptiveLearningAppState extends State<AdaptiveLearningApp> {
  Session? _session;
  bool _bootstrapped = false;
  _GuestScreen _guestScreen = _GuestScreen.login;
  String? _pendingUserId;
  String? _pendingEmail;
  _OnboardStep _onboardStep = _OnboardStep.exam;

  @override
  void initState() {
    super.initState();
    widget.auth.bootstrap().whenComplete(() {
      if (mounted) setState(() => _bootstrapped = true);
    });
  }

  Widget _guestRoute() {
    switch (_guestScreen) {
      case _GuestScreen.login:
        return LoginScreen(
          auth: widget.auth,
          onLoggedIn: (s) => setState(() => _session = s),
          onSignUp: () => setState(() => _guestScreen = _GuestScreen.register),
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
        return _HomePlaceholder(
          user: widget.auth.user ?? _session!.user,
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
      theme: ThemeData(
        useMaterial3: true,
        colorSchemeSeed: AlpColors.brandPrimary,
        scaffoldBackgroundColor: AlpColors.surfaceSecondary,
      ),
      home: !_bootstrapped
          ? const _Splash()
          : _session == null
              ? _guestRoute()
              : _session!.user.onboardingState == 'ONBOARDED'
                  ? _HomePlaceholder(
                      user: _session!.user,
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

class _HomePlaceholder extends StatelessWidget {
  const _HomePlaceholder({required this.user, required this.onSignOut});
  final User user;
  final VoidCallback onSignOut;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Welcome, ${user.firstName}'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: onSignOut,
          ),
        ],
      ),
      body: const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            'Onboarding + catalog screens land in the next mobile pass.\n\nFor now: signed in.',
            textAlign: TextAlign.center,
          ),
        ),
      ),
    );
  }
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
