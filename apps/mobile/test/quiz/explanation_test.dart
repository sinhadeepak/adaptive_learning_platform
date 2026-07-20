// Tests for the quiz-results explanation panel + video shelf:
//   • model parsing (ExplainResult / StudentResource)
//   • ApiClient.explainQuestion / listResources (incl. question→topic fallback)
//   • ExplanationPanel + VideoShelf widget behavior

import 'dart:convert';

import 'package:adaptive_learning_mobile/api/api_client.dart';
import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/quiz/explanation_models.dart';
import 'package:adaptive_learning_mobile/quiz/explanation_panel.dart';
import 'package:adaptive_learning_mobile/quiz/quiz_client.dart';
import 'package:adaptive_learning_mobile/quiz/video_shelf.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

ApiClient _api(MockClientHandler handler) => ApiClient(
      AuthClient(
        baseUrl: 'http://test',
        storage: const FlutterSecureStorage(),
        httpClient: MockClient(handler),
      ),
    );

http.Response _json(Object body) => http.Response(
      jsonEncode(body),
      200,
      headers: {'content-type': 'application/json'},
    );

const _richExplain = {
  'headline': 'Newton’s third law pairs act on different bodies.',
  'key_concept': 'Action–reaction pairs',
  'why_correct': 'Forces come in pairs, equal and opposite.',
  'options': [
    {'id': 'A', 'is_correct': true, 'verdict': 'Correct — equal and opposite.'},
    {'id': 'B', 'is_correct': false, 'verdict': 'Confuses with first law.'},
  ],
  'common_pitfall': 'Pairs act on the same body.',
  'worked_example': 'Step 1 … Step 2 …',
  'next_steps': ['Revise free-body diagrams'],
  'explanation': 'legacy',
  'source': 'ai',
};

Widget _wrap(Widget child) => MaterialApp(
      home: Scaffold(body: SingleChildScrollView(child: child)),
    );

final _item = QuizItemSummary(
  itemIdx: 1,
  questionId: 'q-1',
  answered: true,
  isCorrect: true,
  answerIdx: 0,
  correctIdx: 0,
  stem: 'Which option states Newton’s third law?',
  choices: ['At rest', 'Apply force'],
  topicId: 't-1',
);

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  group('ExplainResult.fromJson', () {
    test('parses the rich v2 note', () {
      final r = ExplainResult.fromJson(Map<String, dynamic>.from(_richExplain));
      expect(r.isRich, isTrue);
      expect(r.headline, contains('third law'));
      expect(r.options, hasLength(2));
      expect(r.options[0].isCorrect, isTrue);
      expect(r.options[1].verdict, contains('first law'));
      expect(r.nextSteps, isNotEmpty);
    });

    test('heuristic note (no rich fields) is not rich', () {
      final r = ExplainResult.fromJson({
        'explanation': 'Plain note.',
        'source': 'heuristic',
      });
      expect(r.isRich, isFalse);
      expect(r.explanation, 'Plain note.');
    });
  });

  group('StudentResource.fromJson', () {
    test('maps snake_case fields', () {
      final r = StudentResource.fromJson({
        'id': 'r-1',
        'url': 'https://youtu.be/abc',
        'title': 'Third law explained',
        'external_id': 'abc',
        'thumbnail_url': 'https://img/abc.jpg',
        'channel_name': 'Physics Wallah',
        'duration_seconds': 312,
        'difficulty': 'EASY',
      });
      expect(r.externalId, 'abc');
      expect(r.channelName, 'Physics Wallah');
      expect(r.durationSeconds, 312);
    });
  });

  group('ApiClient.explainQuestion', () {
    test('parses a rich response', () async {
      final api = _api((req) async {
        expect(req.url.path, contains('/adaptive/explain'));
        return _json(_richExplain);
      });
      final r = await api.explainQuestion(questionId: 'q-1');
      expect(r, isNotNull);
      expect(r!.options, hasLength(2));
    });

    test('returns null on a 500', () async {
      final api = _api((_) async => http.Response('boom', 500));
      expect(await api.explainQuestion(questionId: 'q-1'), isNull);
    });
  });

  group('ApiClient.listResources', () {
    test('falls back from question scope (empty) to topic scope', () async {
      final api = _api((req) async {
        if (req.url.queryParameters.containsKey('question_id')) {
          return _json({'items': []});
        }
        return _json({
          'items': [
            {'id': 'r-1', 'url': 'u', 'title': 'Topic clip'},
          ],
        });
      });
      final items =
          await api.listResources(questionId: 'q-1', topicId: 't-1');
      expect(items, hasLength(1));
      expect(items.first.title, 'Topic clip');
    });

    test('returns [] when neither scope provided', () async {
      final api = _api((_) async => _json({'items': []}));
      expect(await api.listResources(), isEmpty);
    });
  });

  group('ExplanationPanel', () {
    testWidgets('renders per-option rows from a rich note', (tester) async {
      final api = _api((req) async {
        if (req.url.path.contains('/adaptive/explain')) {
          return _json(_richExplain);
        }
        return _json({'items': []});
      });
      await tester.pumpWidget(_wrap(ExplanationPanel(api: api, item: _item)));
      await tester.pump(); // resolve the explain future
      await tester.pump(); // rebuild with the result
      expect(find.text('EACH OPTION, BRIEFLY'), findsOneWidget);
      // Choice labels render as plain Text alongside the (rich) verdicts.
      expect(find.text('At rest'), findsOneWidget);
      expect(find.text('Apply force'), findsOneWidget);
    });
  });

  group('VideoShelf', () {
    testWidgets('hides entirely when no resources', (tester) async {
      final api = _api((_) async => _json({'items': []}));
      await tester.pumpWidget(
        _wrap(VideoShelf(api: api, questionId: 'q-1', topicId: 't-1')),
      );
      await tester.pump();
      await tester.pump();
      expect(find.text('WATCH & LEARN'), findsNothing);
    });

    testWidgets('lists curated clips when present', (tester) async {
      final api = _api((req) async {
        if (req.url.queryParameters.containsKey('question_id')) {
          return _json({
            'items': [
              {
                'id': 'r-1',
                'url': 'https://youtu.be/abc',
                'title': 'Third law explained',
                'external_id': 'abc',
              },
            ],
          });
        }
        return _json({'items': []});
      });
      await tester.pumpWidget(
        _wrap(VideoShelf(api: api, questionId: 'q-1', topicId: 't-1')),
      );
      await tester.pump();
      await tester.pump();
      expect(find.text('WATCH & LEARN'), findsOneWidget);
      expect(find.text('Third law explained'), findsOneWidget);
    });
  });
}
