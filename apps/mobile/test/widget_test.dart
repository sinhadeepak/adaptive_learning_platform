import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/main.dart';
import 'package:adaptive_learning_mobile/screens/forgot_password_screen.dart';
import 'package:adaptive_learning_mobile/screens/login_screen.dart';
import 'package:adaptive_learning_mobile/screens/reset_password_screen.dart';
import 'package:adaptive_learning_mobile/screens/onboarding/daily_goal_screen.dart';
import 'package:adaptive_learning_mobile/screens/onboarding/exam_select_screen.dart';
import 'package:adaptive_learning_mobile/screens/onboarding/language_screen.dart';
import 'package:adaptive_learning_mobile/screens/register_screen.dart';
import 'package:adaptive_learning_mobile/screens/verify_screen.dart';
import 'package:adaptive_learning_mobile/screens/home_screen.dart';
import 'package:adaptive_learning_mobile/quiz/quiz_client.dart';
import 'package:adaptive_learning_mobile/quiz/quiz_screen.dart';
import 'package:adaptive_learning_mobile/quiz/quiz_result_screen.dart';

void main() {
  setUpAll(() {
    // The mobile platform plugin for secure-storage isn't available in widget tests; mock it.
    FlutterSecureStorage.setMockInitialValues({});
  });

  testWidgets('renders Sprint-0-style splash via legacy app shell', (tester) async {
    await tester.pumpWidget(const AdaptiveLearningAppLegacy());
    expect(find.textContaining('Adaptive Learning Platform'), findsOneWidget);
  });

  test('alp_design_tokens path dep is wired (smoke)', () {
    expect(AlpSpacing.s4, 16);
    // brandPrimary is the canonical student-blue from docs/ui (PR #41 flipped
    // it to #4F87F6 — the value used across all design-system surfaces).
    expect(AlpColors.brandPrimary.toARGB32(), 0xFF4F87F6);
    // Direct token also available via the new accent-* names.
    expect(AlpColors.colorBlue.toARGB32(), 0xFF4F87F6);
    expect(AlpColors.colorAi.toARGB32(), 0xFF22D4EE);
  });

  testWidgets('login screen renders email + password fields', (tester) async {
    final mockHttp = MockClient((request) async => http.Response('{}', 404));
    final auth = AuthClient(baseUrl: 'http://test', httpClient: mockHttp);

    Session? captured;
    await tester.pumpWidget(MaterialApp(
      home: LoginScreen(auth: auth, onLoggedIn: (s) => captured = s),
    ),);

    // 'Log in' appears twice — page heading + submit button label.
    expect(find.text('Log in'), findsNWidgets(2));
    expect(find.byKey(const Key('login.email')), findsOneWidget);
    expect(find.byKey(const Key('login.password')), findsOneWidget);
    expect(find.byKey(const Key('login.submit')), findsOneWidget);
    expect(captured, isNull);
  });

  testWidgets('login form validates required fields', (tester) async {
    final mockHttp = MockClient((request) async => http.Response('{}', 200));
    final auth = AuthClient(baseUrl: 'http://test', httpClient: mockHttp);

    await tester.pumpWidget(MaterialApp(
      home: LoginScreen(auth: auth, onLoggedIn: (_) {}),
    ),);

    await tester.tap(find.byKey(const Key('login.submit')));
    await tester.pump();

    expect(find.text('Enter your email'), findsOneWidget);
    expect(find.text('Enter your password'), findsOneWidget);
  });

  testWidgets('login success calls onLoggedIn with session', (tester) async {
    final mockHttp = MockClient((request) async {
      if (request.url.path.endsWith('/auth/login')) {
        return http.Response(
          '''{"user":{"id":"u1","email":"a@b.com","firstName":"A","lastName":"B","role":"STUDENT","onboardingState":"ONBOARDED"},
              "tokens":{"accessToken":"at","refreshToken":"rt","expiresAt":1000}}''',
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      return http.Response('{}', 404);
    });
    final auth = AuthClient(baseUrl: 'http://test', httpClient: mockHttp);

    Session? captured;
    await tester.pumpWidget(MaterialApp(
      home: LoginScreen(auth: auth, onLoggedIn: (s) => captured = s),
    ),);

    await tester.enterText(find.byKey(const Key('login.email')), 'a@b.com');
    await tester.enterText(find.byKey(const Key('login.password')), 'SuperSecret123!');
    await tester.tap(find.byKey(const Key('login.submit')));
    await tester.pumpAndSettle();

    expect(captured, isNotNull);
    expect(captured!.user.firstName, 'A');
    expect(auth.isAuthenticated, isTrue);
  });

  testWidgets('register screen renders all fields', (tester) async {
    final mockHttp = MockClient((request) async => http.Response('{}', 404));
    final auth = AuthClient(baseUrl: 'http://test', httpClient: mockHttp);

    await tester.pumpWidget(
      MaterialApp(
        home: RegisterScreen(
          auth: auth,
          onRegistered: (_, __) {},
          onBackToLogin: () {},
        ),
      ),
    );

    expect(find.text('Create account'), findsAtLeastNWidgets(1));
    expect(find.byKey(const Key('register.firstName')), findsOneWidget);
    expect(find.byKey(const Key('register.lastName')), findsOneWidget);
    expect(find.byKey(const Key('register.email')), findsOneWidget);
    expect(find.byKey(const Key('register.password')), findsOneWidget);
    expect(find.byKey(const Key('register.submit')), findsOneWidget);
  });

  testWidgets('register success calls onRegistered with userId + email', (tester) async {
    final mockHttp = MockClient((request) async {
      if (request.url.path.endsWith('/auth/register')) {
        return http.Response(
          '{"userId":"u-9","otpChannel":"email"}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      return http.Response('{}', 404);
    });
    final auth = AuthClient(baseUrl: 'http://test', httpClient: mockHttp);

    RegisterResult? captured;
    String? capturedEmail;
    await tester.pumpWidget(
      MaterialApp(
        home: RegisterScreen(
          auth: auth,
          onRegistered: (r, e) {
            captured = r;
            capturedEmail = e;
          },
          onBackToLogin: () {},
        ),
      ),
    );

    await tester.enterText(find.byKey(const Key('register.firstName')), 'Rahul');
    await tester.enterText(find.byKey(const Key('register.lastName')), 'Sharma');
    await tester.enterText(find.byKey(const Key('register.email')), 'r@example.com');
    await tester.enterText(find.byKey(const Key('register.password')), 'SuperSecret123!');
    // Tick the ToS checkbox
    await tester.tap(find.byType(Checkbox));
    await tester.pump();
    await tester.tap(find.byKey(const Key('register.submit')));
    await tester.pumpAndSettle();

    expect(captured, isNotNull);
    expect(captured!.userId, 'u-9');
    expect(captured!.otpChannel, 'email');
    expect(capturedEmail, 'r@example.com');
  });

  testWidgets('register 409 surfaces "already registered" message', (tester) async {
    final mockHttp = MockClient(
      (request) async => http.Response(
        '{"detail":{"code":"email_taken","message":"Email is already registered"}}',
        409,
        headers: {'content-type': 'application/json'},
      ),
    );
    final auth = AuthClient(baseUrl: 'http://test', httpClient: mockHttp);

    await tester.pumpWidget(
      MaterialApp(
        home: RegisterScreen(
          auth: auth,
          onRegistered: (_, __) {},
          onBackToLogin: () {},
        ),
      ),
    );

    await tester.enterText(find.byKey(const Key('register.firstName')), 'A');
    await tester.enterText(find.byKey(const Key('register.lastName')), 'B');
    await tester.enterText(find.byKey(const Key('register.email')), 'taken@example.com');
    await tester.enterText(find.byKey(const Key('register.password')), 'SuperSecret123!');
    await tester.tap(find.byType(Checkbox));
    await tester.pump();
    await tester.tap(find.byKey(const Key('register.submit')));
    await tester.pumpAndSettle();

    expect(find.textContaining('already registered'), findsOneWidget);
  });

  testWidgets('verify screen renders 6 OTP cells', (tester) async {
    final mockHttp = MockClient((request) async => http.Response('{}', 404));
    final auth = AuthClient(baseUrl: 'http://test', httpClient: mockHttp);

    await tester.pumpWidget(
      MaterialApp(
        home: VerifyScreen(
          auth: auth,
          userId: 'u-9',
          email: 'r@example.com',
          onVerified: (_) {},
          onBack: () {},
        ),
      ),
    );

    expect(find.text('Verify your email'), findsOneWidget);
    for (var i = 0; i < 6; i++) {
      expect(find.byKey(Key('verify.cell.$i')), findsOneWidget);
    }
    expect(find.textContaining('r@example.com'), findsOneWidget);
  });

  testWidgets('verify with full code calls onVerified', (tester) async {
    final mockHttp = MockClient((request) async {
      if (request.url.path.endsWith('/auth/otp/verify')) {
        return http.Response(
          '''{"user":{"id":"u-9","email":"r@example.com","firstName":"Rahul","lastName":"Sharma","role":"STUDENT","onboardingState":"NEW"},
              "tokens":{"accessToken":"at","refreshToken":"rt","expiresAt":1000}}''',
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      return http.Response('{}', 404);
    });
    final auth = AuthClient(baseUrl: 'http://test', httpClient: mockHttp);

    Session? captured;
    await tester.pumpWidget(
      MaterialApp(
        home: VerifyScreen(
          auth: auth,
          userId: 'u-9',
          email: 'r@example.com',
          onVerified: (s) => captured = s,
          onBack: () {},
        ),
      ),
    );

    for (var i = 0; i < 6; i++) {
      await tester.enterText(find.byKey(Key('verify.cell.$i')), '${i + 1}');
    }
    await tester.tap(find.byKey(const Key('verify.submit')));
    await tester.pumpAndSettle();

    expect(captured, isNotNull);
    expect(captured!.user.firstName, 'Rahul');
  });

  testWidgets('exam-select fetches and renders the seeded exams', (tester) async {
    final mockHttp = MockClient((request) async {
      if (request.url.path.endsWith('/catalog/exams')) {
        return http.Response(
          '''[
            {"id":"e1","code":"JEE_MAIN","name":"JEE Main","subtitle":"Engineering"},
            {"id":"e2","code":"NEET","name":"NEET","subtitle":"Medical"}
          ]''',
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      return http.Response('{}', 404);
    });
    final auth = AuthClient(baseUrl: 'http://test', httpClient: mockHttp);

    await tester.pumpWidget(
      MaterialApp(home: ExamSelectScreen(auth: auth, onContinue: () {})),
    );
    await tester.pumpAndSettle();

    expect(find.text('JEE Main'), findsOneWidget);
    expect(find.text('NEET'), findsOneWidget);
    expect(find.text('Engineering'), findsOneWidget);
  });

  testWidgets('exam-select PUTs the chosen exam and calls onContinue', (tester) async {
    final calls = <String>[];
    final mockHttp = MockClient((request) async {
      calls.add('${request.method} ${request.url.path}');
      if (request.method == 'GET' && request.url.path.endsWith('/catalog/exams')) {
        return http.Response(
          '[{"id":"e1","code":"JEE_MAIN","name":"JEE Main","subtitle":"Engineering"}]',
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      if (request.method == 'PUT' && request.url.path.endsWith('/profile/exams')) {
        return http.Response('{"ok":true}', 200);
      }
      return http.Response('{}', 404);
    });
    final auth = AuthClient(baseUrl: 'http://test', httpClient: mockHttp);

    var continued = false;
    await tester.pumpWidget(
      MaterialApp(
        home: ExamSelectScreen(auth: auth, onContinue: () => continued = true),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('onboarding.exam.card.JEE_MAIN')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('onboarding.exam.continue')));
    await tester.pumpAndSettle();

    expect(continued, isTrue);
    expect(calls.any((c) => c.startsWith('PUT') && c.endsWith('/profile/exams')), isTrue);
  });

  testWidgets('language screen has 3 options + skip', (tester) async {
    final auth = AuthClient(
      baseUrl: 'http://test',
      httpClient: MockClient((req) async => http.Response('{}', 200)),
    );
    await tester.pumpWidget(
      MaterialApp(home: LanguageScreen(auth: auth, onContinue: () {}, onBack: () {})),
    );

    expect(find.byKey(const Key('onboarding.language.en')), findsOneWidget);
    expect(find.byKey(const Key('onboarding.language.hi')), findsOneWidget);
    expect(find.byKey(const Key('onboarding.language.hinglish')), findsOneWidget);
    expect(find.text('Skip (defaults to English)'), findsOneWidget);
  });

  testWidgets('daily-goal "Start learning" PATCHes preferences and calls onCompleted', (tester) async {
    final calls = <String>[];
    final mockHttp = MockClient((request) async {
      calls.add('${request.method} ${request.url.path}');
      if (request.method == 'PATCH' && request.url.path.endsWith('/profile/preferences')) {
        return http.Response('{}', 200);
      }
      return http.Response('{}', 404);
    });
    final auth = AuthClient(baseUrl: 'http://test', httpClient: mockHttp);

    var done = false;
    await tester.pumpWidget(
      MaterialApp(
        home: DailyGoalScreen(auth: auth, onCompleted: () => done = true, onBack: () {}),
      ),
    );

    await tester.ensureVisible(find.byKey(const Key('onboarding.goal.start')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('onboarding.goal.start')));
    await tester.pumpAndSettle();

    expect(done, isTrue);
    expect(calls.any((c) => c.startsWith('PATCH') && c.endsWith('/profile/preferences')), isTrue);
  });

  testWidgets('login 401 surfaces friendly error', (tester) async {
    final mockHttp = MockClient((request) async => http.Response(
          '{"detail":{"code":"invalid_credentials","message":"Email or password is incorrect"}}',
          401,
          headers: {'content-type': 'application/json'},
        ),);
    final auth = AuthClient(baseUrl: 'http://test', httpClient: mockHttp);

    await tester.pumpWidget(MaterialApp(
      home: LoginScreen(auth: auth, onLoggedIn: (_) {}),
    ),);

    await tester.enterText(find.byKey(const Key('login.email')), 'a@b.com');
    await tester.enterText(find.byKey(const Key('login.password')), 'wrong');
    await tester.tap(find.byKey(const Key('login.submit')));
    await tester.pumpAndSettle();

    expect(find.textContaining('Email or password is incorrect'), findsOneWidget);
  });

// ---- Sprint 4 — deep-link cold-start ----

testWidgets('cold-start with reset-password deep link routes to ResetPasswordScreen',
    (tester) async {
  FlutterSecureStorage.setMockInitialValues({});
  final auth = AuthClient(
    baseUrl: 'http://test',
    httpClient: MockClient((_) async => http.Response('{}', 404)),
  );

  await tester.pumpWidget(
    AdaptiveLearningApp(
      auth: auth,
      initialDeepLink: 'alp://reset?token=cold-start-token',
    ),
  );
  // Splash → bootstrap completes → routing settles.
  await tester.pumpAndSettle();

  expect(find.text('Set new password'), findsOneWidget);
  expect(find.byKey(const Key('reset.password')), findsOneWidget);
});

testWidgets('cold-start without deep link lands on login', (tester) async {
  FlutterSecureStorage.setMockInitialValues({});
  final auth = AuthClient(
    baseUrl: 'http://test',
    httpClient: MockClient((_) async => http.Response('{}', 404)),
  );

  await tester.pumpWidget(AdaptiveLearningApp(auth: auth));
  await tester.pumpAndSettle();

  expect(find.byKey(const Key('login.email')), findsOneWidget);
});

testWidgets('cold-start with ignored deep link (no token) falls through to login',
    (tester) async {
  FlutterSecureStorage.setMockInitialValues({});
  final auth = AuthClient(
    baseUrl: 'http://test',
    httpClient: MockClient((_) async => http.Response('{}', 404)),
  );

  await tester.pumpWidget(
    AdaptiveLearningApp(
      auth: auth,
      initialDeepLink: 'https://app.adaptive-learn.io/reset', // no ?token=
    ),
  );
  await tester.pumpAndSettle();

  expect(find.byKey(const Key('login.email')), findsOneWidget);
});

// ---- Sprint 3 — forgot/reset password ----

testWidgets('login forgot button calls onForgotPassword', (tester) async {
  final auth = AuthClient(
    baseUrl: 'http://test',
    httpClient: MockClient((_) async => http.Response('{}', 404)),
  );

  var forgotTapped = false;
  await tester.pumpWidget(
    MaterialApp(
      home: LoginScreen(
        auth: auth,
        onLoggedIn: (_) {},
        onForgotPassword: () => forgotTapped = true,
      ),
    ),
  );
  await tester.tap(find.byKey(const Key('login.forgot')));
  await tester.pump();
  expect(forgotTapped, isTrue);
});

testWidgets('forgot screen submits email and shows confirmation', (tester) async {
  final calls = <String>[];
  final mockHttp = MockClient((request) async {
    calls.add('${request.method} ${request.url.path}');
    if (request.url.path.endsWith('/auth/password/forgot')) {
      return http.Response('', 204);
    }
    return http.Response('{}', 404);
  });
  final auth = AuthClient(baseUrl: 'http://test', httpClient: mockHttp);

  await tester.pumpWidget(MaterialApp(
    home: ForgotPasswordScreen(auth: auth, onBackToLogin: () {}),
  ));

  await tester.enterText(find.byKey(const Key('forgot.email')), 'a@b.com');
  await tester.tap(find.byKey(const Key('forgot.submit')));
  await tester.pumpAndSettle();

  expect(calls.any((c) => c.contains('/auth/password/forgot')), isTrue);
  expect(find.text('Check your email'), findsOneWidget);
  expect(find.textContaining('a@b.com'), findsOneWidget);
});

testWidgets('forgot screen shows enumeration-safe confirmation even on 204', (tester) async {
  // Auth always returns 204 regardless of whether email exists. The screen
  // should never reveal which case fired.
  final mockHttp = MockClient((_) async => http.Response('', 204));
  final auth = AuthClient(baseUrl: 'http://test', httpClient: mockHttp);

  await tester.pumpWidget(MaterialApp(
    home: ForgotPasswordScreen(auth: auth, onBackToLogin: () {}),
  ));

  await tester.enterText(find.byKey(const Key('forgot.email')), 'unknown@nowhere.com');
  await tester.tap(find.byKey(const Key('forgot.submit')));
  await tester.pumpAndSettle();

  expect(find.textContaining('If an account exists'), findsOneWidget);
});

testWidgets('reset screen rejects mismatched confirm', (tester) async {
  final auth = AuthClient(
    baseUrl: 'http://test',
    httpClient: MockClient((_) async => http.Response('', 204)),
  );

  await tester.pumpWidget(MaterialApp(
    home: ResetPasswordScreen(
      auth: auth,
      token: 'tok-123',
      onResetCompleted: () {},
      onBackToLogin: () {},
    ),
  ));

  await tester.enterText(find.byKey(const Key('reset.password')), 'SuperSecret123!');
  await tester.enterText(find.byKey(const Key('reset.confirm')), 'doesnotmatch');
  await tester.tap(find.byKey(const Key('reset.submit')));
  await tester.pump();

  expect(find.text('Passwords do not match'), findsOneWidget);
});

testWidgets('reset screen surfaces 410 expired-token error', (tester) async {
  final mockHttp = MockClient((request) async {
    if (request.url.path.endsWith('/auth/password/reset')) {
      return http.Response('{"detail":{"code":"token_invalid_or_expired"}}', 410);
    }
    return http.Response('{}', 404);
  });
  final auth = AuthClient(baseUrl: 'http://test', httpClient: mockHttp);

  await tester.pumpWidget(MaterialApp(
    home: ResetPasswordScreen(
      auth: auth,
      token: 'expired-token',
      onResetCompleted: () {},
      onBackToLogin: () {},
    ),
  ));

  await tester.enterText(find.byKey(const Key('reset.password')), 'NewSecret123!');
  await tester.enterText(find.byKey(const Key('reset.confirm')), 'NewSecret123!');
  await tester.tap(find.byKey(const Key('reset.submit')));
  await tester.pumpAndSettle();

  expect(find.textContaining('invalid or has expired'), findsOneWidget);
});

testWidgets('reset success calls onResetCompleted', (tester) async {
  final mockHttp = MockClient((request) async {
    if (request.url.path.endsWith('/auth/password/reset')) {
      return http.Response('', 204);
    }
    return http.Response('{}', 404);
  });
  final auth = AuthClient(baseUrl: 'http://test', httpClient: mockHttp);

  var done = false;
  await tester.pumpWidget(MaterialApp(
    home: ResetPasswordScreen(
      auth: auth,
      token: 'tok-OK',
      onResetCompleted: () => done = true,
      onBackToLogin: () {},
    ),
  ));

  await tester.enterText(find.byKey(const Key('reset.password')), 'NewSecret123!');
  await tester.enterText(find.byKey(const Key('reset.confirm')), 'NewSecret123!');
  await tester.tap(find.byKey(const Key('reset.submit')));
  await tester.pumpAndSettle();

  expect(done, isTrue);
});

// ---- Sprint 3 — quiz play + result screens ----

testWidgets('home screen shows quick-start quiz CTA', (tester) async {
  FlutterSecureStorage.setMockInitialValues({});
  final mockHttp = MockClient((request) async => http.Response('{}', 404));
  final auth = AuthClient(
    baseUrl: 'http://test',
    storage: const FlutterSecureStorage(),
    httpClient: mockHttp,
  );

  await tester.pumpWidget(MaterialApp(
    home: HomeScreen(auth: auth, onSignOut: () {}),
  ));
  await tester.pump();

  expect(find.textContaining('Hi,'), findsOneWidget);
  expect(find.text('Mechanics'), findsOneWidget);
  expect(find.text('Start practice quiz'), findsOneWidget);
});

testWidgets('quiz screen renders 4 lettered choices for the current item', (tester) async {
  FlutterSecureStorage.setMockInitialValues({});
  final mockHttp = MockClient((request) async {
    final p = request.url.path;
    if (p.endsWith('/quiz/sessions/sid-1')) {
      return http.Response(
        '{"sessionId":"sid-1","userId":"u","topicId":"t","mode":"PRACTICE","strategy":"binary_search","status":"IN_PROGRESS","targetCount":10,"servedCount":0,"correctCount":0,"items":[]}',
        200,
        headers: {'content-type': 'application/json'},
      );
    }
    if (p.endsWith('/quiz/sessions/sid-1/next')) {
      return http.Response(
        '{"sessionId":"sid-1","status":"IN_PROGRESS","done":false,"item":{"itemIdx":0,"questionId":"q-1","stem":"What is 2+2?","choices":["3","4","5","22"]}}',
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
  final client = QuizClient(auth: auth);

  await tester.pumpWidget(MaterialApp(
    home: QuizScreen(client: client, sessionId: 'sid-1'),
  ));
  await tester.pumpAndSettle();

  expect(find.text('What is 2+2?'), findsOneWidget);
  expect(find.text('A'), findsOneWidget);
  expect(find.text('B'), findsOneWidget);
  expect(find.text('C'), findsOneWidget);
  expect(find.text('D'), findsOneWidget);
  expect(find.text('Submit answer'), findsOneWidget);
});

testWidgets('quiz result screen renders score + per-item review', (tester) async {
  FlutterSecureStorage.setMockInitialValues({});
  final mockHttp = MockClient((request) async {
    if (request.url.path.endsWith('/quiz/sessions/sid-9')) {
      return http.Response(
        '{"sessionId":"sid-9","userId":"u","topicId":"t","mode":"PRACTICE","strategy":"binary_search","status":"SUBMITTED","targetCount":5,"servedCount":5,"correctCount":4,"items":['
        '{"itemIdx":0,"questionId":"q-aaaaaaaa-1","answerIdx":1,"isCorrect":true,"answered":true},'
        '{"itemIdx":1,"questionId":"q-bbbbbbbb-2","answerIdx":0,"isCorrect":false,"answered":true},'
        '{"itemIdx":2,"questionId":"q-cccccccc-3","answerIdx":2,"isCorrect":true,"answered":true},'
        '{"itemIdx":3,"questionId":"q-dddddddd-4","answerIdx":0,"isCorrect":true,"answered":true},'
        '{"itemIdx":4,"questionId":"q-eeeeeeee-5","answerIdx":3,"isCorrect":true,"answered":true}'
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
  final client = QuizClient(auth: auth);

  await tester.pumpWidget(MaterialApp(
    home: QuizResultScreen(client: client, sessionId: 'sid-9'),
  ));
  await tester.pumpAndSettle();

  expect(find.text('4'), findsOneWidget);
  expect(find.text('/5'), findsOneWidget);
  expect(find.text('80%'), findsOneWidget);
  expect(find.text('Q1'), findsOneWidget);
  expect(find.text('Q5'), findsOneWidget);
});

}
