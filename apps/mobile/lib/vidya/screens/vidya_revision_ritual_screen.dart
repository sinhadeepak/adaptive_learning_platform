// VidyaRevisionRitualScreen — Phase C3. The 4-stage spaced-repetition
// ritual (mirrors web's RevisionRitual), launched from the revision queue:
//
//   1. Recall   — rate your confidence (shaky / ok / solid)
//   2. Set      — a 5-question retrieval set on the topic
//   3. Delta    — accuracy + confidence calibration + mastery direction
//   4. Next due — SM-2 next-review estimate
//
// The set runs through the shared polymorphic session screen; on completion
// we fetch the session summary (correct/total) to drive the delta + the
// calibration check (confidence vs actual accuracy).

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../api/analytics.dart';
import '../../auth/auth_client.dart';
import '../../quiz/quiz_client.dart';
import 'vidya_practice_session_screen.dart';

enum _Stage { recall, set, delta, nextDue }

enum _Confidence { shaky, ok, solid }

class VidyaRevisionRitualScreen extends StatefulWidget {
  final AuthClient auth;
  final RevisionItem item;
  const VidyaRevisionRitualScreen({
    super.key,
    required this.auth,
    required this.item,
  });

  @override
  State<VidyaRevisionRitualScreen> createState() =>
      _VidyaRevisionRitualScreenState();
}

class _VidyaRevisionRitualScreenState extends State<VidyaRevisionRitualScreen> {
  _Stage _stage = _Stage.recall;
  _Confidence _confidence = _Confidence.ok;
  int _correct = 0;
  int _total = 0;
  bool _fetching = false;

  void _startSet() {
    final userId = widget.auth.user?.id ?? '';
    final client = QuizClient(auth: widget.auth);
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => VidyaPracticeSessionScreen(
          client: client,
          topicId: widget.item.topicId,
          userId: userId,
          questionCount: 5,
          onCompleted: (sessionId) {
            // Pop the session screen and resolve the summary back here.
            Navigator.of(context).pop();
            _onSetDone(client, sessionId);
          },
          onBack: () => Navigator.of(context).pop(),
        ),
      ),
    );
    setState(() => _stage = _Stage.set);
  }

  Future<void> _onSetDone(QuizClient client, String sessionId) async {
    setState(() => _fetching = true);
    try {
      final s = await client.session(sessionId);
      if (!mounted) return;
      setState(() {
        _correct = s.correctCount;
        _total = s.servedCount > 0 ? s.servedCount : s.targetCount;
        _stage = _Stage.delta;
        _fetching = false;
      });
    } catch (_) {
      if (!mounted) return;
      // Couldn't fetch the summary — still advance, with unknown counts.
      setState(() {
        _stage = _Stage.delta;
        _fetching = false;
      });
    }
  }

  double get _accuracy => _total > 0 ? _correct / _total : 0;

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return VidyaScaffold(
      appBar: VidyaAppBar(
        title: widget.item.topicTitle.isEmpty
            ? 'Revision'
            : widget.item.topicTitle,
        leading: IconButton(
          icon: Icon(Icons.close, color: v.ink),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: switch (_stage) {
        _Stage.recall => _RecallStage(
            confidence: _confidence,
            onPick: (c) => setState(() => _confidence = c),
            onStart: _startSet,
          ),
        _Stage.set => Center(
            child: _fetching
                ? const CircularProgressIndicator()
                : Text(
                    'Answer the 5-question set…',
                    style: TextStyle(
                      fontFamily: VidyaFonts.ui,
                      fontSize: 15,
                      color: v.ink2,
                    ),
                  ),
          ),
        _Stage.delta => _DeltaStage(
            confidence: _confidence,
            correct: _correct,
            total: _total,
            accuracy: _accuracy,
            onNext: () => setState(() => _stage = _Stage.nextDue),
          ),
        _Stage.nextDue => _NextDueStage(
            item: widget.item,
            accuracy: _accuracy,
            onDone: () => Navigator.of(context).maybePop(),
          ),
      },
    );
  }
}

// ─── Stage 1: Recall ────────────────────────────────────────────────

class _RecallStage extends StatelessWidget {
  final _Confidence confidence;
  final ValueChanged<_Confidence> onPick;
  final VoidCallback onStart;
  const _RecallStage({
    required this.confidence,
    required this.onPick,
    required this.onStart,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
      children: [
        _StepEyebrow(step: 1, label: 'RECALL'),
        const SizedBox(height: 12),
        Text(
          'How confident are you right now?',
          style: TextStyle(
            fontFamily: VidyaFonts.display,
            fontSize: 26,
            fontWeight: FontWeight.w500,
            color: v.ink,
            height: 1.15,
          ),
        ),
        const SizedBox(height: 20),
        for (final c in _Confidence.values) ...[
          _ConfidenceOption(
            value: c,
            selected: c == confidence,
            onTap: () => onPick(c),
          ),
          const SizedBox(height: 10),
        ],
        const SizedBox(height: 12),
        VidyaButton(
          label: 'Start the 5-question set',
          onPressed: onStart,
          size: VidyaButtonSize.lg,
        ),
      ],
    );
  }
}

String _confidenceLabel(_Confidence c) => switch (c) {
      _Confidence.shaky => 'Shaky',
      _Confidence.ok => 'OK',
      _Confidence.solid => 'Solid',
    };

