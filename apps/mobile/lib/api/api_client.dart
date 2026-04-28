import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

import '../auth/auth_client.dart';

/// Typed wrapper around AuthClient for the data-plane endpoints the mobile
/// surfaces hit. Mirrors the backend shapes; one method per endpoint so each
/// screen stays slim.
class ApiClient {
  ApiClient(this.auth);
  final AuthClient auth;

  // ────────────────────────────────────────────────────────────────────
  // Analytics
  // ────────────────────────────────────────────────────────────────────

  Future<Readiness> readiness(String userId, {String scope = 'GLOBAL'}) async {
    final r = await auth.apiGet('/analytics/readiness/$userId?scope=$scope');
    final j = jsonDecode(r.body) as Map<String, dynamic>;
    return Readiness(
      score: (j['score'] ?? 0).toDouble(),
      nTopics: (j['nTopics'] ?? 0) as int,
    );
  }

  Future<Streak> streak(String userId) async {
    final r = await auth.apiGet('/analytics/streak/$userId');
    final j = jsonDecode(r.body) as Map<String, dynamic>;
    return Streak(
      current: (j['currentStreak'] ?? 0) as int,
      longest: (j['longestStreak'] ?? 0) as int,
      lastActiveDate: j['lastActiveDate'] as String?,
    );
  }

  Future<List<TopicMastery>> mastery(String userId) async {
    final r = await auth.apiGet('/analytics/mastery/$userId');
    final j = jsonDecode(r.body) as Map<String, dynamic>;
    final topics = (j['topics'] as List).cast<Map<String, dynamic>>();
    return topics
        .map((t) => TopicMastery(
              topicId: t['topicId'] as String,
              ewa: (t['ewa'] as num).toDouble(),
              n: (t['n'] as num).toInt(),
            ))
        .toList();
  }

  Future<List<DailyActivity>> dailyActivity(String userId, {int days = 30}) async {
    final r = await auth.apiGet('/analytics/daily-activity/$userId?days=$days');
    if (r.statusCode != 200) return [];
    final j = jsonDecode(r.body) as Map<String, dynamic>;
    final raw = (j['activity'] as List? ?? []).cast<Map<String, dynamic>>();
    return raw
        .map((m) => DailyActivity(
              date: DateTime.parse(m['date'] as String),
              sessions: ((m['sessions'] ?? 0) as num).toInt(),
              questions: ((m['questions'] ?? 0) as num).toInt(),
              minutes: ((m['minutes'] ?? 0) as num).toInt(),
            ))
        .toList();
  }

  // ────────────────────────────────────────────────────────────────────
  // Profile (user-profile service)
  // ────────────────────────────────────────────────────────────────────

  Future<UserProfile?> getProfile() async {
    final r = await auth.apiGet('/profile/me');
    if (r.statusCode != 200) return null;
    return UserProfile.fromJson(jsonDecode(r.body) as Map<String, dynamic>);
  }

  Future<UserProfile?> updateProfile({String? firstName, String? lastName}) async {
    final body = <String, dynamic>{};
    if (firstName != null) body['firstName'] = firstName;
    if (lastName != null) body['lastName'] = lastName;
    final r = await auth.apiPatch('/profile/me', body);
    if (r.statusCode != 200) return null;
    return UserProfile.fromJson(jsonDecode(r.body) as Map<String, dynamic>);
  }

  /// Upload (or replace) the avatar as a base64 data URL. The backend caps
  /// the body at ~400KB; clients should downscale via image_picker's
  /// `imageQuality` + `maxWidth` before calling.
  Future<UserProfile?> setAvatar(String dataUrl) async {
    final r = await auth.apiPut('/profile/me/avatar', {'avatarUrl': dataUrl});
    if (r.statusCode != 200) return null;
    return UserProfile.fromJson(jsonDecode(r.body) as Map<String, dynamic>);
  }

  Future<bool> removeAvatar() async {
    final url = '${auth.baseUrl}/profile/me/avatar';
    final res = await http.delete(
      Uri.parse(url),
      headers: {'authorization': 'Bearer ${auth.tokens?.accessToken ?? ''}'},
    );
    return res.statusCode == 204 || res.statusCode == 200;
  }

  /// Merge-update the user's per-type notification mute map. Pass
  /// {type: false} to mute, {type: true} to re-enable. Missing keys keep
  /// their existing value.
  Future<UserProfile?> updateNotificationPrefs(Map<String, bool> prefs) async {
    final r = await auth.apiPatch('/profile/notification-prefs', {'prefs': prefs});
    if (r.statusCode != 200) return null;
    return UserProfile.fromJson(jsonDecode(r.body) as Map<String, dynamic>);
  }

  Future<UserProfile?> updatePreferences({String? language, int? dailyGoalMinutes}) async {
    final body = <String, dynamic>{};
    if (language != null) body['language'] = language;
    if (dailyGoalMinutes != null) body['dailyGoalMinutes'] = dailyGoalMinutes;
    final r = await auth.apiPatch('/profile/preferences', body);
    if (r.statusCode != 200) return null;
    return UserProfile.fromJson(jsonDecode(r.body) as Map<String, dynamic>);
  }

  // ────────────────────────────────────────────────────────────────────
  // Bookmarks (saved questions)
  // ────────────────────────────────────────────────────────────────────

