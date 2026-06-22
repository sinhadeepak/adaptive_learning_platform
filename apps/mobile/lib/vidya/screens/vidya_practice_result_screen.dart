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
//   - "See updated insights →" deep-link that switches the parent
//     VidyaMainShell to the Insights tab (canonical cross-tab pattern,
//     see vidya_home_screen.dart). Unwinds the Practice navigator
//     stack via onDone() so the back button doesn't return here.
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
import '../../quiz/quiz_client.dart';
import '../shell/vidya_main_shell_scope.dart';

class VidyaPracticeResultScreen extends StatefulWidget {
  final QuizClient client;
  final String sessionId;
  final VoidCallback onDone;

  const VidyaPracticeResultScreen({
    super.key,
    required this.client,
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
    final api = ApiClient(widget.client.auth);
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
    // Cross-tab handoff — matches the canonical pattern in
    // vidya_home_screen.dart (lines 102 / 169-170). Switching the
    // parent VidyaMainShell's IndexedStack lands the user on the
    // Insights tab WITH the bottom nav, avoiding a duplicate Insights
    // instance nested inside the Practice tab's navigator. Then unwind
    // the Practice stack via onDone() so the back button doesn't
    // return to this stale result screen.
    final scope = VidyaMainShellScope.of(context);
    if (scope != null) {
      scope.switchTo(VidyaShellTab.insights);
      widget.onDone();
    }
  }

  /// Opens a Vidya-styled bottom sheet with the full question stem,
  /// the chosen vs correct option (when choices are present) and the
  /// explanation. Mirrors the Aurora detail drawer but in Vidya tokens.
  Future<void> _openItemDrawer(QuizItemSummary item) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _ReviewDrawer(item: item),
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
    // Derived counts for the KPI row. Prefer the per-item summaries when
    // present (most precise); fall back to session-level counts when the
    // backend doesn't emit items on this endpoint.
    final answeredItems = s.items.where((i) => i.answered).toList();
    final wrong = s.items.isNotEmpty
        ? answeredItems.where((i) => i.isCorrect == false).length
        : (s.servedCount - s.correctCount).clamp(0, s.servedCount);
    final skipped = s.items.isNotEmpty
        ? (s.targetCount - answeredItems.length).clamp(0, s.targetCount)
        : (s.targetCount - s.servedCount).clamp(0, s.targetCount);
    final accuracyPct =
        s.servedCount > 0 ? ((s.correctCount / s.servedCount) * 100).round() : 0;

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
            const SizedBox(height: 24),
            _KpiRow(
              correct: s.correctCount,
              wrong: wrong,
              skipped: skipped,
              accuracyPct: accuracyPct,
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
            // Per-question review — only when the backend emits item
            // summaries (stems come from there). Tapping a row opens a
            // drawer with the full stem.
            if (s.items.isNotEmpty) ...[
              const SizedBox(height: 32),
              Row(
                children: [
                  Text(
                    'REVIEW QUESTIONS',
                    style: TextStyle(
                      fontFamily: VidyaFonts.mono,
                      fontSize: 11,
                      color: muted,
                      letterSpacing: 1.5,
                    ),
                  ),
                  const Spacer(),
                  Text(
                    '${s.items.length} item${s.items.length == 1 ? '' : 's'}',
                    style: TextStyle(
                      fontFamily: VidyaFonts.mono,
                      fontSize: 11,
                      color: muted,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              for (final it in s.items)
                _ReviewRow(item: it, onTap: () => _openItemDrawer(it)),
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

/// Four-up KPI tiles under the big score: Correct / Wrong / Skipped /
/// Accuracy. Colours come from the Vidya semantic palette (good / bad /
/// muted / accent).
class _KpiRow extends StatelessWidget {
  const _KpiRow({
    required this.correct,
    required this.wrong,
    required this.skipped,
    required this.accuracyPct,
  });
  final int correct;
  final int wrong;
  final int skipped;
  final int accuracyPct;

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return Row(
      children: [
        _KpiTile(value: '$correct', label: 'Correct', tone: v.good),
        const SizedBox(width: 10),
        _KpiTile(value: '$wrong', label: 'Wrong', tone: v.bad),
        const SizedBox(width: 10),
        _KpiTile(value: '$skipped', label: 'Skipped', tone: v.ink3),
        const SizedBox(width: 10),
        _KpiTile(value: '$accuracyPct%', label: 'Accuracy', tone: v.accent),
      ],
    );
  }
}

class _KpiTile extends StatelessWidget {
  const _KpiTile({required this.value, required this.label, required this.tone});
  final String value;
  final String label;
  final Color tone;

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 6),
        decoration: BoxDecoration(
          color: v.ink3.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          children: [
            Text(
              value,
              style: TextStyle(
                fontFamily: VidyaFonts.display,
                fontSize: 22,
                fontWeight: FontWeight.w600,
                color: tone,
                height: 1,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: TextStyle(
                fontFamily: VidyaFonts.ui,
                fontSize: 11,
                color: v.ink3,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Compact resolution for an item's status — single source of truth for
/// the label + colour used by both the row and the drawer.
({String label, Color tone}) _statusOf(QuizItemSummary item, VidyaThemeData v) {
  if (!item.answered) return (label: 'SKIPPED', tone: v.ink3);
  if (item.isCorrect == true) return (label: 'CORRECT', tone: v.good);
  return (label: 'WRONG', tone: v.bad);
}

/// One tappable review row: Q-number, status chip, truncated stem.
class _ReviewRow extends StatelessWidget {
  const _ReviewRow({required this.item, required this.onTap});
  final QuizItemSummary item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final status = _statusOf(item, v);
    final stem = (item.stem ?? '').trim();
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: VidyaCard(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(8),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: 32,
                child: Text(
                  'Q${item.itemIdx + 1}',
                  style: TextStyle(
                    fontFamily: VidyaFonts.mono,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: v.ink3,
                  ),
                ),
              ),
              _StatusChip(label: status.label, tone: status.tone),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  stem.isEmpty ? '—' : stem,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontFamily: VidyaFonts.ui,
                    fontSize: 13,
                    height: 1.35,
                    color: v.ink2,
                  ),
                ),
              ),
              Icon(Icons.chevron_right, size: 18, color: v.ink3),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.label, required this.tone});
  final String label;
  final Color tone;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: tone.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontFamily: VidyaFonts.mono,
          fontSize: 10,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.5,
          color: tone,
        ),
      ),
    );
  }
}

/// Bottom-sheet drawer for one reviewed question: full stem, the chosen
/// vs correct option (when choices are present) and the explanation.
class _ReviewDrawer extends StatelessWidget {
  const _ReviewDrawer({required this.item});
  final QuizItemSummary item;

  String _letter(int? idx) =>
      idx != null && idx >= 0 ? String.fromCharCode(65 + idx) : '—';

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final status = _statusOf(item, v);
    final stem = (item.stem ?? '').trim();
    final choices = item.choices ?? const [];
    final explanation = (item.explanation ?? '').trim();

    return DraggableScrollableSheet(
      initialChildSize: 0.55,
      minChildSize: 0.3,
      maxChildSize: 0.92,
      expand: false,
      builder: (ctx, scrollCtrl) => Container(
        decoration: BoxDecoration(
          color: v.paper,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(
          children: [
            Container(
              margin: const EdgeInsets.symmetric(vertical: 8),
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: v.ink3.withValues(alpha: 0.4),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Expanded(
              child: ListView(
                controller: scrollCtrl,
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                children: [
                  Row(
                    children: [
                      Text(
                        'Q${item.itemIdx + 1}',
                        style: TextStyle(
                          fontFamily: VidyaFonts.display,
                          fontSize: 20,
                          fontWeight: FontWeight.w600,
                          color: v.ink,
                        ),
                      ),
                      const SizedBox(width: 10),
                      _StatusChip(label: status.label, tone: status.tone),
                    ],
                  ),
                  const SizedBox(height: 14),
                  Text(
                    stem.isEmpty ? 'No question text available.' : stem,
                    style: TextStyle(
                      fontFamily: VidyaFonts.ui,
                      fontSize: 15,
                      height: 1.45,
                      color: v.ink,
                    ),
                  ),
                  if (choices.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    for (var i = 0; i < choices.length; i++)
                      _DrawerChoice(
                        letter: String.fromCharCode(65 + i),
                        text: choices[i],
                        isCorrect: item.correctIdx == i,
                        isChosenWrong:
                            item.answerIdx == i && item.isCorrect == false,
                      ),
                  ] else if (item.answered) ...[
                    const SizedBox(height: 12),
                    Text(
                      'Your answer: ${_letter(item.answerIdx)}'
                      '   ·   Correct: ${_letter(item.correctIdx)}',
                      style: TextStyle(
                        fontFamily: VidyaFonts.mono,
                        fontSize: 13,
                        color: v.ink2,
                      ),
                    ),
                  ],
                  if (explanation.isNotEmpty) ...[
                    const SizedBox(height: 18),
                    Text(
                      'EXPLANATION',
                      style: TextStyle(
                        fontFamily: VidyaFonts.mono,
                        fontSize: 11,
                        color: v.ink3,
                        letterSpacing: 1.5,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      explanation,
                      style: TextStyle(
                        fontFamily: VidyaFonts.ui,
                        fontSize: 14,
                        height: 1.5,
                        color: v.ink2,
                      ),
                    ),
                  ],
                  const SizedBox(height: 16),
                  VidyaButton(
                    label: 'Close',
                    style: VidyaButtonStyle.ghost,
                    onPressed: () => Navigator.of(context).pop(),
                    size: VidyaButtonSize.lg,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DrawerChoice extends StatelessWidget {
  const _DrawerChoice({
    required this.letter,
    required this.text,
    required this.isCorrect,
    required this.isChosenWrong,
  });
  final String letter;
  final String text;
  final bool isCorrect;
  final bool isChosenWrong;

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final tone = isCorrect
        ? v.good
        : isChosenWrong
            ? v.bad
            : v.ink3;
    final highlighted = isCorrect || isChosenWrong;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: highlighted ? tone.withValues(alpha: 0.10) : null,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: highlighted ? tone : v.ink3.withValues(alpha: 0.2),
        ),
      ),
      child: Row(
        children: [
          Text(
            '$letter.',
            style: TextStyle(
              fontFamily: VidyaFonts.ui,
              fontWeight: FontWeight.w700,
              color: tone,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                fontFamily: VidyaFonts.ui,
                fontSize: 14,
                color: v.ink,
              ),
            ),
          ),
          if (isCorrect) Icon(Icons.check, size: 18, color: v.good),
          if (isChosenWrong) Icon(Icons.close, size: 18, color: v.bad),
        ],
      ),
    );
  }
}
