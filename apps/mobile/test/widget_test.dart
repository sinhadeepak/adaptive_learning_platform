import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:adaptive_learning_mobile/main.dart';

void main() {
  testWidgets('renders sprint 0 shell', (WidgetTester tester) async {
    await tester.pumpWidget(const AdaptiveLearningApp());
    expect(find.textContaining('Adaptive Learning Platform'), findsOneWidget);
  });
}