class _ConfidenceOption extends StatelessWidget {
  final _Confidence value;
  final bool selected;
  final VoidCallback onTap;
  const _ConfidenceOption({
    required this.value,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final icon = switch (value) {
      _Confidence.shaky => Icons.sentiment_dissatisfied_outlined,
      _Confidence.ok => Icons.sentiment_neutral_outlined,
      _Confidence.solid => Icons.sentiment_very_satisfied_outlined,
    };
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: selected ? v.accent.withValues(alpha: 0.12) : v.card,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: selected ? v.accent : v.rule),
        ),
        child: Row(
          children: [
            Icon(icon, size: 24, color: selected ? v.accent : v.ink3),
            const SizedBox(width: 14),
            Text(
              _confidenceLabel(value),
              style: TextStyle(
                fontFamily: VidyaFonts.ui,
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: selected ? v.accent : v.ink,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Stage 3: Delta + calibration ───────────────────────────────────

class _DeltaStage extends StatelessWidget {
  final _Confidence confidence;
  final int correct;
  final int total;
  final double accuracy;
  final VoidCallback onNext;
  const _DeltaStage({
    required this.confidence,
    required this.correct,
    required this.total,
    required this.accuracy,
    required this.onNext,
  });

  /// Compare the stated confidence with the actual accuracy.
  ({String label, Color tone, String detail}) _calibration(VidyaThemeData v) {
    // Expected accuracy band per confidence level.
    final expected = switch (confidence) {
      _Confidence.shaky => 0.40,
      _Confidence.ok => 0.65,
      _Confidence.solid => 0.85,
    };
    final gap = accuracy - expected;
    if (gap.abs() <= 0.15) {
      return (
        label: 'Well calibrated',
        tone: v.good,
        detail: 'Your confidence matched your performance.',
      );
    }
    if (gap < 0) {
      return (
        label: 'Overconfident',
        tone: v.warn,
        detail: 'You felt "${_confidenceLabel(confidence)}" but scored lower '
            '— worth another pass.',
      );
    }
    return (
      label: 'Underconfident',
      tone: v.info,
      detail: 'You knew more than you thought — trust your prep.',
    );
  }

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final cal = _calibration(v);
    final masteryUp = accuracy >= 0.6;
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
      children: [
        _StepEyebrow(step: 3, label: 'DELTA'),
        const SizedBox(height: 16),
        VidyaCard(
          tone: VidyaCardTone.accent,
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  total > 0 ? '$correct / $total correct' : 'Set complete',
                  style: TextStyle(
                    fontFamily: VidyaFonts.display,
                    fontSize: 30,
                    fontWeight: FontWeight.w600,
                    color: v.ink,
                  ),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Icon(
                      masteryUp ? Icons.trending_up : Icons.trending_flat,
                      size: 20,
                      color: masteryUp ? v.good : v.warn,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      masteryUp
                          ? 'Mastery for this topic will rise'
                          : 'Mastery holds — revisit again soon',
                      style: TextStyle(
                        fontFamily: VidyaFonts.ui,
                        fontSize: 14,
                        color: v.ink2,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        VidyaCard(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'CALIBRATION',
                  style: TextStyle(
                    fontFamily: VidyaFonts.mono,
                    fontSize: 11,
                    color: v.ink3,
                    letterSpacing: 1.4,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  cal.label,
                  style: TextStyle(
                    fontFamily: VidyaFonts.ui,
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: cal.tone,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  cal.detail,
                  style: TextStyle(
                    fontFamily: VidyaFonts.ui,
                    fontSize: 13,
                    color: v.ink2,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),
        VidyaButton(
          label: 'See next review',
          onPressed: onNext,
          size: VidyaButtonSize.lg,
        ),
      ],
    );
  }
}

// ─── Stage 4: Next due (SM-2 estimate) ──────────────────────────────

class _NextDueStage extends StatelessWidget {
  final RevisionItem item;
  final double accuracy;
  final VoidCallback onDone;
  const _NextDueStage({
    required this.item,
    required this.accuracy,
    required this.onDone,
  });

  /// Client-side SM-2-style projection: a good set grows the interval, a
  /// poor one shrinks it. The authoritative schedule is computed server-side
  /// from the graded answers — this is the "what to expect" estimate.
  int _nextInterval() {
    final base = item.intervalDays ?? 1;
    if (accuracy >= 0.8) return (base * 2.5).round().clamp(1, 365);
    if (accuracy >= 0.6) return (base * 1.6).round().clamp(1, 365);
    return 1; // reset — revisit tomorrow
  }

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final next = _nextInterval();
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
      children: [
        _StepEyebrow(step: 4, label: 'NEXT DUE'),
        const SizedBox(height: 16),
        VidyaCard(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.event_repeat, size: 28, color: v.accent),
                const SizedBox(height: 12),
                Text(
                  next == 1 ? 'Review again tomorrow' : 'Review in ~$next days',
                  style: TextStyle(
                    fontFamily: VidyaFonts.display,
                    fontSize: 24,
                    fontWeight: FontWeight.w500,
                    color: v.ink,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'Estimated by spaced repetition — the exact date updates '
                  'from your graded answers.',
                  style: TextStyle(
                    fontFamily: VidyaFonts.ui,
                    fontSize: 13,
                    color: v.ink2,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),
        VidyaButton(
          label: 'Done',
          onPressed: onDone,
          size: VidyaButtonSize.lg,
        ),
      ],
    );
  }
}

// ─── Shared ─────────────────────────────────────────────────────────

class _StepEyebrow extends StatelessWidget {
  final int step;
  final String label;
  const _StepEyebrow({required this.step, required this.label});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return Text(
      'STEP $step OF 4 · $label',
      style: TextStyle(
        fontFamily: VidyaFonts.mono,
        fontSize: 11,
        color: v.ink3,
        letterSpacing: 1.4,
      ),
    );
  }
}
