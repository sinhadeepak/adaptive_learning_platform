// VidyaPracticeResultScreen — Phase 3c.full v2 Task 2 (rich).
//
// Landing page after a practice session completes. On mount it calls
// `QuizClient.session(sessionId)` to fetch the summary, then renders:
//
//   - PRACTICE COMPLETE eyebrow + big `${correct} / ${target}` score.
//   - BY TOPIC breakdown listing each topic the user answered with
//     correct/total counts (per-topic if the API emits per-item
//     topicId, else a single row keyed off the session's topicId).
//     Topic labels resolved best-effort from /catalog/topics/{id};
//     falls back to the topicId on catalog failure.
//   - "See updated insights →" deep-link that pushes
//     VidyaInsightsScreen for mastery deltas after the session.
//   - Done CTA that fires `onDone`.
//
// Score denominator is `targetCount`, NOT `servedCount`, so the result
// screen matches the `X of Y` denominator the user saw mid-quiz
// (Task 1's session screen renders `currentNumber of widget.questionCount`,
// which the server persists as `targetCount`). On early-quit, this reads
// as "5 of 10 — you ended early" instead of the misleading "5 of 5
// attempted = 100%" that `servedCount` would produce.
//
// IN_PROGRESS retry guard from v1.1 stays unchanged: if the first
// session() fetch returns IN_PROGRESS we retry once after 500ms to
// let the sessionDone-409 → completion write settle.

import 'dart:async';

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../api/api_client.dart';
import '../../auth/auth_client.dart';
import '../../quiz/quiz_client.dart';
import 'vidya_insights_screen.dart';

class VidyaPracticeResultScreen extends StatefulWidget {
  final QuizClient client;
  final AuthClient auth;
  final String sessionId;
  final VoidCallback onDone;

  const VidyaPracticeResultScreen({
    super.key,
    required this.client,
    required this.auth,
    required this.sessionId,
    required this.onDone,
  });

  @override
  State<VidyaPracticeResultScreen> createState() =>
      _VidyaPracticeResultScreenState();
}

/// Single row of the BY TOPIC breakdown. Pure-record shape so the
/// `computeTopicBreakdown` helper can be unit-tested without touching
/// widget land.
typedef TopicBreakdownRow = ({String topicId, int correct, int total});

/// Groups items by (effective) topicId and returns ordered rows.
///
/// Effective topicId per item is `item.topicId ?? fallbackTopicId`.
/// "Correct" check prefers `item.isCorrect` when present; falls back
/// to `correctIdx == answerIdx` for older payloads.
///
/// Order: total descending (most-attempted first), tie-break topicId
/// ascending lexical. The plan calls for alphabetical-by-label as the
/// tiebreaker, but labels arrive asynchronously — sorting by topicId
/// gives a deterministic order at render time and avoids re-shuffling
/// rows once labels resolve.
@visibleForTesting
List<TopicBreakdownRow> computeTopicBreakdown(
  List<QuizItemSummary> items, {
  String? fallbackTopicId,
}) {
  if (items.isEmpty) return const [];
  final correctByTopic = <String, int>{};
  final totalByTopic = <String, int>{};
  for (final it in items) {
    final tid = it.topicId ?? fallbackTopicId;
    if (tid == null) continue;
    totalByTopic[tid] = (totalByTopic[tid] ?? 0) + 1;
    final ok = it.isCorrect ??
        (it.correctIdx != null &&
            it.answerIdx != null &&
            it.correctIdx == it.answerIdx);
    if (ok) {
      correctByTopic[tid] = (correctByTopic[tid] ?? 0) + 1;
    }
  }
  final rows = <TopicBreakdownRow>[
    for (final tid in totalByTopic.keys)
      (
        topicId: tid,
        correct: correctByTopic[tid] ?? 0,
        total: totalByTopic[tid] ?? 0,
      ),
  ]..sort((a, b) {
      final c = b.total.compareTo(a.total);
      return c != 0 ? c : a.topicId.compareTo(b.topicId);
    });
  return rows;
}

