import 'package:flutter/material.dart';
import 'package:alp_design_tokens/alp_design_tokens.dart';

import '../api/api_client.dart';
import 'quiz_client.dart';
import 'quiz_result_screen.dart';

/// One-question-at-a-time quiz play surface, mirror of web Quiz.tsx.
class QuizScreen extends StatefulWidget {
  const QuizScreen({super.key, required this.client, required this.sessionId, this.api});

  final QuizClient client;
  final String sessionId;
  final ApiClient? api;

  @override
  State<QuizScreen> createState() => _QuizScreenState();
}

class _QuizScreenState extends State<QuizScreen> {
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
    // Re-render on every keystroke so the Submit button enables /
    // disables based on whether the typed input is non-empty.
    _typedInputCtrl.addListener(() {
      if (mounted) setState(() {});
    });
    _loadInitial();
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
    });
    try {
      // Loop in case we hit one or more mobile-incompatible question
      // types in a row — we honestly skip each (no fake "correct"), the
      // server records the skip via answer with the placeholder index,
      // and we move to the next.
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
          // Mark a skip on the session so next() advances. answerIdx=0
          // is the only choice; we increment a local counter so the
          // user sees that something was skipped, not that they
          // mysteriously lost a question.
          try {
            await widget.client.answer(
              widget.sessionId,
              itemIdx: n.item!.itemIdx,
              answerIdx: 0,
            );
          } on QuizError {
            // If the server refuses, surface the question anyway so the
            // user isn't stuck.
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
      // Safety cap exhausted — fall through to result screen.
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

  Future<void> _submitAnswer() async {
    final item = _item;
    if (item == null || _submitting) return;

    // Sprint 7/8 — typed-input branch: build the right responsePayload
    // shape per question type, then submit. Quiz Go forwards the
    // payload to /grading/grade which does sympy / range / text
    // matching server-side. answerIdx defaults to 0 since these
    // questions ship a single placeholder choice (the canonical
    // answer); the server ignores it for non-MCQ types.
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
      try {
        final ar = await widget.client.answer(
          widget.sessionId,
          itemIdx: item.itemIdx,
          answerIdx: 0,
          responsePayload: payload,
        );
        if (!mounted) return;
        setState(() {
          _verdict = ar;
          _served = ar.servedCount;
          _correct = ar.correctCount;
          _submitting = false;
        });
      } on QuizError catch (e) {
        setState(() {
          _submitting = false;
          _error = e.message;
        });
      }
      return;
    }

    // Existing MCQ path.
    final pick = _selectedIdx;
    if (pick == null) return;
    setState(() => _submitting = true);
    try {
      final ar = await widget.client.answer(
        widget.sessionId,
        itemIdx: item.itemIdx,
        answerIdx: pick,
      );
      if (!mounted) return;
      setState(() {
        _verdict = ar;
        _served = ar.servedCount;
        _correct = ar.correctCount;
        _submitting = false;
      });
    } on QuizError catch (e) {
      setState(() {
        _submitting = false;
        _error = e.message;
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

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Quiz')),
        body: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(_error!, style: TextStyle(color: AlpColors.dangerFg)),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('Back'),
              ),
            ],
          ),
        ),
      );
    }

    if (_loading || _item == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Quiz')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final item = _item!;
    final verdict = _verdict;
    final showFeedback = verdict != null;

    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Question ${(_served + (showFeedback ? 0 : 1)).clamp(1, _target)}/$_target  ·  $_correct correct',
        ),
        actions: [
          TextButton(
            onPressed: _submitting ? null : _submitAndShowResult,
            child: const Text('End'),
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                _displayStem(item.stem),
                style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600, height: 1.4),
              ),
              const SizedBox(height: 24),
              // Sprint 7/8 — typed-input renderers for non-MCQ types.
              // FORMULA_INPUT / NUMERIC_* / SHORT_TEXT all share a
              // TextField; the keyboard type and placeholder vary.
              // After feedback lands, the field is read-only and an
              // explanatory line shows the canonical answer (the
              // server returns isCorrect; the canonical answer for
              // typed inputs is in `item.choices.first` since the
              // seed stores it as choice index 0).
              if (_isTypedInput(item)) ...[
                _TypedInputField(
                  controller: _typedInputCtrl,
                  questionType: item.questionType,
                  enabled: !showFeedback,
                ),
                if (showFeedback) ...[
                  const SizedBox(height: 8),
                  Text(
                    verdict.isCorrect
                        ? "Nice — that's right."
                        : "Not quite. Expected: ${item.choices.isNotEmpty ? item.choices.first : '—'}",
                    style: TextStyle(
                      color: verdict.isCorrect
                          ? AlpColors.successFg
                          : AlpColors.dangerFg,
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ] else
              ...List.generate(item.choices.length, (idx) {
                final letter = String.fromCharCode(65 + idx);
                final isSelected = _selectedIdx == idx;
                final isCorrectChoice = showFeedback && idx == verdict.correctIdx;
                final isWrongPick = showFeedback && idx == _selectedIdx && !verdict.isCorrect;
                final tone = isCorrectChoice
                    ? AlpColors.successBg
                    : isWrongPick
                        ? AlpColors.dangerBg
                        : isSelected
                            ? const Color(0x14606EEA) // light brand tint
                            : AlpColors.surfacePrimary;
                final border = isCorrectChoice
                    ? AlpColors.successFg
                    : isWrongPick
                        ? AlpColors.dangerFg
                        : isSelected
                            ? AlpColors.brandPrimary
                            : AlpColors.borderDefault;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: InkWell(
                    onTap: showFeedback ? null : () => setState(() => _selectedIdx = idx),
                    borderRadius: BorderRadius.circular(8),
                    child: Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: tone,
                        border: Border.all(color: border),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        children: [
                          CircleAvatar(
                            backgroundColor: AlpColors.surfaceSecondary,
                            radius: 14,
                            child: Text(
                              letter,
                              style: TextStyle(
                                color: AlpColors.textSecondary,
                                fontWeight: FontWeight.w600,
                                fontSize: 12,
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(child: Text(item.choices[idx])),
                          if (isCorrectChoice)
                            const Padding(
                              padding: EdgeInsets.only(left: 8),
                              child: Icon(Icons.check, size: 18),
                            ),
                          if (isWrongPick)
                            const Padding(
                              padding: EdgeInsets.only(left: 8),
                              child: Icon(Icons.close, size: 18),
                            ),
                        ],
                      ),
                    ),
                  ),
                );
              }),
              const SizedBox(height: 16),
              // MCQ feedback box. Typed-input feedback line is rendered
              // inline above (right under the input field) so the
              // student doesn't have to scroll to see if they got it.
              if (showFeedback && !_isTypedInput(item))
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: verdict.isCorrect ? AlpColors.successBg : AlpColors.dangerBg,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    verdict.isCorrect
                        ? "Nice — that's right."
                        : 'Not quite. The correct answer is ${String.fromCharCode(65 + verdict.correctIdx)}.',
                    style: TextStyle(
                      color: verdict.isCorrect ? AlpColors.successFg : AlpColors.dangerFg,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _submitting
                    ? null
                    : showFeedback
                        ? (_served >= _target ? _submitAndShowResult : _fetchNext)
                        : _isTypedInput(item)
                            ? (_typedInputCtrl.text.trim().isEmpty
                                ? null
                                : _submitAnswer)
                            : (_selectedIdx == null ? null : _submitAnswer),
                style: FilledButton.styleFrom(minimumSize: const Size(double.infinity, 48)),
                child: Text(
                  _submitting
                      ? 'Submitting…'
                      : showFeedback
                          ? (_served >= _target ? 'Finish quiz' : 'Next question')
                          : 'Submit answer',
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// Sprint 7/8 — typed-input renderer for non-MCQ question types.
// Picks keyboard type + placeholder based on the polymorphic
// question_type. Numeric types accept signed numbers with a decimal
// point; FORMULA_INPUT uses monospace + a math-style placeholder;
// SHORT_TEXT is a multi-line plain text field.
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
          ? const TextInputType.numberWithOptions(decimal: false, signed: true)
          : isNumericReal
              ? const TextInputType.numberWithOptions(decimal: true, signed: true)
              : isFormula
                  ? TextInputType.visiblePassword // disables autocorrect for math-y input
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
