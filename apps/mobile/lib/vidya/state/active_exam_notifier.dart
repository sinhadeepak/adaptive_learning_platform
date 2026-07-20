// VidyaActiveExamNotifier — the app-wide multi-exam spine.
//
// A student is often enrolled in several exams/tracks (NEET + JEE + …). The
// app must always support that: a single "active exam" selection drives
// every exam-scoped screen (Home, Study, Insights, PYQ, Mock, Syllabus).
// Before this, only Home read the selection (secure-storage key
// `vidya.active_exam_id`) and the other tabs silently used `exams.first`,
// so switching on Home didn't re-scope anything else.
//
// This notifier is the single source of truth: it loads the enrolled exams
// (profile.exams ⨝ catalog), tracks the active one, persists the choice,
// and notifies listeners on switch. It's provided once at the shell via
// `VidyaActiveExam` (an InheritedNotifier) so any descendant reads it with
// `VidyaActiveExam.of(context)` and rebuilds when the active exam changes.

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../api/api_client.dart';
import '../../auth/auth_client.dart';
import 'exam_ref.dart';

class VidyaActiveExamNotifier extends ChangeNotifier {
  VidyaActiveExamNotifier(this._auth, {FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  /// Build a pre-resolved notifier for widget tests: no network load, the
  /// enrolled/active state is supplied directly so tests can mount an
  /// exam-scoped screen under a [VidyaActiveExam] without driving load().
  @visibleForTesting
  factory VidyaActiveExamNotifier.seeded({
    required AuthClient auth,
    required List<ExamRef> enrolled,
    ExamRef? active,
    FlutterSecureStorage? storage,
  }) {
    final n = VidyaActiveExamNotifier(auth, storage: storage);
    n._enrolled = enrolled;
    n._active = active ?? (enrolled.isEmpty ? null : enrolled.first);
    n._loading = false;
    return n;
  }

  final AuthClient _auth;
  final FlutterSecureStorage _storage;

  /// Secure-storage key for the persisted active exam id. Shared with the
  /// historical Home key so an existing selection carries over.
  static const String storageKey = 'vidya.active_exam_id';

  bool _loading = true;
  bool get loading => _loading;

  List<ExamRef> _enrolled = const [];
  List<ExamRef> get enrolled => _enrolled;

  ExamRef? _active;
  ExamRef? get active => _active;

  /// Convenience accessors for the common scope params: the analytics/IGS
  /// endpoints scope by exam *code* (`scope`/`exam` param), the catalog and
  /// mock endpoints by exam *id*.
  String? get activeExamId => _active?.examId;
  String? get activeExamCode => _active?.code;

  bool get hasMultiple => _enrolled.length >= 2;

  /// Load enrolled exams and resolve the active one (persisted choice if it
  /// is still enrolled, else the primary exam). Safe to call repeatedly.
  Future<void> load() async {
    _loading = true;
    notifyListeners();
    await _resolve();
    _loading = false;
    notifyListeners();
  }

  /// Re-derive the enrolled list (e.g. after the student adds an exam),
  /// preserving the active selection when it's still enrolled.
  Future<void> refresh() async {
    await _resolve();
    notifyListeners();
  }

  /// Switch the active exam. No-op when it's already active or not enrolled.
  Future<void> select(String examId) async {
    if (examId == _active?.examId) return;
    ExamRef? match;
    for (final e in _enrolled) {
      if (e.examId == examId) {
        match = e;
        break;
      }
    }
    if (match == null) return;
    _active = match;
    await _write(examId);
    notifyListeners();
  }

  Future<void> _resolve() async {
    final user = _auth.user;
    if (user == null) {
      _enrolled = const [];
      _active = null;
      return;
    }
    final api = ApiClient(_auth);
    UserProfile? profile;
    var catalog = const <Exam>[];
    try {
      profile = await api.getProfile();
    } catch (_) {/* degrade to no exams */}
    try {
      catalog = await api.exams();
    } catch (_) {/* degrade to no exams */}

    final exams = ExamRef.join(profile?.exams ?? const <UserExam>[], catalog);
    _enrolled = exams;

    // Keep the current active selection if still enrolled; else the
    // persisted one; else the primary exam.
    final keep = _active?.examId;
    final stored = await _read();
    final preferred = keep ?? stored;
    ExamRef? chosen;
    for (final e in exams) {
      if (e.examId == preferred) {
        chosen = e;
        break;
      }
    }
    _active = chosen ?? (exams.isNotEmpty ? exams.first : null);
  }

  Future<String?> _read() async {
    try {
      return await _storage.read(key: storageKey);
    } catch (_) {
      return null;
    }
  }

  Future<void> _write(String examId) async {
    try {
      await _storage.write(key: storageKey, value: examId);
    } catch (_) {/* selection still applied in-memory for this session */}
  }
}

/// Provides a [VidyaActiveExamNotifier] to the subtree. Descendants read it
/// with `VidyaActiveExam.of(context)` and rebuild when the active exam (or
/// enrolled list / loading flag) changes.
class VidyaActiveExam extends InheritedNotifier<VidyaActiveExamNotifier> {
  const VidyaActiveExam({
    super.key,
    required VidyaActiveExamNotifier super.notifier,
    required super.child,
  });

  static VidyaActiveExamNotifier? of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<VidyaActiveExam>()?.notifier;
}
