import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _harness(Widget child) => MaterialApp(
      theme: VidyaTheme.material(
        brightness: Brightness.light,
        persona: VidyaPersona.aspirant,
        density: VidyaDensity.regular,
      ),
      home: Scaffold(body: Center(child: SizedBox(width: 300, height: 200, child: child))),
    );

void main() {
  group('VidyaSigmoidIllustration', () {
    testWidgets('renders YOU marker label', (tester) async {
      await tester.pumpWidget(_harness(
        const VidyaSigmoidIllustration(theta: 0.79, pAtTheta: 0.74),
      ));
      expect(find.textContaining('YOU'), findsOneWidget);
      expect(find.textContaining('+0.79'), findsOneWidget);
    });

    testWidgets('renders axis labels', (tester) async {
      await tester.pumpWidget(_harness(
        const VidyaSigmoidIllustration(theta: 0.0, pAtTheta: 0.5),
      ));
      expect(find.text('P(correct)'), findsOneWidget);
      expect(find.text('ability'), findsOneWidget);
    });

    testWidgets('handles negative theta without crashing', (tester) async {
      await tester.pumpWidget(_harness(
        const VidyaSigmoidIllustration(theta: -1.5, pAtTheta: 0.18),
      ));
      expect(find.textContaining('YOU'), findsOneWidget);
      expect(find.textContaining('-1.50'), findsOneWidget);
    });
  });
}
