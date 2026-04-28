// Sprint 9 F-2 + Sprint 10 S10-D — mobile assignment detail.
//
// Renders the question list with inline answer-radio buttons. After the
// student answers all and taps Submit, the page calls POST /submit; the
// server grades and returns the breakdown. No more manual score entry.

import 'package:flutter/material.dart';

import '../api/assignments.dart';

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
    return Scaffold(
      appBar: AppBar(title: const Text('Assignment')),
      body: _error != null
          ? Padding(
              padding: const EdgeInsets.all(16),
              child: Text(_error!, style: const TextStyle(color: Colors.red)),
            )
          : _assignment == null || _questions == null
              ? const Center(child: CircularProgressIndicator())
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
                const TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
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
                          style: const TextStyle(fontWeight: FontWeight.w600)),
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
                          style: const TextStyle(fontSize: 13)),
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

  Widget _buildQuiz() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(_assignment!.title,
            style:
                const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
        if (formatDueAt(_assignment!).isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(formatDueAt(_assignment!),
                style: const TextStyle(color: Colors.black54)),
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
                    style: const TextStyle(fontWeight: FontWeight.w600)),
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
