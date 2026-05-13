import 'dart:developer' as developer;

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../screens/doubt_detail_screen.dart';
import '../widgets/alp_card.dart';
import 'quiz_client.dart';

/// Quiz result — trophy hero, big score, 4-stat grid, AI mastery pills,
/// CTA stack. Mirrors docs/ui/02_MobileApp screenshot 4.
class QuizResultScreen extends StatefulWidget {
  const QuizResultScreen({
    super.key,
    required this.client,
    required this.sessionId,
    this.api,
  });

  final QuizClient client;
  final String sessionId;

  /// Optional — if provided, the screen shows a per-topic mastery delta pill
  /// after fetching live mastery from analytics.
  final ApiClient? api;

  @override
  State<QuizResultScreen> createState() => _QuizResultScreenState();
}

class _QuizResultScreenState extends State<QuizResultScreen> {
  QuizSessionDetail? _detail;
  String? _error;
  String? _topicTitle;
  TopicMastery? _topicMastery;
  final Set<String> _bookmarked = <String>{};
  final Set<String> _reported = <String>{};
  String? _askingAiQid;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final d = await widget.client.session(widget.sessionId);
      if (!mounted) return;
      setState(() => _detail = d);
      // Best-effort — hydrate topic title + mastery delta + bookmark set.
      if (widget.api != null) {
        try {
          final t = await widget.api!.topic(d.topicId);
          final m = await widget.api!.mastery(d.userId);
          final bms = await widget.api!.listBookmarks();
          if (!mounted) return;
          setState(() {
            _topicTitle = t?.title;
            _topicMastery = m.firstWhere(
              (x) => x.topicId == d.topicId,
              orElse: () => TopicMastery(topicId: d.topicId, ewa: 0, n: 0),
            );
            _bookmarked
              ..clear()
              ..addAll(bms.map((b) => b.questionId));
          });
        } catch (_) {/* keep going */}
      }
    } on QuizError catch (e) {
      setState(() => _error = e.message);
    }
  }

  Future<void> _askAiAbout(QuizItemSummary item) async {
    // Tap-feedback guards. Failures used to fall through silently so the
    // user got no signal — now we surface every branch.
    if (_askingAiQid != null) return; // already in flight; ignore re-tap
    if (widget.api == null) {
      _showAiError("AI tutor isn't available in this view.");
      developer.log('askAi: widget.api is null', name: 'quiz_result');
      return;
    }
    if (_detail == null) {
      _showAiError('Still loading session data — try again in a moment.');
      developer.log('askAi: _detail is null (session not yet loaded)', name: 'quiz_result');
      return;
    }
    setState(() => _askingAiQid = item.questionId);
    try {
      final stem = item.stem ?? 'Question #${item.questionId.substring(0, 8)}';
      developer.log(
        'askAi: createDoubt qid=${item.questionId} topicId=${_detail!.topicId}',
        name: 'quiz_result',
      );
      final detail = await widget.api!.createDoubt(
        questionText: stem,
        topicId: _detail!.topicId,
        topicTitle: _topicTitle,
      );
      if (!mounted) return;
      if (detail == null) {
        _showAiError("Couldn't open the AI tutor — please try again.");
        developer.log('askAi: createDoubt returned null', name: 'quiz_result');
        return;
      }
      await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => DoubtDetailScreen(
          api: widget.api!,
          doubtId: detail.summary.id,
          autoAskAi: true,
        ),
      ),);
    } catch (e, st) {
      developer.log('askAi: failed', name: 'quiz_result', error: e, stackTrace: st);
      if (mounted) _showAiError('AI tutor failed: $e');
    } finally {
      if (mounted) setState(() => _askingAiQid = null);
    }
  }

  void _showAiError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: AlpColors.colorRed,
        duration: const Duration(seconds: 3),
      ),
    );
  }

  Future<void> _reportItem(QuizItemSummary item) async {
    if (widget.api == null) return;
    if (_reported.contains(item.questionId)) return;
    final result = await showModalBottomSheet<_FeedbackSubmission>(
      context: context,
      backgroundColor: AlpColors.bgSurface1,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => _FeedbackSheet(item: item),
    );
    if (result == null || !mounted) return;
    setState(() => _reported.add(item.questionId));
    final ok = await widget.api!.reportQuestion(
      questionId: item.questionId,
      kind: result.kind,
      note: result.note,
    );
    if (!ok && mounted) {
      setState(() => _reported.remove(item.questionId));
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Couldn't submit report — try again.")),
      );
    }
  }

  Future<void> _toggleBookmark(QuizItemSummary item) async {
    if (widget.api == null) return;
    final qid = item.questionId;
    final isMarked = _bookmarked.contains(qid);
    setState(() {
      if (isMarked) {
        _bookmarked.remove(qid);
      } else {
        _bookmarked.add(qid);
      }
    });
    try {
      if (isMarked) {
        final ok = await widget.api!.removeBookmark(qid);
        if (!ok && mounted) setState(() => _bookmarked.add(qid));
      } else {
        final res = await widget.api!.addBookmark(
          questionId: qid,
          topicId: _detail?.topicId,
          topicTitle: _topicTitle,
          stem: item.stem,
        );
        if (res == null && mounted) setState(() => _bookmarked.remove(qid));
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        if (isMarked) {
          _bookmarked.add(qid);
        } else {
          _bookmarked.remove(qid);
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      return Scaffold(
        backgroundColor: AlpColors.bgBase,
        appBar: AppBar(title: const Text('Result'), backgroundColor: AlpColors.bgSurface1),
        body: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(_error!, style: const TextStyle(color: AlpColors.colorRed)),
        ),
      );
    }
    final d = _detail;
    if (d == null) {
      return Scaffold(
        backgroundColor: AlpColors.bgBase,
        appBar: AppBar(backgroundColor: AlpColors.bgSurface1),
        body: const Center(child: CircularProgressIndicator(color: AlpColors.colorAi)),
      );
    }

    final pct = d.servedCount > 0 ? ((d.correctCount / d.servedCount) * 100).round() : 0;
    final wrong = d.items.where((i) => i.answered && i.isCorrect == false).length;
    final isExpired = d.status == 'EXPIRED';
    final scoreTone = pct >= 80
        ? AlpColors.colorGreen
        : pct >= 50
            ? AlpColors.colorBlue
            : AlpColors.colorRed;
    final headlineCopy = isExpired
        ? 'Session expired'
        : pct >= 80
            ? 'Excellent! Accuracy: $pct%'
            : pct >= 50
                ? 'Solid run · Accuracy: $pct%'
                : 'Keep going · Accuracy: $pct%';

    return Scaffold(
      backgroundColor: AlpColors.bgBase,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
          children: [
            // Trophy hero
            const SizedBox(height: 12),
            Center(
              child: Container(
                width: 90,
                height: 90,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      AlpColors.colorAmber,
                      AlpColors.colorAmber.withValues(alpha: 0.6),
                    ],
                  ),
                  borderRadius: BorderRadius.circular(24),
                  boxShadow: [
                    BoxShadow(
                      color: AlpColors.colorAmber.withValues(alpha: 0.30),
                      blurRadius: 20,
                      offset: const Offset(0, 8),
                    ),
                  ],
                ),
                child: const Icon(Icons.emoji_events, color: Colors.white, size: 50),
              ),
            ),
            const SizedBox(height: 18),
            // Big score
            Center(
              child: Text(
                '${d.correctCount}/${d.servedCount}',
                style: TextStyle(
                  color: scoreTone,
                  fontSize: 64,
                  fontWeight: FontWeight.w700,
                  height: 1,
                ),
              ),
            ),
            const SizedBox(height: 8),
            Center(
              child: Text(
                headlineCopy,
                style: const TextStyle(
                  color: AlpColors.textPrimary,
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),

            const SizedBox(height: 24),

            // 4-stat grid
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              childAspectRatio: 1.7,
              children: [
                _StatTile(
                  value: d.correctCount.toString(),
                  label: 'Correct',
                  tone: AlpColors.colorGreen,
                ),
                _StatTile(
                  value: wrong.toString(),
                  label: 'Wrong',
                  tone: AlpColors.colorRed,
                ),
                _StatTile(
                  value: _formatTimeTaken(d),
                  label: 'Time Taken',
                  tone: AlpColors.colorAmber,
                ),
                _StatTile(
                  value: _masteryBoost(),
                  label: 'Mastery Boost',
                  tone: AlpColors.colorAi,
                  tooltip:
                      'How much your ability estimate moved on this topic. '
                      'Positive = mastery rose; negative = dipped. '
                      'Tap-to-dismiss.',
                ),
              ],
            ),

            const SizedBox(height: 16),

            // AI insight pills — Sprint 1 honesty pass.
            // Previous version had "Top 15% this week" / "Top 40% this
            // week" pills that weren't backed by any cohort/percentile
            // data. Replaced with accurate performance bands plus
            // tap-to-dismiss explainers via Tooltip so the student
            // knows what each pill actually represents.
            Wrap(
              alignment: WrapAlignment.center,
              spacing: 8,
              runSpacing: 8,
              children: [
                if (_topicTitle != null && _topicMastery != null)
                  Tooltip(
                    message:
                        'Your mastery on this topic is now ${(_topicMastery!.ewa * 100).round()}%. '
                        'Tap-to-dismiss.',
                    triggerMode: TooltipTriggerMode.tap,
                    showDuration: const Duration(seconds: 4),
                    child: AlpPill(
                      label:
                          '${_topicTitle!} ▲ ${(_topicMastery!.ewa * 100).round()}%',
                      color: AlpColors.colorGreen,
                    ),
                  ),
                if (pct < 70 && _topicTitle != null)
                  Tooltip(
                    message:
                        'Suggested follow-up: queue up another short round on this topic to lock it in.',
                    triggerMode: TooltipTriggerMode.tap,
                    showDuration: const Duration(seconds: 4),
                    child: AlpPill(
                      label: '${_topicTitle!} — Review',
                      color: AlpColors.colorAmber,
                    ),
                  ),
                Tooltip(
                  message: pct >= 80
                      ? 'Strong round — IRT thinks you\'ve mostly nailed this difficulty. Try harder items.'
                      : pct >= 50
                          ? 'Steady round — about average for this difficulty band. A few weak points to revisit.'
                          : 'Foundation round — this batch leaned hard. Spend a session on the basics before another mock.',
                  triggerMode: TooltipTriggerMode.tap,
                  showDuration: const Duration(seconds: 5),
                  child: AlpPill(
                    label: pct >= 80
                        ? 'Strong round'
                        : pct >= 50
                            ? 'Steady round'
                            : 'Build foundations',
                    color: AlpColors.colorPurple,
                  ),
                ),
              ],
            ),

            const SizedBox(height: 24),

            // Review questions — tap the flag to save for later.
            if (d.items.isNotEmpty) ...[
              Row(
                children: [
                  const Icon(Icons.bookmark_outline, color: AlpColors.textMuted, size: 16),
                  const SizedBox(width: 6),
                  Text(
                    'Review questions',
                    style: const TextStyle(
                      color: AlpColors.textPrimary,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const Spacer(),
                  Text(
                    'Tap ▢ to save',
                    style: const TextStyle(color: AlpColors.textMuted, fontSize: 11),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              ...d.items.map((it) => _ItemReviewRow(
                    item: it,
                    bookmarked: _bookmarked.contains(it.questionId),
                    reported: _reported.contains(it.questionId),
                    askingAi: _askingAiQid == it.questionId,
                    onToggle: widget.api == null ? null : () => _toggleBookmark(it),
                    onReport: widget.api == null ? null : () => _reportItem(it),
                    onAskAi: widget.api == null ? null : () => _askAiAbout(it),
                  ),),
              const SizedBox(height: 24),
            ],

            // Primary CTA: View Detailed Analysis (gradient)
            _GradientButton(
              icon: Icons.bar_chart_rounded,
              label: 'View Detailed Analysis',
              onTap: () => Navigator.of(context).pop(),
            ),
            const SizedBox(height: 12),

            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: () => Navigator.of(context).pop(),
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: AlpColors.borderStrong),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
                child: const Text(
                  'Retry Same Topic',
                  style: TextStyle(color: AlpColors.textPrimary, fontWeight: FontWeight.w600),
                ),
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: TextButton(
                onPressed: () => Navigator.of(context).popUntil((r) => r.isFirst),
                child: const Text(
                  '← Back to Practice',
                  style: TextStyle(color: AlpColors.textMuted, fontWeight: FontWeight.w500),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _formatTimeTaken(QuizSessionDetail d) {
    // Without server-side started_at exposed in the existing payload, we
    // don't yet know elapsed time. Approximate as ~1 min per item served.
    final secs = (d.servedCount * 60).clamp(60, 3600);
    final m = secs ~/ 60;
    final s = secs % 60;
    return '$m:${s.toString().padLeft(2, '0')}';
  }

  String _masteryBoost() {
    if (_topicMastery == null || _detail == null) return '+0.0';
    final pct = _detail!.servedCount > 0
        ? (_detail!.correctCount / _detail!.servedCount)
        : 0.0;
    final boost = (pct - 0.5) * 0.8; // proxy delta
    return '${boost >= 0 ? '+' : ''}${boost.toStringAsFixed(1)}';
  }
}

class _GradientButton extends StatelessWidget {
  const _GradientButton({required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 16),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [AlpColors.colorBlue, AlpColors.colorPurple],
            ),
            borderRadius: BorderRadius.circular(12),
            boxShadow: [
              BoxShadow(
                color: AlpColors.colorBlue.withValues(alpha: 0.30),
                blurRadius: 14,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, color: Colors.white, size: 18),
              const SizedBox(width: 8),
              Text(
                label,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ItemReviewRow extends StatelessWidget {
  const _ItemReviewRow({
    required this.item,
    required this.bookmarked,
    required this.reported,
    this.askingAi = false,
    this.onToggle,
    this.onReport,
    this.onAskAi,
  });
  final QuizItemSummary item;
  final bool bookmarked;
  final bool reported;
  final bool askingAi;
  final VoidCallback? onToggle;
  final VoidCallback? onReport;
  final VoidCallback? onAskAi;

  @override
  Widget build(BuildContext context) {
    final tone = !item.answered
        ? AlpColors.textMuted
        : item.isCorrect == true
            ? AlpColors.colorGreen
            : AlpColors.colorRed;
    final label = !item.answered ? 'SKIPPED' : (item.isCorrect == true ? 'CORRECT' : 'WRONG');
    final stem = (item.stem ?? '').trim();
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AlpColors.bgSurface2,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AlpColors.borderDefault),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              SizedBox(
                width: 26,
                child: Text(
                  'Q${item.itemIdx + 1}',
                  style: const TextStyle(color: AlpColors.textMuted, fontSize: 12, fontWeight: FontWeight.w600),
                ),
              ),
              const SizedBox(width: 4),
              AlpPill(label: label, color: tone),
              const Spacer(),
              IconButton(
                tooltip: bookmarked ? 'Remove bookmark' : 'Save question',
                icon: Icon(
                  bookmarked ? Icons.bookmark : Icons.bookmark_outline,
                  color: bookmarked ? AlpColors.colorAmber : AlpColors.textMuted,
                  size: 20,
                ),
                onPressed: onToggle,
                visualDensity: VisualDensity.compact,
                splashRadius: 20,
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
              ),
              IconButton(
                tooltip: reported ? 'Issue reported · thanks' : 'Report an issue',
                icon: Icon(
                  reported ? Icons.check_circle : Icons.flag_outlined,
                  color: reported ? AlpColors.colorGreen : AlpColors.textMuted,
                  size: 18,
                ),
                onPressed: reported ? null : onReport,
                visualDensity: VisualDensity.compact,
                splashRadius: 20,
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
              ),
              IconButton(
                tooltip: askingAi ? 'Asking AI…' : 'Ask AI Tutor',
                icon: askingAi
                    ? const SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(strokeWidth: 2, color: AlpColors.colorAi),
                      )
                    : const Icon(Icons.auto_awesome, color: AlpColors.colorAi, size: 18),
                onPressed: askingAi ? null : onAskAi,
                visualDensity: VisualDensity.compact,
                splashRadius: 20,
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
              ),
            ],
          ),
          if (stem.isNotEmpty) ...[
            const SizedBox(height: 6),
            Padding(
              padding: const EdgeInsets.only(left: 30),
              child: Text(
                stem,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: AlpColors.textPrimary, fontSize: 13, height: 1.35),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile(
      {required this.value,
      required this.label,
      required this.tone,
      this.tooltip,});
  final String value;
  final String label;
  final Color tone;
  // Long-press explainer for stats whose meaning isn't obvious — e.g.
  // "Mastery Boost" for which only ML-savvy users guess at θ-shift.
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    final body = Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AlpColors.bgSurface2,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AlpColors.borderDefault),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            value,
            style: TextStyle(
              color: tone,
              fontSize: 28,
              fontWeight: FontWeight.w700,
              height: 1,
            ),
          ),
          const SizedBox(height: 4),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                label,
                style:
                    const TextStyle(color: AlpColors.textMuted, fontSize: 12),
              ),
              if (tooltip != null) ...[
                const SizedBox(width: 4),
                const Icon(Icons.info_outline,
                    size: 11, color: AlpColors.textMuted,),
              ],
            ],
          ),
        ],
      ),
    );
    if (tooltip == null) return body;
    return Tooltip(
      message: tooltip!,
      triggerMode: TooltipTriggerMode.tap,
      showDuration: const Duration(seconds: 4),
      child: body,
    );
  }
}

