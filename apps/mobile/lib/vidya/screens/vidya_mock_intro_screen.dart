// VidyaMockIntroScreen — Phase 3c.full v3 Task 2.
//
// Intermediate screen between the Practice landing card and the
// Mock session loop. On mount it fetches available exam blueprints
// for `examId` via `ApiClient.examBlueprints`, auto-selects the first
// blueprint (blueprint picker UI defers to v3.v4) and renders its
// metadata + a Start CTA.
//
// Parallel in shape to `VidyaFocusedIntroScreen` (Phase 3c.full v2
// Task 1) — same chrome (✕ in app bar, eyebrow + large name + body
// + Start CTA) but different metadata.
//
// States:
//   loading   — two VidyaSkeletonBlocks (eyebrow + name)
//   empty     — no blueprints OR empty examId → cold-start copy + Back
//   error     — VidyaBanner + Retry
//   loaded    — eyebrow / blueprint name / counts line / marks line /
//               body copy / Start CTA
//
// Testability seam: `apiOverride` lets widget tests inject a stub
// ApiClient without subclassing the HTTP layer (matches the
// VidyaScreeningQuizScreen `client` pattern). Production callers don't
// need to know about it — `ApiClient(widget.client.auth)` is the
// default.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../api/api_client.dart';
import '../../quiz/quiz_client.dart';

class VidyaMockIntroScreen extends StatefulWidget {
  final QuizClient client;
  final String userId;
  final String examId;

  /// Called when the user taps "Start mock test"; receives the
  /// auto-selected blueprint's metadata so the session screen can be
  /// pushed with the caller's full callback wiring.
  final void Function({
    required String blueprintId,
    required String blueprintName,
    required int itemCount,
    required int totalMinutes,
  }) onStart;
  final VoidCallback onBack;

  /// Test-only seam — when null, production code constructs an
  /// `ApiClient(widget.client.auth)` itself. Widget tests inject a stub
  /// so blueprint fetches never hit the wire.
  final ApiClient? apiOverride;

  const VidyaMockIntroScreen({
    super.key,
    required this.client,
    required this.userId,
    required this.examId,
    required this.onStart,
    required this.onBack,
    this.apiOverride,
  });

  @override
  State<VidyaMockIntroScreen> createState() => _VidyaMockIntroScreenState();
}

class _VidyaMockIntroScreenState extends State<VidyaMockIntroScreen> {
  List<ExamBlueprint>? _blueprints;
  String? _error;
  bool _loading = true;

