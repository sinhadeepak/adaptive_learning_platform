// Sprint 9 F-2 + Sprint 10 S10-D + Sprint 12 S12-D — mobile assignment
// detail. Two paths:
//   - "▶ Start as Quiz" routes through the Quiz session FSM (preferred).
//   - Inline answer radios as a fallback (offline-friendly path).

import 'package:flutter/material.dart';
import '../aurora/widgets/widgets.dart';

import '../api/assignments.dart';
import '../quiz/quiz_client.dart';
import '../quiz/quiz_screen.dart';

class AssignmentDetailScreen extends StatefulWidget {
  const AssignmentDetailScreen({
    super.key,
    required this.client,
    required this.assignmentId,
  });

  final AssignmentsClient client;
  final String assignmentId;

  @override
  State<AssignmentDetailScreen> createState() => _AssignmentDetailScreenState();
}

class _AssignmentDetailScreenState extends State<AssignmentDetailScreen> {
  Assignment? _assignment;
  List<AssignmentQuestion>? _questions;
  String? _error;
  bool _submitting = false;
  SubmitResult? _result;
  final Map<String, int> _answers = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final a = await widget.client.get(widget.assignmentId);
      final qs = await widget.client.questions(widget.assignmentId);
      if (!mounted) return;
      setState(() {
        _assignment = a;
        _questions = qs;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = '$e');
    }
  }

  bool get _allAnswered =>
      _questions != null &&
      _questions!.isNotEmpty &&
      _questions!.every((q) => _answers.containsKey(q.questionId));

  Future<void> _submit() async {
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final r =
          await widget.client.submit(widget.assignmentId, answers: _answers);
      if (!mounted) return;
      setState(() => _result = r);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuroraScaffold(
      appBar: AuroraAppBar(title: 'Assignment'),
      body: _error != null
          ? Padding(
              padding: const EdgeInsets.all(16),
              child: Text(_error!, style: const TextStyle(color: Colors.red)),
            )
          : _assignment == null || _questions == null
              ? const Center(child: AuroraSpinner(size: 32))
              : _result != null
                  ? _buildResult(_result!)
                  : _buildQuiz(),
    );
  }

  Widget _buildResult(SubmitResult r) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('Score: ${r.correctCount}/${r.totalCount}',
            style:
                const TextStyle(fontSize: 22, fontWeight: FontWeight.w700),),
        const SizedBox(height: 8),
        Text(
          r.correctCount == r.totalCount
              ? 'Perfect — well done!'
              : (r.correctCount * 2 >= r.totalCount
                  ? 'Solid run. Review the missed items below.'
                  : 'Try again — review the explanations and re-attempt.'),
          style: const TextStyle(color: Colors.black54),
        ),
        const SizedBox(height: 16),
        ...r.breakdown.map(
          (b) => Card(
            margin: const EdgeInsets.symmetric(vertical: 4),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        b.isCorrect ? Icons.check_circle : Icons.cancel,
                        color: b.isCorrect ? Colors.green : Colors.red,
                      ),
                      const SizedBox(width: 8),
                      Text('Q${b.position}',
                          style: const TextStyle(fontWeight: FontWeight.w600),),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'You: ${b.studentAnswer == null ? "—" : (b.studentAnswer! + 1).toString()}, correct: ${b.correctAnswer + 1}',
                          style: const TextStyle(color: Colors.black54),
                        ),
                      ),
                    ],
                  ),
                  // Sprint 11 S11-C — explanation only on misses.
                  if (!b.isCorrect &&
                      b.explanation != null &&
                      b.explanation!.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: Colors.amber.shade50,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text('💡 ${b.explanation!}',
                          style: const TextStyle(fontSize: 13),),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  Future<void> _startAsQuiz() async {
    final user = widget.client.auth.user;
    if (user == null) return;
    setState(() => _error = null);
    try {
      final r = await widget.client.startAsQuiz(
        widget.assignmentId,
        userId: user.id,
      );
      if (!mounted) return;
      // Push the existing QuizScreen — same play loop as PRACTICE/MOCK
      // sessions. On submit, Quiz publishes quiz.session.completed and
      // Content's subscriber upserts assignment_progress.
      final qc = QuizClient(auth: widget.client.auth);
      await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) =>
              QuizScreen(client: qc, sessionId: r.sessionId),
        ),
      );
      // After returning from the QuizScreen, refresh so myCompletedAt
      // reflects the just-completed session.
      _load();
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = '$e');
    }
  }

  Widget _buildQuiz() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(_assignment!.title,
            style:
                const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),),
        if (formatDueAt(_assignment!).isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(formatDueAt(_assignment!),
                style: const TextStyle(color: Colors.black54),),
          ),
        const SizedBox(height: 16),
        // Sprint 12 S12-D — primary CTA: route through the real Quiz
        // session FSM. Inline radios stay below as a fallback for users
        // who'd rather not navigate away.
        if (_questions!.isNotEmpty)
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _startAsQuiz,
              child: const Text('▶ Start as Quiz'),
            ),
          ),
        const SizedBox(height: 24),
        if (_questions!.isEmpty)
          const Text('This assignment has no questions yet.'),
        ..._questions!.map(
          (q) => Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${q.position}. ${q.stem ?? "Question ${q.position}"}',
                    style: const TextStyle(fontWeight: FontWeight.w600),),
                if (q.choices != null)
                  ...List.generate(q.choices!.length, (idx) {
                    final letter = String.fromCharCode(65 + idx);
                    return RadioListTile<int>(
                      dense: true,
                      title: Text('$letter. ${q.choices![idx]}'),
                      value: idx,
                      groupValue: _answers[q.questionId],
                      onChanged: (v) {
                        if (v == null) return;
                        setState(() => _answers[q.questionId] = v);
                      },
                    );
                  }),
              ],
            ),
          ),
        ),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: (_submitting || !_allAnswered) ? null : _submit,
            child: Text(_submitting ? 'Grading…' : 'Submit answers'),
          ),
        ),
        if (!_allAnswered && _questions!.isNotEmpty)
          const Padding(
            padding: EdgeInsets.only(top: 8),
            child: Text(
              'Answer every question to enable submit.',
              style: TextStyle(color: Colors.black54),
            ),
          ),
      ],
    );
  }
}
