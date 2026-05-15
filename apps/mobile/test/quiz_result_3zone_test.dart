// Smoke tests for the QuizResultScreen 3-zone IA (Phase 6 S51).
//
// Verifies:
//   - Zone 1 (Score band) renders the trophy + big score.
//   - Zone 2 (AI insight) is collapsed by default and toggles open.
//   - Zone 3 (Review) renders one row per item and surfaces "n items".
//   - Tapping a review row opens the detail drawer.

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/quiz/quiz_client.dart';
import 'package:adaptive_learning_mobile/quiz/quiz_result_screen.dart';
import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

QuizClient _makeClient() {
  final mockHttp = MockClient((request) async {
    if (request.url.path.endsWith('/quiz/sessions/sid-7')) {
      return http.Response(
        '{"sessionId":"sid-7","userId":"u","topicId":"t","mode":"PRACTICE","strategy":"binary_search","status":"SUBMITTED","targetCount":5,"servedCount":5,"correctCount":4,"items":['
        '{"itemIdx":0,"questionId":"q-aaaaaaaa-1","answerIdx":1,"isCorrect":true,"answered":true,"stem":"What is 2 plus 2?"},'
        '{"itemIdx":1,"questionId":"q-bbbbbbbb-2","answerIdx":0,"isCorrect":false,"answered":true,"stem":"Square root of 81?"},'
        '{"itemIdx":2,"questionId":"q-cccccccc-3","answerIdx":2,"isCorrect":true,"answered":true,"stem":"Cube of 3?"},'
        '{"itemIdx":3,"questionId":"q-dddddddd-4","answerIdx":0,"isCorrect":true,"answered":true,"stem":"Sin of 90 degrees?"},'
        '{"itemIdx":4,"questionId":"q-eeeeeeee-5","answerIdx":3,"isCorrect":true,"answered":true,"stem":"Boiling point of water?"}'
        ']}',
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    return http.Response('{}', 404);
  });
  final auth = AuthClient(
    baseUrl: 'http://test',
    storage: const FlutterSecureStorage(),
    httpClient: mockHttp,
  );
  return QuizClient(auth: auth);
}

// Default test viewport is 800x600; the result page is a long ListView,
// so we expand the height to keep zones 2-3 in view. 2000dp is enough
// for a 5-item result without straining the test VM.
//
// `addTearDown` (not the file-level `tearDown`) is the right hook for
// resetting the viewport — it fires while the test is still in scope,
// so `setSurfaceSize` is allowed. The top-level `tearDown` runs after
// the binding leaves test mode and throws an assertion.
Future<void> _pumpScreen(WidgetTester tester) async {
  await tester.binding.setSurfaceSize(const Size(800, 2000));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  await tester.pumpWidget(MaterialApp(
    theme: AuroraTheme.light(),
    home: QuizResultScreen(client: _makeClient(), sessionId: 'sid-7'),
  ),);
  await tester.pumpAndSettle();
}

void main() {
  setUp(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    FlutterSecureStorage.setMockInitialValues({});
  });

  testWidgets('Zone 1 renders trophy + score band', (tester) async {
    await _pumpScreen(tester);
    expect(find.text('4/5'), findsOneWidget);
    expect(find.byIcon(Icons.emoji_events), findsOneWidget);
    expect(find.textContaining('Accuracy: 80%'), findsOneWidget);
  });

  testWidgets('Zone 2 starts collapsed and opens on tap', (tester) async {
    await _pumpScreen(tester);

    // The AI insight card is visible with its one-line headline.
    expect(find.text('AI insight'), findsOneWidget);
    // Detail copy is hidden until the card is tapped.
    expect(
      find.textContaining("IRT thinks you've mostly nailed",
          findRichText: true,),
      findsNothing,
    );
    // Collapsed-state chevron is down.
    expect(find.byIcon(Icons.expand_more), findsOneWidget);

    await tester.tap(find.text('AI insight'));
    await tester.pumpAndSettle();

    // Expanded — chevron flips up and the detail copy appears.
    expect(find.byIcon(Icons.expand_less), findsOneWidget);
    expect(
      find.textContaining("IRT thinks you've mostly nailed",
          findRichText: true,),
      findsOneWidget,
    );
  });

  testWidgets('Zone 3 renders one row per item with count', (tester) async {
    await _pumpScreen(tester);

    expect(find.text('Review questions'), findsOneWidget);
    expect(find.text('5 items'), findsOneWidget);
    // Each item label rendered as a pill.
    expect(find.text('CORRECT'), findsNWidgets(4));
    expect(find.text('WRONG'), findsOneWidget);
  });

  testWidgets('Tapping a review row opens the detail drawer', (tester) async {
    await _pumpScreen(tester);

    // Tap the first review row — find the InkWell wrapping Q1's text.
    await tester.tap(find.text('What is 2 plus 2?').first);
    await tester.pumpAndSettle();

    // Drawer shows the full Q-label header + the same stem.
    expect(find.text('Q1'), findsWidgets);
    // The drawer footer button.
    expect(find.text('Close'), findsOneWidget);
  });
}
