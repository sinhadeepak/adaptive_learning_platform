// Phase 1 — PolymorphicRenderer coverage regression guard.
//
// This is the safety net for routing the Vidya practice + mock session
// screens through PolymorphicRenderer (replacing their MCQ-only radios).
// It asserts that every one of the 29 question type_ids dispatches to a
// real renderer — i.e. none fall through to the `_UnknownType` fallback —
// and that each builds without throwing given a representative payload.
//
// It also pins the submit contract for the two MCQ-family types: the
// renderer must emit `{selected_id}` / `{selected_ids}` via onChange,
// which the session screens forward verbatim as `responsePayload`.

import 'package:adaptive_learning_mobile/quiz/polymorphic_renderer.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// All 29 v1 type_ids, mirroring the switch arms in
/// `polymorphic_renderer.dart` (and web's renderers/index.tsx).
const _allTypeIds = <String>[
  // Objective
  'MCQ_SINGLE', 'ASSERTION_REASON', 'MULTI_STATEMENT', 'MCQ_MULTI',
  'TRUE_FALSE',
  // Numeric
  'NUMERIC_INTEGER', 'NUMERIC_DECIMAL', 'NUMERIC_RANGE', 'FORMULA_INPUT',
  // Matching
  'MATCH_THE_FOLLOWING', 'SEQUENCING', 'CLASSIFICATION',
  // Fill-in
  'FILL_BLANK_SINGLE', 'FILL_BLANK_MULTI', 'CLOZE_PASSAGE', 'SHORT_TEXT',
  // Subjective
  'ESSAY', 'DESCRIPTIVE_LONG', 'CASE_STUDY', 'COMPREHENSION_LONG',
  // Visual & spatial
  'DIAGRAM_HOTSPOT', 'DIAGRAM_LABEL', 'MAP_LOCATION', 'PICTORIAL_IDENTIFY',
  // Audio / video
  'LISTENING_COMP', 'VIDEO_QUESTION',
  // Interactive
  'KBC_LIFELINE', 'TIMED_REVEAL', 'ADAPTIVE_DIFFICULTY',
];

/// A generous superset payload — renderers read the keys they need and
/// ignore the rest, so one fixture safely drives every type without a
/// per-type table. The stem is unique so we can assert it rendered.
const _stemMarker = 'COVERAGE_STEM_MARKER';

Map<String, dynamic> _payload() => <String, dynamic>{
      'stem': _stemMarker,
      'prompt': _stemMarker,
      'passage': 'A short passage for comprehension / case-study types.',
      'partial_credit': true,
      'options': [
        {'id': 'A', 'text': 'Option A'},
        {'id': 'B', 'text': 'Option B'},
        {'id': 'C', 'text': 'Option C'},
      ],
      'left': [
        {'id': 'L1', 'text': 'Left 1'},
        {'id': 'L2', 'text': 'Left 2'},
      ],
      'right': [
        {'id': 'R1', 'text': 'Right 1'},
        {'id': 'R2', 'text': 'Right 2'},
      ],
      'items': [
        {'id': 'I1', 'text': 'Item 1'},
        {'id': 'I2', 'text': 'Item 2'},
      ],
      'categories': [
        {'id': 'CAT1', 'label': 'Category 1', 'text': 'Category 1'},
        {'id': 'CAT2', 'label': 'Category 2', 'text': 'Category 2'},
      ],
      'blanks': [
        {'id': 'b1', 'label': 'Blank 1'},
      ],
      'segments': [
        {'type': 'text', 'text': 'The '},
        {'type': 'blank', 'id': 'b1'},
        {'type': 'text', 'text': ' end.'},
      ],
      'image_url': 'https://example.test/diagram.png',
      'image_id': 'img-123',
      'media_id': 'media-123',
      'media_url': 'https://example.test/clip.mp4',
      'hotspots': [
        {'id': 'h1', 'x': 0.5, 'y': 0.5, 'label': 'Spot 1'},
      ],
      'labels': [
        {'id': 'lab1', 'text': 'Label 1'},
      ],
      'regions': [
        {'id': 'reg1', 'name': 'Region 1'},
      ],
      // `rubric` intentionally omitted: _TextResponse expects a Map and
      // _CaseStudy expects a List, so a shared fixture can't satisfy both.
      // Both treat an absent rubric as null and render fine without it.
      'sub_questions': [
        {'id': 'sq1', 'text': 'Sub-question 1'},
      ],
      'case_facts': 'Case facts for case-study types.',
      'time_limit_seconds': 30,
      'lifelines': ['fifty_fifty', 'audience'],
    };

Widget _host(Widget child) => MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(child: child),
      ),
    );

void main() {
  group('PolymorphicRenderer dispatch coverage', () {
    for (final typeId in _allTypeIds) {
      testWidgets('$typeId dispatches to a real renderer (not _UnknownType)',
          (tester) async {
        dynamic emitted;
        final widget = _host(
          PolymorphicRenderer.build(
            typeId: typeId,
            payload: _payload(),
            value: null,
            onChange: (v) => emitted = v,
          ),
        );
        await tester.pumpWidget(widget);
        await tester.pump();

        // The headline guard: no type falls through to the fallback.
        expect(
          find.text('Unknown question type'),
          findsNothing,
          reason: '$typeId fell through to _UnknownType — renderer missing.',
        );
        // (emitted is referenced so analyzers don't flag it; interaction
        // assertions live in the dedicated MCQ tests below.)
        expect(emitted, isNull);
      });
    }

    test('the fixture covers exactly the 29 documented type_ids', () {
      expect(_allTypeIds.length, 29);
      expect(_allTypeIds.toSet().length, 29, reason: 'no duplicates');
    });

    testWidgets('an unregistered type DOES render the _UnknownType fallback',
        (tester) async {
      final widget = _host(
        PolymorphicRenderer.build(
          typeId: 'NOT_A_REAL_TYPE',
          payload: _payload(),
          value: null,
          onChange: (_) {},
        ),
      );
      await tester.pumpWidget(widget);
      await tester.pump();
      expect(find.text('Unknown question type'), findsOneWidget);
    });
  });

  group('MCQ submit-contract', () {
    testWidgets('MCQ_SINGLE emits {selected_id} on tap', (tester) async {
      dynamic emitted;
      final widget = _host(
        PolymorphicRenderer.build(
          typeId: 'MCQ_SINGLE',
          payload: _payload(),
          value: null,
          onChange: (v) => emitted = v,
        ),
      );
      await tester.pumpWidget(widget);
      await tester.pump();
      await tester.tap(find.text('Option B'));
      await tester.pump();
      expect(emitted, isA<Map<String, dynamic>>());
      expect((emitted as Map)['selected_id'], 'B');
    });

    testWidgets('MCQ_MULTI accumulates into {selected_ids}', (tester) async {
      dynamic emitted;
      final widget = _host(
        PolymorphicRenderer.build(
          typeId: 'MCQ_MULTI',
          payload: _payload(),
          value: null,
          onChange: (v) => emitted = v,
        ),
      );
      await tester.pumpWidget(widget);
      await tester.pump();
      await tester.tap(find.text('Option A'));
      await tester.pump();
      expect(emitted, isA<Map<String, dynamic>>());
      expect((emitted as Map)['selected_ids'], contains('A'));
    });
  });
}
