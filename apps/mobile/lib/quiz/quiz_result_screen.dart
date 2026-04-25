import 'package:flutter/material.dart';
import 'package:alp_design_tokens/alp_design_tokens.dart';

import 'quiz_client.dart';

class QuizResultScreen extends StatefulWidget {
  const QuizResultScreen({super.key, required this.client, required this.sessionId});

  final QuizClient client;
  final String sessionId;

  @override
  State<QuizResultScreen> createState() => _QuizResultScreenState();
}

class _QuizResultScreenState extends State<QuizResultScreen> {
  QuizSessionDetail? _detail;
  String? _error;

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
    } on QuizError catch (e) {
      setState(() => _error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Result')),
        body: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(_error!, style: TextStyle(color: AlpColors.dangerFg)),
        ),
      );
    }
    final d = _detail;
    if (d == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Result')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final pct = d.servedCount > 0 ? ((d.correctCount / d.servedCount) * 100).round() : 0;
    final headline = d.status == 'EXPIRED'
        ? 'Session expired'
        : pct >= 80
            ? "Strong run."
            : pct >= 50
                ? "Decent — room to push."
                : "Keep going — these will click.";
    final tone = pct >= 80
        ? AlpColors.successFg
        : pct >= 50
            ? AlpColors.warningFg
            : AlpColors.dangerFg;

    return Scaffold(
      appBar: AppBar(title: const Text('Result')),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                headline,
                style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700, height: 1.3),
              ),
              const SizedBox(height: 16),
              Row(
                crossAxisAlignment: CrossAxisAlignment.baseline,
                textBaseline: TextBaseline.alphabetic,
                children: [
                  Text(
                    '${d.correctCount}',
                    style: TextStyle(fontSize: 64, fontWeight: FontWeight.w800, color: tone),
                  ),
                  Text(
                    '/${d.servedCount}',
                    style: TextStyle(
                      fontSize: 28,
                      color: AlpColors.textMuted,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(width: 16),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        '$pct%',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w600,
                          color: AlpColors.textPrimary,
                        ),
                      ),
                      Text(
                        '${d.mode.toLowerCase()} · ${d.strategy == 'irt' ? 'adaptive' : 'linear'}',
                        style: TextStyle(fontSize: 13, color: AlpColors.textSecondary),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 24),
              Text(
                'Item review',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: AlpColors.textPrimary,
                ),
              ),
              const SizedBox(height: 8),
              ...d.items.map((it) {
                final color = it.answered
                    ? (it.isCorrect == true
                        ? AlpColors.successFg
                        : AlpColors.dangerFg)
                    : AlpColors.textMuted;
                final label = it.answered
                    ? (it.isCorrect == true ? 'Correct' : 'Incorrect')
                    : 'Skipped';
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Row(
                    children: [
                      SizedBox(
                        width: 36,
                        child: Text(
                          'Q${it.itemIdx + 1}',
                          style: TextStyle(
                            fontWeight: FontWeight.w600,
                            color: AlpColors.textPrimary,
                          ),
                        ),
                      ),
                      Expanded(
                        child: Text(
                          label,
                          style: TextStyle(color: color, fontWeight: FontWeight.w500),
                        ),
                      ),
                      Text(
                        '#${it.questionId.substring(0, 8)}',
                        style: TextStyle(
                          fontFamily: 'monospace',
                          fontSize: 12,
                          color: AlpColors.textMuted,
                        ),
                      ),
                    ],
                  ),
                );
              }),
              const SizedBox(height: 24),
              FilledButton(
                onPressed: () => Navigator.of(context).pop(),
                style: FilledButton.styleFrom(minimumSize: const Size(double.infinity, 48)),
                child: const Text('Back to home'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