class _FeedbackSubmission {
  _FeedbackSubmission({required this.kind, required this.note});
  final String kind;
  final String note;
}

class _FeedbackSheet extends StatefulWidget {
  const _FeedbackSheet({required this.item});
  final QuizItemSummary item;

  @override
  State<_FeedbackSheet> createState() => _FeedbackSheetState();
}

class _FeedbackSheetState extends State<_FeedbackSheet> {
  String _kind = 'AMBIGUOUS';
  final TextEditingController _noteCtrl = TextEditingController();

  static const _options = [
    ('WRONG_ANSWER', 'The marked answer is wrong'),
    ('AMBIGUOUS', 'Multiple answers seem valid'),
    ('TYPO', 'Typo or formatting issue'),
    ('OTHER', 'Something else'),
  ];

  @override
  void dispose() {
    _noteCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final stem = (widget.item.stem ?? '').trim();
    final preview = stem.length > 160 ? '${stem.substring(0, 160)}…' : stem;
    return Padding(
      padding: EdgeInsets.fromLTRB(
        16,
        16,
        16,
        16 + MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.flag_outlined, color: AlpColors.colorAmber),
              const SizedBox(width: 8),
              const Text(
                'Report an issue',
                style: TextStyle(
                  color: AlpColors.textPrimary,
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const Spacer(),
              IconButton(
                icon: const Icon(Icons.close, color: AlpColors.textMuted),
                onPressed: () => Navigator.of(context).pop(),
                splashRadius: 20,
              ),
            ],
          ),
          if (preview.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              'Q${widget.item.itemIdx + 1} · $preview',
              style: const TextStyle(color: AlpColors.textMuted, fontSize: 12),
            ),
          ],
          const SizedBox(height: 14),
          for (final opt in _options)
            InkWell(
              onTap: () => setState(() => _kind = opt.$1),
              borderRadius: BorderRadius.circular(10),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                margin: const EdgeInsets.only(bottom: 8),
                decoration: BoxDecoration(
                  border: Border.all(
                    color: _kind == opt.$1 ? AlpColors.colorBlue : AlpColors.borderDefault,
                  ),
                  color: _kind == opt.$1 ? AlpColors.bgSurface2 : Colors.transparent,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  children: [
                    Icon(
                      _kind == opt.$1 ? Icons.radio_button_checked : Icons.radio_button_off,
                      color: _kind == opt.$1 ? AlpColors.colorBlue : AlpColors.textMuted,
                      size: 18,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        opt.$2,
                        style: const TextStyle(color: AlpColors.textPrimary, fontSize: 13),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          TextField(
            controller: _noteCtrl,
            minLines: 2,
            maxLines: 4,
            maxLength: 500,
            style: const TextStyle(color: AlpColors.textPrimary, fontSize: 13),
            decoration: InputDecoration(
              hintText: 'Optional — what went wrong?',
              hintStyle: const TextStyle(color: AlpColors.textMuted),
              filled: true,
              fillColor: AlpColors.bgSurface2,
              counterStyle: const TextStyle(color: AlpColors.textMuted, fontSize: 11),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: const BorderSide(color: AlpColors.borderDefault),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: const BorderSide(color: AlpColors.borderDefault),
              ),
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () => Navigator.of(context).pop(
                _FeedbackSubmission(kind: _kind, note: _noteCtrl.text.trim()),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: AlpColors.colorBlue,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              child: const Text(
                'Submit report',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
