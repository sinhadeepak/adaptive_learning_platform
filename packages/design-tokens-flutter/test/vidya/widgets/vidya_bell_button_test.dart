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
  group('VidyaBellButton', () {
    testWidgets('renders bell icon with no badge when unreadCount == 0',
        (tester) async {
      await tester.pumpWidget(_harness(VidyaBellButton(
        unreadCount: 0,
        onTap: () {},
      )));
      expect(find.byIcon(Icons.notifications_outlined), findsOneWidget);
      // No badge text exists in the subtree.
      expect(find.text('0'), findsNothing);
    });

    testWidgets('renders badge with count when unreadCount > 0',
        (tester) async {
      await tester.pumpWidget(_harness(VidyaBellButton(
        unreadCount: 5,
        onTap: () {},
      )));
      expect(find.byIcon(Icons.notifications_outlined), findsOneWidget);
      expect(find.text('5'), findsOneWidget);
    });

    testWidgets('renders 99+ when unreadCount > 99', (tester) async {
      await tester.pumpWidget(_harness(VidyaBellButton(
        unreadCount: 142,
        onTap: () {},
      )));
      expect(find.text('99+'), findsOneWidget);
    });

    testWidgets('tap fires onTap', (tester) async {
      var taps = 0;
      await tester.pumpWidget(_harness(VidyaBellButton(
        unreadCount: 0,
        onTap: () => taps++,
      )));
      await tester.tap(find.byIcon(Icons.notifications_outlined));
      expect(taps, 1);
    });
  });
}
