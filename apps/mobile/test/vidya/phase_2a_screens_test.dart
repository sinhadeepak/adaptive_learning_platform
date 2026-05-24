import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:adaptive_learning_mobile/vidya/screens/vidya_splash_screen.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_welcome_screen.dart';

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
}