  Future<List<Bookmark>> listBookmarks() async {
    final r = await auth.apiGet('/profile/bookmarks');
    if (r.statusCode != 200) return [];
    final j = jsonDecode(r.body) as Map<String, dynamic>;
    final items = (j['items'] as List? ?? []).cast<Map<String, dynamic>>();
    return items.map(Bookmark.fromJson).toList();
  }

  Future<Bookmark?> addBookmark({
    required String questionId,
    String? topicId,
    String? topicTitle,
    String? stem,
    String? note,
  }) async {
    final r = await auth.apiPost('/profile/bookmarks', {
      'questionId': questionId,
      if (topicId != null) 'topicId': topicId,
      if (topicTitle != null) 'topicTitle': topicTitle,
      if (stem != null) 'stem': stem,
      if (note != null) 'note': note,
    });
    if (r.statusCode >= 300) return null;
    return Bookmark.fromJson(jsonDecode(r.body) as Map<String, dynamic>);
  }

  Future<bool> removeBookmark(String questionId) async {
    final url = '${auth.baseUrl}/profile/bookmarks/$questionId';
    final res = await http.delete(
      Uri.parse(url),
      headers: {'authorization': 'Bearer ${auth.tokens?.accessToken ?? ''}'},
    );
    return res.statusCode == 204 || res.statusCode == 200;
  }

  /// Flag a question as ambiguous/wrong/typo. Backend de-dups on
  /// (user, question, kind) so accidentally tapping twice is a no-op.
  Future<bool> reportQuestion({
    required String questionId,
    required String kind,
    String? note,
  }) async {
    final r = await auth.apiPost('/profile/feedback', {
      'questionId': questionId,
      'kind': kind,
      if (note != null && note.isNotEmpty) 'note': note,
    });
    return r.statusCode >= 200 && r.statusCode < 300;
  }

  // ────────────────────────────────────────────────────────────────────
  // Notification inbox
  // ────────────────────────────────────────────────────────────────────

  Future<InboxPage> inbox(String userId) async {
    final r = await auth.apiGet('/notifications/inbox/$userId');
    if (r.statusCode != 200) return InboxPage.empty();
    final j = jsonDecode(r.body) as Map<String, dynamic>;
    final raw = (j['items'] as List? ?? []).cast<Map<String, dynamic>>();
    return InboxPage(
      unreadCount: ((j['unreadCount'] ?? 0) as num).toInt(),
      items: raw.map(InboxItem.fromJson).toList(),
    );
  }

  Future<int> inboxUnreadCount(String userId) async {
    try {
      final r = await auth.apiGet('/notifications/inbox/$userId/unread-count');
      if (r.statusCode != 200) return 0;
      final j = jsonDecode(r.body) as Map<String, dynamic>;
      return ((j['unreadCount'] ?? 0) as num).toInt();
    } catch (_) {
      return 0;
    }
  }

  Future<bool> markNotificationRead(String userId, String notificationId) async {
    final url = '${auth.baseUrl}/notifications/$notificationId/read?user_id=$userId';
    final res = await http.post(
      Uri.parse(url),
      headers: {'authorization': 'Bearer ${auth.tokens?.accessToken ?? ''}'},
    );
    return res.statusCode == 200;
  }

  Future<int> markAllNotificationsRead(String userId) async {
    final r = await auth.apiPost('/notifications/inbox/$userId/mark-all-read', const {});
    if (r.statusCode != 200) return 0;
    final j = jsonDecode(r.body) as Map<String, dynamic>;
    return ((j['flipped'] ?? 0) as num).toInt();
  }

  // ────────────────────────────────────────────────────────────────────
  // Quiz session history
  // ────────────────────────────────────────────────────────────────────

  Future<List<SessionHistoryRow>> sessionHistory(String userId, {int limit = 50}) async {
    final r = await auth.apiGet('/quiz/sessions?userId=$userId&limit=$limit');
    if (r.statusCode != 200) return [];
    final j = jsonDecode(r.body) as Map<String, dynamic>;
    final items = (j['items'] as List? ?? []).cast<Map<String, dynamic>>();
    return items.map(SessionHistoryRow.fromJson).toList();
  }

  Future<List<MockAttemptRow>> mockAttempts() async {
    final r = await auth.apiGet('/profile/mock-attempts');
    if (r.statusCode != 200) return [];
    final j = jsonDecode(r.body) as Map<String, dynamic>;
    final items = (j['items'] as List? ?? []).cast<Map<String, dynamic>>();
    return items.map(MockAttemptRow.fromJson).toList();
  }

  Future<List<Achievement>> achievements() async {
    final r = await auth.apiGet('/profile/achievements');
    if (r.statusCode != 200) return [];
    final j = jsonDecode(r.body) as Map<String, dynamic>;
    final items = (j['items'] as List? ?? []).cast<Map<String, dynamic>>();
    return items.map(Achievement.fromJson).toList();
  }

  // ────────────────────────────────────────────────────────────────────
  // Catalog
  // ────────────────────────────────────────────────────────────────────

  Future<List<Exam>> exams() async {
    final r = await auth.apiGet('/catalog/exams');
    final list = jsonDecode(r.body) as List;
    return list
        .cast<Map<String, dynamic>>()
        .map((e) => Exam(
              id: e['id'] as String,
              code: e['code'] as String,
              name: e['name'] as String,
              subtitle: e['subtitle'] as String?,
            ))
        .toList();
  }

