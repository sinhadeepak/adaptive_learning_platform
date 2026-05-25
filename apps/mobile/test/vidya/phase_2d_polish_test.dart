import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:adaptive_learning_mobile/vidya/screens/vidya_splash_screen.dart';

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
}
