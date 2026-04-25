import 'package:flutter/material.dart';
import 'package:alp_design_tokens/alp_design_tokens.dart';

import 'quiz_client.dart';
import 'quiz_result_screen.dart';

/// One-question-at-a-time quiz play surface, mirror of web Quiz.tsx.
class QuizScreen extends StatefulWidget {
  const QuizScreen({super.key, required this.client, required this.sessionId});

  final QuizClient client;
  final String sessionId;

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

  @override
  void initState() {
    super.initState();
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
    setState(() {
      _loading = true;
      _selectedIdx = null;
      _verdict = null;
      _error = null;
    });
    try {
      final n = await widget.client.next(widget.sessionId);
      if (!mounted) return;
      setState(() {
        _loading = false;
        if (n.done || n.item == null) {
          _item = null;
        } else {
          _item = n.item;
        }
      });
      if (n.done) {
        await _submitAndShowResult();
      }
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
    final pick = _selectedIdx;
    if (item == null || pick == null || _submitting) return;
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
        builder: (_) => QuizResultScreen(client: widget.client, sessionId: widget.sessionId),
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
                item.stem,
                style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600, height: 1.4),
              ),
              const SizedBox(height: 24),
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
              if (showFeedback)
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: verdict.isCorrect ? AlpColors.successBg : AlpColors.dangerBg,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    verdict.isCorrect
                        ? "Nice — that's right."
                        : "Not quite. The correct answer is ${String.fromCharCode(65 + verdict.correctIdx)}.",
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
