// LumiCoachContext — multi-turn conversation state for Lumi.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §20.5
//       (Lumi Coaching Model — multi-turn context rules).
// Plan: /home/deepak/.claude/plans/the-mobile-app-ui-cheerful-codd.md
//       Wave 2 W2.0.7.
//
// Two kinds of state
// ──────────────────
//   1. Session-scoped (in-memory)
//      Last [contextWindow] turns + the active topic + the
//      hint-level-so-far. Discarded on session end / cold start /
//      persona switch.
//   2. Cross-session profile (persisted)
//      The user's persona, top-3 weak EWA topics, recent milestones,
//      preferred locale, and parent-set restrictions. Persisted to
//      flutter_secure_storage under `alp.lumi.profile` as a single JSON
//      blob — small enough not to need a database.
//
// Cross-persona leak prevention
// ─────────────────────────────
// A user switching persona (rare; debug only) clears the in-memory
// session via [LumiCoachContext.endSession] AND wipes the cross-session
// profile via [LumiCoachContext.wipeProfile]. This is the contract the
// PersonaNotifier listener should honour.
//
// Why an explicit class instead of provider state?
// ────────────────────────────────────────────────
// Multi-turn context is read by both the Lumi widget tree (for
// rendering the conversation) AND by [LumiCoach.buildRequest] (for
// composing the LLM payload). Putting it on a single notifier with a
// well-defined contract is cleaner than threading it through both
// surfaces independently. Tests can pump a fresh [LumiCoachContext]
// without spinning up a notifier subtree.

import 'dart:convert';

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'lumi_coach.dart';

/// The maximum number of turns kept in-memory and sent to the LLM. The
/// last [contextWindow] entries of [LumiCoachContext.turns] are what
/// the model sees. Hard cap on context length keeps token cost bounded
/// and matches the master spec's §20.5 multi-turn rule.
const int contextWindow = 8;

/// Cross-session profile snippet — the small subset of user state Lumi
/// is allowed to remember across sessions. Intentionally minimal:
/// anything bigger would belong to the profile / analytics services,
/// not to Lumi's transient memory.
@immutable
class LumiProfile {
  const LumiProfile({
    required this.persona,
    required this.locale,
    this.weakTopicIds = const [],
    this.recentMilestones = const [],
    this.parentRestrictionTags = const [],
  });

  final Persona persona;

  /// IETF BCP-47 (e.g. `en-IN`, `hi-IN`). Drives the response language
  /// for the (forthcoming) `alp-tutor` call.
  final String locale;

  /// Top-3 weak EWA topic ids (most-weak first). Lumi may proactively
  /// recommend practice in these.
  final List<String> weakTopicIds;

  /// Last 5 milestone ids unlocked by the user. Lumi references these
  /// in celebrations and `farewell()` farewells ("…and your 7-day
  /// streak is intact").
  final List<String> recentMilestones;

  /// Parent-set restriction tags for Kid persona (e.g. `no_emojis`,
  /// `pace_slow`). Empty for non-Kid personas. Honoured by the server-
  /// side prompt template.
  final List<String> parentRestrictionTags;

  LumiProfile copyWith({
    Persona? persona,
    String? locale,
    List<String>? weakTopicIds,
    List<String>? recentMilestones,
    List<String>? parentRestrictionTags,
  }) =>
      LumiProfile(
        persona: persona ?? this.persona,
        locale: locale ?? this.locale,
        weakTopicIds: weakTopicIds ?? this.weakTopicIds,
        recentMilestones: recentMilestones ?? this.recentMilestones,
        parentRestrictionTags:
            parentRestrictionTags ?? this.parentRestrictionTags,
      );

  Map<String, dynamic> toJson() => {
        'persona': persona.id,
        'locale': locale,
        'weak_topic_ids': weakTopicIds,
        'recent_milestones': recentMilestones,
        'parent_restriction_tags': parentRestrictionTags,
      };

  factory LumiProfile.fromJson(Map<String, dynamic> json) => LumiProfile(
        persona:
            PersonaX.fromId(json['persona'] as String?) ?? Persona.aspirant,
        locale: (json['locale'] as String?) ?? 'en-IN',
        weakTopicIds:
            (json['weak_topic_ids'] as List?)?.cast<String>() ?? const [],
        recentMilestones:
            (json['recent_milestones'] as List?)?.cast<String>() ?? const [],
        parentRestrictionTags:
            (json['parent_restriction_tags'] as List?)?.cast<String>() ??
                const [],
      );
}

