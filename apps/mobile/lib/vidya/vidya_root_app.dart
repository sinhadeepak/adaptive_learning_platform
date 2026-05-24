// VidyaRootApp — runApp target for Phase 2a+. Owns the Vidya
// notifiers, bootstraps them in parallel with the AuthClient and
// the vidya.onboarding_done flag, then drives a 7-state machine
// from splash → welcome → 3 cards → exam-select → AuroraRoute.

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../auth/auth_client.dart';
import '../main.dart' show AuroraGuestFlow;
import 'aurora_route.dart';
import 'density_notifier.dart';
import 'persona_notifier.dart';
import 'screens/vidya_exam_select_screen.dart';
import 'screens/vidya_onboarding_card_screen.dart';
import 'screens/vidya_splash_screen.dart';
import 'screens/vidya_welcome_screen.dart';
import 'theme_mode_notifier.dart';
import 'vidya_app.dart';

enum _VidyaScreen {
  splash,
  welcome,
  card1,
  card2,
  card3,
  examSelect,
  aurora,
}

class VidyaRootApp extends StatefulWidget {
  final AuthClient auth;
  const VidyaRootApp({super.key, required this.auth});

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
    setState(() {
      _bootstrapped = true;
      _screen = onboardingDone == 'true' ? _VidyaScreen.aurora : _VidyaScreen.welcome;
    });
  }

  void _rebuild() {
    if (mounted) setState(() {});
  }

  Future<void> _markOnboardingDone() async {
    await _storage.write(key: _onboardingDoneKey, value: 'true');
    if (mounted) setState(() => _screen = _VidyaScreen.aurora);
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
          onSignIn: _markOnboardingDone,
          onSkip: _markOnboardingDone,
        );
      case _VidyaScreen.card1:
        return VidyaOnboardingCardScreen(
          cardIndex: 1,
          onContinue: () => setState(() => _screen = _VidyaScreen.card2),
          onSkip: () => setState(() => _screen = _VidyaScreen.examSelect),
          onBack: () => setState(() => _screen = _VidyaScreen.welcome),
        );
      case _VidyaScreen.card2:
        return VidyaOnboardingCardScreen(
          cardIndex: 2,
          onContinue: () => setState(() => _screen = _VidyaScreen.card3),
          onSkip: () => setState(() => _screen = _VidyaScreen.examSelect),
          onBack: () => setState(() => _screen = _VidyaScreen.card1),
        );
      case _VidyaScreen.card3:
        return VidyaOnboardingCardScreen(
          cardIndex: 3,
          onContinue: () => setState(() => _screen = _VidyaScreen.examSelect),
          onSkip: () => setState(() => _screen = _VidyaScreen.examSelect),
          onBack: () => setState(() => _screen = _VidyaScreen.card2),
        );
      case _VidyaScreen.examSelect:
        return VidyaExamSelectScreen(
          auth: widget.auth,
          onContinue: _markOnboardingDone,
          onBack: () => setState(() => _screen = _VidyaScreen.card3),
        );
      case _VidyaScreen.aurora:
        return AuroraRoute(builder: (_) => AuroraGuestFlow(auth: widget.auth));
    }
  }
}
