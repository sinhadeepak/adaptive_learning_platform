import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'package:adaptive_learning_mobile/vidya/screens/vidya_splash_screen.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_welcome_screen.dart';

Widget _harness(Widget child) => MaterialApp(
      theme: VidyaTheme.material(
        brightness: Brightness.light,
        persona: VidyaPersona.aspirant,
        density: VidyaDensity.regular,
      ),
      home: child,
    );

void main() {
  group('VidyaSplashScreen (Phase 2d polish)', () {
    testWidgets('renders vidya wordmark with italic accent + tagline',
        (tester) async {
      await tester.pumpWidget(_harness(const VidyaSplashScreen()));
      expect(find.byKey(const Key('vidya.splash.wordmark')), findsOneWidget);
      expect(find.text('THE ADAPTIVE TUTOR'), findsOneWidget);
    });

    testWidgets('shows a progress indicator', (tester) async {
      await tester.pumpWidget(_harness(const VidyaSplashScreen()));
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });
  });

  group('VidyaWelcomeScreen (Phase 2d polish)', () {
    setUp(() {
      FlutterSecureStorage.setMockInitialValues({});
    });

    testWidgets('renders wordmark + lang toggle + eyebrow + headline',
        (tester) async {
      await tester.pumpWidget(_harness(VidyaWelcomeScreen(
        onGetStarted: () {},
        onSignIn: () {},
        onSkip: () {},
      )));
      expect(find.byKey(const Key('vidya.welcome.wordmark')), findsOneWidget);
      expect(find.byKey(const Key('vidya.welcome.lang')), findsOneWidget);
      expect(find.text('WELCOME TO VIDYA'), findsOneWidget);
      expect(find.textContaining('adaptive'), findsAtLeastNWidgets(1));
    });

    testWidgets('CTAs are wired', (tester) async {
      var getStarted = 0, signIn = 0;
      await tester.pumpWidget(_harness(VidyaWelcomeScreen(
        onGetStarted: () => getStarted++,
        onSignIn: () => signIn++,
        onSkip: () {},
      )));
      await tester.tap(find.byKey(const Key('vidya.welcome.getStarted')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('vidya.welcome.signIn')));
      await tester.pumpAndSettle();
      expect(getStarted, 1);
      expect(signIn, 1);
    });

    testWidgets('lang toggle defaults to EN and tapping हि persists choice',
        (tester) async {
      await tester.pumpWidget(_harness(VidyaWelcomeScreen(
        onGetStarted: () {},
        onSignIn: () {},
        onSkip: () {},
      )));
      await tester.tap(find.text('हि'));
      await tester.pumpAndSettle();
      const storage = FlutterSecureStorage();
      expect(await storage.read(key: 'vidya.lang'), 'hi');
    });

    testWidgets('renders terms text', (tester) async {
      await tester.pumpWidget(_harness(VidyaWelcomeScreen(
        onGetStarted: () {},
        onSignIn: () {},
        onSkip: () {},
      )));
      expect(find.textContaining('By continuing'), findsOneWidget);
    });
  });
}