  Future<List<Subject>> subjectsForExam(String examId) async {
    final r = await auth.apiGet('/catalog/exams/$examId/subjects');
    return (jsonDecode(r.body) as List)
        .cast<Map<String, dynamic>>()
        .map((s) => Subject(
              id: s['id'] as String,
              examId: s['examId'] as String,
              name: s['name'] as String,
              topicCount: (s['topicCount'] as num).toInt(),
            ))
        .toList();
  }

  Future<List<Topic>> topicsForSubject(String subjectId) async {
    final r = await auth.apiGet('/catalog/subjects/$subjectId/topics');
    return (jsonDecode(r.body) as List)
        .cast<Map<String, dynamic>>()
        .map((t) => Topic(
              id: t['id'] as String,
              subjectId: t['subjectId'] as String,
              title: t['title'] as String,
              questionCount: (t['questionCount'] as num).toInt(),
              tier: (t['tier'] ?? 'FREE') as String,
            ))
        .toList();
  }

  Future<Topic?> topic(String topicId) async {
    final r = await auth.apiGet('/catalog/topics/$topicId');
    if (r.statusCode != 200) return null;
    final j = jsonDecode(r.body) as Map<String, dynamic>;
    return Topic(
      id: j['id'] as String,
      subjectId: j['subjectId'] as String,
      title: j['title'] as String,
      questionCount: (j['questionCount'] ?? 0) as int,
      tier: (j['tier'] ?? 'FREE') as String,
    );
  }

  // ────────────────────────────────────────────────────────────────────
  // Adaptive (AI surfaces)
  // ────────────────────────────────────────────────────────────────────

  Future<bool> aiEnabled() async {
    try {
      final r = await auth.apiGet('/adaptive/ai-status');
      final j = jsonDecode(r.body) as Map<String, dynamic>;
      return (j['enabled'] ?? false) as bool;
    } catch (_) {
      return false;
    }
  }

  Future<RankProjection> rankProjection(String userId, String examCode) async {
    final r = await auth.apiGet('/adaptive/rank-projection/$userId?exam=$examCode');
    final j = jsonDecode(r.body) as Map<String, dynamic>;
    final commentary = (j['commentary'] ?? const {}) as Map<String, dynamic>;
    return RankProjection(
      examCode: (j['examCode'] ?? examCode) as String,
      examName: (j['examName'] ?? '') as String,
      readiness: ((j['readiness'] ?? 0) as num).toDouble(),
      nAttempts: ((j['nAttempts'] ?? 0) as num).toInt(),
      projectedRank: ((j['projectedRank'] ?? 0) as num).toInt(),
      rankLow: ((j['rankLow'] ?? 0) as num).toInt(),
      rankHigh: ((j['rankHigh'] ?? 0) as num).toInt(),
      projectedPercentile: ((j['projectedPercentile'] ?? 0) as num).toDouble(),
      totalCandidates: ((j['totalCandidates'] ?? 0) as num).toInt(),
      confidence: (j['confidence'] ?? 'low') as String,
      headline: commentary['headline'] as String? ?? '',
      nextAction: commentary['next_action'] as String? ?? '',
      source: (j['source'] ?? 'heuristic') as String,
      error: j['error'] as String?,
    );
  }

  Future<GuidedNextSteps> guidedNextSteps(String userId, {String? examCode}) async {
    final qs = examCode == null ? '' : '?exam=$examCode';
    final r = await auth.apiGet('/adaptive/guided-next-steps/$userId$qs');
    final j = jsonDecode(r.body) as Map<String, dynamic>;
    final steps = (j['steps'] as List? ?? []).cast<Map<String, dynamic>>();
    return GuidedNextSteps(
      headline: (j['headline'] ?? '') as String,
      source: (j['source'] ?? 'heuristic') as String,
      steps: steps
          .map((s) => GuidedStep(
                action: (s['action'] ?? 'PRACTICE') as String,
                topicId: (s['topicId'] ?? '') as String,
                topicTitle: (s['topicTitle'] ?? '') as String,
                why: (s['why'] ?? '') as String,
                estMinutes: (s['estMinutes'] ?? 15) as int,
              ))
          .toList(),
    );
  }

  Future<WeaknessDiagnosis> weaknessDiagnosis(String userId) async {
    final r = await auth.apiGet('/adaptive/weakness-diagnosis/$userId');
    final j = jsonDecode(r.body) as Map<String, dynamic>;
    final patterns = (j['patterns'] as List? ?? []).cast<Map<String, dynamic>>();
    return WeaknessDiagnosis(
      overallAssessment: (j['overall_assessment'] ?? '') as String,
      patterns: patterns
          .map((p) => WeaknessPattern(
                name: (p['name'] ?? '') as String,
                description: (p['description'] ?? '') as String,
                subjectsAffected: ((p['subjects_affected'] ?? []) as List).cast<String>(),
                severity: (p['severity'] ?? 'medium') as String,
                evidenceCount: ((p['evidence_count'] ?? 0) as num).toInt(),
                prescription: (p['prescription'] ?? '') as String,
              ))
          .toList(),
      weakestTopics: ((j['weakest_topics'] ?? []) as List).cast<String>(),
      nAttemptsAnalyzed: ((j['n_attempts_analyzed'] ?? 0) as num).toInt(),
      nWrong: ((j['n_wrong'] ?? 0) as num).toInt(),
      source: (j['source'] ?? 'heuristic') as String,
      message: j['message'] as String?,
    );
  }

