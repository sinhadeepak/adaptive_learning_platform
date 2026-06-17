// Reflection + commitment + recovery clients (P6 S57 mobile parity).
//
// Mirrors apps/web-student/src/lib/reflection.ts + recovery.ts. Backed
// by 92efa83:
//   POST /reflections
//   POST /commitments/{rid}/check-in
//   GET  /commitments/{user_id}?status=
//   GET  /recovery/active
//   POST /recovery/{rid}/accept
//   POST /recovery/{rid}/decline
//
// Plus a localStorage-style low-bandwidth pref helper using
// FlutterSecureStorage.

import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../auth/auth_client.dart';

enum ReflectionTrigger { session, mock, weekly }

String reflectionTriggerWire(ReflectionTrigger t) => switch (t) {
      ReflectionTrigger.session => 'session',
      ReflectionTrigger.mock => 'mock',
      ReflectionTrigger.weekly => 'weekly',
    };

enum CommitmentStatus { pending, kept, missed }

CommitmentStatus _statusFrom(String s) => switch (s) {
      'kept' => CommitmentStatus.kept,
      'missed' => CommitmentStatus.missed,
      _ => CommitmentStatus.pending,
    };

class Commitment {
  const Commitment({
    required this.id,
    required this.trigger,
    required this.promptId,
    required this.commitment,
    required this.status,
    required this.occurredAt,
    this.commitmentDueAt,
    this.lastCheckInAt,
  });

  factory Commitment.fromJson(Map<String, dynamic> j) => Commitment(
        id: j['id'] as String,
        trigger: _triggerFromWire(j['trigger'] as String? ?? 'session'),
        promptId: j['prompt_id'] as String? ?? 'default_prompt',
        commitment: j['commitment'] as String? ?? '',
        commitmentDueAt: j['commitment_due_at'] as String?,
        status: _statusFrom(
            j['commitment_status'] as String? ?? 'pending',),
        occurredAt: j['occurred_at'] as String? ?? '',
        lastCheckInAt: j['last_check_in_at'] as String?,
      );

  final String id;
  final ReflectionTrigger trigger;
  final String promptId;
  final String commitment;
  final String? commitmentDueAt;
  final CommitmentStatus status;
  final String occurredAt;
  final String? lastCheckInAt;
}

ReflectionTrigger _triggerFromWire(String s) => switch (s) {
      'mock' => ReflectionTrigger.mock,
      'weekly' => ReflectionTrigger.weekly,
      _ => ReflectionTrigger.session,
    };

class ReflectionClient {
  ReflectionClient({required this.auth});
  final AuthClient auth;

  Future<String> postReflection({
    required String userId,
    required ReflectionTrigger trigger,
    String? triggerArtifactId,
    String promptId = 'default_prompt',
    String? response,
    String? commitment,
    String? commitmentDueAt,
  }) async {
    final body = <String, dynamic>{
      'user_id': userId,
      'trigger': reflectionTriggerWire(trigger),
      'prompt_id': promptId,
      'response': response,
      'commitment': commitment,
    };
    if (triggerArtifactId != null) {
      body['trigger_artifact_id'] = triggerArtifactId;
    }
    if (commitmentDueAt != null) {
      body['commitment_due_at'] = commitmentDueAt;
    }
    final r = await auth.apiPost('/reflections', body);
    if (r.statusCode != 201 && r.statusCode != 200) {
      throw Exception('reflection post failed: HTTP ${r.statusCode}');
    }
    final raw = jsonDecode(r.body) as Map<String, dynamic>;
    return raw['id'] as String;
  }

  Future<List<Commitment>> listCommitments(String userId,
      {CommitmentStatus? status,}) async {
    final qs = status == null
        ? ''
        : '?status=${{
            CommitmentStatus.pending: 'pending',
            CommitmentStatus.kept: 'kept',
            CommitmentStatus.missed: 'missed',
          }[status]}';
    final r = await auth.apiGet('/commitments/$userId$qs');
    if (r.statusCode != 200) {
      throw Exception('commitments fetch failed: HTTP ${r.statusCode}');
    }
    final raw = jsonDecode(r.body);
    final arr = raw is List
        ? raw
        : ((raw as Map<String, dynamic>)['items'] as List? ?? const []);
    return arr
        .map((e) => Commitment.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<CommitmentStatus> checkIn(
    String rid, {
    required bool kept,
    String? note,
  }) async {
    final r = await auth.apiPost('/commitments/$rid/check-in', {
      'kept': kept,
      'note': note,
    });
    if (r.statusCode != 200) {
      throw Exception('check-in failed: HTTP ${r.statusCode}');
    }
    final raw = jsonDecode(r.body) as Map<String, dynamic>;
    return _statusFrom(raw['commitment_status'] as String);
  }
}

// ─── Recovery ───────────────────────────────────────────────────────

