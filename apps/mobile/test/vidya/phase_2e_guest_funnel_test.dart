import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:adaptive_learning_mobile/vidya/screens/vidya_guest_screening_intro_screen.dart';

Widget _harness(Widget child) => MaterialApp(
      theme: VidyaTheme.material(
        brightness: Brightness.light,
        persona: VidyaPersona.aspirant,
        density: VidyaDensity.regular,
      ),
      home: child,
    );

void main() {
  group('VidyaGuestScreeningIntroScreen', () {
    testWidgets('renders eyebrow + headline + info rows + CTAs',
        (tester) async {
      await tester.pumpWidget(_harness(VidyaGuestScreeningIntroScreen(
        onStart: () {},
        onSkip: () {},
      )));
      expect(find.text('5-MINUTE SCREENING'), findsOneWidget);
      expect(find.text('See where you stand. Before signing up.'),
          findsOneWidget);
      expect(find.textContaining('15 adaptive questions'), findsOneWidget);
      expect(find.text('Time'), findsOneWidget);
      expect(find.text('Questions'), findsOneWidget);
      expect(find.text("You'll get"), findsOneWidget);
      expect(find.text('Privacy'), findsOneWidget);
      expect(find.byKey(const Key('vidya.guest.intro.start')), findsOneWidget);
      expect(find.byKey(const Key('vidya.guest.intro.skip')), findsOneWidget);
    });

    testWidgets('Start fires onStart', (tester) async {
      var taps = 0;
      await tester.pumpWidget(_harness(VidyaGuestScreeningIntroScreen(
        onStart: () => taps++,
        onSkip: () {},
      )));
      await tester.tap(find.byKey(const Key('vidya.guest.intro.start')));
      await tester.pumpAndSettle();
      expect(taps, 1);
    });

    testWidgets('Skip fires onSkip', (tester) async {
      var taps = 0;
      await tester.pumpWidget(_harness(VidyaGuestScreeningIntroScreen(
        onStart: () {},
        onSkip: () => taps++,
      )));
      await tester.tap(find.byKey(const Key('vidya.guest.intro.skip')));
      await tester.pumpAndSettle();
      expect(taps, 1);
    });
  });
}