  Future<StudyPlan> studyPlan(String userId, {String? examCode}) async {
    final qs = examCode == null ? '' : '?exam=$examCode';
    final r = await auth.apiGet('/adaptive/study-plan/$userId$qs');
    final j = jsonDecode(r.body) as Map<String, dynamic>;
    final priorities = (j['topicPriorities'] as List? ?? []).cast<Map<String, dynamic>>();
    final schedule = (j['weeklySchedule'] as List? ?? []).cast<Map<String, dynamic>>();
    return StudyPlan(
      headline: (j['headline'] ?? '') as String,
      diagnosis: (j['diagnosis'] ?? '') as String,
      encouragement: (j['encouragement'] ?? '') as String,
      source: (j['source'] ?? 'heuristic') as String,
      priorities: priorities
          .map((p) => StudyPriority(
                topicId: (p['topicId'] ?? '') as String,
                title: (p['title'] ?? '') as String,
                rank: ((p['rank'] ?? 0) as num).toInt(),
                rationale: (p['rationale'] ?? '') as String,
                targetMastery: ((p['targetMastery'] ?? 0) as num).toDouble(),
              ))
          .toList(),
      schedule: schedule
          .map((d) => StudyDay(
                day: (d['day'] ?? '') as String,
                focus: (d['focus'] ?? '') as String,
                actions: ((d['actions'] ?? []) as List).cast<String>(),
              ))
          .toList(),
    );
  }

  Future<DoubtPhotoResult> solvePhotoDoubt(Uint8List bytes, String mime) async {
    final dataUrl = 'data:$mime;base64,${base64Encode(bytes)}';
    final r = await auth.apiPost('/adaptive/doubt/photo', {'imageDataUrl': dataUrl});
    final j = jsonDecode(r.body) as Map<String, dynamic>;
    final similar = (j['similar_problems'] as List? ?? []).cast<Map<String, dynamic>>();
    return DoubtPhotoResult(
      extracted: (j['extracted_question'] ?? '') as String,
      subject: (j['subject'] ?? '') as String,
      suggestedTopic: (j['suggested_topic'] ?? '') as String,
      matchedTopicId: j['matched_topic_id'] as String?,
      solutionSteps: ((j['solution_steps'] ?? []) as List).cast<String>(),
      finalAnswer: (j['final_answer'] ?? '') as String,
      confidence: (j['confidence'] ?? 'low') as String,
      similar: similar
          .map((s) => SimilarProblem(
                id: (s['id'] ?? '') as String,
                stem: (s['stem'] ?? '') as String,
                topicId: (s['topicId'] ?? '') as String,
              ))
          .toList(),
      source: (j['source'] ?? 'stub') as String,
    );
  }

  // ────────────────────────────────────────────────────────────────────
  // Doubts
  // ────────────────────────────────────────────────────────────────────

  Future<List<DoubtSummary>> listMyDoubts() async {
    final r = await auth.apiGet('/doubts');
    if (r.statusCode != 200) return [];
    final j = jsonDecode(r.body) as Map<String, dynamic>;
    final items = (j['items'] as List? ?? []).cast<Map<String, dynamic>>();
    return items.map(DoubtSummary.fromJson).toList();
  }

  Future<DoubtDetail?> getDoubt(String doubtId) async {
    final r = await auth.apiGet('/doubts/$doubtId');
    if (r.statusCode != 200) return null;
    final j = jsonDecode(r.body) as Map<String, dynamic>;
    return DoubtDetail.fromJson(j);
  }

  Future<DoubtDetail?> createDoubt({
    required String questionText,
    String? photoDataUrl,
    String? topicId,
    String? topicTitle,
    String? initialAiAnswer,
  }) async {
    final r = await auth.apiPost('/doubts', {
      'questionText': questionText,
      if (photoDataUrl != null) 'photoDataUrl': photoDataUrl,
      if (topicId != null) 'topicId': topicId,
      if (topicTitle != null) 'topicTitle': topicTitle,
      if (initialAiAnswer != null) 'initialAiAnswer': initialAiAnswer,
    });
    if (r.statusCode >= 300) return null;
    return DoubtDetail.fromJson(jsonDecode(r.body) as Map<String, dynamic>);
  }

  Future<DoubtAnswer?> postAnswer(String doubtId, String content, {String source = 'peer'}) async {
    final r = await auth.apiPost('/doubts/$doubtId/answers', {
      'content': content,
      'source': source,
    });
    if (r.statusCode >= 300) return null;
    return DoubtAnswer.fromJson(jsonDecode(r.body) as Map<String, dynamic>);
  }

  // ────────────────────────────────────────────────────────────────────
  // Mock tests
  // ────────────────────────────────────────────────────────────────────

