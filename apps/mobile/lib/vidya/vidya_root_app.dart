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
