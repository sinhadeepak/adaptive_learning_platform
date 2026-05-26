// VidyaRootApp — runApp target for Phase 2a+. Owns the Vidya
// notifiers, bootstraps them in parallel with the AuthClient and
// the vidya.onboarding_done flag, then drives an 18-state machine
// covering onboarding + auth + screening + guest screening + home.

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import '../auth/auth_client.dart';
import '../auth/deep_link.dart';
import '../screens/main_scaffold.dart';
import 'aurora_route.dart';
import 'density_notifier.dart';
import 'persona_notifier.dart';
import 'screening_client.dart';
import 'screens/vidya_exam_select_screen.dart';
import 'screens/vidya_forgot_password_screen.dart';
import 'screens/vidya_guest_screening_intro_screen.dart';
import 'screens/vidya_guest_screening_result_screen.dart';
import 'screens/vidya_login_screen.dart';
import 'screens/vidya_new_password_screen.dart';
import 'screens/vidya_onboarding_card_screen.dart';
import 'screens/vidya_register_screen.dart';
import 'screens/vidya_screening_intro_screen.dart';
import 'screens/vidya_screening_quiz_screen.dart';
import 'screens/vidya_screening_result_screen.dart';
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
  screeningIntro,
  screeningQuiz,
  screeningResult,
  guestExamSelect,
  guestScreeningIntro,
  guestScreeningResult,
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
  static const _screeningDoneKey = 'vidya.screening_done';
  static const _screeningSkippedKey = 'vidya.screening_skipped';

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

  // Screening state.
  String? _screeningToken;
  String? _selectedExamCode;

  // Guest-funnel state — set in the pre-auth flow and consumed in
  // _onSignedIn to claim the anonymous attempt for the new account.
  String? _pendingGuestToken;
  String? _pendingGuestExamCode;
  late final ScreeningClient _screeningClient = ScreeningClient(
    baseUrl: widget.auth.baseUrl,
    httpClient: http.Client(),
    auth: widget.auth,
  );

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
      // Already logged in — if onboarding is done, go straight to home.
      // Otherwise, drop them at examSelect so they can complete setup.
      if (onboardingDone == 'true') return _VidyaScreen.home;
      return _VidyaScreen.examSelect;
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
          onContinue: () =>
              setState(() => _screen = _VidyaScreen.guestExamSelect),
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
            final done = await _storage.read(key: _screeningDoneKey);
            final skipped = await _storage.read(key: _screeningSkippedKey);
            final code = await _storage.read(key: 'vidya.selected_exam_code');
            if (!mounted) return;
            setState(() {
              _selectedExamCode = code;
              _screen = (done == 'true' || skipped == 'true')
                  ? _VidyaScreen.home
                  : _VidyaScreen.screeningIntro;
            });
          },
          onBack: () => setState(() => _screen = _VidyaScreen.welcome),
        );
      case _VidyaScreen.screeningIntro:
        return VidyaScreeningIntroScreen(
          onStart: () => setState(() => _screen = _VidyaScreen.screeningQuiz),
          onSkip: () async {
            await _storage.write(key: _screeningSkippedKey, value: 'true');
            if (mounted) setState(() => _screen = _VidyaScreen.home);
          },
        );
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
      case _VidyaScreen.screeningResult:
        return VidyaScreeningResultScreen(
          client: _screeningClient,
          token: _screeningToken ?? '',
          onCompleted: () async {
            await _storage.write(key: _screeningDoneKey, value: 'true');
            if (mounted) setState(() => _screen = _VidyaScreen.home);
          },
        );
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
