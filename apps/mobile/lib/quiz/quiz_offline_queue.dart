// Offline-recovery v0 for the mobile quiz player (Phase 6 S51, UX-32).
//
// Spec: docs/02_planning/55_Phase6_UXCoPilot_Evaluation_and_SprintPlan.md S51
//
// Goal: if the student answers a question while offline (airplane mode,
// flaky cellular, app backgrounded mid-submit), we don't lose the
// answer. We persist each pending answer to flutter_secure_storage as
// it's submitted, then drain the queue when connectivity returns.
//
// Storage shape:
//   key:   quiz.offline_queue.v1.<sessionId>
//   value: JSON list of entries (see [PendingAnswer.toJson])
//
// The Quiz Go server's /answers endpoint is idempotent on
// (session_id, item_idx) per Sprint-1 GAP-08 — replaying a duplicate
// is safe (server returns the same answer record). That's what makes
// this queue correct: at worst we resend an already-recorded answer.

import 'dart:async';
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'quiz_client.dart';

class PendingAnswer {
  const PendingAnswer({
    required this.sessionId,
    required this.itemIdx,
    required this.answerIdx,
    required this.queuedAtMs,
    this.responsePayload,
  });

  factory PendingAnswer.fromJson(Map<String, dynamic> j) => PendingAnswer(
        sessionId: j['sessionId'] as String,
        itemIdx: j['itemIdx'] as int,
        answerIdx: j['answerIdx'] as int,
        queuedAtMs: j['queuedAtMs'] as int,
        responsePayload: j['responsePayload'] as Map<String, dynamic>?,
      );

  final String sessionId;
  final int itemIdx;
  final int answerIdx;
  final int queuedAtMs;
  final Map<String, dynamic>? responsePayload;

  Map<String, dynamic> toJson() => {
        'sessionId': sessionId,
        'itemIdx': itemIdx,
        'answerIdx': answerIdx,
        'queuedAtMs': queuedAtMs,
        if (responsePayload != null) 'responsePayload': responsePayload,
      };
}

/// Minimal persistent queue keyed by sessionId. Storage layer is
/// injectable so widget tests can use an in-memory map.
class QuizOfflineQueue {
  QuizOfflineQueue({
    FlutterSecureStorage? storage,
    Map<String, String>? memoryStore,
  })  : _storage = storage,
        _memory = memoryStore;

  final FlutterSecureStorage? _storage;
  final Map<String, String>? _memory;

  String _key(String sessionId) => 'quiz.offline_queue.v1.$sessionId';

  Future<String?> _read(String key) async {
    if (_memory != null) return _memory[key];
    return (_storage ?? const FlutterSecureStorage()).read(key: key);
  }

  Future<void> _write(String key, String value) async {
    if (_memory != null) {
      _memory[key] = value;
      return;
    }
    await (_storage ?? const FlutterSecureStorage())
        .write(key: key, value: value);
  }

  Future<void> _delete(String key) async {
    if (_memory != null) {
      _memory.remove(key);
      return;
    }
    await (_storage ?? const FlutterSecureStorage()).delete(key: key);
  }

  Future<List<PendingAnswer>> load(String sessionId) async {
    final raw = await _read(_key(sessionId));
    if (raw == null || raw.isEmpty) return const [];
    try {
      final list = jsonDecode(raw) as List<dynamic>;
      return list
          .map((e) => PendingAnswer.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (_) {
      // Corrupt blob — clear and start fresh.
      await _delete(_key(sessionId));
      return const [];
    }
  }

  Future<void> enqueue(PendingAnswer entry) async {
    final existing = await load(entry.sessionId);
    final next = [...existing, entry];
    await _write(_key(entry.sessionId), jsonEncode(next));
  }

  Future<void> remove(String sessionId, int itemIdx) async {
    final existing = await load(sessionId);
    final next =
        existing.where((e) => e.itemIdx != itemIdx).toList(growable: false);
    if (next.isEmpty) {
      await _delete(_key(sessionId));
    } else {
      await _write(_key(sessionId), jsonEncode(next));
    }
  }

  Future<void> clear(String sessionId) => _delete(_key(sessionId));

  /// Attempts to send every queued answer for [sessionId] via [client].
  /// Returns the number of successfully replayed entries. Quiz answer
  /// endpoint is idempotent on (session_id, item_idx) so re-sending is
  /// safe; on failure the entry stays in the queue.
  Future<int> drain(QuizClient client, String sessionId) async {
    final pending = await load(sessionId);
    if (pending.isEmpty) return 0;
    var replayed = 0;
    for (final p in pending) {
      try {
        await client.answer(
          p.sessionId,
          itemIdx: p.itemIdx,
          answerIdx: p.answerIdx,
          responsePayload: p.responsePayload,
        );
        await remove(sessionId, p.itemIdx);
        replayed += 1;
      } catch (_) {
        // Still offline / transient error — leave the rest for next time.
        return replayed;
      }
    }
    return replayed;
  }
}