  Future<MockPlan> mockPlan({required String userId, required String examCode}) async {
    final r = await auth.apiPost('/adaptive/mock/plan', {
      'userId': userId,
      'examCode': examCode,
    });
    final j = jsonDecode(r.body) as Map<String, dynamic>;
    if (j['error'] != null) {
      return MockPlan.error(
        j['error'] as String,
        (j['message'] ?? '') as String,
      );
    }
    final questions = (j['questions'] as List).cast<Map<String, dynamic>>();
    final sections = (j['sections'] as List).cast<Map<String, dynamic>>();
    return MockPlan(
      mockId: j['mockId'] as String,
      examCode: j['examCode'] as String,
      examName: j['examName'] as String,
      durationMinutes: (j['durationMinutes'] as num).toInt(),
      totalQuestions: (j['totalQuestions'] as num).toInt(),
      maxMarks: (j['maxMarks'] as num).toInt(),
      marksCorrect: (j['marksCorrect'] as num).toInt(),
      marksWrong: (j['marksWrong'] as num).toInt(),
      sections: sections
          .map((s) => MockSection(
                name: s['name'] as String,
                questionCount: (s['questionCount'] as num).toInt(),
                fromIdx: (s['fromIdx'] as num).toInt(),
                toIdx: (s['toIdx'] as num).toInt(),
              ))
          .toList(),
      questions: questions
          .map((q) => MockQuestion(
                id: q['id'] as String,
                topicId: q['topicId'] as String,
                stem: q['stem'] as String,
                choices: (q['choices'] as List).cast<String>(),
                difficultyB: ((q['difficultyB'] ?? 0) as num).toDouble(),
              ))
          .toList(),
    );
  }

  Future<MockResult> mockScore({
    required String mockId,
    required Map<String, int> answers,
  }) async {
    final r = await auth.apiPost('/adaptive/mock/score', {
      'mockId': mockId,
      'answers': answers,
    });
    final j = jsonDecode(r.body) as Map<String, dynamic>;
    if (j['error'] != null) {
      return MockResult.error(j['error'] as String, (j['message'] ?? '') as String);
    }
    return MockResult(
      examCode: j['examCode'] as String,
      examName: j['examName'] as String,
      rawScore: (j['rawScore'] as num).toInt(),
      maxMarks: (j['maxMarks'] as num).toInt(),
      accuracy: (j['accuracy'] as num).toDouble(),
      totalQuestions: (j['totalQuestions'] as num).toInt(),
      nCorrect: (j['nCorrect'] as num).toInt(),
      nWrong: (j['nWrong'] as num).toInt(),
      nUnanswered: (j['nUnanswered'] as num).toInt(),
      percentile: (j['percentile'] as num).toDouble(),
      projectedRank: (j['projectedRank'] as num).toInt(),
      rankLow: (j['rankLow'] as num).toInt(),
      rankHigh: (j['rankHigh'] as num).toInt(),
      confidence: j['confidence'] as String,
      sections: ((j['sections'] ?? []) as List)
          .cast<Map<String, dynamic>>()
          .map((s) => MockSectionResult(
                name: s['name'] as String,
                correct: (s['correct'] as num).toInt(),
                wrong: (s['wrong'] as num).toInt(),
                unanswered: (s['unanswered'] as num).toInt(),
                total: (s['total'] as num).toInt(),
              ))
          .toList(),
    );
  }

  /// Streaming tutor chat. Yields content deltas as they arrive.
  Stream<String> tutorChat({
    required String topicId,
    required List<TutorTurn> messages,
    String? userId,
  }) async* {
    final body = jsonEncode({
      'topicId': topicId,
      'messages': messages.map((m) => {'role': m.role, 'content': m.content}).toList(),
      if (userId != null) 'userId': userId,
    });
    final req = http.Request('POST', Uri.parse('${auth.baseUrl}/adaptive/tutor/chat'))
      ..headers.addAll({
        'content-type': 'application/json',
        'authorization': 'Bearer ${auth.tokens?.accessToken ?? ''}',
      })
      ..body = body;
    final res = await req.send();
    if (res.statusCode != 200) {
      yield 'Tutor service error (${res.statusCode}).';
      return;
    }
    final stream = res.stream.transform(utf8.decoder);
    var buffer = '';
    await for (final chunk in stream) {
      buffer += chunk;
      while (true) {
        final boundary = buffer.indexOf('\n\n');
        if (boundary < 0) break;
        final frame = buffer.substring(0, boundary);
        buffer = buffer.substring(boundary + 2);
        for (final line in frame.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          final payload = line.substring(6).trim();
          if (payload == '[DONE]') return;
          try {
            final m = jsonDecode(payload) as Map<String, dynamic>;
            final delta = m['delta'] as String?;
            if (delta != null && delta.isNotEmpty) yield delta;
          } catch (_) {/* skip malformed */}
        }
      }
    }
  }
}

// ──────────────────────────────────────────────────────────────────────
// DTOs
// ──────────────────────────────────────────────────────────────────────

class Readiness {
  Readiness({required this.score, required this.nTopics});
  final double score;
  final int nTopics;
}

class Streak {
  Streak({required this.current, required this.longest, this.lastActiveDate});
  final int current;
  final int longest;
  final String? lastActiveDate;
}

class UserProfile {
  UserProfile({
    required this.firstName,
    required this.lastName,
    required this.email,
    required this.language,
    this.dailyGoalMinutes,
    this.avatarUrl,
    this.notificationPrefs = const {},
  });
  final String firstName;
  final String lastName;
  final String email;
  final String language;
  final int? dailyGoalMinutes;
  final String? avatarUrl;
  final Map<String, bool> notificationPrefs;

