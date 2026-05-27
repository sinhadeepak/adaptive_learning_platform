// Phase 3c.full v2 — Task 1: VidyaFocusedIntroScreen widget tests.
//
// Mirrors the _StubQuizClient pattern from phase_3c_full_practice_test.dart
// but stubs InsightsClient (concrete class — we extend it and override
// the network-facing methods so the screen never hits a real socket).
// _StubQuizClient is duplicated here in slim form; the v1 test file's
// full stub stays as the canonical reference for session-screen tests.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/insights/insights_client.dart';
import 'package:adaptive_learning_mobile/quiz/quiz_client.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_focused_intro_screen.dart';

Widget _harness(Widget child) => MaterialApp(
      theme: VidyaTheme.material(
        brightness: Brightness.light,
        persona: VidyaPersona.aspirant,
        density: VidyaDensity.regular,
      ),
      home: child,
    );

ConceptRow _row({
  required String id,
  required double ewa,
  int n = 5,
}) =>
    ConceptRow(
      conceptId: id,
      ewa: ewa,
      n: n,
      decaySeverity: DecaySeverity.aging,
      decayDays: 3,
    );

InsightsSnapshot _mkSnap({
  List<ConceptRow> weakConcepts = const [],
}) =>
    InsightsSnapshot(
      userId: 'u-1',
      conceptMastery: const [],
      topicDecay: const [],
      readiness: null,
      weakConcepts: weakConcepts,
      decayAlerts: const [],
      missionsTodayPending: false,
      revisionDueToday: 0,
    );

/// Stub InsightsClient that extends the real class so the screen treats
/// it polymorphically. AuthClient gets a MockClient returning 500s so
/// even if the screen short-circuits past the stub it can't hit the wire.
class _StubInsightsClient extends InsightsClient {
  _StubInsightsClient({
    InsightsSnapshot? snapshot,
    Object? snapshotError,
  })  : _snapshot = snapshot,
        _snapshotError = snapshotError,
        super(
          auth: AuthClient(
            baseUrl: 'http://stub',
            httpClient: MockClient((req) async => http.Response('{}', 500)),
          ),
        );

  InsightsSnapshot? _snapshot;
  Object? _snapshotError;
  int snapshotCalls = 0;
  String? lastUserId;

  void setSnapshot(InsightsSnapshot s) {
    _snapshot = s;
  }

  void clearError() {
    _snapshotError = null;
  }

  @override
  Future<InsightsSnapshot> fetchSnapshot(String userId) async {
    snapshotCalls++;
    lastUserId = userId;
    if (_snapshotError != null) throw _snapshotError!;
    return _snapshot ?? _mkSnap();
  }
}

/// Slim QuizClient stub — the focused intro screen only needs `auth`
/// (so it can construct an ApiClient for /catalog/topics/{id}). All
/// other QuizClient methods are inherited from the real class but
/// will hit the 500-MockClient if called accidentally.
QuizClient _quizStub() => QuizClient(
      auth: AuthClient(
        baseUrl: 'http://stub',
        httpClient: MockClient((req) async => http.Response('{}', 500)),
      ),
    );

void main() {
  group('VidyaFocusedIntroScreen — Phase 3c.full v2', () {
    testWidgets('fetches snapshot on mount and renders weakest topic name',
        (tester) async {
      // Two weak concepts; backend may not sort by EWA so we hand them in
      // last_seen_at order (highest EWA first) and assert the screen
      // picks the lowest EWA as "weakest".
      final insights = _StubInsightsClient(
        snapshot: _mkSnap(
          weakConcepts: [
            _row(id: 'c-recent', ewa: 0.38),
            _row(id: 'c-weakest', ewa: 0.22),
          ],
        ),
      );

      await tester.pumpWidget(_harness(VidyaFocusedIntroScreen(
        client: _quizStub(),
        insights: insights,
        userId: 'u-1',
        onStart: (_, __) {},
        onBack: () {},
      )));
      await tester.pumpAndSettle();

      expect(insights.snapshotCalls, 1);
      expect(insights.lastUserId, 'u-1');
      // Catalog fetch will fail (500) → screen renders the raw conceptId
      // as the label, which is exactly the graceful-degradation contract.
      expect(find.text('c-weakest'), findsOneWidget);
      expect(find.textContaining('EWA 0.22'), findsOneWidget);
      expect(find.text('FOCUSED PRACTICE'), findsOneWidget);
      expect(find.text('Start focused session'), findsOneWidget);
    });

    testWidgets('empty weak-concepts → empty-state copy + Back CTA',
        (tester) async {
      final insights = _StubInsightsClient(snapshot: _mkSnap());

      var backTaps = 0;
      await tester.pumpWidget(_harness(VidyaFocusedIntroScreen(
        client: _quizStub(),
        insights: insights,
        userId: 'u-1',
        onStart: (_, __) {},
        onBack: () => backTaps++,
      )));
      await tester.pumpAndSettle();

      expect(
        find.textContaining("don't have a weak topic yet"),
        findsOneWidget,
      );
      expect(find.textContaining('Quick Practice'), findsOneWidget);
      expect(find.text('Start focused session'), findsNothing);
      await tester.tap(find.text('Back'));
      await tester.pump();
      expect(backTaps, 1);
    });

    testWidgets('snapshot fetch error → VidyaBanner + Retry', (tester) async {
      final insights = _StubInsightsClient(
        snapshotError: Exception('boom'),
      );

      await tester.pumpWidget(_harness(VidyaFocusedIntroScreen(
        client: _quizStub(),
        insights: insights,
        userId: 'u-1',
        onStart: (_, __) {},
        onBack: () {},
      )));
      await tester.pumpAndSettle();

      expect(find.textContaining("couldn't load"), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
      expect(insights.snapshotCalls, 1);

      // Clear the error + seed a snapshot; Retry should recover.
      insights.clearError();
      insights.setSnapshot(_mkSnap(
        weakConcepts: [_row(id: 'c-after-retry', ewa: 0.31)],
      ));

      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();

      expect(find.text('c-after-retry'), findsOneWidget);
      expect(insights.snapshotCalls, 2);
    });

    testWidgets('Start CTA fires onStart(topicId, topicLabel)',
        (tester) async {
      final insights = _StubInsightsClient(
        snapshot: _mkSnap(
          weakConcepts: [_row(id: 'c-weakest', ewa: 0.18)],
        ),
      );

      String? startedTopicId;
      String? startedLabel;
      await tester.pumpWidget(_harness(VidyaFocusedIntroScreen(
        client: _quizStub(),
        insights: insights,
        userId: 'u-1',
        onStart: (id, label) {
          startedTopicId = id;
          startedLabel = label;
        },
        onBack: () {},
      )));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Start focused session'));
      await tester.pump();

      expect(startedTopicId, 'c-weakest');
      // Label falls back to conceptId because the catalog fetch 500s.
      expect(startedLabel, 'c-weakest');
    });

    testWidgets('close (✕) fires onBack', (tester) async {
      final insights = _StubInsightsClient(
        snapshot: _mkSnap(
          weakConcepts: [_row(id: 'c-weakest', ewa: 0.30)],
        ),
      );

      var backTaps = 0;
      await tester.pumpWidget(_harness(VidyaFocusedIntroScreen(
        client: _quizStub(),
        insights: insights,
        userId: 'u-1',
        onStart: (_, __) {},
        onBack: () => backTaps++,
      )));
      await tester.pumpAndSettle();

      await tester.tap(find.byIcon(Icons.close));
      await tester.pump();
      expect(backTaps, 1);
    });
  });
}
