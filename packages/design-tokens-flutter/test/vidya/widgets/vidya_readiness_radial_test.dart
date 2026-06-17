import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _harness(Widget child) => MaterialApp(
      theme: VidyaTheme.material(
        brightness: Brightness.light,
        persona: VidyaPersona.aspirant,
        density: VidyaDensity.regular,
      ),
      home: Scaffold(body: Center(child: SizedBox(width: 220, height: 220, child: child))),
    );

void main() {
  group('VidyaReadinessRadial', () {
    testWidgets('renders eyebrow + value + suffix', (tester) async {
      await tester.pumpWidget(_harness(
        const VidyaReadinessRadial(
          eyebrow: 'READINESS',
          value: 728,
          max: 900,
        ),
      ));
      expect(find.text('READINESS'), findsOneWidget);
      expect(find.text('728'), findsOneWidget);
      expect(find.text('/ 900'), findsOneWidget);
    });

    testWidgets('clamps value to max', (tester) async {
      await tester.pumpWidget(_harness(
        const VidyaReadinessRadial(
          eyebrow: 'READINESS',
          value: 1200,
          max: 900,
        ),
      ));
      expect(find.text('1200'), findsOneWidget);
    });

    testWidgets('handles zero value', (tester) async {
      await tester.pumpWidget(_harness(
        const VidyaReadinessRadial(
          eyebrow: 'READINESS',
          value: 0,
          max: 900,
        ),
      ));
      expect(find.text('0'), findsOneWidget);
    });
  });
}
