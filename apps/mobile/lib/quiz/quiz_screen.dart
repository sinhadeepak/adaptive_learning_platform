import 'package:flutter/material.dart';
import 'package:alp_design_tokens/alp_design_tokens.dart';

import '../api/api_client.dart';
import '../aurora/widgets/widgets.dart';
import 'quiz_client.dart';
import 'quiz_offline_queue.dart';
import 'quiz_result_screen.dart';

/// One-question-at-a-time quiz play surface, mirror of web Quiz.tsx.
///
/// Phase 6 S51 refactor — wraps the per-question UI in
/// `PracticeRunnerShell` (full-screen focus mode), routes End / Bookmark /
/// Adjust difficulty through `AuroraActionSheet`, and layers
/// `QuizOfflineQueue` over `answer()` so a network blip mid-submit doesn't
/// drop the response.
class QuizScreen extends StatefulWidget {
  const QuizScreen({
    super.key,
    required this.client,
    required this.sessionId,
    this.api,
    @visibleForTesting QuizOfflineQueue? offlineQueue,
  }) : _offlineQueue = offlineQueue;

  final QuizClient client;
  final String sessionId;
  final ApiClient? api;
  final QuizOfflineQueue? _offlineQueue;

  @override
  State<QuizScreen> createState() => _QuizScreenState();
}

class _QuizScreenState extends State<QuizScreen> {
  late final QuizOfflineQueue _queue =
      widget._offlineQueue ?? QuizOfflineQueue();

  QuizItem? _item;
  int? _selectedIdx;
  QuizAnswer? _verdict;
  bool _loading = true;
  bool _submitting = false;
  String? _error;
  int _served = 0;
  int _correct = 0;
  int _target = 10;
  int _skippedCount = 0;
  bool _isFlagged = false;
  bool _replayedFromQueue = false;
  int _queuedOfflineCount = 0;

  // Sprint 7/8 — typed-response input. The single TextEditingController
  // is reused across NUMERIC_*, FORMULA_INPUT and SHORT_TEXT — the
  // payload shape is built per-type at submit time.
  final TextEditingController _typedInputCtrl = TextEditingController();

  @override
  void dispose() {
    _typedInputCtrl.dispose();
    super.dispose();
  }

  // Question types that render an inline text/numeric input on mobile
  // and submit a structured responsePayload to /grading/grade.
  static const _typedInputKinds = {
    'FORMULA_INPUT',
    'NUMERIC_INTEGER',
    'NUMERIC_DECIMAL',
    'NUMERIC_RANGE',
    'SHORT_TEXT',
  };

  bool _isTypedInput(QuizItem item) =>
      _typedInputKinds.contains(item.questionType);

  // Question stems from the polymorphic seed embed an internal debug
  // prefix like `[CBSE C8_FORCE Diagram #109]` — useful to authors,
  // confusing to students. Strip it on display.
  static final RegExp _debugPrefix = RegExp(
    r'^\s*\[[A-Z][A-Z0-9_]*(?:[\s_-][A-Z0-9_]+){0,3}(?:\s*#\s*\d+)?\]\s*',
  );

  String _displayStem(String stem) => stem.replaceFirst(_debugPrefix, '');

  // Per ADR-0026 + the 29-type mobile parity port, all canvas + Phase 2
  // types are rendered natively via PolymorphicRenderer. The only items
  // still auto-skipped are legacy seeds that ship a single placeholder
  // choice "See diagram canvas." with no real questionType — they
  // pre-date the polymorphic content path.
  bool _isUnplayableOnMobile(QuizItem item) {
    if (item.questionType.isEmpty || item.questionType == 'MCQ_SINGLE') {
      if (item.choices.length == 1) {
        final only = item.choices.first.trim();
        if (only.toLowerCase().contains('diagram canvas')) return true;
      }
    }
    return false;
  }

