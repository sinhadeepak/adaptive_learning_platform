import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:adaptive_learning_mobile/vidya/screens/vidya_splash_screen.dart';

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
}
