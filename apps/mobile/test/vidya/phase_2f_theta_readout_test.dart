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
  group('VidyaThetaReadout', () {
    testWidgets('renders nothing when theta is null', (tester) async {
      await tester.pumpWidget(_harness(const VidyaThetaReadout(
        theta: null,
        previousTheta: null,
        nextQB: null,
        narrative: 'ignored',
      )));
      expect(find.text('LIVE θ READOUT'), findsNothing);
    });

    testWidgets('renders eyebrow, value, next-Q line, narrative when theta present',
        (tester) async {
      await tester.pumpWidget(_harness(const VidyaThetaReadout(
        theta: -0.42,
        previousTheta: -0.50,
        nextQB: 0.84,
        narrative: "You're answering above your zone.",
      )));
      expect(find.text('LIVE θ READOUT'), findsOneWidget);
      expect(find.textContaining('−0.42'), findsOneWidget);
      expect(find.textContaining('0.84'), findsOneWidget);
      expect(find.textContaining('answering above'), findsOneWidget);
    });

    testWidgets('renders ↑ arrow when theta increased', (tester) async {
      await tester.pumpWidget(_harness(const VidyaThetaReadout(
        theta: 0.10,
        previousTheta: -0.10,
        nextQB: 0.50,
        narrative: 'up',
      )));
      expect(find.byIcon(Icons.arrow_upward), findsOneWidget);
    });

    testWidgets('renders ↓ arrow when theta decreased', (tester) async {
      await tester.pumpWidget(_harness(const VidyaThetaReadout(
        theta: -0.20,
        previousTheta: 0.10,
        nextQB: 0.30,
        narrative: 'down',
      )));
      expect(find.byIcon(Icons.arrow_downward), findsOneWidget);
    });

    testWidgets('no arrow when previousTheta is null (item 1)', (tester) async {
      await tester.pumpWidget(_harness(const VidyaThetaReadout(
        theta: 0.0,
        previousTheta: null,
        nextQB: 0.50,
        narrative: "Let's see where you stand.",
      )));
      expect(find.byIcon(Icons.arrow_upward), findsNothing);
      expect(find.byIcon(Icons.arrow_downward), findsNothing);
    });

    testWidgets('hides Next Q line when nextQB null but theta present',
        (tester) async {
      await tester.pumpWidget(_harness(const VidyaThetaReadout(
        theta: -0.42,
        previousTheta: null,
        nextQB: null,
        narrative: 'n',
      )));
      expect(find.text('LIVE θ READOUT'), findsOneWidget);
      expect(find.textContaining('Next Q diff'), findsNothing);
    });
  });
}
