import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_splash_screen.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_welcome_screen.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_onboarding_card_screen.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_exam_select_screen.dart';

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

void main() {
  group('VidyaSplashScreen', () {
    testWidgets('renders in light theme', (tester) async {
      await tester.pumpWidget(_harness(child: const VidyaSplashScreen()));
      expect(find.byType(VidyaSplashScreen), findsOneWidget);
    });

    testWidgets('renders in dark theme', (tester) async {
      await tester.pumpWidget(_harness(
        brightness: Brightness.dark,
        child: const VidyaSplashScreen(),
      ));
      expect(find.byType(VidyaSplashScreen), findsOneWidget);
    });

    testWidgets('renders for every persona', (tester) async {
      for (final p in VidyaPersona.values) {
        await tester.pumpWidget(_harness(
          persona: p,
          child: const VidyaSplashScreen(),
        ));
        expect(find.byType(VidyaSplashScreen), findsOneWidget);
      }
    });

    testWidgets('renders for every density', (tester) async {
      for (final d in VidyaDensity.values) {
        await tester.pumpWidget(_harness(
          density: d,
          child: const VidyaSplashScreen(),
        ));
        expect(find.byType(VidyaSplashScreen), findsOneWidget);
      }
    });
  });

  group('VidyaWelcomeScreen', () {
    testWidgets('renders Get Started and Sign In CTAs', (tester) async {
      var getStarted = 0;
      var signIn = 0;
      var skip = 0;
      await tester.pumpWidget(_harness(
        child: VidyaWelcomeScreen(
          onGetStarted: () => getStarted++,
          onSignIn: () => signIn++,
          onSkip: () => skip++,
        ),
      ));
      expect(find.text('Get started'), findsOneWidget);
      expect(find.text('Sign in'), findsOneWidget);
    });

    testWidgets('Get Started fires callback', (tester) async {
      var taps = 0;
      await tester.pumpWidget(_harness(
        child: VidyaWelcomeScreen(
          onGetStarted: () => taps++,
          onSignIn: () {},
          onSkip: () {},
        ),
      ));
      await tester.tap(find.text('Get started'));
      await tester.pumpAndSettle();
      expect(taps, 1);
    });

    testWidgets('Sign in fires callback', (tester) async {
      var taps = 0;
      await tester.pumpWidget(_harness(
        child: VidyaWelcomeScreen(
          onGetStarted: () {},
          onSignIn: () => taps++,
          onSkip: () {},
        ),
      ));
      await tester.tap(find.text('Sign in'));
      await tester.pumpAndSettle();
      expect(taps, 1);
    });

    testWidgets('renders in dark + all personas + all densities',
        (tester) async {
      Widget make() => VidyaWelcomeScreen(
            onGetStarted: () {},
            onSignIn: () {},
            onSkip: () {},
          );
      await tester.pumpWidget(_harness(brightness: Brightness.dark, child: make()));
      expect(find.byType(VidyaWelcomeScreen), findsOneWidget);
      for (final p in VidyaPersona.values) {
        await tester.pumpWidget(_harness(persona: p, child: make()));
        expect(find.byType(VidyaWelcomeScreen), findsOneWidget);
      }
      for (final d in VidyaDensity.values) {
        await tester.pumpWidget(_harness(density: d, child: make()));
        expect(find.byType(VidyaWelcomeScreen), findsOneWidget);
      }
    });
  });

  group('VidyaOnboardingCardScreen', () {
    Widget make({required int cardIndex}) => VidyaOnboardingCardScreen(
          cardIndex: cardIndex,
          onContinue: () {},
          onSkip: () {},
          onBack: () {},
        );

    testWidgets('renders card 1 (AI adapts)', (tester) async {
      await tester.pumpWidget(_harness(child: make(cardIndex: 1)));
      expect(find.byType(VidyaOnboardingCardScreen), findsOneWidget);
      expect(find.text('1 of 3'), findsOneWidget);
    });

    testWidgets('renders card 2 (Readiness)', (tester) async {
      await tester.pumpWidget(_harness(child: make(cardIndex: 2)));
      expect(find.text('2 of 3'), findsOneWidget);
    });

    testWidgets('renders card 3 (Guided)', (tester) async {
      await tester.pumpWidget(_harness(child: make(cardIndex: 3)));
      expect(find.text('3 of 3'), findsOneWidget);
    });

    testWidgets('Continue fires onContinue', (tester) async {
      var taps = 0;
      await tester.pumpWidget(_harness(
        child: VidyaOnboardingCardScreen(
          cardIndex: 1,
          onContinue: () => taps++,
          onSkip: () {},
          onBack: () {},
        ),
      ));
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
      expect(taps, 1);
    });

    testWidgets('Skip fires onSkip', (tester) async {
      var taps = 0;
      await tester.pumpWidget(_harness(
        child: VidyaOnboardingCardScreen(
          cardIndex: 1,
          onContinue: () {},
          onSkip: () => taps++,
          onBack: () {},
        ),
      ));
      await tester.tap(find.text('Skip'));
      await tester.pumpAndSettle();
      expect(taps, 1);
    });

    testWidgets('renders dark + all personas + all densities', (tester) async {
      await tester.pumpWidget(_harness(
        brightness: Brightness.dark,
        child: make(cardIndex: 2),
      ));
      expect(find.byType(VidyaOnboardingCardScreen), findsOneWidget);
      for (final p in VidyaPersona.values) {
        await tester.pumpWidget(_harness(persona: p, child: make(cardIndex: 2)));
        expect(find.byType(VidyaOnboardingCardScreen), findsOneWidget);
      }
      for (final d in VidyaDensity.values) {
        await tester.pumpWidget(_harness(density: d, child: make(cardIndex: 2)));
        expect(find.byType(VidyaOnboardingCardScreen), findsOneWidget);
      }
    });
  });

  // ─── VidyaExamSelectScreen ───────────────────────────────────────────────

  AuthClient makeAuth(
    String examListJson, {
    void Function()? onPut,
  }) {
    return AuthClient(
      baseUrl: 'http://test',
      httpClient: MockClient((req) async {
        if (req.method == 'GET' && req.url.path.endsWith('/catalog/exams')) {
          return http.Response(
            examListJson,
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (req.method == 'PUT' && req.url.path.endsWith('/profile/exams')) {
          onPut?.call();
          return http.Response('{"ok":true}', 200);
        }
        return http.Response('{}', 404);
      }),
    );
  }

  group('VidyaExamSelectScreen', () {
    setUpAll(() {
      FlutterSecureStorage.setMockInitialValues({});
    });

    testWidgets('shows loading then exam list', (tester) async {
      final auth = makeAuth(
        '[{"id":"e1","code":"NEET","name":"NEET","subtitle":"Medical"},'
        '{"id":"e2","code":"JEE_MAIN","name":"JEE Main","subtitle":"Engineering"}]',
      );
      await tester.pumpWidget(_harness(
        child: VidyaExamSelectScreen(
          auth: auth,
          onContinue: () {},
          onBack: () {},
        ),
      ));
      // Loading state
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      await tester.pumpAndSettle();
      // Exam list rendered
      expect(find.text('NEET'), findsOneWidget);
      expect(find.text('JEE Main'), findsOneWidget);
      expect(find.text('Medical'), findsOneWidget);
      expect(find.text('Engineering'), findsOneWidget);
    });

    testWidgets('Continue is disabled until exam picked', (tester) async {
      final auth = makeAuth(
        '[{"id":"e1","code":"NEET","name":"NEET","subtitle":"Medical"}]',
      );
      await tester.pumpWidget(_harness(
        child: VidyaExamSelectScreen(
          auth: auth,
          onContinue: () {},
          onBack: () {},
        ),
      ));
      await tester.pumpAndSettle();

      // Continue button is present but disabled (no exam selected)
      final continueBtn = find.byKey(const Key('vidya.exam.continue'));
      expect(continueBtn, findsOneWidget);

      // Tap it — nothing should happen since it's disabled
      var continued = false;
      await tester.pumpWidget(_harness(
        child: VidyaExamSelectScreen(
          auth: auth,
          onContinue: () => continued = true,
          onBack: () {},
        ),
      ));
      await tester.pumpAndSettle();
      await tester.tap(continueBtn, warnIfMissed: false);
      await tester.pump();
      expect(continued, isFalse);

      // Now select an exam — Continue becomes active
      await tester.tap(find.byKey(const Key('vidya.exam.card.NEET')));
      await tester.pump();
      await tester.tap(continueBtn);
      await tester.pumpAndSettle();
      expect(continued, isTrue);
    });

    testWidgets('Continue after selection calls PUT + onContinue', (tester) async {
      var putCalled = false;
      var continued = false;
      final auth = makeAuth(
        '[{"id":"e1","code":"JEE_MAIN","name":"JEE Main","subtitle":"Engineering"}]',
        onPut: () => putCalled = true,
      );
      await tester.pumpWidget(_harness(
        child: VidyaExamSelectScreen(
          auth: auth,
          onContinue: () => continued = true,
          onBack: () {},
        ),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('vidya.exam.card.JEE_MAIN')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('vidya.exam.continue')));
      await tester.pumpAndSettle();

      expect(putCalled, isTrue);
      expect(continued, isTrue);
    });

    testWidgets('renders dark + all personas + all densities', (tester) async {
      Widget make() => VidyaExamSelectScreen(
            auth: makeAuth('[{"id":"e1","code":"NEET","name":"NEET"}]'),
            onContinue: () {},
            onBack: () {},
          );

      await tester.pumpWidget(
          _harness(brightness: Brightness.dark, child: make()));
      await tester.pumpAndSettle();
      expect(find.byType(VidyaExamSelectScreen), findsOneWidget);

      for (final p in VidyaPersona.values) {
        await tester.pumpWidget(_harness(persona: p, child: make()));
        await tester.pumpAndSettle();
        expect(find.byType(VidyaExamSelectScreen), findsOneWidget);
      }
      for (final d in VidyaDensity.values) {
        await tester.pumpWidget(_harness(density: d, child: make()));
        await tester.pumpAndSettle();
        expect(find.byType(VidyaExamSelectScreen), findsOneWidget);
      }
    });
  });
}
