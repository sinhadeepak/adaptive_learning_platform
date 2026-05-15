import 'dart:async';

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../aurora/widgets/widgets.dart';
import '../widgets/alp_card.dart';
import '../widgets/report_outcome_dialog.dart';
import 'mock_result_screen.dart';
import 'persona.dart';

/// Full-screen mock test player.
///
/// Driven entirely by a [MockPlan] received from the adaptive engine. The
/// engine never sends correct answers; we POST `answers` back to /mock/score
/// at submit time and let the engine compute raw / percentile / projected AIR.
///
/// Mirrors the real-exam UX: top timer + section pills + mark-for-review +
/// bottom navigator with green/red/yellow per-question state.
class MockTestScreen extends StatefulWidget {
  const MockTestScreen({super.key, required this.api, required this.plan});
  final ApiClient api;
  final MockPlan plan;

  @override
  State<MockTestScreen> createState() => _MockTestScreenState();
}

class _MockTestScreenState extends State<MockTestScreen> {
  int _idx = 0;
  late final Map<String, int> _answers = {};
  late final Set<String> _flagged = {};
  late int _remainingSecs;
  Timer? _ticker;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _remainingSecs = widget.plan.durationMinutes * 60;
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() {
        _remainingSecs -= 1;
        if (_remainingSecs <= 0) {
          _ticker?.cancel();
          _submit(autoFromTimer: true);
        }
      });
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  MockQuestion get _current => widget.plan.questions[_idx];
  String _currentSectionName() {
    for (final s in widget.plan.sections) {
      if (_idx >= s.fromIdx && _idx < s.toIdx) return s.name;
    }
    return '';
  }

  void _next() {
    if (_idx < widget.plan.totalQuestions - 1) {
      setState(() => _idx += 1);
    }
  }

  void _prev() {
    if (_idx > 0) setState(() => _idx -= 1);
  }

  void _toggleFlag() {
    setState(() {
      final id = _current.id;
      if (_flagged.contains(id)) {
        _flagged.remove(id);
      } else {
        _flagged.add(id);
      }
    });
  }

  Future<void> _submit({bool autoFromTimer = false}) async {
    if (_submitting) return;
    if (!autoFromTimer) {
      final confirm = await showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text('Submit mock?', style: TextStyle()),
          content: Text(
            'Answered: ${_answers.length} of ${widget.plan.totalQuestions}\n'
            'Flagged: ${_flagged.length}',
            style: const TextStyle(color: AlpColors.textSecondary),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Keep going', style: TextStyle(color: AlpColors.textMuted)),
            ),
            ElevatedButton(
              onPressed: () => Navigator.pop(context, true),
              style: ElevatedButton.styleFrom(backgroundColor: AlpColors.colorBlue),
              child: const Text('Submit'),
            ),
          ],
        ),
      );
      if (confirm != true) return;
    }
    setState(() => _submitting = true);
    try {
      final result = await widget.api.mockScore(mockId: widget.plan.mockId, answers: _answers);
      if (!mounted) return;
      await Navigator.of(context).pushReplacement(MaterialPageRoute(
        builder: (_) => MockResultScreen(result: result),
      ),);
      // Sprint A7 — once the result screen lands, ask senior students
      // (juniors don't take real competitive exams) for their actual
      // outcome. Strict opt-in; honoured "don't ask again" flag.
      if (!mounted) return;
      if (legacyAudienceForExamCode(widget.plan.examCode).isSenior &&
          await shouldAskOutcome(widget.api.auth)) {
        if (!mounted) return;
        await showReportOutcomeDialog(
          context: context,
          auth: widget.api.auth,
          examCode: widget.plan.examCode,
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _submitting = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Submit failed: $e')),
        );
      }
    }
  }

  Future<bool> _confirmExit() async {
    final res = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Quit mock?', style: TextStyle()),
        content: const Text(
          'Your progress will be lost. The mock cannot be resumed.',
          style: TextStyle(color: AlpColors.textSecondary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Keep going', style: TextStyle(color: AlpColors.textMuted)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Quit', style: TextStyle(color: AlpColors.colorRed)),
          ),
        ],
      ),
    );
    return res ?? false;
  }

  @override
  Widget build(BuildContext context) {
    final mins = _remainingSecs ~/ 60;
    final secs = _remainingSecs % 60;
    final timerStr = '${mins.toString().padLeft(2, '0')}:${secs.toString().padLeft(2, '0')}';
    final timeLow = _remainingSecs < 60;

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (await _confirmExit() && mounted) Navigator.of(context).pop();
      },
      child: AuroraScaffold(
        focusMode: true,
        body: Column(
            children: [
              _Header(
                examName: widget.plan.examName,
                sectionName: _currentSectionName(),
                progress: '${_idx + 1} / ${widget.plan.totalQuestions}',
                timer: timerStr,
                timerLow: timeLow,
                onExit: () async {
                  if (await _confirmExit() && mounted) Navigator.of(context).pop();
                },
              ),
              _ProgressBar(
                idx: _idx,
                total: widget.plan.totalQuestions,
                answers: _answers,
                flagged: _flagged,
                questions: widget.plan.questions,
                onJump: (i) => setState(() => _idx = i),
              ),
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          AlpPill(
                            label: 'Q${_idx + 1} · ${_currentSectionName()}',
                            color: AlpColors.colorBlue,
                          ),
                          const Spacer(),
                          GestureDetector(
                            onTap: _toggleFlag,
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                              decoration: BoxDecoration(
                                color: _flagged.contains(_current.id)
                                    ? AlpColors.colorAmber.withValues(alpha: 0.20)
                                    : AlpColors.bgSurface3,
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(
                                  color: _flagged.contains(_current.id)
                                      ? AlpColors.colorAmber
                                      : AlpColors.borderDefault,
                                ),
                              ),
                              child: Row(
                                children: [
                                  Icon(
                                    _flagged.contains(_current.id) ? Icons.bookmark : Icons.bookmark_border,
                                    color: _flagged.contains(_current.id) ? AlpColors.colorAmber : AlpColors.textMuted,
                                    size: 14,
                                  ),
                                  const SizedBox(width: 4),
                                  Text(
                                    _flagged.contains(_current.id) ? 'Flagged' : 'Flag',
                                    style: TextStyle(
                                      color: _flagged.contains(_current.id) ? AlpColors.colorAmber : AlpColors.textMuted,
                                      fontSize: 11,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      Text(
                        _current.stem,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w500,
                          height: 1.5,
                        ),
                      ),
                      const SizedBox(height: 18),
                      ...List.generate(_current.choices.length, (i) {
                        final picked = _answers[_current.id] == i;
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: _ChoiceTile(
                            letter: String.fromCharCode(65 + i),
                            text: _current.choices[i],
                            picked: picked,
                            onTap: () {
                              setState(() => _answers[_current.id] = i);
                            },
                          ),
                        );
                      }),
                    ],
                  ),
                ),
              ),
              _BottomBar(
                idx: _idx,
                total: widget.plan.totalQuestions,
                onPrev: _idx > 0 ? _prev : null,
                onNext: _idx < widget.plan.totalQuestions - 1 ? _next : null,
                onSubmit: _submit,
                submitting: _submitting,
              ),
            ],
          ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.examName,
    required this.sectionName,
    required this.progress,
    required this.timer,
    required this.timerLow,
    required this.onExit,
  });
  final String examName;
  final String sectionName;
  final String progress;
  final String timer;
  final bool timerLow;
  final VoidCallback onExit;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
      decoration: const BoxDecoration(
        color: AlpColors.bgSurface1,
        border: Border(bottom: BorderSide(color: AlpColors.borderDefault)),
      ),
      child: Row(
        children: [
          IconButton(
            onPressed: onExit,
            icon: const Icon(Icons.close, color: AlpColors.textMuted),
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  examName,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  '$sectionName · $progress',
                  style: const TextStyle(color: AlpColors.textMuted, fontSize: 11),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: timerLow
                  ? AlpColors.colorRed.withValues(alpha: 0.18)
                  : AlpColors.colorAi.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: timerLow ? AlpColors.colorRed : AlpColors.colorAi.withValues(alpha: 0.4),
              ),
            ),
            child: Row(
              children: [
                Icon(
                  Icons.timer_outlined,
                  size: 14,
                  color: timerLow ? AlpColors.colorRed : AlpColors.colorAi,
                ),
                const SizedBox(width: 4),
                Text(
                  timer,
                  style: TextStyle(
                    color: timerLow ? AlpColors.colorRed : AlpColors.colorAi,
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.5,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ProgressBar extends StatelessWidget {
  const _ProgressBar({
    required this.idx,
    required this.total,
    required this.answers,
    required this.flagged,
    required this.questions,
    required this.onJump,
  });
  final int idx;
  final int total;
  final Map<String, int> answers;
  final Set<String> flagged;
  final List<MockQuestion> questions;
  final ValueChanged<int> onJump;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 44,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: const BoxDecoration(
        color: AlpColors.bgSurface1,
        border: Border(bottom: BorderSide(color: AlpColors.borderDefault)),
      ),
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        itemCount: total,
        itemBuilder: (_, i) {
          final id = questions[i].id;
          final answered = answers.containsKey(id);
          final isFlagged = flagged.contains(id);
          final active = i == idx;
          final color = answered
              ? AlpColors.colorGreen
              : isFlagged
                  ? AlpColors.colorAmber
                  : AlpColors.bgSurface3;
          return GestureDetector(
            onTap: () => onJump(i),
            child: Container(
              width: 30,
              margin: const EdgeInsets.symmetric(vertical: 6, horizontal: 3),
              decoration: BoxDecoration(
                color: color,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(
                  color: active ? AlpColors.colorAi : Colors.transparent,
                  width: 2,
                ),
              ),
              child: Center(
                child: Text(
                  '${i + 1}',
                  style: TextStyle(
                    color: answered || isFlagged ? Colors.white : AlpColors.textMuted,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _ChoiceTile extends StatelessWidget {
  const _ChoiceTile({required this.letter, required this.text, required this.picked, required this.onTap});
  final String letter;
  final String text;
  final bool picked;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return AlpCard(
      onTap: onTap,
      borderColor: picked ? AlpColors.colorBlue : null,
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              color: picked ? AlpColors.colorBlue : AlpColors.bgSurface3,
              borderRadius: BorderRadius.circular(6),
            ),
            child: Center(
              child: Text(
                letter,
                style: TextStyle(
                  color: picked ? Colors.white : AlpColors.textMuted,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                // W2.11 partial: active picks theme onSurface; inactive
                // still uses legacy textSecondary (Wave-1 dark lock keeps
                // it visible; W2.11.2 sweeps the muted token next).
                color: picked
                    ? Theme.of(context).colorScheme.onSurface
                    : AlpColors.textSecondary,
                fontSize: 14,
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _BottomBar extends StatelessWidget {
  const _BottomBar({
    required this.idx,
    required this.total,
    required this.onPrev,
    required this.onNext,
    required this.onSubmit,
    required this.submitting,
  });
  final int idx;
  final int total;
  final VoidCallback? onPrev;
  final VoidCallback? onNext;
  final VoidCallback onSubmit;
  final bool submitting;

  @override
  Widget build(BuildContext context) {
    final isLast = idx == total - 1;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      decoration: const BoxDecoration(
        color: AlpColors.bgSurface1,
        border: Border(top: BorderSide(color: AlpColors.borderDefault)),
      ),
      child: Row(
        children: [
          OutlinedButton(
            onPressed: onPrev,
            style: OutlinedButton.styleFrom(
              side: const BorderSide(color: AlpColors.borderStrong),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            ),
            child: const Text('← Prev', style: TextStyle()),
          ),
          const Spacer(),
          if (!isLast)
            ElevatedButton(
              onPressed: onNext,
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
              child: const Text('Next →', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
            )
          else
            ElevatedButton.icon(
              onPressed: submitting ? null : onSubmit,
              icon: submitting
                  ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.check, color: Colors.white, size: 16),
              label: Text(
                submitting ? 'Submitting…' : 'Submit',
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
              ),
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
            ),
        ],
      ),
    );
  }
}
