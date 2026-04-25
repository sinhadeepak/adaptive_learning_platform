import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

/// Mirror of @alp/auth-client (TS) for Flutter — JWT login + refresh + secure-storage of tokens.
/// Sprint 1: register / verifyOtp / login / logout, plus refreshing fetch wrapper.
class AuthClient {
  AuthClient({required this.baseUrl, FlutterSecureStorage? storage, http.Client? httpClient})
      : _storage = storage ?? const FlutterSecureStorage(),
        _http = httpClient ?? http.Client();

  final String baseUrl;
  final FlutterSecureStorage _storage;
  final http.Client _http;

  static const _tokenKey = 'alp.auth.tokens';

  Tokens? _cachedTokens;
  User? _user;

  User? get user => _user;
  bool get isAuthenticated => _cachedTokens != null;

  Future<void> _loadTokens() async {
    final raw = await _storage.read(key: _tokenKey);
    if (raw == null) return;
    try {
      _cachedTokens = Tokens.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      // ignore corrupt cache
    }
  }

  Future<void> bootstrap() async {
    await _loadTokens();
  }

  Future<Session> login({required String email, required String password, bool remember = false}) async {
    final body = jsonEncode({'email': email, 'password': password, 'remember': remember});
    final res = await _http.post(
      Uri.parse('$baseUrl/auth/login'),
      headers: {'content-type': 'application/json'},
      body: body,
    );
    if (res.statusCode != 200) throw _decodeAuthError(res);
    final session = Session.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
    await _persist(session);
    return session;
  }

  Future<RegisterResult> register({
    required String firstName,
    required String lastName,
    required String email,
    required String password,
    String? phone,
  }) async {
    final body = jsonEncode({
      'firstName': firstName,
      'lastName': lastName,
      'email': email,
      'password': password,
      if (phone != null && phone.isNotEmpty) 'phone': phone,
    });
    final res = await _http.post(
      Uri.parse('$baseUrl/auth/register'),
      headers: {'content-type': 'application/json'},
      body: body,
    );
    if (res.statusCode != 200) throw _decodeAuthError(res);
    final json = jsonDecode(res.body) as Map<String, dynamic>;
    return RegisterResult(userId: json['userId'] as String, otpChannel: json['otpChannel'] as String);
  }

  Future<Session> verifyOtp({required String userId, required String code, String channel = 'email'}) async {
    final res = await _http.post(
      Uri.parse('$baseUrl/auth/otp/verify'),
      headers: {'content-type': 'application/json'},
      body: jsonEncode({'userId': userId, 'code': code, 'channel': channel}),
    );
    if (res.statusCode != 200) throw _decodeAuthError(res);
    final session = Session.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
    await _persist(session);
    return session;
  }

  /// Initiate password reset. Server is enumeration-safe: 204 regardless of
  /// whether `email` exists. Caller should always show "if your email is on
  /// file you'll get a link" so this contract isn't accidentally leaked.
  Future<void> forgotPassword({required String email}) async {
    final res = await _http.post(
      Uri.parse('$baseUrl/auth/password/forgot'),
      headers: {'content-type': 'application/json'},
      body: jsonEncode({'email': email}),
    );
    // 204 on success; 429 on rate-limit. Anything else is a server problem.
    if (res.statusCode == 204) return;
    if (res.statusCode == 429) {
      throw AuthException(
        code: AuthErrorCode.rateLimited,
        statusCode: 429,
        message: 'Too many attempts — wait a minute and retry.',
      );
    }
    throw _decodeAuthError(res);
  }

  /// Consume a reset token and set a new password. Returns 204; throws on
  /// expired/invalid token (410) or weak password (422).
  Future<void> resetPassword({required String token, required String newPassword}) async {
    final res = await _http.post(
      Uri.parse('$baseUrl/auth/password/reset'),
      headers: {'content-type': 'application/json'},
      body: jsonEncode({'token': token, 'newPassword': newPassword}),
    );
    if (res.statusCode == 204) return;
    if (res.statusCode == 410) {
      throw AuthException(
        code: AuthErrorCode.resetTokenInvalid,
        statusCode: 410,
        message: 'Reset link is invalid or has expired.',
      );
    }
    if (res.statusCode == 422) {
      throw AuthException(
        code: AuthErrorCode.weakPassword,
        statusCode: 422,
        message: 'Password is too weak. Try at least 8 characters with a digit.',
      );
    }
    throw _decodeAuthError(res);
  }

  Future<void> logout() async {
    final t = _cachedTokens;
    if (t != null) {
      try {
        await _http.post(
          Uri.parse('$baseUrl/auth/logout'),
          headers: {'content-type': 'application/json'},
          body: jsonEncode({'refreshToken': t.refreshToken}),
        );
      } catch (_) {
        // best-effort
      }
    }
    await _storage.delete(key: _tokenKey);
    _cachedTokens = null;
    _user = null;
  }

