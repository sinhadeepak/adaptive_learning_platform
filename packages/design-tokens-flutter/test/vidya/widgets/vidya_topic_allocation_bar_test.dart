import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _harness(Widget child) => MaterialApp(
      theme: VidyaTheme.material(
        brightness: Brightness.light,
        persona: VidyaPersona.aspirant,
        density: VidyaDensity.regular,
      ),
      home: Scaffold(body: Center(child: SizedBox(width: 320, child: child))),
    );

void main() {
  group('VidyaTopicAllocationBar', () {
    testWidgets('renders each row name + percent', (tester) async {
      await tester.pumpWidget(_harness(
        const VidyaTopicAllocationBar(
          items: [
            VidyaTopicAllocation(name: 'Thermodynamics', percent: 62, accent: true),
            VidyaTopicAllocation(name: 'Organic chemistry', percent: 24),
            VidyaTopicAllocation(name: 'Cell biology', percent: 14),
          ],
        ),
      ));
      expect(find.text('Thermodynamics'), findsOneWidget);
      expect(find.text('62%'), findsOneWidget);
      expect(find.text('Organic chemistry'), findsOneWidget);
      expect(find.text('24%'), findsOneWidget);
      expect(find.text('Cell biology'), findsOneWidget);
      expect(find.text('14%'), findsOneWidget);
    });

    testWidgets('handles empty list without crashing', (tester) async {
      await tester.pumpWidget(_harness(
        const VidyaTopicAllocationBar(items: []),
      ));
      expect(find.byType(VidyaTopicAllocationBar), findsOneWidget);
    });
  });
}
