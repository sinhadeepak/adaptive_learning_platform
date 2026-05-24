import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/vidya/vidya_root_app.dart';

AuthClient _makeAuth() => AuthClient(
      baseUrl: 'http://test',
      httpClient: MockClient((req) async {
        // /catalog/exams (GET) returns empty list; other paths 404.
        if (req.url.path.endsWith('/catalog/exams')) {
          return http.Response('[]', 200);
        }
        return http.Response('{}', 404);
      }),
    );

void main() {
  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
  });

  testWidgets('renders splash during bootstrap', (tester) async {
    await tester.pumpWidget(VidyaRootApp(auth: _makeAuth()));
    expect(find.byType(VidyaRootApp), findsOneWidget);
  });

  testWidgets('first-launch (no onboarding_done key) lands on welcome',
      (tester) async {
    await tester.pumpWidget(VidyaRootApp(auth: _makeAuth()));
    await tester.pumpAndSettle();
    expect(find.text('Welcome to Vidya'), findsOneWidget);
  });

  testWidgets('returning user (onboarding_done == true) lands on AuroraRoute',
      (tester) async {
    FlutterSecureStorage.setMockInitialValues(
        {'vidya.onboarding_done': 'true'});
    await tester.pumpWidget(VidyaRootApp(auth: _makeAuth()));
    await tester.pumpAndSettle();
    // Welcome NOT visible — AuroraRoute is rendering AuroraGuestFlow.
    expect(find.text('Welcome to Vidya'), findsNothing);
  });
}
