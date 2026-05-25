// ScreeningClient — thin wrapper over the /screening/* endpoints.
// start/next/answer/reveal are unauthenticated (server policy — see
// services/learning/src/learning/screening/routes.py). persist +
// diagnosticComplete require auth and go through AuthClient so the
// bearer token is added automatically.

import 'dart:convert';

import 'package:http/http.dart' as http;

import '../auth/auth_client.dart';

class ScreeningClient {
  final String baseUrl;
  final http.Client _http;
  final AuthClient _auth;

  ScreeningClient({
    required this.baseUrl,
    required http.Client httpClient,
    required AuthClient auth,
  })  : _http = httpClient,
        _auth = auth;

  Uri _uri(String path) => Uri.parse('$baseUrl$path');

  Future<ScreeningStart> start({
    required String examCode,
    String language = 'en',
  }) async {
    final res = await _http.post(
      _uri('/api/v1/screening/start'),
      headers: const {'content-type': 'application/json'},
      body: jsonEncode({'exam_code': examCode, 'language': language}),
    );
    if (res.statusCode == 503) {
      throw ScreeningUnavailable(_decodeMessage(res));
    }
    if (res.statusCode != 200) {
      throw ScreeningException(res.statusCode, _decodeMessage(res));
    }
    final json = jsonDecode(res.body) as Map<String, dynamic>;
    return ScreeningStart(
      token: json['token'] as String,
      targetCount: json['target_count'] as int,
      examCode: json['exam_code'] as String,
    );
  }

  Future<ScreeningNextResult> next(String token) async {
    final res = await _http.get(_uri('/api/v1/screening/$token/next'));
    if (res.statusCode == 409) {
      final code = _decodeCode(res);
      if (code == 'complete') return ScreeningComplete();
      throw ScreeningException(409, _decodeMessage(res));
    }
    if (res.statusCode == 404) throw ScreeningExpired();
    if (res.statusCode != 200) {
      throw ScreeningException(res.statusCode, _decodeMessage(res));
    }
    final json = jsonDecode(res.body) as Map<String, dynamic>;
    return ScreeningQuestion(
      itemIdx: json['item_idx'] as int,
      total: json['total'] as int,
      stem: json['stem'] as String,
      choices: (json['choices'] as List<dynamic>).cast<String>(),
    );
  }

  Future<void> answer(
    String token, {
    required int itemIdx,
    required int answerIdx,
  }) async {
    final res = await _http.post(
      _uri('/api/v1/screening/$token/answer'),
      headers: const {'content-type': 'application/json'},
      body: jsonEncode({'item_idx': itemIdx, 'answer_idx': answerIdx}),
    );
    if (res.statusCode == 204) return;
    if (res.statusCode == 404) throw ScreeningExpired();
    throw ScreeningException(res.statusCode, _decodeMessage(res));
  }

  Future<ScreeningReveal> reveal(String token) async {
    final res = await _http.get(_uri('/api/v1/screening/$token/reveal'));
    if (res.statusCode == 404) throw ScreeningExpired();
    if (res.statusCode != 200) {
      throw ScreeningException(res.statusCode, _decodeMessage(res));
    }
    final json = jsonDecode(res.body) as Map<String, dynamic>;
    return ScreeningReveal(
      scorePct: (json['score_pct'] as num).toDouble(),
      correct: json['correct'] as int,
      total: json['total'] as int,
      readinessSeed: (json['readiness_seed'] as num).toDouble(),
      topicBreakdown: (json['topic_breakdown'] as List<dynamic>)
          .map((e) => TopicBreakdown(
                topicId: (e as Map<String, dynamic>)['topic_id'] as String,
                correct: e['correct'] as int,
                total: e['total'] as int,
              ))
          .toList(growable: false),
    );
  }

  Future<ScreeningPersist> persist(String token) async {
    final res = await _auth.apiPost('/screening/$token/persist', const <String, dynamic>{});
    if (res.statusCode != 200) {
      throw ScreeningException(res.statusCode, _decodeMessage(res));
    }
    final json = jsonDecode(res.body) as Map<String, dynamic>;
    return ScreeningPersist(
      persisted: json['persisted'] as bool,
      attemptId: json['attempt_id'] as String?,
    );
  }

  Future<void> diagnosticComplete() async {
    final res = await _auth.apiPost(
      '/profile/me/diagnostic-complete',
      const <String, dynamic>{},
    );
    if (res.statusCode != 204 && res.statusCode != 200) {
      throw ScreeningException(res.statusCode, _decodeMessage(res));
    }
  }
}

String _decodeMessage(http.Response res) {
  try {
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    final detail = body['detail'];
    if (detail is Map<String, dynamic>) {
      final msg = detail['message'];
      if (msg is String) return msg;
    }
  } catch (_) {}
  return 'Something went wrong.';
}

String? _decodeCode(http.Response res) {
  try {
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    final detail = body['detail'];
    if (detail is Map<String, dynamic>) {
      final code = detail['code'];
      if (code is String) return code;
    }
  } catch (_) {}
  return null;
}

class ScreeningStart {
  final String token;
  final int targetCount;
  final String examCode;
  const ScreeningStart({
    required this.token,
    required this.targetCount,
    required this.examCode,
  });
}

sealed class ScreeningNextResult {}

class ScreeningQuestion extends ScreeningNextResult {
  final int itemIdx;
  final int total;
  final String stem;
  final List<String> choices;
  ScreeningQuestion({
    required this.itemIdx,
    required this.total,
    required this.stem,
    required this.choices,
  });
}

class ScreeningComplete extends ScreeningNextResult {}

class TopicBreakdown {
  final String topicId;
  final int correct;
  final int total;
  const TopicBreakdown({
    required this.topicId,
    required this.correct,
    required this.total,
  });
}

class ScreeningReveal {
  final double scorePct;
  final int correct;
  final int total;
  final double readinessSeed;
  final List<TopicBreakdown> topicBreakdown;
  const ScreeningReveal({
    required this.scorePct,
    required this.correct,
    required this.total,
    required this.readinessSeed,
    required this.topicBreakdown,
  });
}

class ScreeningPersist {
  final bool persisted;
  final String? attemptId;
  const ScreeningPersist({required this.persisted, this.attemptId});
}

class ScreeningException implements Exception {
  final int statusCode;
  final String message;
  ScreeningException(this.statusCode, this.message);
  @override
  String toString() => 'ScreeningException($statusCode): $message';
}

class ScreeningExpired extends ScreeningException {
  ScreeningExpired() : super(404, 'Screening session expired.');
}

class ScreeningUnavailable extends ScreeningException {
  ScreeningUnavailable(String msg) : super(503, msg);
}