enum RecoveryStatus { pending, accepted, declined, expired }

RecoveryStatus _recoveryFrom(String s) => switch (s) {
      'accepted' => RecoveryStatus.accepted,
      'declined' => RecoveryStatus.declined,
      'expired' => RecoveryStatus.expired,
      _ => RecoveryStatus.pending,
    };

class RecoveryProposal {
  const RecoveryProposal({
    required this.id,
    required this.planId,
    required this.triggeredAt,
    required this.missedSessionIds,
    required this.rationale,
    required this.expectedMinutes,
    required this.status,
  });

  factory RecoveryProposal.fromJson(Map<String, dynamic> j) =>
      RecoveryProposal(
        id: j['id'] as String,
        planId: j['plan_id'] as String,
        triggeredAt: j['triggered_at'] as String,
        missedSessionIds: ((j['missed_session_ids'] as List?) ?? const [])
            .map((e) => e.toString())
            .toList(),
        rationale: j['rationale'] as String? ?? '',
        expectedMinutes: (j['expected_minutes'] as num).toInt(),
        status: _recoveryFrom(j['status'] as String? ?? 'pending'),
      );

  final String id;
  final String planId;
  final String triggeredAt;
  final List<String> missedSessionIds;
  final String rationale;
  final int expectedMinutes;
  final RecoveryStatus status;
}

sealed class FetchActiveRecoveryResult {
  const FetchActiveRecoveryResult();
}

class RecoveryFound extends FetchActiveRecoveryResult {
  const RecoveryFound(this.proposal);
  final RecoveryProposal proposal;
}

class RecoveryAbsent extends FetchActiveRecoveryResult {
  const RecoveryAbsent();
}

class RecoveryClient {
  RecoveryClient({required this.auth});
  final AuthClient auth;

  Future<FetchActiveRecoveryResult> fetchActive() async {
    final r = await auth.apiGet('/recovery/active');
    if (r.statusCode != 200) {
      throw Exception('recovery fetch failed: HTTP ${r.statusCode}');
    }
    final raw = jsonDecode(r.body) as Map<String, dynamic>;
    final p = raw['proposal'];
    if (p == null) return const RecoveryAbsent();
    return RecoveryFound(
        RecoveryProposal.fromJson(p as Map<String, dynamic>),);
  }

  Future<RecoveryStatus> accept(String rid) async {
    final r = await auth.apiPost('/recovery/$rid/accept', {});
    if (r.statusCode != 200) {
      throw Exception('recovery accept failed: HTTP ${r.statusCode}');
    }
    return _recoveryFrom(
        (jsonDecode(r.body) as Map<String, dynamic>)['status'] as String,);
  }

  Future<RecoveryStatus> decline(String rid) async {
    final r = await auth.apiPost('/recovery/$rid/decline', {});
    if (r.statusCode != 200) {
      throw Exception('recovery decline failed: HTTP ${r.statusCode}');
    }
    return _recoveryFrom(
        (jsonDecode(r.body) as Map<String, dynamic>)['status'] as String,);
  }
}

// ─── Low-bandwidth preferences ──────────────────────────────────────

class LowBandwidthPrefs {
  const LowBandwidthPrefs({
    required this.reducedAnimations,
    required this.prefetchOff,
    required this.imagesLite,
  });

  factory LowBandwidthPrefs.fromJson(Map<String, dynamic> j) =>
      LowBandwidthPrefs(
        reducedAnimations: j['reducedAnimations'] as bool? ?? false,
        prefetchOff: j['prefetchOff'] as bool? ?? false,
        imagesLite: j['imagesLite'] as bool? ?? false,
      );

  final bool reducedAnimations;
  final bool prefetchOff;
  final bool imagesLite;

  Map<String, dynamic> toJson() => {
        'reducedAnimations': reducedAnimations,
        'prefetchOff': prefetchOff,
        'imagesLite': imagesLite,
      };

  static const off = LowBandwidthPrefs(
    reducedAnimations: false,
    prefetchOff: false,
    imagesLite: false,
  );
}

const _bwKey = 'ux32.low_bandwidth.v1';

Future<LowBandwidthPrefs> loadLowBandwidthPrefs({
  FlutterSecureStorage? storage,
}) async {
  final s = storage ?? const FlutterSecureStorage();
  final raw = await s.read(key: _bwKey);
  if (raw == null) return LowBandwidthPrefs.off;
  try {
    return LowBandwidthPrefs.fromJson(
        jsonDecode(raw) as Map<String, dynamic>,);
  } catch (_) {
    return LowBandwidthPrefs.off;
  }
}

Future<void> saveLowBandwidthPrefs(
  LowBandwidthPrefs prefs, {
  FlutterSecureStorage? storage,
}) async {
  final s = storage ?? const FlutterSecureStorage();
  await s.write(key: _bwKey, value: jsonEncode(prefs.toJson()));
}
