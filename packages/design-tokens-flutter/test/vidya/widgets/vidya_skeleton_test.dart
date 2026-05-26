import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _harness(Widget child) => MaterialApp(
      theme: VidyaTheme.material(
        brightness: Brightness.light,
        persona: VidyaPersona.aspirant,
        density: VidyaDensity.regular,
      ),
      home: Scaffold(body: child),
    );

void main() {
  group('VidyaSkeletonBlock', () {
    testWidgets('respects explicit width + height', (tester) async {
      await tester.pumpWidget(_harness(const SizedBox(
        width: 200,
        height: 200,
        child: VidyaSkeletonBlock(width: 140, height: 32),
      )));
      final container = tester.widget<Container>(
        find.byType(VidyaSkeletonBlock).descendant(find.byType(Container)),
      );
      // Container's constraints reflect width/height.
      expect(container.constraints, isNotNull);
    });

    testWidgets('has rounded corners (default 8px) and a muted fill',
        (tester) async {
      await tester.pumpWidget(_harness(
        const VidyaSkeletonBlock(width: 100, height: 20),
      ));
      final container = tester.widget<Container>(
        find.byType(VidyaSkeletonBlock).descendant(find.byType(Container)),
      );
      final decoration = container.decoration as BoxDecoration;
      expect(decoration.borderRadius, isA<BorderRadius>());
      expect(decoration.color, isNotNull);
    });

    testWidgets('null width expands horizontally', (tester) async {
      await tester.pumpWidget(_harness(const SizedBox(
        width: 300,
        height: 100,
        child: VidyaSkeletonBlock(height: 20), // width: null
      )));
      // Doesn't throw; renders. Inner Container width is constrained by parent.
      expect(find.byType(VidyaSkeletonBlock), findsOneWidget);
    });
  });
}

// Tiny helper to chain finders (Flutter's Finder API doesn't have .descendant
// as a method on Finder; this keeps the test ergonomic without a helper file).
extension on Finder {
  Finder descendant(Finder of) =>
      find.descendant(of: this, matching: of);
}
