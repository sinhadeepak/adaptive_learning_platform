// Phase B — VidyaTopicDetailScreen tests. Native topic surface: mastery
// ring + bucket + stat tiles, and a real "Practice this topic" launch
// (was a deferred snackbar). Caller passes auth + Topic + ewa.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:adaptive_learning_mobile/api/api_client.dart';
import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_practice_session_screen.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_topic_detail_screen.dart';

// Session calls 500 in tests → the launched session screen settles to its
// error banner, but the push (what we assert) still happens.
AuthClient _auth({bool withUser = true}) {
  final auth = AuthClient(
    baseUrl: 'http://test',
    httpClient: MockClient((req) async => http.Response('{}', 500)),
  );
  if (withUser) {
    auth.setUser(User(
      id: 'u-1',
      email: 't@example.com',
      firstName: 'T',
      lastName: 'U',
      role: 'STUDENT',
      onboardingState: 'COMPLETE',
    ));
  }
  return auth;
}

Widget _harness(Widget child) => MaterialApp(
      theme: VidyaTheme.material(
        brightness: Brightness.light,
        persona: VidyaPersona.aspirant,
        density: VidyaDensity.regular,
      ),
      home: child,
    );

Topic _mechanics({int questionCount = 14}) => Topic(
      id: 't1',
      subjectId: 's1',
      title: 'Mechanics',
      questionCount: questionCount,
      tier: 'CORE',
    );

void main() {
  group('VidyaTopicDetailScreen — Phase B', () {
    testWidgets('renders topic title in AppBar', (tester) async {
      await tester.pumpWidget(_harness(
        VidyaTopicDetailScreen(auth: _auth(), topic: _mechanics(), ewa: 0.52),
      ));
      await tester.pumpAndSettle();
      expect(find.text('Mechanics'), findsAtLeastNWidgets(1));
    });

    testWidgets('renders bucket label + mastery % for DEVELOPING band',
        (tester) async {
      await tester.pumpWidget(_harness(
        VidyaTopicDetailScreen(auth: _auth(), topic: _mechanics(), ewa: 0.52),
      ));
      await tester.pumpAndSettle();
      expect(find.textContaining('DEVELOPING'), findsOneWidget);
      // 0.52 → "52%" in the MASTERY tile (and "52" in the ring).
      expect(find.text('52%'), findsOneWidget);
      expect(find.text('MASTERY'), findsOneWidget);
    });

    testWidgets('STRONG bucket label when ewa >= 0.70', (tester) async {
      await tester.pumpWidget(_harness(
        VidyaTopicDetailScreen(auth: _auth(), topic: _mechanics(), ewa: 0.85),
      ));
      await tester.pumpAndSettle();
      expect(find.textContaining('STRONG'), findsOneWidget);
    });

    testWidgets('NOT STARTED bucket label when ewa == 0', (tester) async {
      await tester.pumpWidget(_harness(
        VidyaTopicDetailScreen(auth: _auth(), topic: _mechanics(), ewa: 0.0),
      ));
      await tester.pumpAndSettle();
      expect(find.textContaining('NOT STARTED'), findsOneWidget);
    });

    testWidgets('renders question count in the QUESTIONS tile', (tester) async {
      await tester.pumpWidget(_harness(
        VidyaTopicDetailScreen(
          auth: _auth(),
          topic: _mechanics(questionCount: 14),
          ewa: 0.52,
        ),
      ));
      await tester.pumpAndSettle();
      expect(find.text('QUESTIONS'), findsOneWidget);
      expect(find.text('14'), findsOneWidget);
    });

    testWidgets('Practice this topic launches a practice session',
        (tester) async {
      await tester.pumpWidget(_harness(
        VidyaTopicDetailScreen(auth: _auth(), topic: _mechanics(), ewa: 0.52),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Practice this topic'));
      await tester.pumpAndSettle();
      expect(find.byType(VidyaPracticeSessionScreen), findsOneWidget);
    });

    testWidgets('Practice nudges to sign in when no user', (tester) async {
      await tester.pumpWidget(_harness(
        VidyaTopicDetailScreen(
          auth: _auth(withUser: false),
          topic: _mechanics(),
          ewa: 0.52,
        ),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Practice this topic'));
      await tester.pump();
      expect(find.byType(VidyaPracticeSessionScreen), findsNothing);
      expect(find.textContaining('Sign in'), findsOneWidget);
    });
  });
}
