// Phase 1 — QuizItem model widening regression.
//
// Guards the parse contract the Vidya session screens now depend on:
//   * `payload` is parsed from the wire (drives PolymorphicRenderer)
//   * `choices` tolerates absence/empty (non-MCQ items ship no choices)
//   * `isMcq` correctly splits the lettered-choice path from the
//     polymorphic path.
// Mirrors web's QuizItem (apps/web-student/src/pages/Quiz.tsx).

import 'package:adaptive_learning_mobile/quiz/quiz_client.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('QuizItem.fromJson', () {
    test('parses a legacy MCQ item (no questionType, no payload)', () {
      final item = QuizItem.fromJson({
        'itemIdx': 0,
        'questionId': 'q1',
        'stem': 'What is 2 + 2?',
        'choices': ['3', '4', '5'],
      });

      expect(item.questionType, 'MCQ_SINGLE');
      expect(item.payload, isEmpty);
      expect(item.choices, ['3', '4', '5']);
      expect(item.isMcq, isTrue);
    });

    test('parses a polymorphic item with payload and empty choices', () {
      final item = QuizItem.fromJson({
        'itemIdx': 3,
        'questionId': 'q2',
        'stem': 'Match the columns.',
        'choices': <dynamic>[],
        'questionType': 'MATCH_THE_FOLLOWING',
        'payload': {
          'stem': 'Match the columns.',
          'left': [
            {'id': 'L1', 'text': 'A'},
          ],
        },
      });

      expect(item.questionType, 'MATCH_THE_FOLLOWING');
      expect(item.isMcq, isFalse);
      expect(item.choices, isEmpty);
      expect(item.payload['left'], isA<List>());
    });

    test('tolerates an entirely absent choices array', () {
      final item = QuizItem.fromJson({
        'itemIdx': 1,
        'questionId': 'q3',
        'stem': 'Type the answer.',
        'questionType': 'NUMERIC_INTEGER',
        'payload': {'stem': 'Type the answer.'},
      });

      expect(item.choices, isEmpty);
      expect(item.isMcq, isFalse);
    });

    test('empty questionType falls back to the MCQ path', () {
      final item = QuizItem.fromJson({
        'itemIdx': 0,
        'questionId': 'q4',
        'stem': 'Legacy item.',
        'choices': ['a', 'b'],
        'questionType': '',
      });

      expect(item.isMcq, isTrue);
    });

    test('round-trips through QuizNext.fromJson', () {
      final next = QuizNext.fromJson({
        'sessionId': 's1',
        'status': 'IN_PROGRESS',
        'done': false,
        'item': {
          'itemIdx': 2,
          'questionId': 'q5',
          'stem': 'Pick all that apply.',
          'choices': <dynamic>[],
          'questionType': 'MCQ_MULTI',
          'payload': {
            'options': [
              {'id': 'A', 'text': 'Alpha'},
            ],
          },
        },
      });

      expect(next.done, isFalse);
      expect(next.item, isNotNull);
      expect(next.item!.questionType, 'MCQ_MULTI');
      expect(next.item!.isMcq, isFalse);
      expect(next.item!.payload['options'], isA<List>());
    });
  });
}