  @override
  void initState() {
    super.initState();
    _typedInputCtrl.addListener(() {
      if (mounted) setState(() {});
    });
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    // S51 offline-recovery v0 — drain any answers queued while offline
    // before resuming the session. The server is idempotent on
    // (session_id, item_idx) so re-sending is safe.
    try {
      final replayed = await _queue.drain(widget.client, widget.sessionId);
      if (replayed > 0 && mounted) {
        setState(() {
          _replayedFromQueue = true;
          _queuedOfflineCount = 0;
        });
      } else {
        final pending = await _queue.load(widget.sessionId);
        if (mounted) setState(() => _queuedOfflineCount = pending.length);
      }
    } catch (_) {
      // If we can't reach the server, leave the queue alone — we'll
      // try again when the user submits the next answer.
    }
    await _loadInitial();
  }

  Future<void> _loadInitial() async {
    try {
      final detail = await widget.client.session(widget.sessionId);
      if (!mounted) return;
      _served = detail.servedCount;
      _correct = detail.correctCount;
      _target = detail.targetCount;
      if (detail.status != 'IN_PROGRESS') {
        _goToResult();
        return;
      }
      await _fetchNext();
    } on QuizError catch (e) {
      setState(() {
        _loading = false;
        _error = e.message;
      });
    }
  }

