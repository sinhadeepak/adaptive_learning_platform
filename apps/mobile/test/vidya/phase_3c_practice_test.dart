// Phase 3c v1 — VidyaPracticeScreen landing tests. Phase 3c.full v1
// extended the screen to thread a QuizClient through; Quick now
// navigates into VidyaPracticeSessionScreen instead of snackbar-ing.
// Focused + Mock keep their snackbar stub (v2/v3 work).

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/insights/insights_client.dart';
import 'package:adaptive_learning_mobile/quiz/quiz_client.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_focused_intro_screen.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_mock_intro_screen.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_practice_screen.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_practice_session_screen.dart';

AuthClient _auth() => AuthClient(
      baseUrl: 'http://test',
      // Anything Practice-session hits (start, next, …) is stubbed to
      // 500 so the session screen renders its error banner — enough
      // for byType-based navigation assertions.
      httpClient: MockClient((req) async => http.Response('{}', 500)),
    );

QuizClient _stub() => QuizClient(auth: _auth());

/// Build a QuizClient whose AuthClient carries an in-memory User so the
/// Mock card wiring can read `client.auth.user?.examId`. When [examId]
/// is null we explicitly set a User with null examId, exercising the
/// onboarding-nudge branch.
QuizClient _stubWithUser({String? examId}) {
  final auth = _auth();
  auth.setUser(User(
    id: 'u-1',
    email: 't@example.com',
    firstName: 'T',
    lastName: 'U',
    role: 'STUDENT',
    onboardingState: 'COMPLETE',
    examId: examId,
  ));
  return QuizClient(auth: auth);
}

InsightsClient _stubInsights() => InsightsClient(auth: _auth());

Widget _harness(Widget child) => MaterialApp(
      theme: VidyaTheme.material(
        brightness: Brightness.light,
        persona: VidyaPersona.aspirant,
        density: VidyaDensity.regular,
      ),
      home: Scaffold(body: child),
    );

void main() {
  group('VidyaPracticeScreen — Phase 3c v1', () {
    testWidgets('renders PRACTICE eyebrow + tagline', (tester) async {
      await tester.pumpWidget(_harness(VidyaPracticeScreen(client: _stub(), insights: _stubInsights())));
      await tester.pumpAndSettle();
      expect(find.text('PRACTICE'), findsOneWidget);
      expect(find.text('Sharpen your edge.'), findsOneWidget);
    });

    testWidgets('renders three mode cards with name + duration eyebrow',
        (tester) async {
      await tester.pumpWidget(_harness(VidyaPracticeScreen(client: _stub(), insights: _stubInsights())));
      await tester.pumpAndSettle();
      expect(find.text('Quick Practice'), findsOneWidget);
      expect(find.text('Focused Practice'), findsOneWidget);
      expect(find.text('Mock Test'), findsOneWidget);
      expect(find.textContaining('QUICK'), findsOneWidget);
      expect(find.textContaining('FOCUSED'), findsOneWidget);
      expect(find.textContaining('MOCK'), findsOneWidget);
    });

    testWidgets('Quick Practice tap navigates to session screen',
        (tester) async {
      await tester.pumpWidget(_harness(VidyaPracticeScreen(client: _stub(), insights: _stubInsights())));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Quick Practice'));
      await tester.pumpAndSettle();
      expect(find.byType(VidyaPracticeSessionScreen), findsOneWidget);
    });

    testWidgets('Focused Practice tap navigates to focused intro screen',
        (tester) async {
      await tester.pumpWidget(_harness(VidyaPracticeScreen(client: _stub(), insights: _stubInsights())));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Focused Practice'));
      await tester.pumpAndSettle();
      expect(find.byType(VidyaFocusedIntroScreen), findsOneWidget);
    });

    testWidgets('Mock Test tap navigates to mock intro screen (examId set)',
        (tester) async {
      await tester.pumpWidget(_harness(VidyaPracticeScreen(
        client: _stubWithUser(examId: 'exam-jee-main'),
        insights: _stubInsights(),
      )));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Mock Test'));
      // The intro screen kicks off an HTTP fetch that 500s in tests;
      // pumpAndSettle is safe because that future resolves quickly.
      await tester.pumpAndSettle();
      expect(find.byType(VidyaMockIntroScreen), findsOneWidget);
    });

    testWidgets('Mock Test tap shows onboarding nudge when examId is null',
        (tester) async {
      await tester.pumpWidget(_harness(VidyaPracticeScreen(
        client: _stubWithUser(),
        insights: _stubInsights(),
      )));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Mock Test'));
      await tester.pump();
      expect(
        find.textContaining('Pick your exam in onboarding'),
        findsOneWidget,
      );
      expect(find.byType(VidyaMockIntroScreen), findsNothing);
    });
  });
}
