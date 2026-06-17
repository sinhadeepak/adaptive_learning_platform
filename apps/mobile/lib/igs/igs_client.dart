// IGS — Internal Guidance System client for Flutter.
//
// Two surfaces, mirroring the web client:
//   • HTTP via AuthClient.apiGet / apiPost
//   • WebSocket subscriber via `web_socket_channel`
//
// Reconnect-with-backoff is the same shape as the web client; on
// Android / iOS the connection is dropped when the app backgrounds
// and re-opened on resume by the screen's WidgetsBindingObserver.

import 'dart:async';
import 'dart:convert';

import 'package:web_socket_channel/web_socket_channel.dart';

import '../auth/auth_client.dart';

class IGSAction {
  IGSAction({
    required this.actionKind,
    required this.conceptId,
    required this.blueprintId,
    required this.questionCount,
    required this.expectedMinutes,
    required this.score,
    required this.rank,
    required this.rationale,
    required this.expectedMarksGained,
  });

  final String actionKind;
  final String? conceptId;
  final String? blueprintId;
  final int? questionCount;
  final int expectedMinutes;
  final double score;
  final int rank;
  final List<String> rationale;
  final double expectedMarksGained;

  factory IGSAction.fromJson(Map<String, dynamic> j) => IGSAction(
        actionKind: (j['action_kind'] ?? j['actionKind']) as String,
        conceptId: (j['concept_id'] ?? j['conceptId']) as String?,
        blueprintId: (j['blueprint_id'] ?? j['blueprintId']) as String?,
        questionCount: (j['question_count'] ?? j['questionCount']) as int?,
        expectedMinutes:
            ((j['expected_minutes'] ?? j['expectedMinutes'] ?? 20) as num).toInt(),
        score: ((j['score'] ?? 0) as num).toDouble(),
        rank: ((j['rank'] ?? 1) as num).toInt(),
        rationale: ((j['rationale'] as List?) ?? []).cast<String>(),
        expectedMarksGained:
            ((j['expected_marks_gained'] ?? j['expectedMarksGained'] ?? 0) as num).toDouble(),
      );
}

class TodayPlan {
  TodayPlan({
    required this.userId,
    required this.examId,
    required this.totalMinutes,
    required this.actions,
  });

  final String userId;
  final String examId;
  final int totalMinutes;
  // Surfaced as `actions` to UI; server returns under key `plan`.
  final List<IGSAction> actions;

  factory TodayPlan.fromJson(Map<String, dynamic> j) => TodayPlan(
        userId: j['user_id'] as String,
        examId: j['exam_id'] as String,
        totalMinutes: ((j['total_minutes'] ?? 0) as num).toInt(),
        actions: (((j['plan'] ?? j['actions']) as List?) ?? const [])
            .cast<Map<String, dynamic>>()
            .map(IGSAction.fromJson)
            .toList(),
      );
}

class IGSClient {
  IGSClient(this.auth);
  final AuthClient auth;

  Future<TodayPlan?> fetchTodayPlan(String userId, String examId) async {
    final r = await auth.apiGet('/igs/$userId/today-plan?exam_id=$examId');
    if (r.statusCode != 200) return null;
    return TodayPlan.fromJson(jsonDecode(r.body) as Map<String, dynamic>);
  }

  Future<void> postOverride(
    String userId, {
    required String chosenActionKind,
    String? rejectedTopActionId,
    String? conceptId,
    String? reason,
  }) async {
    await auth.apiPost('/igs/$userId/override', {
      'chosen_action_kind': chosenActionKind,
      if (rejectedTopActionId != null) 'rejected_top_action_id': rejectedTopActionId,
      if (conceptId != null) 'concept_id': conceptId,
      if (reason != null) 'reason': reason,
    });
  }
}

// ── WebSocket subscriber ──────────────────────────────────────────────

typedef NextActionHandler = void Function(IGSAction chosen);
typedef PlanUpdatedHandler = void Function();

class IGSStream {
  IGSStream({
    required this.auth,
    required this.examId,
    this.onNextAction,
    this.onPlanUpdated,
    this.onError,
  });

  final AuthClient auth;
  final String examId;
  final NextActionHandler? onNextAction;
  final PlanUpdatedHandler? onPlanUpdated;
  final void Function(String code, String message)? onError;

  WebSocketChannel? _ch;
  bool _closed = false;
  Duration _backoff = const Duration(seconds: 1);
  StreamSubscription<dynamic>? _sub;

  void connect() {
    if (_closed) return;
    final tok = auth.tokens?.accessToken;
    if (tok == null) {
      Future.delayed(const Duration(seconds: 2), connect);
      return;
    }
    // AuthClient.baseUrl looks like `https://host/api/v1` — swap scheme
    // and append /igs/stream.
    final base = auth.baseUrl;
    final wsScheme = base.startsWith('https') ? 'wss' : 'ws';
    final stripped = base.replaceFirst(RegExp(r'^https?'), '');
    final url = '$wsScheme$stripped/igs/stream?token=$tok&exam_id=$examId';

    try {
      _ch = WebSocketChannel.connect(Uri.parse(url));
      _backoff = const Duration(seconds: 1);
    } catch (_) {
      _scheduleReconnect();
      return;
    }

    _ch!.sink.add(jsonEncode({
      't': 'igs.subscribe',
      'p': {'examId': examId},
    }));

    _sub = _ch!.stream.listen(
      (raw) {
        try {
          final env = jsonDecode(raw as String) as Map<String, dynamic>;
          switch (env['t']) {
            case 'igs.next-action.updated':
              final p = env['p'] as Map<String, dynamic>;
              final chosen = IGSAction.fromJson(p['chosen'] as Map<String, dynamic>);
              onNextAction?.call(chosen);
              break;
            case 'igs.plan.updated':
              onPlanUpdated?.call();
              break;
            case 'igs.error':
              final p = (env['p'] as Map?) ?? {};
              onError?.call(
                (p['code'] ?? 'unknown') as String,
                (p['message'] ?? '') as String,
              );
              break;
            case 'igs.heartbeat':
              break;
          }
        } catch (_) {/* ignore malformed */}
      },
      onError: (_) => _scheduleReconnect(),
      onDone: _scheduleReconnect,
      cancelOnError: true,
    );
  }

  void _scheduleReconnect() {
    if (_closed) return;
    final wait = _backoff;
    final nextMs = (_backoff.inMilliseconds * 2).clamp(1000, 30000);
    _backoff = Duration(milliseconds: nextMs);
    Future.delayed(wait, connect);
  }

  void close() {
    _closed = true;
    _sub?.cancel();
    _ch?.sink.close();
  }
}
