// Phase 3c v1 — VidyaPracticeScreen landing tests. Stateless; no
// API fetches in v1.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:adaptive_learning_mobile/vidya/screens/vidya_practice_screen.dart';

Widget _harness(Widget child) => MaterialApp(
      theme: VidyaTheme.material(
        brightness: Brightness.light,
        persona: VidyaPersona.aspirant,
        density: VidyaDensity.regular,
      ),
      home: Scaffold(body: child),
    );

void main() {
  group('VidyaPracticeScreen — Phase 3c v1', () {
    testWidgets('renders PRACTICE eyebrow + tagline', (tester) async {
      await tester.pumpWidget(_harness(const VidyaPracticeScreen()));
      await tester.pumpAndSettle();
      expect(find.text('PRACTICE'), findsOneWidget);
      expect(find.text('Sharpen your edge.'), findsOneWidget);
    });

    testWidgets('renders three mode cards with name + duration eyebrow',
        (tester) async {
      await tester.pumpWidget(_harness(const VidyaPracticeScreen()));
      await tester.pumpAndSettle();
      expect(find.text('Quick Practice'), findsOneWidget);
      expect(find.text('Focused Practice'), findsOneWidget);
      expect(find.text('Mock Test'), findsOneWidget);
      expect(find.textContaining('QUICK'), findsOneWidget);
      expect(find.textContaining('FOCUSED'), findsOneWidget);
      expect(find.textContaining('MOCK'), findsOneWidget);
    });

    testWidgets('tapping Quick Practice shows the deferred snackbar',
        (tester) async {
      await tester.pumpWidget(_harness(const VidyaPracticeScreen()));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Quick Practice'));
      await tester.pump();
      expect(find.textContaining('coming in Phase 3c.full'), findsOneWidget);
    });

    testWidgets('tapping Mock Test shows the deferred snackbar',
        (tester) async {
      await tester.pumpWidget(_harness(const VidyaPracticeScreen()));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Mock Test'));
      await tester.pump();
      expect(find.textContaining('coming in Phase 3c.full'), findsOneWidget);
    });
  });
}
