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

    /// Optional extra fields merged into the request body (e.g. `language`
    /// for content-language delivery — Task 8 translation feature).
    Map<String, dynamic> extraFields = const {},
  }) async {
    final res = await auth.apiPost('/quiz/sessions/start', {
      'topicId': topicId,
      'userId': userId,
      'mode': mode,
      ...extraFields,
    });
    if (res.statusCode == 422) {
      throw const QuizError(
          'No published questions for this topic.', QuizErrorCode.emptyTopic);
    }
    if (res.statusCode != 201) {
      throw QuizError(
          'Could not start quiz (${res.statusCode}).', QuizErrorCode.unknown);
    }
    return QuizSessionStart.fromJson(
        jsonDecode(res.body) as Map<String, dynamic>);
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
    return QuizSessionStart.fromJson(
        jsonDecode(res.body) as Map<String, dynamic>);
  }

  /// Phase 3c.full v3 — Mock blueprint launch (Sprint 23 P4-S23).
  /// POSTs to `/quiz/sessions/from-blueprint` and returns the rich
  /// Mock-specific response (sessionId, blueprintName, itemCount,
  /// totalMinutes, marksCorrect, marksNegative, short, sections, …).
  Future<QuizSessionStartFromBlueprint> startFromBlueprint({
    required String blueprintId,
    required String userId,
    int attemptIdx = 0,
  }) async {
    final res = await auth.apiPost('/quiz/sessions/from-blueprint', {
      'blueprintId': blueprintId,
      'userId': userId,
      'attemptIdx': attemptIdx,
    });
    if (res.statusCode == 404) {
      throw const QuizError('No mock blueprint found.', QuizErrorCode.notFound);
    }
    if (res.statusCode == 422) {
      throw const QuizError(
        'No questions available for this mock yet.',
        QuizErrorCode.emptyTopic,
      );
    }
    if (res.statusCode != 201) {
      throw QuizError(
        'Could not start mock (${res.statusCode}).',
        QuizErrorCode.unknown,
      );
    }
    return QuizSessionStartFromBlueprint.fromJson(
      jsonDecode(res.body) as Map<String, dynamic>,
    );
  }

  Future<QuizNext> next(String sessionId) async {
    final res = await auth.apiGet('/quiz/sessions/$sessionId/next');
    if (res.statusCode == 409) {
      throw const QuizError('Session is already submitted or expired.',
          QuizErrorCode.sessionDone);
    }
    if (res.statusCode != 200) {
      throw QuizError('Could not load next question (${res.statusCode}).',
          QuizErrorCode.unknown);
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
      throw QuizError(
          'Answer rejected (${res.statusCode}).', QuizErrorCode.unknown);
    }
    return QuizAnswer.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  Future<QuizSession> submit(String sessionId) async {
    final res =
        await auth.apiPost('/quiz/sessions/$sessionId/submit', const {});
    if (res.statusCode != 200) {
      throw QuizError(
          'Could not submit (${res.statusCode}).', QuizErrorCode.unknown);
    }
    return QuizSession.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  Future<QuizSessionDetail> session(String sessionId) async {
    final res = await auth.apiGet('/quiz/sessions/$sessionId');
    if (res.statusCode == 404) {
      throw const QuizError('Session not found.', QuizErrorCode.notFound);
    }
    if (res.statusCode != 200) {
      throw QuizError(
          'Could not load session (${res.statusCode}).', QuizErrorCode.unknown);
    }
    return QuizSessionDetail.fromJson(
        jsonDecode(res.body) as Map<String, dynamic>);
  }

  /// List the user's recent sessions (newest first). Wraps
  /// `GET /quiz/sessions?userId=&limit=&mode=`. Used by the resume surface
  /// to find IN_PROGRESS practice sessions. Returns [] on any error.
  Future<List<SessionSummary>> listSessions(
    String userId, {
    int limit = 50,
    String? mode,
  }) async {
    final modeQ = mode != null ? '&mode=$mode' : '';
    final res =
        await auth.apiGet('/quiz/sessions?userId=$userId&limit=$limit$modeQ');
    if (res.statusCode != 200) return const [];
    final j = jsonDecode(res.body) as Map<String, dynamic>;
    final items = (j['items'] as List? ?? const [])
        .cast<Map<String, dynamic>>()
        .map(SessionSummary.fromJson)
        .toList();
    return items;
  }

  /// Per-question detail for the post-test deep-dive: time, correctness,
  /// section, difficulty. Wraps `GET /quiz/sessions/{id}/per-question-time`
  /// (quiz Go service `SessionService.PerQuestionTime`).
  Future<List<SessionItemTime>> perQuestionTime(String sessionId) async {
    final res =
        await auth.apiGet('/quiz/sessions/$sessionId/per-question-time');
    if (res.statusCode == 404) {
      throw const QuizError('Session not found.', QuizErrorCode.notFound);
    }
    if (res.statusCode != 200) {
      throw QuizError(
        'Could not load session detail (${res.statusCode}).',
        QuizErrorCode.unknown,
      );
    }
    final j = jsonDecode(res.body) as Map<String, dynamic>;
    final items = (j['items'] as List? ?? const [])
        .cast<Map<String, dynamic>>()
        .map(SessionItemTime.fromJson)
        .toList();
    return items;
  }
}

/// One row from `GET /quiz/sessions` (the session list). Mirrors the quiz
/// service's `sessionListItem`. `targetCount`/`servedCount` drive the
/// resume surface's progress label.
class SessionSummary {
  SessionSummary({
    required this.sessionId,
    required this.topicId,
    required this.mode,
    required this.status,
    required this.targetCount,
    required this.servedCount,
    this.blueprintId,
  });
  final String sessionId;
  final String topicId;
  final String mode; // PRACTICE | MOCK | ...
  final String status; // IN_PROGRESS | COMPLETED | EXPIRED | ...
  final int targetCount;
  final int servedCount;
  final String? blueprintId;

  bool get inProgress => status == 'IN_PROGRESS';
  bool get isPractice => mode == 'PRACTICE';

  factory SessionSummary.fromJson(Map<String, dynamic> j) => SessionSummary(
        sessionId: (j['sessionId'] ?? '') as String,
        topicId: (j['topicId'] ?? '') as String,
        mode: (j['mode'] ?? '') as String,
        status: (j['status'] ?? '') as String,
        targetCount: (j['targetCount'] as num?)?.toInt() ?? 0,
        servedCount: (j['servedCount'] as num?)?.toInt() ?? 0,
        blueprintId: j['blueprintId'] as String?,
      );
}

/// One row from `GET /quiz/sessions/{id}/per-question-time`. Mirrors the
/// quiz service's `perQuestionTimeItem`.
class SessionItemTime {
  SessionItemTime({
    required this.itemIdx,
    required this.questionId,
    this.sectionId,
    this.timeSeconds,
    this.isCorrect,
    this.answerIdx,
    required this.correctIdx,
    required this.difficultyB,
    required this.topicId,
  });
  final int itemIdx;
  final String questionId;
  final String? sectionId;
  final double? timeSeconds;
  final bool? isCorrect;
  final int? answerIdx;
  final int correctIdx;
  final double difficultyB;
  final String topicId;

  bool get answered => answerIdx != null;

  factory SessionItemTime.fromJson(Map<String, dynamic> j) => SessionItemTime(
        itemIdx: (j['itemIdx'] as num).toInt(),
        questionId: (j['questionId'] ?? '') as String,
        sectionId: j['sectionId'] as String?,
        timeSeconds: (j['timeSeconds'] as num?)?.toDouble(),
        isCorrect: j['isCorrect'] as bool?,
        answerIdx: (j['answerIdx'] as num?)?.toInt(),
        correctIdx: (j['correctIdx'] as num?)?.toInt() ?? -1,
        difficultyB: (j['difficultyB'] as num?)?.toDouble() ?? 0.0,
        topicId: (j['topicId'] ?? '') as String,
      );
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
  QuizSessionStart(
      {required this.sessionId,
      required this.strategy,
      required this.mode,
      required this.expiresAt});
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

/// Response from `POST /quiz/sessions/from-blueprint` (Sprint 23 P4-S23).
/// Carries the rich Mock blueprint metadata the session UI needs at start:
/// total marks rules, per-section composition, and the `short` flag the
/// composer raises when the question bank couldn't fill the blueprint.
class QuizSessionStartFromBlueprint {
  QuizSessionStartFromBlueprint({
    required this.sessionId,
    required this.blueprintId,
    required this.blueprintName,
    required this.mode,
    required this.status,
    required this.expiresAt,
    required this.itemCount,
    required this.totalMinutes,
    required this.marksCorrect,
    required this.marksNegative,
    required this.short,
    required this.interSectionNavigation,
    required this.perSectionTimeLocked,
    required this.sections,
  });
  final String sessionId;
  final String blueprintId;
  final String blueprintName;
  final String mode; // always "MOCK_BLUEPRINT"
  final String status; // "IN_PROGRESS"
  final DateTime expiresAt;
  final int itemCount;
  final int totalMinutes;
  final int marksCorrect;
  final double marksNegative;
  final bool short;
  final bool interSectionNavigation;
  final bool perSectionTimeLocked;
  final List<MockBlueprintSection> sections;

  factory QuizSessionStartFromBlueprint.fromJson(Map<String, dynamic> j) =>
      QuizSessionStartFromBlueprint(
        sessionId: j['sessionId'] as String,
        blueprintId: j['blueprintId'] as String,
        blueprintName: (j['blueprintName'] ?? '') as String,
        mode: (j['mode'] ?? 'MOCK_BLUEPRINT') as String,
        status: (j['status'] ?? 'IN_PROGRESS') as String,
        expiresAt: DateTime.parse(j['expiresAt'] as String),
        itemCount: ((j['itemCount'] ?? 0) as num).toInt(),
        totalMinutes: ((j['totalMinutes'] ?? 0) as num).toInt(),
        marksCorrect: ((j['marksCorrect'] ?? 0) as num).toInt(),
        marksNegative: ((j['marksNegative'] ?? 0) as num).toDouble(),
        short: (j['short'] ?? false) as bool,
        interSectionNavigation: (j['interSectionNavigation'] ?? true) as bool,
        perSectionTimeLocked: (j['perSectionTimeLocked'] ?? false) as bool,
        sections: ((j['sections'] ?? const []) as List)
            .cast<Map<String, dynamic>>()
            .map(MockBlueprintSection.fromJson)
            .toList(),
      );
}

/// Per-section composition result emitted by the blueprint composer.
/// `nRequested` is what the blueprint asked for; `nComposed` is what
/// the bank could actually fill (drives the per-section short banner).
class MockBlueprintSection {
  MockBlueprintSection({
    required this.sectionId,
    required this.name,
    required this.nRequested,
    required this.nComposed,
    required this.short,
  });
  final String sectionId;
  final String name;
  final int nRequested;
  final int nComposed;
  final bool short;

  factory MockBlueprintSection.fromJson(Map<String, dynamic> j) =>
      MockBlueprintSection(
        sectionId: (j['sectionId'] ?? '') as String,
        name: (j['name'] ?? '') as String,
        nRequested: ((j['nRequested'] ?? 0) as num).toInt(),
        nComposed: ((j['nComposed'] ?? 0) as num).toInt(),
        short: (j['short'] ?? false) as bool,
      );
}

class QuizNext {
  QuizNext(
      {required this.sessionId,
      required this.status,
      required this.done,
      this.item});
  final String sessionId;
  final String status;
  final bool done;
  final QuizItem? item;
  factory QuizNext.fromJson(Map<String, dynamic> j) => QuizNext(
        sessionId: j['sessionId'] as String,
        status: j['status'] as String,
        done: j['done'] as bool,
        item: j['item'] is Map
            ? QuizItem.fromJson(j['item'] as Map<String, dynamic>)
            : null,
      );
}

class QuizItem {
  QuizItem({
    required this.itemIdx,
    required this.questionId,
    required this.stem,
    required this.choices,
    this.questionType = 'MCQ_SINGLE',
    this.payload = const {},
  });
  final int itemIdx;
  final String questionId;
  final String stem;
  final List<String> choices;
  // Sprint 7/8 — drives renderer choice on the client.
  // Empty / unknown falls back to MCQ_SINGLE (the existing path).
  final String questionType;
  // P5 — present for non-MCQ types. The PolymorphicRenderer drives the
  // whole answer surface (including the stem) off this map. Defaults to
  // `{}` so MCQ_SINGLE / legacy payloads keep parsing. Mirrors web's
  // `QuizItem.payload` (apps/web-student/src/pages/Quiz.tsx).
  final Map<String, dynamic> payload;

  /// MCQ_SINGLE (and untyped legacy items) render the lettered-choice UI
  /// and submit `answerIdx`; every other type renders via
  /// `PolymorphicRenderer` and submits a structured `responsePayload`.
  bool get isMcq => questionType.isEmpty || questionType == 'MCQ_SINGLE';

  factory QuizItem.fromJson(Map<String, dynamic> j) => QuizItem(
        itemIdx: (j['itemIdx'] as num).toInt(),
        questionId: j['questionId'] as String,
        stem: j['stem'] as String,
        // Non-MCQ items can ship an empty / absent choices array — the
        // payload carries their options instead. Tolerate both.
        choices: (j['choices'] as List?)?.cast<String>() ?? const [],
        questionType: (j['questionType'] ?? 'MCQ_SINGLE') as String,
        payload: (j['payload'] as Map?)?.cast<String, dynamic>() ?? const {},
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
  factory QuizSessionDetail.fromJson(Map<String, dynamic> j) =>
      QuizSessionDetail(
        sessionId: j['sessionId'] as String,
        userId: j['userId'] as String,
        topicId: j['topicId'] as String,
        mode: j['mode'] as String,
        strategy: j['strategy'] as String,
        status: j['status'] as String,
        targetCount: (j['targetCount'] as num).toInt(),
        servedCount: (j['servedCount'] as num).toInt(),
        correctCount: (j['correctCount'] as num).toInt(),
        items: (j['items'] as List)
            .map((e) => QuizItemSummary.fromJson(e as Map<String, dynamic>))
            .toList(),
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
