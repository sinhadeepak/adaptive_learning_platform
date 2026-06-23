// Regression guard for the text-input reversal bug: a stateless renderer
// that recreated its TextEditingController on every (value-feedback)
// rebuild collapsed the cursor to offset 0, so input was prepended
// ("this is fine" → "enif si siht"). The fix is a persistent-controller
// field. This test drives the real parent-feedback loop and asserts the
// cursor stays at the end (not reset to the start) after a rebuild.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:adaptive_learning_mobile/quiz/polymorphic_renderer.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Mimics the session screen: holds the answer payload and re-passes it
/// into the renderer on every onChange (the rebuild that triggered the
/// reversal).
class _FeedbackHarness extends StatefulWidget {
  const _FeedbackHarness({required this.typeId, required this.payload});
  final String typeId;
  final Map<String, dynamic> payload;
  @override
  State<_FeedbackHarness> createState() => _FeedbackHarnessState();
}

class _FeedbackHarnessState extends State<_FeedbackHarness> {
  dynamic value;
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      theme: VidyaTheme.material(
        brightness: Brightness.light,
        persona: VidyaPersona.aspirant,
        density: VidyaDensity.regular,
      ),
      home: Scaffold(
        body: SingleChildScrollView(
          child: PolymorphicRenderer.build(
            typeId: widget.typeId,
            payload: widget.payload,
            value: value,
            onChange: (v) => setState(() => value = v),
          ),
        ),
      ),
    );
  }
}

void main() {
  testWidgets('SHORT_TEXT input is not reversed; cursor stays at end',
      (tester) async {
    await tester.pumpWidget(const _FeedbackHarness(
      typeId: 'SHORT_TEXT',
      payload: {'stem': 'Explain states of matter.'},
    ));
    await tester.pumpAndSettle();

    const typed = 'this is fine';
    await tester.enterText(find.byType(TextField), typed);
    await tester.pumpAndSettle();

    final state = tester.state<_FeedbackHarnessState>(
      find.byType(_FeedbackHarness),
    );
    // Value round-trips correctly (not reversed).
    expect((state.value as Map)['text'], typed);

    // The persistent controller keeps the text and the cursor at the end
    // — the old recreated-controller bug left it collapsed at offset 0/-1.
    final field = tester.widget<TextField>(find.byType(TextField));
    expect(field.controller!.text, typed);
    expect(field.controller!.selection.baseOffset, typed.length);
  });

  testWidgets('NUMERIC field round-trips a decimal without normalising mid-type',
      (tester) async {
    await tester.pumpWidget(const _FeedbackHarness(
      typeId: 'NUMERIC_DECIMAL',
      payload: {'stem': 'Value of g?'},
    ));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), '9.8');
    await tester.pumpAndSettle();
    final field = tester.widget<TextField>(find.byType(TextField));
    // Field shows exactly what was typed (no clobber back to "9.8" → "9").
    expect(field.controller!.text, '9.8');
    expect(field.controller!.selection.baseOffset, 3);
  });
}