  factory UserProfile.fromJson(Map<String, dynamic> j) {
    final user = (j['user'] ?? {}) as Map<String, dynamic>;
    final prefs = (j['preferences'] ?? {}) as Map<String, dynamic>;
    final notif = (j['notificationPrefs'] as Map<String, dynamic>?) ?? const {};
    return UserProfile(
      firstName: (user['firstName'] ?? '') as String,
      lastName: (user['lastName'] ?? '') as String,
      email: (user['email'] ?? '') as String,
      language: (prefs['language'] ?? 'en') as String,
      dailyGoalMinutes: (prefs['dailyGoalMinutes'] as num?)?.toInt(),
      avatarUrl: j['avatarUrl'] as String?,
      notificationPrefs: notif.map((k, v) => MapEntry(k, v == true)),
    );
  }
}

class DailyActivity {
  DailyActivity({required this.date, required this.sessions, required this.questions, required this.minutes});
  final DateTime date;
  final int sessions;
  final int questions;
  final int minutes;
}

class TopicMastery {
  TopicMastery({required this.topicId, required this.ewa, required this.n});
  final String topicId;
  final double ewa;
  final int n;
}

class Exam {
  Exam({required this.id, required this.code, required this.name, this.subtitle});
  final String id;
  final String code;
  final String name;
  final String? subtitle;
}

class Subject {
  Subject({required this.id, required this.examId, required this.name, required this.topicCount});
  final String id;
  final String examId;
  final String name;
  final int topicCount;
}

class Topic {
  Topic({required this.id, required this.subjectId, required this.title, required this.questionCount, required this.tier});
  final String id;
  final String subjectId;
  final String title;
  final int questionCount;
  final String tier;
}

class RankProjection {
  RankProjection({
    required this.examCode,
    required this.examName,
    required this.readiness,
    required this.nAttempts,
    required this.projectedRank,
    required this.rankLow,
    required this.rankHigh,
    required this.projectedPercentile,
    required this.totalCandidates,
    required this.confidence,
    required this.headline,
    required this.nextAction,
    required this.source,
    this.error,
  });
  final String examCode;
  final String examName;
  final double readiness;
  final int nAttempts;
  final int projectedRank;
  final int rankLow;
  final int rankHigh;
  final double projectedPercentile;
  final int totalCandidates;
  final String confidence;
  final String headline;
  final String nextAction;
  final String source;
  final String? error;
}

class GuidedStep {
  GuidedStep({required this.action, required this.topicId, required this.topicTitle, required this.why, required this.estMinutes});
  final String action;
  final String topicId;
  final String topicTitle;
  final String why;
  final int estMinutes;
}

class GuidedNextSteps {
  GuidedNextSteps({required this.headline, required this.source, required this.steps});
  final String headline;
  final String source;
  final List<GuidedStep> steps;
}

class SimilarProblem {
  SimilarProblem({required this.id, required this.stem, required this.topicId});
  final String id;
  final String stem;
  final String topicId;
}

class DoubtPhotoResult {
  DoubtPhotoResult({
    required this.extracted,
    required this.subject,
    required this.suggestedTopic,
    required this.solutionSteps,
    required this.finalAnswer,
    required this.confidence,
    required this.similar,
    required this.source,
    this.matchedTopicId,
  });
  final String extracted;
  final String subject;
  final String suggestedTopic;
  final String? matchedTopicId;
  final List<String> solutionSteps;
  final String finalAnswer;
  final String confidence;
  final List<SimilarProblem> similar;
  final String source;
}

class WeaknessPattern {
  WeaknessPattern({
    required this.name,
    required this.description,
    required this.subjectsAffected,
    required this.severity,
    required this.evidenceCount,
    required this.prescription,
  });
  final String name;
  final String description;
  final List<String> subjectsAffected;
  final String severity;
  final int evidenceCount;
  final String prescription;
}

class WeaknessDiagnosis {
  WeaknessDiagnosis({
    required this.overallAssessment,
    required this.patterns,
    required this.weakestTopics,
    required this.nAttemptsAnalyzed,
    required this.nWrong,
    required this.source,
    this.message,
  });
  final String overallAssessment;
  final List<WeaknessPattern> patterns;
  final List<String> weakestTopics;
  final int nAttemptsAnalyzed;
  final int nWrong;
  final String source;
  final String? message;
}

class StudyPriority {
  StudyPriority({required this.topicId, required this.title, required this.rank, required this.rationale, required this.targetMastery});
  final String topicId;
  final String title;
  final int rank;
  final String rationale;
  final double targetMastery;
}

class StudyDay {
  StudyDay({required this.day, required this.focus, required this.actions});
  final String day;
  final String focus;
  final List<String> actions;
}

class StudyPlan {
  StudyPlan({
    required this.headline,
    required this.diagnosis,
    required this.encouragement,
    required this.source,
    required this.priorities,
    required this.schedule,
  });
  final String headline;
  final String diagnosis;
  final String encouragement;
  final String source;
  final List<StudyPriority> priorities;
  final List<StudyDay> schedule;
}

// ────────────────────────────────────────────────────────────────────
// Doubts DTOs
// ────────────────────────────────────────────────────────────────────

class DoubtSummary {
  DoubtSummary({
    required this.id,
    required this.userId,
    required this.questionText,
    required this.status,
    required this.createdAt,
    required this.lastActivityAt,
    required this.answerCount,
    this.topicId,
    this.topicTitle,
  });
  final String id;
  final String userId;
  final String questionText;
  final String status;
  final String createdAt;
  final String lastActivityAt;
  final int answerCount;
  final String? topicId;
  final String? topicTitle;

