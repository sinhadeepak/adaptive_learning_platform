// Phase 3b.full v2 — VidyaTopicDetailScreen tests. Stateless screen,
// no fetches — caller passes Topic + ewa.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:adaptive_learning_mobile/api/api_client.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_topic_detail_screen.dart';

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
  group('VidyaTopicDetailScreen — Phase 3b.full v2', () {
    testWidgets('renders topic title in AppBar', (tester) async {
      await tester.pumpWidget(_harness(
        VidyaTopicDetailScreen(topic: _mechanics(), ewa: 0.52),
      ));
      await tester.pumpAndSettle();
      expect(find.text('Mechanics'), findsAtLeastNWidgets(1));
    });

    testWidgets('renders bucket label + EWA for DEVELOPING band',
        (tester) async {
      await tester.pumpWidget(_harness(
        VidyaTopicDetailScreen(topic: _mechanics(), ewa: 0.52),
      ));
      await tester.pumpAndSettle();
      expect(find.textContaining('DEVELOPING'), findsOneWidget);
      expect(find.textContaining('0.52'), findsOneWidget);
    });

    testWidgets('STRONG bucket label when ewa >= 0.70', (tester) async {
      await tester.pumpWidget(_harness(
        VidyaTopicDetailScreen(topic: _mechanics(), ewa: 0.85),
      ));
      await tester.pumpAndSettle();
      expect(find.textContaining('STRONG'), findsOneWidget);
    });

    testWidgets('NOT STARTED bucket label when ewa == 0', (tester) async {
      await tester.pumpWidget(_harness(
        VidyaTopicDetailScreen(topic: _mechanics(), ewa: 0.0),
      ));
      await tester.pumpAndSettle();
      expect(find.textContaining('NOT STARTED'), findsOneWidget);
    });

    testWidgets('renders question count', (tester) async {
      await tester.pumpWidget(_harness(
        VidyaTopicDetailScreen(
          topic: _mechanics(questionCount: 14),
          ewa: 0.52,
        ),
      ));
      await tester.pumpAndSettle();
      expect(find.textContaining('14 questions'), findsOneWidget);
    });

    testWidgets('Practice this topic shows the deferred snackbar',
        (tester) async {
      await tester.pumpWidget(_harness(
        VidyaTopicDetailScreen(topic: _mechanics(), ewa: 0.52),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Practice this topic'));
      await tester.pump();
      expect(
        find.textContaining('coming in Phase 3c.full'),
        findsOneWidget,
      );
    });

    testWidgets('shows COMING IN PHASE 3b.full v3 placeholder card',
        (tester) async {
      await tester.pumpWidget(_harness(
        VidyaTopicDetailScreen(topic: _mechanics(), ewa: 0.52),
      ));
      await tester.pumpAndSettle();
      expect(find.text('COMING IN PHASE 3b.full v3'), findsOneWidget);
    });
  });
}