class _VidyaPracticeResultScreenState
    extends State<VidyaPracticeResultScreen> {
  QuizSessionDetail? _summary;
  List<TopicBreakdownRow> _breakdown = const [];
  Map<String, String> _topicLabels = const {};
  String? _error;

  /// Phase 3c.full v1.1 — single-shot guard against the race where the
  /// session screen pushes us here via the sessionDone-409 completion path
  /// before the server has finished writing the COMPLETED status. We retry
  /// `session()` once after a short delay; if the second fetch still isn't
  /// terminal we render anyway (best-effort). v2 should consider a proper
  /// state machine if this becomes a real problem in production.
  bool _didRetryStatus = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final s = await widget.client.session(widget.sessionId);
      // If the session hasn't been marked COMPLETED yet (race with the
      // sessionDone-409 completion path in the session screen), retry
      // once after 500ms. EXPIRED is also terminal — don't retry on it.
      // Best-effort; v2 should consider a real state machine.
      if (s.status != 'COMPLETED' &&
          s.status != 'EXPIRED' &&
          !_didRetryStatus) {
        _didRetryStatus = true;
        await Future<void>.delayed(const Duration(milliseconds: 500));
        if (!mounted) return;
        return _load();
      }
      if (!mounted) return;
      final breakdown = computeTopicBreakdown(
        s.items,
        fallbackTopicId: s.topicId,
      );
      setState(() {
        _summary = s;
        _breakdown = breakdown;
      });
      if (breakdown.isNotEmpty) {
        // Fire-and-forget — labels arrive later. The breakdown rows
        // render with raw topicIds until labels resolve, and the
        // Insights CTA is independent of label state.
        unawaited(_resolveLabels(breakdown.map((r) => r.topicId).toList()));
      }
    } on QuizError catch (e) {
      if (mounted) {
        setState(() => _error = "We couldn't load your result. ${e.message}");
      }
    } catch (_) {
      if (mounted) {
        setState(() => _error = "We couldn't load your result.");
      }
    }
  }

  Future<void> _resolveLabels(List<String> topicIds) async {
    final api = ApiClient(widget.auth);
    try {
      final results = await Future.wait(
        topicIds.map((id) async {
          try {
            final t = await api.topic(id);
            return MapEntry(id, t?.title);
          } catch (_) {
            return MapEntry(id, null);
          }
        }),
        eagerError: false,
      );
      if (!mounted) return;
      final next = <String, String>{};
      for (final e in results) {
        final v = e.value;
        if (v != null && v.isNotEmpty) next[e.key] = v;
      }
      if (next.isNotEmpty) setState(() => _topicLabels = next);
    } catch (_) {
      // Best-effort — rows already render with topicIds as labels.
    }
  }

  Future<void> _retry() async {
    setState(() {
      _error = null;
      _didRetryStatus = false;
    });
    await _load();
  }

  void _onSeeInsights() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => VidyaInsightsScreen(auth: widget.auth),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = VidyaThemeData.of(context);
    final muted = theme.ink3;
    final accent = theme.accent;

    if (_error != null && _summary == null) {
      return VidyaScaffold(
        appBar: VidyaAppBar(title: ''),
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
                label: 'Done',
                style: VidyaButtonStyle.ghost,
                onPressed: widget.onDone,
                size: VidyaButtonSize.lg,
              ),
            ],
          ),
        ),
      );
    }

    if (_summary == null) {
      // Layout matches the final state: small eyebrow rectangle + larger
      // number block. Keeps loading visually homogeneous with the rest
      // of the Vidya catalogue (Home, Insights, Study, Subject Detail).
      return VidyaScaffold(
        appBar: VidyaAppBar(title: ''),
        body: Padding(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: const [
              SizedBox(height: 24),
              VidyaSkeletonBlock(width: 140, height: 14),
              SizedBox(height: 24),
              VidyaSkeletonBlock(width: 200, height: 64),
            ],
          ),
        ),
      );
    }

    final s = _summary!;
    return VidyaScaffold(
      appBar: VidyaAppBar(title: ''),
      body: Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
        child: ListView(
          children: [
            const SizedBox(height: 24),
            Text(
              'PRACTICE COMPLETE',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontFamily: VidyaFonts.mono,
                fontSize: 12,
                color: muted,
                letterSpacing: 1.8,
              ),
            ),
            const SizedBox(height: 24),
            Text(
              '${s.correctCount} / ${s.targetCount}',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontFamily: VidyaFonts.display,
                fontSize: 64,
                fontWeight: FontWeight.w600,
                color: accent,
                height: 1.1,
              ),
            ),
            // Hide the breakdown when there's only one row — it would
            // render directly under the big score and read as
            // `Mechanics  7 / 10` under `7 / 10`, adding zero info.
            // Today the backend `itemSummary` doesn't emit per-item
            // topicId, so all PRACTICE sessions collapse to one row;
            // multi-row will light up automatically once the Go
            // `itemSummary` struct serialises topicId per item.
            if (_breakdown.length >= 2) ...[
              const SizedBox(height: 32),
              Text(
                'BY TOPIC',
                style: TextStyle(
                  fontFamily: VidyaFonts.mono,
                  fontSize: 11,
                  color: muted,
                  letterSpacing: 1.5,
                ),
              ),
              const SizedBox(height: 12),
              for (final row in _breakdown)
                _TopicBreakdownRow(
                  row: row,
                  label: _topicLabels[row.topicId] ?? row.topicId,
                ),
            ],
            const SizedBox(height: 16),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                key: const Key('vidya.practice.result.see-insights'),
                onPressed: _onSeeInsights,
                child: Text(
                  'See updated insights →',
                  style: TextStyle(
                    fontFamily: VidyaFonts.ui,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: accent,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 24),
            VidyaButton(
              key: const Key('vidya.practice.result.done'),
              label: 'Done',
              onPressed: widget.onDone,
              size: VidyaButtonSize.lg,
            ),
          ],
        ),
      ),
    );
  }
}

class _TopicBreakdownRow extends StatelessWidget {
  final TopicBreakdownRow row;
  final String label;
  const _TopicBreakdownRow({required this.row, required this.label});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                fontFamily: VidyaFonts.ui,
                fontSize: 15,
                color: v.ink,
                fontWeight: FontWeight.w500,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          const SizedBox(width: 12),
          Text(
            '${row.correct} / ${row.total}',
            style: TextStyle(
              fontFamily: VidyaFonts.mono,
              fontSize: 14,
              color: v.ink2,
            ),
          ),
        ],
      ),
    );
  }
}