  Future<void> _fetchNext() async {
    _typedInputCtrl.clear();
    setState(() {
      _loading = true;
      _selectedIdx = null;
      _verdict = null;
      _error = null;
      _isFlagged = false;
    });
    try {
      var safety = 0;
      while (safety++ < 5) {
        final n = await widget.client.next(widget.sessionId);
        if (!mounted) return;
        if (n.done || n.item == null) {
          setState(() {
            _loading = false;
            _item = null;
          });
          await _submitAndShowResult();
          return;
        }
        if (_isUnplayableOnMobile(n.item!)) {
          try {
            await widget.client.answer(
              widget.sessionId,
              itemIdx: n.item!.itemIdx,
              answerIdx: 0,
            );
          } on QuizError {
            setState(() {
              _loading = false;
              _item = n.item;
            });
            return;
          }
          _skippedCount += 1;
          continue;
        }
        setState(() {
          _loading = false;
          _item = n.item;
        });
        if (_skippedCount > 0 && mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              behavior: SnackBarBehavior.floating,
              content: Text(
                _skippedCount == 1
                    ? 'Skipped 1 question — this type works best on the web app.'
                    : 'Skipped $_skippedCount questions — these work best on the web app.',
              ),
            ),
          );
        }
        return;
      }
      await _submitAndShowResult();
    } on QuizError catch (e) {
      if (e.code == QuizErrorCode.sessionDone) {
        _goToResult();
        return;
      }
      setState(() {
        _loading = false;
        _error = e.message;
      });
    }
  }

  /// Submit + offline-fallback. If the server call throws unexpectedly
  /// (network blip), queue the answer locally so it replays on next
  /// mount / reconnect.
  Future<QuizAnswer?> _submitWithOfflineFallback({
    required QuizItem item,
    required int answerIdx,
    Map<String, dynamic>? responsePayload,
  }) async {
    try {
      final ar = await widget.client.answer(
        widget.sessionId,
        itemIdx: item.itemIdx,
        answerIdx: answerIdx,
        responsePayload: responsePayload,
      );
      await _queue.remove(widget.sessionId, item.itemIdx);
      return ar;
    } on QuizError catch (e) {
      // Online but server refused — surface the error, do NOT queue
      // (it would just be rejected again).
      setState(() {
        _submitting = false;
        _error = e.message;
      });
      return null;
    } catch (_) {
      // Network blip / DNS / TLS / parse failure — assume offline and
      // queue. The server is idempotent on (session_id, item_idx).
      await _queue.enqueue(PendingAnswer(
        sessionId: widget.sessionId,
        itemIdx: item.itemIdx,
        answerIdx: answerIdx,
        queuedAtMs: DateTime.now().millisecondsSinceEpoch,
        responsePayload: responsePayload,
      ),);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            behavior: SnackBarBehavior.floating,
            content: Text(
              'Saved offline — will sync when you reconnect.',
            ),
          ),
        );
        setState(() {
          _queuedOfflineCount += 1;
        });
      }
      // Optimistic verdict: server is the source of truth on correctness;
      // for offline mode we punt and let the student move on.
      return QuizAnswer(
        sessionId: widget.sessionId,
        itemIdx: item.itemIdx,
        isCorrect: false,
        correctIdx: -1,
        servedCount: _served + 1,
        correctCount: _correct,
      );
    }
  }

  Future<void> _submitAnswer() async {
    final item = _item;
    if (item == null || _submitting) return;

    if (_isTypedInput(item)) {
      final raw = _typedInputCtrl.text.trim();
      if (raw.isEmpty) return;
      Map<String, dynamic>? payload;
      switch (item.questionType) {
        case 'NUMERIC_INTEGER':
          final n = int.tryParse(raw);
          if (n == null) {
            setState(() => _error = 'Enter a whole number.');
            return;
          }
          payload = {'answer': n};
          break;
        case 'NUMERIC_DECIMAL':
        case 'NUMERIC_RANGE':
          final d = double.tryParse(raw);
          if (d == null) {
            setState(() => _error = 'Enter a numeric value.');
            return;
          }
          payload = {'answer': d};
          break;
        case 'FORMULA_INPUT':
          payload = {'expression': raw};
          break;
        case 'SHORT_TEXT':
          payload = {'text': raw};
          break;
      }
      setState(() {
        _submitting = true;
        _error = null;
      });
      final ar = await _submitWithOfflineFallback(
        item: item,
        answerIdx: 0,
        responsePayload: payload,
      );
      if (!mounted) return;
      if (ar != null) {
        setState(() {
          _verdict = ar;
          _served = ar.servedCount;
          _correct = ar.correctCount;
          _submitting = false;
        });
      }
      return;
    }

    final pick = _selectedIdx;
    if (pick == null) return;
    setState(() => _submitting = true);
    final ar = await _submitWithOfflineFallback(
      item: item,
      answerIdx: pick,
    );
    if (!mounted) return;
    if (ar != null) {
      setState(() {
        _verdict = ar;
        _served = ar.servedCount;
        _correct = ar.correctCount;
        _submitting = false;
      });
    }
  }

  Future<void> _submitAndShowResult() async {
    try {
      await widget.client.submit(widget.sessionId);
    } on QuizError {
      // ignore — result page will load whatever state the server has.
    }
    _goToResult();
  }

  void _goToResult() {
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(
        builder: (_) => QuizResultScreen(
          client: widget.client,
          sessionId: widget.sessionId,
          api: widget.api,
        ),
      ),
    );
  }

  Future<void> _openActionSheet() async {
    if (!mounted) return;
    final action = await showAuroraActionSheet<_QuizAction>(
      context,
      title: 'Session',
      message: 'Adjust the session or wrap it up.',
      actions: [
        const AuroraActionSheetAction(
          label: 'Adjust difficulty',
          icon: Icons.tune,
          value: _QuizAction.adjustDifficulty,
        ),
        const AuroraActionSheetAction(
          label: 'Bookmark question',
          icon: Icons.bookmark_border,
          value: _QuizAction.bookmark,
        ),
        AuroraActionSheetAction.destructive(
          label: 'End quiz',
          icon: Icons.flag_outlined,
          value: _QuizAction.endQuiz,
        ),
      ],
    );
    if (!mounted || action == null) return;
    switch (action) {
      case _QuizAction.endQuiz:
        await _submitAndShowResult();
        break;
      case _QuizAction.bookmark:
        // S51 v0: visual ack only. The bookmark API will be wired when
        // the per-question bookmark backend lands; the UI surface is
        // shipped first so the action exists from the start.
        setState(() => _isFlagged = !_isFlagged);
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            behavior: SnackBarBehavior.floating,
            content: Text(
              _isFlagged ? 'Bookmarked for review.' : 'Removed bookmark.',
            ),
          ),
        );
        break;
      case _QuizAction.adjustDifficulty:
        // Difficulty agency lands in Phase 6 S54 — pre-quiz intent
        // selector + mid-quiz friction prompt. The action sheet entry
        // ships now so the affordance exists; the actual sheet lands
        // with S54.
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            behavior: SnackBarBehavior.floating,
            content: Text(
              'Difficulty agency arrives with the S54 frontend slice.',
            ),
          ),
        );
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;

    if (_error != null) {
      return AuroraScaffold(
        appBar: const AuroraAppBar(title: 'Quiz'),
        body: Padding(
          padding: const EdgeInsets.all(24),
          child: AuroraEmptyState(
            illustration: const Icon(Icons.error_outline),
            title: 'Something went wrong',
            description: _error,
            actions: [
              AuroraButton(
                label: 'Back',
                variant: AuroraButtonVariant.secondary,
                onPressed: () => Navigator.of(context).pop(),
              ),
            ],
          ),
        ),
      );
    }

    if (_loading || _item == null) {
      return AuroraScaffold(
        appBar: const AuroraAppBar(title: 'Quiz'),
        body: const Center(child: AuroraSpinner(size: 32)),
      );
    }

    final item = _item!;
    final verdict = _verdict;
    final showFeedback = verdict != null;

    return PracticeRunnerShell(
      questionIndex: (_served + (showFeedback ? 0 : 0)).clamp(0, _target - 1),
      totalQuestions: _target,
      timerLabel: '$_correct ✓',
      isFlagged: _isFlagged,
      onExit: _openActionSheet,
      onToggleFlag: () => setState(() => _isFlagged = !_isFlagged),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_replayedFromQueue)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: AuroraBanner(
                title: 'Synced offline answers',
                body: 'We replayed the questions you answered while offline.',
                tone: AuroraBannerTone.success,
                onDismiss: () => setState(() => _replayedFromQueue = false),
              ),
            ),
          if (_queuedOfflineCount > 0)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: AuroraBanner(
                title: _queuedOfflineCount == 1
                    ? '1 answer waiting to sync'
                    : '$_queuedOfflineCount answers waiting to sync',
                body: 'They will send the next time you have a connection.',
                tone: AuroraBannerTone.warning,
              ),
            ),
          Text(
            _displayStem(item.stem),
            style: typography.h3
                .copyWith(color: colors.neutral900, height: 1.35),
          ),
          const SizedBox(height: 20),
          if (_isTypedInput(item))
            _TypedInputField(
              controller: _typedInputCtrl,
              questionType: item.questionType,
              enabled: !showFeedback,
            )
          else
            ..._mcqChoices(item, verdict),
          if (showFeedback) ...[
            const SizedBox(height: 16),
            _verdictBox(verdict, item, colors, typography),
          ],
        ],
      ),
      answerSurface: _answerSurface(item, showFeedback),
    );
  }

  List<Widget> _mcqChoices(QuizItem item, QuizAnswer? verdict) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final showFeedback = verdict != null;
    return List.generate(item.choices.length, (idx) {
      final letter = String.fromCharCode(65 + idx);
      final isSelected = _selectedIdx == idx;
      final isCorrectChoice = showFeedback && idx == verdict.correctIdx;
      final isWrongPick =
          showFeedback && idx == _selectedIdx && !verdict.isCorrect;
      final tone = isCorrectChoice
          ? colors.success50
          : isWrongPick
              ? colors.danger50
              : isSelected
                  ? colors.brand50
                  : colors.neutral0;
      final border = isCorrectChoice
          ? colors.success500
          : isWrongPick
              ? colors.danger500
              : isSelected
                  ? colors.brand500
                  : colors.neutral200;
      return Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: InkWell(
          onTap: showFeedback ? null : () => setState(() => _selectedIdx = idx),
          borderRadius: BorderRadius.circular(10),
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: tone,
              border: Border.all(color: border),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Row(
              children: [
                CircleAvatar(
                  backgroundColor: colors.neutral100,
                  radius: 14,
                  child: Text(
                    letter,
                    style: TextStyle(
                      color: colors.neutral700,
                      fontWeight: FontWeight.w600,
                      fontSize: 12,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(child: Text(item.choices[idx])),
                if (isCorrectChoice)
                  Padding(
                    padding: const EdgeInsets.only(left: 8),
                    child:
                        Icon(Icons.check, size: 18, color: colors.success600),
                  ),
                if (isWrongPick)
                  Padding(
                    padding: const EdgeInsets.only(left: 8),
                    child:
                        Icon(Icons.close, size: 18, color: colors.danger600),
                  ),
              ],
            ),
          ),
        ),
      );
    });
  }

  Widget _verdictBox(
    QuizAnswer verdict,
    QuizItem item,
    AuroraColors colors,
    AuroraTypography typography,
  ) {
    final correct = verdict.isCorrect;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: correct ? colors.success50 : colors.danger50,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: correct ? colors.success500 : colors.danger500,
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(correct ? Icons.check_circle : Icons.cancel,
              color: correct ? colors.success600 : colors.danger600,
              size: 18,),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              _verdictMessage(verdict, item),
              style: typography.body.copyWith(
                color: correct ? colors.success600 : colors.danger600,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _verdictMessage(QuizAnswer verdict, QuizItem item) {
    if (verdict.isCorrect) return "Nice — that's right.";
    if (_isTypedInput(item)) {
      final expected = item.choices.isNotEmpty ? item.choices.first : '—';
      return 'Not quite. Expected: $expected';
    }
    if (verdict.correctIdx < 0) {
      // Offline / queued answer — no canonical correctIdx yet.
      return 'Saved offline — we’ll show the correct answer once it syncs.';
    }
    return 'Not quite. The correct answer is ${String.fromCharCode(65 + verdict.correctIdx)}.';
  }

  Widget _answerSurface(QuizItem item, bool showFeedback) {
    final canSubmit = _isTypedInput(item)
        ? _typedInputCtrl.text.trim().isNotEmpty
        : _selectedIdx != null;

    final label = _submitting
        ? 'Submitting…'
        : showFeedback
            ? (_served >= _target ? 'Finish quiz' : 'Next question')
            : 'Submit answer';

    final onPress = _submitting
        ? null
        : showFeedback
            ? (_served >= _target ? _submitAndShowResult : _fetchNext)
            : (canSubmit ? _submitAnswer : null);

    return AuroraButton(
      label: label,
      variant: showFeedback
          ? AuroraButtonVariant.aurora
          : AuroraButtonVariant.primary,
      size: AuroraButtonSize.lg,
      loading: _submitting,
      fullWidth: true,
      onPressed: onPress,
    );
  }
}

enum _QuizAction { adjustDifficulty, bookmark, endQuiz }

// Sprint 7/8 — typed-input renderer for non-MCQ question types.
class _TypedInputField extends StatelessWidget {
  const _TypedInputField({
    required this.controller,
    required this.questionType,
    required this.enabled,
  });

  final TextEditingController controller;
  final String questionType;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final isFormula = questionType == 'FORMULA_INPUT';
    final isNumericInt = questionType == 'NUMERIC_INTEGER';
    final isNumericReal = questionType == 'NUMERIC_DECIMAL' ||
        questionType == 'NUMERIC_RANGE';
    final isLongText = questionType == 'SHORT_TEXT';

    final hint = switch (questionType) {
      'FORMULA_INPUT' => 'e.g. F=m*a or v^2 = u^2 + 2*a*s',
      'NUMERIC_INTEGER' => 'Whole number, e.g. 42',
      'NUMERIC_DECIMAL' => 'Decimal, e.g. 9.81',
      'NUMERIC_RANGE' => 'Any value within the accepted range',
      'SHORT_TEXT' => 'Type your answer in one or two sentences',
      _ => 'Your answer',
    };

    return TextField(
      controller: controller,
      enabled: enabled,
      maxLines: isLongText ? 3 : 1,
      keyboardType: isNumericInt
          ? const TextInputType.numberWithOptions(
              decimal: false, signed: true,)
          : isNumericReal
              ? const TextInputType.numberWithOptions(
                  decimal: true, signed: true,)
              : isFormula
                  ? TextInputType
                      .visiblePassword // disables autocorrect for math-y input
                  : TextInputType.text,
      style: TextStyle(
        fontFamily: isFormula ? 'monospace' : null,
        fontSize: 16,
      ),
      decoration: InputDecoration(
        hintText: hint,
        border: const OutlineInputBorder(),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
      ),
    );
  }
}
