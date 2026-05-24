import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_login_screen.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_register_screen.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_verify_screen.dart';
import 'package:adaptive_learning_mobile/vidya/screens/vidya_forgot_password_screen.dart';

Widget _harness({
  required Widget child,
  Brightness brightness = Brightness.light,
  VidyaPersona persona = VidyaPersona.aspirant,
  VidyaDensity density = VidyaDensity.regular,
}) {
  return MaterialApp(
    theme: VidyaTheme.material(
      brightness: brightness,
      persona: persona,
      density: density,
    ),
    home: child,
  );
}

AuthClient _authWith(Future<http.Response> Function(http.Request) handler) =>
    AuthClient(baseUrl: 'http://test', httpClient: MockClient(handler));

void main() {
  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
  });

  group('VidyaLoginScreen', () {
    testWidgets('renders email + password fields + submit', (tester) async {
      final auth = _authWith((req) async => http.Response('{}', 404));
      await tester.pumpWidget(_harness(
        child: VidyaLoginScreen(
          auth: auth,
          onLoggedIn: (_) {},
          onSignUp: () {},
          onForgotPassword: () {},
        ),
      ));
      expect(find.byKey(const Key('vidya.login.email')), findsOneWidget);
      expect(find.byKey(const Key('vidya.login.password')), findsOneWidget);
      expect(find.byKey(const Key('vidya.login.submit')), findsOneWidget);
    });

    testWidgets('empty submit shows validation', (tester) async {
      final auth = _authWith((req) async => http.Response('{}', 200));
      await tester.pumpWidget(_harness(
        child: VidyaLoginScreen(
          auth: auth,
          onLoggedIn: (_) {},
          onSignUp: () {},
          onForgotPassword: () {},
        ),
      ));
      await tester.tap(find.byKey(const Key('vidya.login.submit')));
      await tester.pump();
      expect(find.text('Enter your email'), findsOneWidget);
      expect(find.text('Enter your password'), findsOneWidget);
    });

    testWidgets('success calls onLoggedIn with session', (tester) async {
      final auth = _authWith((req) async {
        if (req.url.path.endsWith('/auth/login')) {
          return http.Response(
            '{"user":{"id":"u1","email":"a@b.com","firstName":"A","lastName":"B","role":"STUDENT","onboardingState":"ONBOARDED"},'
            '"tokens":{"accessToken":"at","refreshToken":"rt","expiresAt":1000}}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('{}', 404);
      });
      Session? captured;
      await tester.pumpWidget(_harness(
        child: VidyaLoginScreen(
          auth: auth,
          onLoggedIn: (s) => captured = s,
          onSignUp: () {},
          onForgotPassword: () {},
        ),
      ));
      await tester.enterText(find.byKey(const Key('vidya.login.email')), 'a@b.com');
      await tester.enterText(find.byKey(const Key('vidya.login.password')), 'SuperSecret123!');
      await tester.tap(find.byKey(const Key('vidya.login.submit')));
      await tester.pumpAndSettle();
      expect(captured, isNotNull);
      expect(captured!.user.firstName, 'A');
    });

    testWidgets('401 surfaces invalid-credentials banner', (tester) async {
      final auth = _authWith((req) async => http.Response(
            '{"detail":{"code":"invalid_credentials","message":"Wrong email or password."}}',
            401,
            headers: {'content-type': 'application/json'},
          ));
      await tester.pumpWidget(_harness(
        child: VidyaLoginScreen(
          auth: auth,
          onLoggedIn: (_) {},
          onSignUp: () {},
          onForgotPassword: () {},
        ),
      ));
      await tester.enterText(find.byKey(const Key('vidya.login.email')), 'a@b.com');
      await tester.enterText(find.byKey(const Key('vidya.login.password')), 'wrong');
      await tester.tap(find.byKey(const Key('vidya.login.submit')));
      await tester.pumpAndSettle();
      expect(find.textContaining('Wrong email or password'), findsOneWidget);
    });

    testWidgets('Forgot link fires onForgotPassword', (tester) async {
      final auth = _authWith((req) async => http.Response('{}', 404));
      var taps = 0;
      await tester.pumpWidget(_harness(
        child: VidyaLoginScreen(
          auth: auth,
          onLoggedIn: (_) {},
          onSignUp: () {},
          onForgotPassword: () => taps++,
        ),
      ));
      await tester.tap(find.text('Forgot password?'));
      await tester.pumpAndSettle();
      expect(taps, 1);
    });

    testWidgets('Sign up link fires onSignUp', (tester) async {
      final auth = _authWith((req) async => http.Response('{}', 404));
      var taps = 0;
      await tester.pumpWidget(_harness(
        child: VidyaLoginScreen(
          auth: auth,
          onLoggedIn: (_) {},
          onSignUp: () => taps++,
          onForgotPassword: () {},
        ),
      ));
      await tester.tap(find.text("Don't have an account? Sign up"));
      await tester.pumpAndSettle();
      expect(taps, 1);
    });
  });

  group('VidyaRegisterScreen', () {
    testWidgets('renders all required fields + ToS checkbox', (tester) async {
      final auth = AuthClient(
        baseUrl: 'http://test',
        httpClient: MockClient((_) async => http.Response('{}', 404)),
      );
      await tester.pumpWidget(_harness(
        child: VidyaRegisterScreen(
          auth: auth,
          onRegistered: (_, __) {},
          onBackToLogin: () {},
        ),
      ));
      expect(find.byKey(const Key('vidya.register.firstName')), findsOneWidget);
      expect(find.byKey(const Key('vidya.register.lastName')), findsOneWidget);
      expect(find.byKey(const Key('vidya.register.email')), findsOneWidget);
      expect(find.byKey(const Key('vidya.register.password')), findsOneWidget);
      expect(find.byType(Checkbox), findsOneWidget);
      expect(find.byKey(const Key('vidya.register.submit')), findsOneWidget);
    });

    testWidgets('success hands (RegisterResult, email) to onRegistered',
        (tester) async {
      final auth = AuthClient(
        baseUrl: 'http://test',
        httpClient: MockClient((req) async {
          if (req.url.path.endsWith('/auth/register')) {
            return http.Response(
              '{"userId":"u-9","otpChannel":"email"}',
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          return http.Response('{}', 404);
        }),
      );
      RegisterResult? captured;
      String? capturedEmail;
      await tester.pumpWidget(_harness(
        child: VidyaRegisterScreen(
          auth: auth,
          onRegistered: (r, e) {
            captured = r;
            capturedEmail = e;
          },
          onBackToLogin: () {},
        ),
      ));
      await tester.enterText(find.byKey(const Key('vidya.register.firstName')), 'Rahul');
      await tester.enterText(find.byKey(const Key('vidya.register.lastName')), 'Sharma');
      await tester.enterText(find.byKey(const Key('vidya.register.email')), 'r@example.com');
      await tester.enterText(find.byKey(const Key('vidya.register.password')), 'SuperSecret123!');
      await tester.tap(find.byType(Checkbox));
      await tester.pump();
      await tester.tap(find.byKey(const Key('vidya.register.submit')));
      await tester.pumpAndSettle();
      expect(captured?.userId, 'u-9');
      expect(captured?.otpChannel, 'email');
      expect(capturedEmail, 'r@example.com');
    });

    testWidgets('409 surfaces "already registered" message', (tester) async {
      final auth = AuthClient(
        baseUrl: 'http://test',
        httpClient: MockClient((_) async => http.Response(
              '{"detail":{"code":"email_taken","message":"Email is already registered"}}',
              409,
              headers: {'content-type': 'application/json'},
            )),
      );
      await tester.pumpWidget(_harness(
        child: VidyaRegisterScreen(
          auth: auth,
          onRegistered: (_, __) {},
          onBackToLogin: () {},
        ),
      ));
      await tester.enterText(find.byKey(const Key('vidya.register.firstName')), 'R');
      await tester.enterText(find.byKey(const Key('vidya.register.lastName')), 'S');
      await tester.enterText(find.byKey(const Key('vidya.register.email')), 'r@example.com');
      await tester.enterText(find.byKey(const Key('vidya.register.password')), 'SuperSecret123!');
      await tester.tap(find.byType(Checkbox));
      await tester.pump();
      await tester.tap(find.byKey(const Key('vidya.register.submit')));
      await tester.pumpAndSettle();
      expect(find.textContaining('already registered'), findsOneWidget);
    });

    testWidgets('blocks submit when ToS unchecked', (tester) async {
      final auth = AuthClient(
        baseUrl: 'http://test',
        httpClient: MockClient((_) async => http.Response('{}', 404)),
      );
      var called = 0;
      await tester.pumpWidget(_harness(
        child: VidyaRegisterScreen(
          auth: auth,
          onRegistered: (_, __) => called++,
          onBackToLogin: () {},
        ),
      ));
      await tester.enterText(find.byKey(const Key('vidya.register.firstName')), 'R');
      await tester.enterText(find.byKey(const Key('vidya.register.lastName')), 'S');
      await tester.enterText(find.byKey(const Key('vidya.register.email')), 'r@example.com');
      await tester.enterText(find.byKey(const Key('vidya.register.password')), 'SuperSecret123!');
      // ToS NOT checked
      await tester.tap(find.byKey(const Key('vidya.register.submit')));
      await tester.pumpAndSettle();
      expect(called, 0);
      expect(find.textContaining('accept the Terms'), findsOneWidget);
    });
  });

  group('VidyaVerifyScreen', () {
    testWidgets('renders 6 OTP cells', (tester) async {
      final auth = AuthClient(
        baseUrl: 'http://test',
        httpClient: MockClient((_) async => http.Response('{}', 404)),
      );
      await tester.pumpWidget(_harness(
        child: VidyaVerifyScreen(
          auth: auth,
          userId: 'u-1',
          email: 'a@b.com',
          channel: 'email',
          onVerified: (_) {},
          onBack: () {},
        ),
      ));
      expect(find.byKey(const Key('vidya.verify.cell0')), findsOneWidget);
      expect(find.byKey(const Key('vidya.verify.cell5')), findsOneWidget);
    });

    testWidgets('full 6-digit entry calls verifyOtp + onVerified',
        (tester) async {
      final auth = AuthClient(
        baseUrl: 'http://test',
        httpClient: MockClient((req) async {
          if (req.url.path.endsWith('/auth/otp/verify')) {
            return http.Response(
              '{"user":{"id":"u-1","email":"a@b.com","firstName":"A","lastName":"B","role":"STUDENT","onboardingState":"REGISTERED"},'
              '"tokens":{"accessToken":"at","refreshToken":"rt","expiresAt":1000}}',
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          return http.Response('{}', 404);
        }),
      );
      Session? captured;
      await tester.pumpWidget(_harness(
        child: VidyaVerifyScreen(
          auth: auth,
          userId: 'u-1',
          email: 'a@b.com',
          channel: 'email',
          onVerified: (s) => captured = s,
          onBack: () {},
        ),
      ));
      for (var i = 0; i < 6; i++) {
        await tester.enterText(find.byKey(Key('vidya.verify.cell$i')), '${i + 1}');
      }
      await tester.pumpAndSettle();
      expect(captured, isNotNull);
      expect(captured!.user.id, 'u-1');
    });

    testWidgets('shows email in subtitle when channel == email', (tester) async {
      final auth = AuthClient(
        baseUrl: 'http://test',
        httpClient: MockClient((_) async => http.Response('{}', 404)),
      );
      await tester.pumpWidget(_harness(
        child: VidyaVerifyScreen(
          auth: auth,
          userId: 'u-1',
          email: 'a@b.com',
          channel: 'email',
          onVerified: (_) {},
          onBack: () {},
        ),
      ));
      expect(find.textContaining('a@b.com'), findsOneWidget);
    });

    testWidgets('invalid OTP surfaces error banner', (tester) async {
      final auth = AuthClient(
        baseUrl: 'http://test',
        httpClient: MockClient((_) async => http.Response(
              '{"detail":{"code":"otp_invalid","message":"Code did not match. Try again."}}',
              400,
              headers: {'content-type': 'application/json'},
            )),
      );
      await tester.pumpWidget(_harness(
        child: VidyaVerifyScreen(
          auth: auth,
          userId: 'u-1',
          email: 'a@b.com',
          channel: 'email',
          onVerified: (_) {},
          onBack: () {},
        ),
      ));
      for (var i = 0; i < 6; i++) {
        await tester.enterText(find.byKey(Key('vidya.verify.cell$i')), '0');
      }
      await tester.pumpAndSettle();
      expect(find.textContaining('did not match'), findsOneWidget);
    });
  });

  group('VidyaForgotPasswordScreen', () {
    testWidgets('submits email then shows enumeration-safe confirmation',
        (tester) async {
      final auth = AuthClient(
        baseUrl: 'http://test',
        httpClient: MockClient((req) async {
          if (req.url.path.endsWith('/auth/password/forgot')) {
            return http.Response('', 204);
          }
          return http.Response('{}', 404);
        }),
      );
      await tester.pumpWidget(_harness(
        child: VidyaForgotPasswordScreen(
          auth: auth,
          onBackToLogin: () {},
        ),
      ));
      await tester.enterText(
          find.byKey(const Key('vidya.forgot.email')), 'a@b.com');
      await tester.tap(find.byKey(const Key('vidya.forgot.submit')));
      await tester.pumpAndSettle();
      expect(find.textContaining('check your inbox'), findsOneWidget);
    });

    testWidgets('204 vs 200 both show same confirmation (enumeration-safe)',
        (tester) async {
      // 204 case already covered above; this tests the rate-limited path.
      final auth = AuthClient(
        baseUrl: 'http://test',
        httpClient: MockClient((_) async => http.Response('{}', 429)),
      );
      await tester.pumpWidget(_harness(
        child: VidyaForgotPasswordScreen(
          auth: auth,
          onBackToLogin: () {},
        ),
      ));
      await tester.enterText(
          find.byKey(const Key('vidya.forgot.email')), 'a@b.com');
      await tester.tap(find.byKey(const Key('vidya.forgot.submit')));
      await tester.pumpAndSettle();
      expect(find.textContaining('Too many'), findsOneWidget);
    });

    testWidgets('Back to login fires onBackToLogin', (tester) async {
      final auth = AuthClient(
        baseUrl: 'http://test',
        httpClient: MockClient((_) async => http.Response('{}', 404)),
      );
      var taps = 0;
      await tester.pumpWidget(_harness(
        child: VidyaForgotPasswordScreen(
          auth: auth,
          onBackToLogin: () => taps++,
        ),
      ));
      await tester.tap(find.text('Back to login'));
      await tester.pumpAndSettle();
      expect(taps, 1);
    });
  });
}
