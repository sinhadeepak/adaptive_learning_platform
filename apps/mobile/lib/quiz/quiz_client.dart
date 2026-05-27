import 'dart:convert';

import '../auth/auth_client.dart';

/// Mirrors the web Quiz API client. Uses AuthClient's typed apiGet/apiPost
/// helpers so the bearer token auto-attaches to every call.
class QuizClient {
  QuizClient({required this.auth});

  final AuthClient auth;

  Future<QuizSessionStart> start({
    required String topicId,
    required String userId,
    String mode = 'PRACTICE',
  }) async {
    final res = await auth.apiPost('/quiz/sessions/start', {
      'topicId': topicId,
      'userId': userId,
      'mode': mode,
    });
    if (res.statusCode == 422) {
      throw const QuizError('No published questions for this topic.', QuizErrorCode.emptyTopic);
    }
    if (res.statusCode != 201) {
      throw QuizError('Could not start quiz (${res.statusCode}).', QuizErrorCode.unknown);
    }
    return QuizSessionStart.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  /// F1 — Mistake replay. Pre-loads a PRACTICE-mode session with the
  /// user's most recent wrong-answered items. `topicId`/`sinceDays`/`limit`
  /// are all optional filters (defaults: all topics, all time, 10 items).
  Future<QuizSessionStart> startMistakeReplay({
    required String userId,
    String? topicId,
    int? sinceDays,
    int limit = 10,
  }) async {
    final body = <String, dynamic>{'userId': userId, 'limit': limit};
    if (topicId != null) body['topicId'] = topicId;
    if (sinceDays != null && sinceDays > 0) body['sinceDays'] = sinceDays;
    final res = await auth.apiPost('/quiz/sessions/start-mistake-replay', body);
    if (res.statusCode == 422) {
      throw const QuizError(
        'No wrong-answered questions yet — answer some practice items first.',
        QuizErrorCode.emptyTopic,
      );
    }
    if (res.statusCode != 201) {
      throw QuizError(
        'Could not start replay (${res.statusCode}).',
        QuizErrorCode.unknown,
      );
    }
    return QuizSessionStart.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  Future<QuizNext> next(String sessionId) async {
    final res = await auth.apiGet('/quiz/sessions/$sessionId/next');
    if (res.statusCode == 409) {
      throw const QuizError('Session is already submitted or expired.', QuizErrorCode.sessionDone);
    }
    if (res.statusCode != 200) {
      throw QuizError('Could not load next question (${res.statusCode}).', QuizErrorCode.unknown);
    }
    return QuizNext.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  Future<QuizAnswer> answer(
    String sessionId, {
    required int itemIdx,
    required int answerIdx,
    // Sprint 7/8 — non-MCQ types submit a structured response payload
    // alongside answerIdx. The Quiz Go server forwards it to
    // /grading/grade for symbolic / range / text matching. Ignored
    // (and may be 0) for MCQ_SINGLE — answerIdx is canonical there.
    Map<String, dynamic>? responsePayload,
  }) async {
    final res = await auth.apiPost('/quiz/sessions/$sessionId/answers', {
      'itemIdx': itemIdx,
      'answerIdx': answerIdx,
      if (responsePayload != null) 'responsePayload': responsePayload,
    });
    if (res.statusCode != 200) {
      throw QuizError('Answer rejected (${res.statusCode}).', QuizErrorCode.unknown);
    }
    return QuizAnswer.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  Future<QuizSession> submit(String sessionId) async {
    final res = await auth.apiPost('/quiz/sessions/$sessionId/submit', const {});
    if (res.statusCode != 200) {
      throw QuizError('Could not submit (${res.statusCode}).', QuizErrorCode.unknown);
    }
    return QuizSession.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  Future<QuizSessionDetail> session(String sessionId) async {
    final res = await auth.apiGet('/quiz/sessions/$sessionId');
    if (res.statusCode == 404) {
      throw const QuizError('Session not found.', QuizErrorCode.notFound);
    }
    if (res.statusCode != 200) {
      throw QuizError('Could not load session (${res.statusCode}).', QuizErrorCode.unknown);
    }
    return QuizSessionDetail.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }
}

enum QuizErrorCode { emptyTopic, sessionDone, notFound, unknown }

class QuizError implements Exception {
  const QuizError(this.message, this.code);
  final String message;
  final QuizErrorCode code;
  @override
  String toString() => 'QuizError($code): $message';
}

class QuizSessionStart {
  QuizSessionStart({required this.sessionId, required this.strategy, required this.mode, required this.expiresAt});
  final String sessionId;
  final String strategy;
  final String mode;
  final DateTime expiresAt;
  factory QuizSessionStart.fromJson(Map<String, dynamic> j) => QuizSessionStart(
        sessionId: j['sessionId'] as String,
        strategy: j['strategy'] as String,
        mode: j['mode'] as String,
        expiresAt: DateTime.parse(j['expiresAt'] as String),
      );
}

class QuizNext {
  QuizNext({required this.sessionId, required this.status, required this.done, this.item});
  final String sessionId;
  final String status;
  final bool done;
  final QuizItem? item;
  factory QuizNext.fromJson(Map<String, dynamic> j) => QuizNext(
        sessionId: j['sessionId'] as String,
        status: j['status'] as String,
        done: j['done'] as bool,
        item: j['item'] is Map ? QuizItem.fromJson(j['item'] as Map<String, dynamic>) : null,
      );
}

class QuizItem {
  QuizItem(
      {required this.itemIdx,
      required this.questionId,
      required this.stem,
      required this.choices,
      this.questionType = 'MCQ_SINGLE',});
  final int itemIdx;
  final String questionId;
  final String stem;
  final List<String> choices;
  // Sprint 7/8 — drives renderer choice on the client.
  // Empty / unknown falls back to MCQ_SINGLE (the existing path).
  final String questionType;
  factory QuizItem.fromJson(Map<String, dynamic> j) => QuizItem(
        itemIdx: (j['itemIdx'] as num).toInt(),
        questionId: j['questionId'] as String,
        stem: j['stem'] as String,
        choices: (j['choices'] as List).cast<String>(),
        questionType: (j['questionType'] ?? 'MCQ_SINGLE') as String,
      );
}

class QuizAnswer {
  QuizAnswer({
    required this.sessionId,
    required this.itemIdx,
    required this.isCorrect,
    required this.correctIdx,
    required this.servedCount,
    required this.correctCount,
  });
  final String sessionId;
  final int itemIdx;
  final bool isCorrect;
  final int correctIdx;
  final int servedCount;
  final int correctCount;
  factory QuizAnswer.fromJson(Map<String, dynamic> j) => QuizAnswer(
        sessionId: j['sessionId'] as String,
        itemIdx: (j['itemIdx'] as num).toInt(),
        isCorrect: j['isCorrect'] as bool,
        correctIdx: (j['correctIdx'] as num).toInt(),
        servedCount: (j['servedCount'] as num).toInt(),
        correctCount: (j['correctCount'] as num).toInt(),
      );
}

class QuizSession {
  QuizSession({
    required this.sessionId,
    required this.status,
    required this.servedCount,
    required this.correctCount,
    required this.score,
  });
  final String sessionId;
  final String status;
  final int servedCount;
  final int correctCount;
  final double score;
  factory QuizSession.fromJson(Map<String, dynamic> j) => QuizSession(
        sessionId: j['sessionId'] as String,
        status: j['status'] as String,
        servedCount: (j['servedCount'] as num).toInt(),
        correctCount: (j['correctCount'] as num).toInt(),
        score: (j['score'] as num).toDouble(),
      );
}

class QuizSessionDetail {
  QuizSessionDetail({
    required this.sessionId,
    required this.userId,
    required this.topicId,
    required this.mode,
    required this.strategy,
    required this.status,
    required this.targetCount,
    required this.servedCount,
    required this.correctCount,
    required this.items,
  });
  final String sessionId;
  final String userId;
  final String topicId;
  final String mode;
  final String strategy;
  final String status;
  final int targetCount;
  final int servedCount;
  final int correctCount;
  final List<QuizItemSummary> items;
  factory QuizSessionDetail.fromJson(Map<String, dynamic> j) => QuizSessionDetail(
        sessionId: j['sessionId'] as String,
        userId: j['userId'] as String,
        topicId: j['topicId'] as String,
        mode: j['mode'] as String,
        strategy: j['strategy'] as String,
        status: j['status'] as String,
        targetCount: (j['targetCount'] as num).toInt(),
        servedCount: (j['servedCount'] as num).toInt(),
        correctCount: (j['correctCount'] as num).toInt(),
        items: (j['items'] as List).map((e) => QuizItemSummary.fromJson(e as Map<String, dynamic>)).toList(),
      );
}

class QuizItemSummary {
  QuizItemSummary({
    required this.itemIdx,
    required this.questionId,
    required this.answered,
    this.isCorrect,
    this.answerIdx,
    this.correctIdx,
    this.stem,
    this.choices,
    this.explanation,
    this.topicId,
  });
  final int itemIdx;
  final String questionId;
  final bool? isCorrect;
  final bool answered;
  final int? answerIdx;
  final int? correctIdx;
  final String? stem;
  final List<String>? choices;
  final String? explanation;
  // Phase 3c.full v2 — per-item topicId used by the result-screen
  // breakdown. The backend doesn't emit this yet on GET
  // /quiz/sessions/{id}.items; nullable so existing payloads keep
  // parsing. When null at the screen layer we fall back to the
  // session-level `topicId` so single-topic PRACTICE sessions still
  // render a meaningful breakdown row.
  final String? topicId;

  factory QuizItemSummary.fromJson(Map<String, dynamic> j) => QuizItemSummary(
        itemIdx: (j['itemIdx'] as num).toInt(),
        questionId: j['questionId'] as String,
        isCorrect: j['isCorrect'] as bool?,
        answered: j['answered'] as bool,
        answerIdx: (j['answerIdx'] as num?)?.toInt(),
        correctIdx: (j['correctIdx'] as num?)?.toInt(),
        stem: j['stem'] as String?,
        choices: (j['choices'] as List?)?.cast<String>(),
        explanation: j['explanation'] as String?,
        topicId: j['topicId'] as String?,
      );
}