  factory DoubtSummary.fromJson(Map<String, dynamic> j) => DoubtSummary(
        id: j['id'] as String,
        userId: j['userId'] as String,
        questionText: j['questionText'] as String,
        status: j['status'] as String,
        createdAt: j['createdAt'] as String,
        lastActivityAt: j['lastActivityAt'] as String,
        answerCount: ((j['answerCount'] ?? 0) as num).toInt(),
        topicId: j['topicId'] as String?,
        topicTitle: j['topicTitle'] as String?,
      );
}

class DoubtAnswer {
  DoubtAnswer({
    required this.id,
    required this.doubtId,
    required this.content,
    required this.source,
    required this.authorRole,
    required this.createdAt,
    required this.accepted,
    this.authorId,
  });
  final String id;
  final String doubtId;
  final String content;
  final String source;
  final String authorRole;
  final String createdAt;
  final bool accepted;
  final String? authorId;

  factory DoubtAnswer.fromJson(Map<String, dynamic> j) => DoubtAnswer(
        id: j['id'] as String,
        doubtId: j['doubtId'] as String,
        content: j['content'] as String,
        source: j['source'] as String,
        authorRole: j['authorRole'] as String,
        createdAt: j['createdAt'] as String,
        accepted: (j['accepted'] ?? false) as bool,
        authorId: j['authorId'] as String?,
      );
}

class DoubtDetail {
  DoubtDetail({required this.summary, required this.answers});
  final DoubtSummary summary;
  final List<DoubtAnswer> answers;

  factory DoubtDetail.fromJson(Map<String, dynamic> j) => DoubtDetail(
        summary: DoubtSummary.fromJson(j),
        answers: ((j['answers'] ?? []) as List)
            .cast<Map<String, dynamic>>()
            .map(DoubtAnswer.fromJson)
            .toList(),
      );
}

class TutorTurn {
  TutorTurn({required this.role, required this.content});
  final String role;
  final String content;
}

class InboxItem {
  InboxItem({
    required this.id,
    required this.type,
    required this.channel,
    required this.payload,
    required this.createdAt,
    this.readAt,
  });
  final String id;
  final String type;
  final String channel;
  final Map<String, dynamic> payload;
  final String createdAt;
  final String? readAt;

  bool get unread => readAt == null;

  factory InboxItem.fromJson(Map<String, dynamic> j) => InboxItem(
        id: j['id'] as String,
        type: (j['type'] ?? '') as String,
        channel: (j['channel'] ?? '') as String,
        payload: (j['payload'] as Map<String, dynamic>?) ?? const {},
        createdAt: (j['createdAt'] ?? '') as String,
        readAt: j['readAt'] as String?,
      );
}

class InboxPage {
  InboxPage({required this.unreadCount, required this.items});
  InboxPage.empty()
      : unreadCount = 0,
        items = const [];
  final int unreadCount;
  final List<InboxItem> items;
}

class Achievement {
  Achievement({required this.id, required this.kind, required this.payload, required this.awardedAt});
  final String id;
  final String kind;
  final Map<String, dynamic> payload;
  final String awardedAt;

  factory Achievement.fromJson(Map<String, dynamic> j) => Achievement(
        id: j['id'] as String,
        kind: (j['kind'] ?? '') as String,
        payload: (j['payload'] as Map<String, dynamic>?) ?? const {},
        awardedAt: (j['awardedAt'] ?? '').toString(),
      );
}

class MockAttemptRow {
  MockAttemptRow({
    required this.id,
    required this.examCode,
    required this.examName,
    required this.rawScore,
    required this.maxMarks,
    required this.accuracy,
    required this.totalQuestions,
    required this.nCorrect,
    required this.nWrong,
    required this.nUnanswered,
    required this.createdAt,
    this.mockId,
    this.percentile,
    this.projectedRank,
    this.confidence,
    this.sections = const [],
  });
  final String id;
  final String? mockId;
  final String examCode;
  final String? examName;
  final int rawScore;
  final int maxMarks;
  final double accuracy;
  final int totalQuestions;
  final int nCorrect;
  final int nWrong;
  final int nUnanswered;
  final double? percentile;
  final int? projectedRank;
  final String? confidence;
  final String createdAt;
  final List<MockSectionResult> sections;

  factory MockAttemptRow.fromJson(Map<String, dynamic> j) => MockAttemptRow(
        id: j['id'] as String,
        mockId: j['mockId'] as String?,
        examCode: (j['examCode'] ?? '') as String,
        examName: j['examName'] as String?,
        rawScore: ((j['rawScore'] ?? 0) as num).toInt(),
        maxMarks: ((j['maxMarks'] ?? 0) as num).toInt(),
        accuracy: ((j['accuracy'] ?? 0) as num).toDouble(),
        totalQuestions: ((j['totalQuestions'] ?? 0) as num).toInt(),
        nCorrect: ((j['nCorrect'] ?? 0) as num).toInt(),
        nWrong: ((j['nWrong'] ?? 0) as num).toInt(),
        nUnanswered: ((j['nUnanswered'] ?? 0) as num).toInt(),
        percentile: (j['percentile'] as num?)?.toDouble(),
        projectedRank: (j['projectedRank'] as num?)?.toInt(),
        confidence: j['confidence'] as String?,
        createdAt: (j['createdAt'] ?? '').toString(),
        sections: ((j['sections'] ?? []) as List)
            .cast<Map<String, dynamic>>()
            .map((s) => MockSectionResult(
                  name: (s['name'] ?? '') as String,
                  correct: ((s['correct'] ?? 0) as num).toInt(),
                  wrong: ((s['wrong'] ?? 0) as num).toInt(),
                  unanswered: ((s['unanswered'] ?? 0) as num).toInt(),
                  total: ((s['total'] ?? 0) as num).toInt(),
                ))
            .toList(),
      );
}

