import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _harness(Widget child) => MaterialApp(
      theme: VidyaTheme.material(
        brightness: Brightness.light,
        persona: VidyaPersona.aspirant,
        density: VidyaDensity.regular,
      ),
      home: Scaffold(body: Center(child: child)),
    );

void main() {
  group('VidyaLangToggle', () {
    testWidgets('renders EN and हि labels', (tester) async {
      await tester.pumpWidget(_harness(
        VidyaLangToggle(
          value: VidyaLang.en,
          onChanged: (_) {},
        ),
      ));
      expect(find.text('EN'), findsOneWidget);
      expect(find.text('हि'), findsOneWidget);
    });

    testWidgets('tapping a segment fires onChanged with the new value',
        (tester) async {
      VidyaLang? captured;
      await tester.pumpWidget(_harness(
        VidyaLangToggle(
          value: VidyaLang.en,
          onChanged: (v) => captured = v,
        ),
      ));
      await tester.tap(find.text('हि'));
      await tester.pumpAndSettle();
      expect(captured, VidyaLang.hi);
    });

    testWidgets('tapping the currently-selected segment fires nothing',
        (tester) async {
      var calls = 0;
      await tester.pumpWidget(_harness(
        VidyaLangToggle(
          value: VidyaLang.en,
          onChanged: (_) => calls++,
        ),
      ));
      await tester.tap(find.text('EN'));
      await tester.pumpAndSettle();
      expect(calls, 0);
    });
  });
}
