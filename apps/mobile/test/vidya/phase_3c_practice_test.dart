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
import 'package:adaptive_learning_mobile/vidya/screens/vidya_mocks_screen.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_practice_screen.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_practice_session_screen.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_pyq_screen.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_test_builder_screen.dart';
import 'package:adaptive_learning_mobile/vidya/state/active_exam_notifier.dart';
import 'package:adaptive_learning_mobile/vidya/state/exam_ref.dart';

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

// PYQ/Mock gates now read the active exam from the app-wide spine (not the
// stale user.examId). Pass [activeExamId] to seed an active exam; omit it to
// exercise the no-exam onboarding-nudge branch.
Widget _harness(Widget child, {String? activeExamId}) {
  Widget body = child;
  if (activeExamId != null) {
    body = VidyaActiveExam(
      notifier: VidyaActiveExamNotifier.seeded(
        auth: _auth(),
        enrolled: [
          ExamRef(examId: activeExamId, code: 'JEE', name: 'JEE Main')
        ],
      ),
      child: body,
    );
  }
  return MaterialApp(
    theme: VidyaTheme.material(
      brightness: Brightness.light,
      persona: VidyaPersona.aspirant,
      density: VidyaDensity.regular,
    ),
    home: Scaffold(body: body),
  );
}

void main() {
  group('VidyaPracticeScreen — Phase 3c v1', () {
    testWidgets('renders PRACTICE eyebrow + tagline', (tester) async {
      await tester.pumpWidget(_harness(
          VidyaPracticeScreen(client: _stub(), insights: _stubInsights())));
      await tester.pumpAndSettle();
      expect(find.text('PRACTICE'), findsOneWidget);
      expect(find.text('Sharpen your edge.'), findsOneWidget);
    });

    testWidgets('renders six mode cards with name + duration eyebrow',
        (tester) async {
      await tester.pumpWidget(_harness(
          VidyaPracticeScreen(client: _stub(), insights: _stubInsights())));
      await tester.pumpAndSettle();
      expect(find.text('Quick Practice'), findsOneWidget);
      expect(find.text('Focused Practice'), findsOneWidget);
      expect(find.text('Mistakes Drill'), findsOneWidget);
      expect(find.text('Previous-Year Qs'), findsOneWidget);
      expect(find.text('Mock Test'), findsOneWidget);
      expect(find.text('Build a Test'), findsOneWidget);
      expect(find.textContaining('QUICK'), findsOneWidget);
      expect(find.textContaining('FOCUSED'), findsOneWidget);
      expect(find.textContaining('MISTAKES'), findsOneWidget);
      expect(find.textContaining('PYQ'), findsOneWidget);
      expect(find.textContaining('MOCK'), findsOneWidget);
      expect(find.textContaining('BUILD'), findsOneWidget);
    });

    testWidgets('PYQ tap navigates to the PYQ browser (examId set)',
        (tester) async {
      await tester.pumpWidget(_harness(
        VidyaPracticeScreen(
          client: _stubWithUser(examId: 'exam-jee-main'),
          insights: _stubInsights(),
        ),
        activeExamId: 'exam-jee-main',
      ));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Previous-Year Qs'));
      await tester.tap(find.text('Previous-Year Qs'));
      await tester.pumpAndSettle();
      expect(find.byType(VidyaPyqScreen), findsOneWidget);
    });

    testWidgets('Quick Practice tap navigates to session screen',
        (tester) async {
      await tester.pumpWidget(_harness(
          VidyaPracticeScreen(client: _stub(), insights: _stubInsights())));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Quick Practice'));
      await tester.pumpAndSettle();
      expect(find.byType(VidyaPracticeSessionScreen), findsOneWidget);
    });

    testWidgets('Focused Practice tap navigates to focused intro screen',
        (tester) async {
      await tester.pumpWidget(_harness(
          VidyaPracticeScreen(client: _stub(), insights: _stubInsights())));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Focused Practice'));
      await tester.pumpAndSettle();
      expect(find.byType(VidyaFocusedIntroScreen), findsOneWidget);
    });

    testWidgets(
        'Mistakes Drill tap navigates to session screen in mistakes mode',
        (tester) async {
      await tester.pumpWidget(_harness(
        VidyaPracticeScreen(client: _stubWithUser(), insights: _stubInsights()),
      ));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Mistakes Drill'));
      await tester.tap(find.text('Mistakes Drill'));
      await tester.pumpAndSettle();
      final screen = tester.widget<VidyaPracticeSessionScreen>(
        find.byType(VidyaPracticeSessionScreen),
      );
      // mistakes mode is what drives _start → startMistakeReplay.
      expect(screen.mode, QuizSessionMode.mistakes);
    });

    testWidgets('Mock Test tap navigates to the mocks catalog (examId set)',
        (tester) async {
      await tester.pumpWidget(_harness(
        VidyaPracticeScreen(
          client: _stubWithUser(examId: 'exam-jee-main'),
          insights: _stubInsights(),
        ),
        activeExamId: 'exam-jee-main',
      ));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Mock Test'));
      await tester.tap(find.text('Mock Test'));
      // The catalog kicks off an HTTP fetch that 500s in tests;
      // pumpAndSettle is safe because that future resolves quickly.
      await tester.pumpAndSettle();
      expect(find.byType(VidyaMocksScreen), findsOneWidget);
    });

    testWidgets('Mock Test tap shows onboarding nudge when examId is null',
        (tester) async {
      await tester.pumpWidget(_harness(VidyaPracticeScreen(
        client: _stubWithUser(),
        insights: _stubInsights(),
      )));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Mock Test'));
      await tester.tap(find.text('Mock Test'));
      await tester.pump();
      expect(
        find.textContaining('Pick your exam in onboarding'),
        findsOneWidget,
      );
      expect(find.byType(VidyaMocksScreen), findsNothing);
    });

    testWidgets('Build a Test tap navigates to the test builder (examId set)',
        (tester) async {
      await tester.pumpWidget(_harness(
        VidyaPracticeScreen(
          client: _stubWithUser(examId: 'exam-jee-main'),
          insights: _stubInsights(),
        ),
        activeExamId: 'exam-jee-main',
      ));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Build a Test'));
      await tester.tap(find.text('Build a Test'));
      await tester.pumpAndSettle();
      expect(find.byType(VidyaTestBuilderScreen), findsOneWidget);
    });
  });
}