  Future<void> _persist(Session session) async {
    _cachedTokens = session.tokens;
    _user = session.user;
    await _storage.write(key: _tokenKey, value: jsonEncode(session.tokens.toJson()));
  }

  /// Authenticated GET. Adds the Bearer header automatically; returns the raw http.Response
  /// so the caller can decide how to parse / handle errors.
  Future<http.Response> apiGet(String path) {
    return _http.get(_uri(path), headers: _authHeaders());
  }

  /// Authenticated PUT with JSON body.
  Future<http.Response> apiPut(String path, Object body) {
    return _http.put(_uri(path), headers: _authHeaders(json: true), body: jsonEncode(body));
  }

  /// Authenticated PATCH with JSON body.
  Future<http.Response> apiPatch(String path, Object body) {
    return _http.patch(_uri(path), headers: _authHeaders(json: true), body: jsonEncode(body));
  }

  /// Authenticated POST with JSON body. Use empty {} for endpoints that take
  /// no body (e.g. /quiz/sessions/{id}/submit).
  Future<http.Response> apiPost(String path, Object body) {
    return _http.post(_uri(path), headers: _authHeaders(json: true), body: jsonEncode(body));
  }

  Uri _uri(String path) => Uri.parse('$baseUrl$path');

  Map<String, String> _authHeaders({bool json = false}) {
    final h = <String, String>{};
    final t = _cachedTokens;
    if (t != null) h['authorization'] = 'Bearer ${t.accessToken}';
    if (json) h['content-type'] = 'application/json';
    return h;
  }

  /// Update the in-memory user — used when an onboarding step returns a fresh profile
  /// containing the advanced onboardingState.
  void setUser(User u) {
    _user = u;
  }
}

class Session {
  Session({required this.user, required this.tokens});
  final User user;
  final Tokens tokens;
  factory Session.fromJson(Map<String, dynamic> json) => Session(
        user: User.fromJson(json['user'] as Map<String, dynamic>),
        tokens: Tokens.fromJson(json['tokens'] as Map<String, dynamic>),
      );
}

class User {
  User({
    required this.id,
    required this.email,
    required this.firstName,
    required this.lastName,
    required this.role,
    required this.onboardingState,
    this.tenantId,
  });
  final String id;
  final String email;
  final String firstName;
  final String lastName;
  final String role;
  final String onboardingState;
  final String? tenantId;
  factory User.fromJson(Map<String, dynamic> json) => User(
        id: json['id'] as String,
        email: json['email'] as String,
        firstName: json['firstName'] as String,
        lastName: json['lastName'] as String,
        role: json['role'] as String,
        onboardingState: json['onboardingState'] as String,
        tenantId: json['tenantId'] as String?,
      );
}

class Tokens {
  Tokens({required this.accessToken, required this.refreshToken, required this.expiresAt});
  final String accessToken;
  final String refreshToken;
  final int expiresAt;
  factory Tokens.fromJson(Map<String, dynamic> json) => Tokens(
        accessToken: json['accessToken'] as String,
        refreshToken: json['refreshToken'] as String,
        expiresAt: json['expiresAt'] as int,
      );
  Map<String, dynamic> toJson() => {
        'accessToken': accessToken,
        'refreshToken': refreshToken,
        'expiresAt': expiresAt,
      };
}

class RegisterResult {
  RegisterResult({required this.userId, required this.otpChannel});
  final String userId;
  final String otpChannel;
}

enum AuthErrorCode {
  invalidCredentials,
  locked,
  rateLimited,
  notVerified,
  resetTokenInvalid,
  weakPassword,
  unknown,
}

class AuthException implements Exception {
  AuthException({required this.code, required this.statusCode, required this.message});
  final AuthErrorCode code;
  final int statusCode;
  final String message;
  @override
  String toString() => 'AuthException(${code.name}, $statusCode): $message';
}

AuthException _decodeAuthError(http.Response res) {
  String message = 'Something went wrong. Please try again.';
  try {
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    final detail = body['detail'];
    if (detail is Map<String, dynamic>) {
      final msg = detail['message'];
      if (msg is String) message = msg;
    }
  } catch (_) {
    // body wasn't JSON — ignore
  }
  AuthErrorCode code;
  switch (res.statusCode) {
    case 401:
      code = AuthErrorCode.invalidCredentials;
      break;
    case 423:
      code = AuthErrorCode.locked;
      break;
    case 429:
      code = AuthErrorCode.rateLimited;
      break;
    default:
      code = AuthErrorCode.unknown;
  }
  return AuthException(code: code, statusCode: res.statusCode, message: message);
}