class SessionHistoryRow {
  SessionHistoryRow({
    required this.sessionId,
    required this.topicId,
    required this.mode,
    required this.status,
    required this.targetCount,
    required this.servedCount,
    required this.correctCount,
    required this.startedAt,
    this.submittedAt,
  });
  final String sessionId;
  final String topicId;
  final String mode;
  final String status;
  final int targetCount;
  final int servedCount;
  final int correctCount;
  final String startedAt;
  final String? submittedAt;

  factory SessionHistoryRow.fromJson(Map<String, dynamic> j) => SessionHistoryRow(
        sessionId: j['sessionId'] as String,
        topicId: j['topicId'] as String,
        mode: j['mode'] as String,
        status: j['status'] as String,
        targetCount: ((j['targetCount'] ?? 0) as num).toInt(),
        servedCount: ((j['servedCount'] ?? 0) as num).toInt(),
        correctCount: ((j['correctCount'] ?? 0) as num).toInt(),
        startedAt: j['startedAt'] as String,
        submittedAt: j['submittedAt'] as String?,
      );
}

class Bookmark {
  Bookmark({
    required this.userId,
    required this.questionId,
    required this.createdAt,
    this.topicId,
    this.topicTitle,
    this.stem,
    this.note,
  });
  final String userId;
  final String questionId;
  final String? topicId;
  final String? topicTitle;
  final String? stem;
  final String? note;
  final String createdAt;

  factory Bookmark.fromJson(Map<String, dynamic> j) => Bookmark(
        userId: j['userId'] as String,
        questionId: j['questionId'] as String,
        topicId: j['topicId'] as String?,
        topicTitle: j['topicTitle'] as String?,
        stem: j['stem'] as String?,
        note: j['note'] as String?,
        createdAt: j['createdAt'].toString(),
      );
}

class MockSection {
  MockSection({required this.name, required this.questionCount, required this.fromIdx, required this.toIdx});
  final String name;
  final int questionCount;
  final int fromIdx;
  final int toIdx;
}

class MockQuestion {
  MockQuestion({required this.id, required this.topicId, required this.stem, required this.choices, required this.difficultyB});
  final String id;
  final String topicId;
  final String stem;
  final List<String> choices;
  final double difficultyB;
}

class MockPlan {
  MockPlan({
    required this.mockId,
    required this.examCode,
    required this.examName,
    required this.durationMinutes,
    required this.totalQuestions,
    required this.maxMarks,
    required this.marksCorrect,
    required this.marksWrong,
    required this.sections,
    required this.questions,
  })  : error = null,
        message = null;

  MockPlan.error(this.error, this.message)
      : mockId = '',
        examCode = '',
        examName = '',
        durationMinutes = 0,
        totalQuestions = 0,
        maxMarks = 0,
        marksCorrect = 0,
        marksWrong = 0,
        sections = const [],
        questions = const [];

  final String mockId;
  final String examCode;
  final String examName;
  final int durationMinutes;
  final int totalQuestions;
  final int maxMarks;
  final int marksCorrect;
  final int marksWrong;
  final List<MockSection> sections;
  final List<MockQuestion> questions;
  final String? error;
  final String? message;
}

class MockSectionResult {
  MockSectionResult({required this.name, required this.correct, required this.wrong, required this.unanswered, required this.total});
  final String name;
  final int correct;
  final int wrong;
  final int unanswered;
  final int total;
}

class MockResult {
  MockResult({
    required this.examCode,
    required this.examName,
    required this.rawScore,
    required this.maxMarks,
    required this.accuracy,
    required this.totalQuestions,
    required this.nCorrect,
    required this.nWrong,
    required this.nUnanswered,
    required this.percentile,
    required this.projectedRank,
    required this.rankLow,
    required this.rankHigh,
    required this.confidence,
    required this.sections,
  })  : error = null,
        message = null;

  MockResult.error(this.error, this.message)
      : examCode = '',
        examName = '',
        rawScore = 0,
        maxMarks = 0,
        accuracy = 0,
        totalQuestions = 0,
        nCorrect = 0,
        nWrong = 0,
        nUnanswered = 0,
        percentile = 0,
        projectedRank = 0,
        rankLow = 0,
        rankHigh = 0,
        confidence = 'low',
        sections = const [];

  final String examCode;
  final String examName;
  final int rawScore;
  final int maxMarks;
  final double accuracy;
  final int totalQuestions;
  final int nCorrect;
  final int nWrong;
  final int nUnanswered;
  final double percentile;
  final int projectedRank;
  final int rankLow;
  final int rankHigh;
  final String confidence;
  final List<MockSectionResult> sections;
  final String? error;
  final String? message;
}