  ApiClient get _api =>
      widget.apiOverride ?? ApiClient(widget.client.auth);

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
      _blueprints = null;
    });
    // Don't even hit the wire if we have no examId — treat as empty.
    if (widget.examId.isEmpty) {
      if (mounted) {
        setState(() {
          _blueprints = const [];
          _loading = false;
        });
      }
      return;
    }
    try {
      final bps = await _api.examBlueprints(widget.examId);
      if (!mounted) return;
      setState(() {
        _blueprints = bps;
        _loading = false;
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = "We couldn't load mock tests for your exam.";
          _loading = false;
        });
      }
    }
  }

  Future<void> _retry() async {
    await _load();
  }

  /// Renders e.g. "+4 / −1 marking · 3 sections". `marksNegative` is
  /// a double on the wire (some exams use 0.25); render it as a plain
  /// integer when it's a whole number, otherwise keep one or two
  /// decimals as written.
  String _marksLine(ExamBlueprint bp) {
    final neg = bp.marksNegative;
    final negStr = neg == neg.truncateToDouble()
        ? neg.toInt().toString()
        : neg.toString();
    final sections = bp.sections.length;
    final sectionsLabel = sections == 1 ? '1 section' : '$sections sections';
    return '+${bp.marksCorrect} / −$negStr marking · $sectionsLabel';
  }

  String _countsLine(ExamBlueprint bp) {
    final q = bp.totalQuestions;
    final qLabel = q == 1 ? '1 question' : '$q questions';
    final m = bp.totalMinutes;
    final mLabel = m == 1 ? '1 minute' : '$m minutes';
    return '$qLabel · $mLabel';
  }

  @override
  Widget build(BuildContext context) {
    final theme = VidyaThemeData.of(context);
    final ink = theme.ink;
    final muted = theme.ink3;
    final accent = theme.accent;

    if (_loading) {
      return VidyaScaffold(
        appBar: VidyaAppBar(
          title: '',
          actions: [
            IconButton(
              icon: Icon(Icons.close, color: ink),
              onPressed: widget.onBack,
            ),
          ],
        ),
        body: Padding(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: const [
              SizedBox(height: 8),
              VidyaSkeletonBlock(width: 140, height: 12),
              SizedBox(height: 24),
              VidyaSkeletonBlock(width: 260, height: 32),
            ],
          ),
        ),
      );
    }

    if (_error != null) {
      return VidyaScaffold(
        appBar: VidyaAppBar(
          title: '',
          actions: [
            IconButton(
              icon: Icon(Icons.close, color: ink),
              onPressed: widget.onBack,
            ),
          ],
        ),
        body: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 24),
              VidyaBanner(
                tone: VidyaBannerTone.warn,
                message: _error!,
                action: TextButton(
                  onPressed: _retry,
                  child: Text(
                    'Retry',
                    style: TextStyle(
                      fontFamily: VidyaFonts.ui,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: accent,
                    ),
                  ),
                ),
              ),
              const Spacer(),
              VidyaButton(
                label: 'Close',
                style: VidyaButtonStyle.ghost,
                onPressed: widget.onBack,
                size: VidyaButtonSize.lg,
              ),
            ],
          ),
        ),
      );
    }

    final blueprints = _blueprints ?? const <ExamBlueprint>[];
    if (blueprints.isEmpty) {
      return VidyaScaffold(
        appBar: VidyaAppBar(
          title: '',
          actions: [
            IconButton(
              icon: Icon(Icons.close, color: ink),
              onPressed: widget.onBack,
            ),
          ],
        ),
        body: Padding(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'MOCK TEST',
                style: TextStyle(
                  fontFamily: VidyaFonts.mono,
                  fontSize: 11,
                  color: muted,
                  letterSpacing: 1.5,
                ),
              ),
              const SizedBox(height: 24),
              Text(
                'Mock tests unlock once we have blueprints for your '
                'exam. Try Quick or Focused practice for now.',
                style: TextStyle(
                  fontFamily: VidyaFonts.ui,
                  fontSize: 15,
                  color: theme.ink2,
                  height: 1.5,
                ),
              ),
              const Spacer(),
              VidyaButton(
                label: 'Back',
                style: VidyaButtonStyle.ghost,
                onPressed: widget.onBack,
                size: VidyaButtonSize.lg,
              ),
            ],
          ),
        ),
      );
    }

    // TODO(v3.v4): when more than one blueprint is published for an exam,
    // offer a picker. For v3.v1 we auto-select the first (publishedAt
    // DESC server-side, so this is "the most recent published mock").
    final bp = blueprints.first;

    return VidyaScaffold(
      appBar: VidyaAppBar(
        title: '',
        actions: [
          IconButton(
            icon: Icon(Icons.close, color: ink),
            onPressed: widget.onBack,
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'MOCK TEST',
              style: TextStyle(
                fontFamily: VidyaFonts.mono,
                fontSize: 11,
                color: muted,
                letterSpacing: 1.5,
              ),
            ),
            const SizedBox(height: 24),
            Text(
              bp.name,
              style: TextStyle(
                fontFamily: VidyaFonts.display,
                fontSize: 32,
                fontWeight: FontWeight.w500,
                color: ink,
                height: 1.15,
              ),
            ),
            const SizedBox(height: 16),
            Text(
              _countsLine(bp),
              style: TextStyle(
                fontFamily: VidyaFonts.ui,
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: theme.ink2,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              _marksLine(bp),
              style: TextStyle(
                fontFamily: VidyaFonts.ui,
                fontSize: 14,
                color: theme.ink2,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 20),
            Text(
              'This is a full-length timed mock. Once you start, the '
              "timer keeps running. Submit when you're done.",
              style: TextStyle(
                fontFamily: VidyaFonts.ui,
                fontSize: 14,
                color: theme.ink2,
                height: 1.5,
              ),
            ),
            const Spacer(),
            VidyaButton(
              key: const Key('vidya.mock.intro.start'),
              label: 'Start mock test',
              onPressed: () => widget.onStart(
                blueprintId: bp.id,
                blueprintName: bp.name,
                itemCount: bp.totalQuestions,
                totalMinutes: bp.totalMinutes,
              ),
              size: VidyaButtonSize.lg,
            ),
          ],
        ),
      ),
    );
  }
}
