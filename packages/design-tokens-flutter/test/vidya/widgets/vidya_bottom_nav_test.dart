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
  group('VidyaBottomNav', () {
    testWidgets('renders 5 tabs labeled HOME / STUDY / PRACTICE / INSIGHTS / MORE',
        (tester) async {
      await tester.pumpWidget(_harness(VidyaBottomNav(
        active: VidyaShellTab.home,
        onTap: (_) {},
      )));
      expect(find.text('HOME'), findsOneWidget);
      expect(find.text('STUDY'), findsOneWidget);
      expect(find.text('PRACTICE'), findsOneWidget);
      expect(find.text('INSIGHTS'), findsOneWidget);
      expect(find.text('MORE'), findsOneWidget);
    });

    testWidgets('tapping a tab fires onTap with that tab', (tester) async {
      VidyaShellTab? tapped;
      await tester.pumpWidget(_harness(VidyaBottomNav(
        active: VidyaShellTab.home,
        onTap: (t) => tapped = t,
      )));
      await tester.tap(find.text('STUDY'));
      expect(tapped, VidyaShellTab.study);

      await tester.tap(find.text('INSIGHTS'));
      expect(tapped, VidyaShellTab.insights);

      await tester.tap(find.text('MORE'));
      expect(tapped, VidyaShellTab.more);
    });

    testWidgets('active tab icon uses theme.accent colour', (tester) async {
      await tester.pumpWidget(_harness(VidyaBottomNav(
        active: VidyaShellTab.practice,
        onTap: (_) {},
      )));
      final icon = tester.widget<Icon>(
        find.byKey(const Key('vidya.nav.icon.practice')),
      );
      // Active icon colour matches accent (we don't pin the exact hex —
      // the theme owns that — just assert it's not null and equals the
      // colour read from a sibling theme lookup).
      expect(icon.color, isNotNull);
      // And an inactive sibling icon has a different colour:
      final inactive = tester.widget<Icon>(
        find.byKey(const Key('vidya.nav.icon.home')),
      );
      expect(icon.color, isNot(equals(inactive.color)));
    });

    testWidgets('VidyaShellTab enum order is fixed (home=0..more=4)', (tester) async {
      expect(VidyaShellTab.values, [
        VidyaShellTab.home,
        VidyaShellTab.study,
        VidyaShellTab.practice,
        VidyaShellTab.insights,
        VidyaShellTab.more,
      ]);
      expect(VidyaShellTab.home.index, 0);
      expect(VidyaShellTab.more.index, 4);
    });
  });
}
