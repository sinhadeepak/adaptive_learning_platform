// Study plan client (Phase 6 S55 mobile parity).
//
// Mirrors apps/web-student/src/lib/study-plan.ts. Backed by the
// alp-learning plans module from 9f6d748:
//   GET  /plans/active
//   POST /plans/generate
//   POST /plans/{plan_id}/edit
//
// ADR: docs/adr/0023-constrained-plan-coediting.md

import 'dart:convert';

import '../auth/auth_client.dart';

enum EditKind {
  move,
  swap,
  rest,
  shorten,
  add,
  regenerate,
  replace,
  postpone,
  split,
}

String editKindWire(EditKind k) => switch (k) {
      EditKind.move => 'move',
      EditKind.swap => 'swap',
      EditKind.rest => 'rest',
      EditKind.shorten => 'shorten',
      EditKind.add => 'add',
      EditKind.regenerate => 'regenerate',
      EditKind.replace => 'replace',
      EditKind.postpone => 'postpone',
      EditKind.split => 'split',
    };

class PlanSession {
  const PlanSession({
    required this.id,
    required this.planId,
    required this.dayOffset,
    required this.slot,
    required this.kind,
    required this.expectedMinutes,
    required this.expectedQuestions,
    required this.isRequired,
    required this.status,
    required this.position,
    this.conceptId,
    this.topicId,
    this.lockedReason,
    this.completedAt,
    this.linkedSessionId,
  });

  factory PlanSession.fromJson(Map<String, dynamic> j) => PlanSession(
        id: j['id'] as String,
        planId: j['plan_id'] as String,
        dayOffset: (j['day_offset'] as num).toInt(),
        slot: j['slot'] as String? ?? '',
        kind: j['kind'] as String? ?? '',
        conceptId: j['concept_id'] as String?,
        topicId: j['topic_id'] as String?,
        expectedMinutes: (j['expected_minutes'] as num).toInt(),
        expectedQuestions: (j['expected_questions'] as num).toInt(),
        isRequired: j['is_required'] as bool? ?? false,
        lockedReason: j['locked_reason'] as String?,
        status: j['status'] as String? ?? 'pending',
        completedAt: j['completed_at'] as String?,
        linkedSessionId: j['linked_session_id'] as String?,
        position: (j['position'] as num).toInt(),
      );

  final String id;
  final String planId;
  final int dayOffset;
  final String slot;
  final String kind;
  final String? conceptId;
  final String? topicId;
  final int expectedMinutes;
  final int expectedQuestions;
  final bool isRequired;
  final String? lockedReason;
  final String status;
  final String? completedAt;
  final String? linkedSessionId;
  final int position;
}

class StudyPlan {
  const StudyPlan({
    required this.id,
    required this.userId,
    required this.weekStart,
    required this.dailyMinutesGoal,
    required this.source,
    required this.status,
    required this.sessions,
    this.targetDate,
  });

  factory StudyPlan.fromJson(Map<String, dynamic> j) => StudyPlan(
        id: j['id'] as String,
        userId: j['user_id'] as String,
        weekStart: j['week_start'] as String,
        targetDate: j['target_date'] as String?,
        dailyMinutesGoal: (j['daily_minutes_goal'] as num).toInt(),
        source: j['source'] as String? ?? 'ai_initial',
        status: j['status'] as String? ?? 'active',
        sessions: ((j['sessions'] as List?) ?? const [])
            .map((e) => PlanSession.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  final String id;
  final String userId;
  final String weekStart;
  final String? targetDate;
  final int dailyMinutesGoal;
  final String source;
  final String status;
  final List<PlanSession> sessions;
}

sealed class FetchActivePlanResult {
  const FetchActivePlanResult();
}

class PlanFound extends FetchActivePlanResult {
  const PlanFound(this.plan);
  final StudyPlan plan;
}

class PlanAbsent extends FetchActivePlanResult {
  const PlanAbsent();
}

class EditResponse {
  const EditResponse({
    required this.editId,
    required this.blocked,
    required this.summary,
    this.blockReason,
  });

  factory EditResponse.fromJson(Map<String, dynamic> j) => EditResponse(
        editId: j['edit_id'] as String,
        blocked: j['blocked'] as bool? ?? false,
        blockReason: j['block_reason'] as String?,
        summary: (j['impact_preview'] as Map<String, dynamic>?)?[
                'summary'] as String? ??
            '',
      );

  final String editId;
  final bool blocked;
  final String? blockReason;
  final String summary;
}

class EditPayload {
  const EditPayload({
    required this.kind,
    this.sessionId,
    this.toDayOffset,
    this.newMinutes,
  });

  final EditKind kind;
  final String? sessionId;
  final int? toDayOffset;
  final int? newMinutes;

  Map<String, dynamic> toJson() {
    final body = <String, dynamic>{'kind': editKindWire(kind)};
    if (sessionId != null) body['session_id'] = sessionId;
    if (toDayOffset != null) body['to_day_offset'] = toDayOffset;
    if (newMinutes != null) body['new_minutes'] = newMinutes;
    return body;
  }
}

class StudyPlanClient {
  StudyPlanClient({required this.auth});

  final AuthClient auth;

  Future<FetchActivePlanResult> fetchActive() async {
    final r = await auth.apiGet('/plans/active');
    if (r.statusCode == 404) return const PlanAbsent();
    if (r.statusCode != 200) {
      throw Exception('active plan fetch failed: HTTP ${r.statusCode}');
    }
    return PlanFound(
      StudyPlan.fromJson(jsonDecode(r.body) as Map<String, dynamic>),
    );
  }

  Future<StudyPlan> generate({
    int dailyMinutesGoal = 30,
    String? targetDate,
    bool hasRecentMock = false,
  }) async {
    final body = {
      'daily_minutes_goal': dailyMinutesGoal,
      'target_date': targetDate,
      'weak_concepts': const [],
      'decays': const [],
      'has_recent_mock': hasRecentMock,
    };
    final r = await auth.apiPost('/plans/generate', body);
    if (r.statusCode != 200) {
      throw Exception('plan generate failed: HTTP ${r.statusCode}');
    }
    return StudyPlan.fromJson(jsonDecode(r.body) as Map<String, dynamic>);
  }

  Future<EditResponse> edit(String planId, EditPayload payload) async {
    final r =
        await auth.apiPost('/plans/$planId/edit', payload.toJson());
    if (r.statusCode != 200) {
      throw Exception('plan edit failed: HTTP ${r.statusCode}');
    }
    return EditResponse.fromJson(
      jsonDecode(r.body) as Map<String, dynamic>,
    );
  }
}

// ─── Display helpers ────────────────────────────────────────────────

const sessionKindLabels = <String, String>{
  'practice_concept': 'Practice — weak concept',
  'revise_concept': 'Revise — fading recall',
  'take_mock': 'Mock — full pattern',
  'watch_video': 'Watch — short explainer',
  'crash_drill': 'Crash drill — high-yield',
  'take_break': 'Take a short break',
};

String sessionKindLabel(String kind) =>
    sessionKindLabels[kind] ?? kind;

String dayOffsetLabel(int offset, String weekStart) {
  try {
    final start = DateTime.parse(weekStart);
    final d = start.add(Duration(days: offset));
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    return '${days[d.weekday - 1]} · ${months[d.month - 1]} ${d.day}';
  } catch (_) {
    return 'Day ${offset + 1}';
  }
}