/// Multi-turn Lumi conversation state. Owns the in-memory transcript
/// for the active session AND lends access to the persisted [profile].
///
/// Usage
/// ─────
///   final ctx = LumiCoachContext();
///   await ctx.bootstrap();
///   await ctx.startSession(persona: persona, topicId: topicId);
///   ctx.appendUser('Why is the sky blue?');
///   final req = ctx.buildRequest(userMessage: 'Why is the sky blue?');
///   // …caller sends `req` to alp-tutor and gets a LumiResponse…
///   ctx.appendLumi(resp.lumi);
///   // …on session end:
///   ctx.endSession();
class LumiCoachContext extends ChangeNotifier {
  LumiCoachContext({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  static const _storageKey = 'alp.lumi.profile';
  final FlutterSecureStorage _storage;

  // ── Session-scoped state (in-memory; cleared on endSession) ─────

  final List<LumiTurn> _turns = [];
  String? _sessionId;
  String? _activeTopicId;
  int _currentHintLevel = 0;

  /// All turns this session, oldest first. UI surfaces render this in
  /// natural reading order.
  List<LumiTurn> get turns => List.unmodifiable(_turns);

  /// Last [contextWindow] turns, oldest first — the slice that goes
  /// into the LLM payload.
  List<LumiTurn> get windowedTurns =>
      _turns.length <= contextWindow ? turns : _turns.sublist(_turns.length - contextWindow);

  String? get sessionId => _sessionId;
  String? get activeTopicId => _activeTopicId;
  int get currentHintLevel => _currentHintLevel;

  // ── Cross-session profile (persisted) ───────────────────────────

  LumiProfile? _profile;
  LumiProfile? get profile => _profile;

  /// Reads the persisted profile and current session id (if any).
  /// Call once at app start in parallel with the other notifier
  /// bootstraps in [main.dart]. Safe to call repeatedly.
  Future<void> bootstrap() async {
    final raw = await _storage.read(key: _storageKey);
    if (raw == null) return;
    try {
      final json = jsonDecode(raw) as Map<String, dynamic>;
      _profile = LumiProfile.fromJson(json);
      notifyListeners();
    } catch (e) {
      // Corrupt profile blob — wipe and continue. Lumi degrades to
      // first-time behaviour rather than crashing on bad state.
      assert(() {
        debugPrint('[LumiCoachContext] corrupt profile, wiping: $e');
        return true;
      }());
      await _storage.delete(key: _storageKey);
    }
  }

  /// Begins a fresh in-memory session. Generates a session id, clears
  /// the turn buffer, and resets the hint counter.
  ///
  /// If the supplied [persona] differs from the persisted profile's
  /// persona, the persisted profile is wiped automatically — this is
  /// the cross-persona leak prevention contract from spec §20.5.
  Future<void> startSession({
    required Persona persona,
    required String locale,
    String? topicId,
  }) async {
    if (_profile != null && _profile!.persona != persona) {
      await wipeProfile();
    }
    _profile ??= LumiProfile(persona: persona, locale: locale);
    if (_profile!.persona != persona || _profile!.locale != locale) {
      _profile = _profile!.copyWith(persona: persona, locale: locale);
      await _persistProfile();
    }
    _sessionId = _generateSessionId();
    _activeTopicId = topicId;
    _currentHintLevel = 0;
    _turns.clear();
    notifyListeners();
  }

  /// Appends a user turn. UI surfaces should call this *before*
  /// dispatching the HTTP request so optimistic rendering reflects the
  /// message immediately.
  void appendUser(String content, {Map<String, dynamic> metadata = const {}}) {
    _turns.add(LumiTurn(
      role: 'user',
      content: content,
      metadata: metadata,
    ),);
    notifyListeners();
  }

  /// Appends a Lumi turn. UI surfaces call this after the HTTP response
  /// resolves. Metadata copied from [LumiTurn] so the renderer can pick
  /// up `refused`, `hint_level`, `citations`.
  void appendLumi(LumiTurn turn) {
    _turns.add(turn);
    final hintLevel = turn.metadata['hint_level'];
    if (hintLevel is int) _currentHintLevel = hintLevel;
    notifyListeners();
  }

  /// Composes the wire payload for a new user message. Centralised here
  /// (rather than open-coded by callers) so the windowing rule lives in
  /// one place.
  LumiRequest buildRequest({
    required String userMessage,
    int? hintLevelRequested,
  }) {
    final p = _profile;
    final locale = p?.locale ?? 'en-IN';
    final persona = p?.persona ?? Persona.aspirant;
    return LumiRequest(
      mode: LumiCoachModeX.forPersona(persona),
      userMessage: userMessage,
      history: windowedTurns,
      locale: locale,
      topicId: _activeTopicId,
      hintLevelRequested: hintLevelRequested,
      sessionId: _sessionId,
    );
  }

  /// Ends the in-memory session. Cross-session profile is preserved.
  /// Safe to call multiple times.
  void endSession() {
    if (_sessionId == null && _turns.isEmpty) return;
    _turns.clear();
    _sessionId = null;
    _activeTopicId = null;
    _currentHintLevel = 0;
    notifyListeners();
  }

  /// Updates the cross-session profile. Use for: weak-topic snapshot
  /// refresh, milestone unlock, locale change, parent-restriction set.
  Future<void> updateProfile(
    LumiProfile Function(LumiProfile current) updater,
  ) async {
    final base = _profile ??
        LumiProfile(persona: Persona.aspirant, locale: 'en-IN');
    _profile = updater(base);
    await _persistProfile();
    notifyListeners();
  }

  /// Hard-wipes the cross-session profile. Called when the user
  /// switches persona, withdraws consent, or initiates account
  /// deletion.
  Future<void> wipeProfile() async {
    _profile = null;
    await _storage.delete(key: _storageKey);
    notifyListeners();
  }

  Future<void> _persistProfile() async {
    final p = _profile;
    if (p == null) {
      await _storage.delete(key: _storageKey);
      return;
    }
    await _storage.write(key: _storageKey, value: jsonEncode(p.toJson()));
  }

  static String _generateSessionId() {
    // UUID v4-ish — sufficient for client-side telemetry correlation.
    // Server-side `alp-tutor` also stamps its own ids; this is only
    // for client-side dedup and analytics.
    final now = DateTime.now().microsecondsSinceEpoch.toRadixString(16);
    final rand = (DateTime.now().millisecondsSinceEpoch ^
            (now.hashCode & 0x7FFFFFFF))
        .toRadixString(16);
    return 'lumi-$now-$rand';
  }
}
