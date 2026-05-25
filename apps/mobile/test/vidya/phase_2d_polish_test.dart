import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_splash_screen.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_welcome_screen.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_onboarding_card_screen.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_exam_select_screen.dart';

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

  group('VidyaOnboardingCardScreen (Phase 2d polish)', () {
    Widget _withSize(Widget child) => MediaQuery(
          data: const MediaQueryData(size: Size(390, 800)),
          child: _harness(child),
        );

    testWidgets('card 1 renders ADAPTIVE ENGINE eyebrow + sigmoid + YOU marker',
        (tester) async {
      await tester.pumpWidget(_withSize(VidyaOnboardingCardScreen(
        cardIndex: 1,
        onContinue: () {},
        onSkip: () {},
        onBack: () {},
      )));
      await tester.pumpAndSettle();
      expect(find.textContaining('ADAPTIVE ENGINE'), findsOneWidget);
      expect(find.text('Every question, tuned to you.'), findsOneWidget);
      expect(find.byType(VidyaSigmoidIllustration), findsOneWidget);
      expect(find.textContaining('YOU'), findsAtLeastNWidgets(1));
    });

    testWidgets('card 2 renders READINESS SCORE eyebrow + radial + 728',
        (tester) async {
      await tester.pumpWidget(_withSize(VidyaOnboardingCardScreen(
        cardIndex: 2,
        onContinue: () {},
        onSkip: () {},
        onBack: () {},
      )));
      await tester.pumpAndSettle();
      expect(find.text('READINESS SCORE'), findsOneWidget);
      expect(find.text('One number, every day.'), findsOneWidget);
      expect(find.byType(VidyaReadinessRadial), findsOneWidget);
      expect(find.text('728'), findsOneWidget);
    });

    testWidgets('card 3 renders DAILY PLAN eyebrow + topic bars',
        (tester) async {
      await tester.pumpWidget(_withSize(VidyaOnboardingCardScreen(
        cardIndex: 3,
        onContinue: () {},
        onSkip: () {},
        onBack: () {},
      )));
      await tester.pumpAndSettle();
      expect(find.text('DAILY PLAN'), findsOneWidget);
      expect(find.text('The shortest path to your rank.'), findsOneWidget);
      expect(find.byType(VidyaTopicAllocationBar), findsOneWidget);
      expect(find.text('Thermodynamics'), findsOneWidget);
      expect(find.text('62%'), findsOneWidget);
    });
  });

  group('VidyaExamSelectScreen (Phase 2d polish)', () {
    AuthClient _auth(List<Map<String, dynamic>> examPayload) =>
        AuthClient(
          baseUrl: 'http://test',
          httpClient: MockClient((req) async {
            if (req.url.path.endsWith('/catalog/exams')) {
              return http.Response(
                jsonEncode(examPayload),
                200,
                headers: {'content-type': 'application/json'},
              );
            }
            if (req.url.path.endsWith('/profile/exams')) {
              return http.Response('{}', 200);
            }
            return http.Response('{}', 404);
          }),
        );

    testWidgets('renders STEP eyebrow + title', (tester) async {
      await tester.pumpWidget(_harness(VidyaExamSelectScreen(
        auth: _auth([
          {
            'id': 'a-neet',
            'code': 'NEET',
            'name': 'National Eligibility Test',
            'subtitle': 'Medical · MBBS / BDS / AYUSH',
          },
        ]),
        onContinue: () {},
        onBack: () {},
      )));
      await tester.pumpAndSettle();
      expect(find.textContaining('STEP 1'), findsOneWidget);
      expect(find.text('Choose your exam'), findsOneWidget);
    });

    testWidgets('renders exam name + subtitle + aspirant count badge',
        (tester) async {
      await tester.pumpWidget(_harness(VidyaExamSelectScreen(
        auth: _auth([
          {
            'id': 'a-neet',
            'code': 'NEET',
            'name': 'National Eligibility Test',
            'subtitle': 'Medical · MBBS / BDS / AYUSH',
          },
        ]),
        onContinue: () {},
        onBack: () {},
      )));
      await tester.pumpAndSettle();
      expect(find.text('National Eligibility Test'), findsOneWidget);
      expect(find.text('Medical · MBBS / BDS / AYUSH'), findsOneWidget);
      expect(find.textContaining('2.4M aspirants'), findsOneWidget);
    });

    testWidgets('Continue label switches to exam-aware once a card is tapped',
        (tester) async {
      await tester.pumpWidget(_harness(VidyaExamSelectScreen(
        auth: _auth([
          {
            'id': 'a-neet',
            'code': 'NEET',
            'name': 'National Eligibility Test',
            'subtitle': 'Medical · MBBS / BDS / AYUSH',
          },
        ]),
        onContinue: () {},
        onBack: () {},
      )));
      await tester.pumpAndSettle();
      expect(find.text('Continue'), findsOneWidget);
      await tester.tap(find.text('National Eligibility Test'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Continue with NEET'), findsOneWidget);
    });
  });
}
