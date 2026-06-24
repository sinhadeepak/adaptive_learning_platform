// Phase D — VidyaTutorChatScreen smoke test. The streaming send path uses a
// non-injected http client (SSE), so we assert the chat chrome (intro +
// composer) rather than drive a live stream.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_tutor_chat_screen.dart';

AuthClient _auth() => AuthClient(
      baseUrl: 'http://test',
      httpClient: MockClient((req) async => http.Response('{}', 500)),
    );

Widget _harness(Widget child) => MaterialApp(
      theme: VidyaTheme.material(
        brightness: Brightness.light,
        persona: VidyaPersona.aspirant,
        density: VidyaDensity.regular,
      ),
      home: child,
    );

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  testWidgets('renders the tutor intro + composer', (tester) async {
    await tester.pumpWidget(_harness(VidyaTutorChatScreen(auth: _auth())));
    await tester.pumpAndSettle();
    expect(find.text('AI tutor'), findsOneWidget); // app bar title
    expect(find.text('Ask your AI tutor'), findsOneWidget); // intro
    expect(find.byType(TextField), findsOneWidget);
    expect(find.byIcon(Icons.arrow_upward), findsOneWidget); // send button
  });

  testWidgets('topicTitle overrides the app-bar title', (tester) async {
    await tester.pumpWidget(_harness(
      VidyaTutorChatScreen(auth: _auth(), topicTitle: 'Thermodynamics'),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Thermodynamics'), findsOneWidget);
  });
}
